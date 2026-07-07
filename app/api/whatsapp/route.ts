import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import {
  guardias, clientes, incidencias, servicio_guardias, servicios, salidas, users,
  candidatos, vacantes, whatsapp_conversaciones, eventos_calendario,
} from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getConfig } from '@/src/lib/mailer';
import { cleanPhoneNumber, phoneMatches, tocarChat, enviarMensajeWASender } from '@/src/lib/whatsapp';

// Inicializar el SDK de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const MAX_RONDAS_HERRAMIENTAS = 4;
const MENSAJES_MEMORIA = 20;

function fechaHoraLocal(): string {
  return new Date().toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Historial reciente del teléfono en el formato que espera Gemini
function cargarHistorial(telefono: string) {
  const rows = db.select().from(whatsapp_conversaciones)
    .where(eq(whatsapp_conversaciones.telefono, telefono))
    .orderBy(desc(whatsapp_conversaciones.id))
    .limit(MENSAJES_MEMORIA)
    .all()
    .reverse();
  // Gemini exige que el historial inicie con un mensaje del usuario
  while (rows.length && rows[0].rol !== 'user') rows.shift();
  return rows.map((r) => ({ role: r.rol as 'user' | 'model', parts: [{ text: r.mensaje }] }));
}

function guardarMensaje(telefono: string, rol: 'user' | 'model', mensaje: string, autor: 'contacto' | 'bot' | 'humano') {
  try {
    db.insert(whatsapp_conversaciones).values({ telefono, rol, mensaje, autor }).run();
  } catch (e) {
    console.error('No se pudo guardar el mensaje de WhatsApp:', e);
  }
}

function getAdminUserId(): number {
  const admin = db.select().from(users).where(eq(users.role, 'admin')).get();
  if (admin) return admin.id;
  const firstUser = db.select().from(users).get();
  return firstUser ? firstUser.id : 1;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Validar Token de Seguridad Opcional (si se configura)
    const token = req.nextUrl.searchParams.get('token');
    const webhookToken = process.env.WASENDER_WEBHOOK_TOKEN;
    if (webhookToken && token !== webhookToken) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 2. Extraer datos del payload de WASender de forma segura (soporta varios formatos)
    const body = await req.json();
    const rawPhone = body.phone || body.sender || body.from || body.message?.from;
    const incomingText = body.message || body.text || body.message?.text || body.content;

    if (!rawPhone || !incomingText || typeof incomingText !== 'string') {
      return Response.json({ error: 'Payload incompleto o inválido' }, { status: 400 });
    }

    const cleanIncoming = cleanPhoneNumber(rawPhone);

    // 3. Identificar al remitente: guardia, cliente o candidato/desconocido
    const allGuardias = db.select().from(guardias).all();
    const matchedGuardia = allGuardias.find((g) => phoneMatches(g.telefono, cleanIncoming));

    let matchedCliente = null;
    if (!matchedGuardia) {
      const allClientes = db.select().from(clientes).all();
      matchedCliente = allClientes.find((c) => phoneMatches(c.telefono, cleanIncoming)) || null;
    }

    let matchedCandidato = null;
    if (!matchedGuardia && !matchedCliente) {
      const allCandidatos = db.select().from(candidatos).all();
      matchedCandidato = allCandidatos.find((c) => phoneMatches(c.telefono, cleanIncoming)) || null;
    }

    // 4. Registrar actividad del chat y respetar la pausa del bot
    const estadoChat = tocarChat(cleanIncoming, { incrementarNoLeidos: true });
    const historial = cargarHistorial(cleanIncoming);
    guardarMensaje(cleanIncoming, 'user', incomingText, 'contacto');

    // Si un humano tomó el control del chat, solo se guarda el mensaje entrante
    if (estadoChat.bot_activo === 0) {
      return Response.json({ status: 'bot_paused' });
    }

    let responseText = '';
    if (matchedGuardia || matchedCliente) {
      responseText = await chatUsuarioInterno(
        incomingText, historial,
        matchedGuardia ? 'Guardia' : 'Cliente',
        matchedGuardia ? matchedGuardia.nombre : matchedCliente!.nombre,
        matchedGuardia ? matchedGuardia.id : matchedCliente!.id,
        cleanIncoming,
      );
    } else {
      responseText = await chatReclutamiento(incomingText, historial, matchedCandidato, cleanIncoming);
    }

    guardarMensaje(cleanIncoming, 'model', responseText, 'bot');

    // 5. Enviar mensaje de vuelta al número mediante WASender
    await enviarMensajeWASender(cleanIncoming, responseText);

    return Response.json({ status: 'success', response: responseText });
  } catch (error: any) {
    console.error('Error procesando webhook de WhatsApp:', error);
    return Response.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

// ============================================================
// Flujo 1: guardias y clientes registrados (asistente interno)
// ============================================================
async function chatUsuarioInterno(
  incomingText: string,
  historial: { role: 'user' | 'model'; parts: { text: string }[] }[],
  tipoUsuario: 'Guardia' | 'Cliente',
  usuarioNombre: string,
  usuarioId: number,
  usuarioTelefono: string,
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const systemInstruction = `Eres el Asistente Virtual Inteligente de U3 Seguridad Privada.
Estás chateando por WhatsApp con un usuario del sistema.
Fecha y hora actual: ${fechaHoraLocal()}.

INFORMACIÓN DEL REMITENTE:
- Nombre: ${usuarioNombre}
- Rol en el sistema: ${tipoUsuario}
- ID interno: ${usuarioId}
- Teléfono: ${usuarioTelefono}

INSTRUCCIONES CLAVE:
1. Responde de forma muy concisa, profesional y directa, ya que las respuestas se leerán en WhatsApp.
2. Si el usuario te saluda, salúdalo por su nombre y pregúntale en qué puedes ayudarle.
3. Si el usuario te hace una pregunta que requiera ver su turno, servicio asignado, inventario o registrar una novedad/incidencia, ejecuta de inmediato la herramienta adecuada.
4. Solo tienes acceso a las herramientas descritas a continuación. Si el usuario pide algo fuera del alcance, indícale amablemente que no tienes esa función habilitada.`;

  const chat = model.startChat({
    history: historial,
    generationConfig: { maxOutputTokens: 600 },
    systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
    tools: [
      {
        functionDeclarations: [
          {
            name: 'registrarIncidencia',
            description: 'Registra un reporte de novedad o incidencia de seguridad (ej. daños, robos, retrasos, fallas de equipo) en el sistema.',
            parameters: {
              type: 'OBJECT',
              properties: {
                tipo: {
                  type: 'STRING',
                  description: 'El tipo de incidencia. Ejemplos: "Falta", "Retardo", "Falla de Equipo", "Accidente", "Incidente de Seguridad", "Novedad en Turno"',
                },
                gravedad: {
                  type: 'STRING',
                  description: 'Gravedad del reporte: "Leve", "Media", "Grave"',
                },
                descripcion: {
                  type: 'STRING',
                  description: 'Detalles minuciosos del reporte (ej. "Se reporta daño en la reja trasera del almacén")',
                },
              },
              required: ['tipo', 'descripcion'],
            },
          },
          {
            name: 'consultarServicioAsignado',
            description: 'Obtiene las asignaciones de servicios activos, turnos y ubicación del guardia.',
            parameters: { type: 'OBJECT', properties: {} },
          },
          {
            name: 'consultarInventarioAsignado',
            description: 'Obtiene los uniformes, tallas y prendas que el guardia tiene actualmente registrados a su cargo.',
            parameters: { type: 'OBJECT', properties: {} },
          },
        ],
      },
    ] as any,
  });

  const ejecutarHerramienta = (name: string, args: any): any => {
    if (name === 'registrarIncidencia') {
      const { tipo, gravedad, descripcion } = args as { tipo: string; gravedad?: string; descripcion: string };
      try {
        const nuevaIncidencia = db.insert(incidencias).values({
          guardia_id: usuarioId,
          tipo: tipo || 'Novedad en Turno',
          gravedad: gravedad || 'Leve',
          fecha: new Date().toISOString().split('T')[0],
          descripcion: descripcion || '',
          estado: 'Abierta',
          creado_por: getAdminUserId(),
        }).returning().get();
        return { success: true, message: 'Incidencia registrada exitosamente en el ERP', incidenciaId: nuevaIncidencia.id };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
    if (name === 'consultarServicioAsignado') {
      if (tipoUsuario !== 'Guardia') return { success: false, error: 'Esta consulta solo está permitida para Guardias de seguridad.' };
      try {
        const asignaciones = db.select({
          turno: servicio_guardias.turno,
          nombreServicio: servicios.nombre,
          direccion: servicios.direccion,
        })
          .from(servicio_guardias)
          .innerJoin(servicios, eq(servicio_guardias.servicio_id, servicios.id))
          .where(eq(servicio_guardias.guardia_id, usuarioId))
          .all();
        return { success: true, asignaciones };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
    if (name === 'consultarInventarioAsignado') {
      if (tipoUsuario !== 'Guardia') return { success: false, error: 'Esta consulta solo está permitida para Guardias de seguridad.' };
      try {
        const uniformes = db.select({
          articulo: salidas.articulo,
          talla: salidas.talla,
          cantidad: salidas.cantidad,
          fecha: salidas.fecha,
          concepto: salidas.concepto,
          estadoAsignacion: salidas.estado_asignacion,
        })
          .from(salidas)
          .where(eq(salidas.guardia_id, usuarioId))
          .all();
        return { success: true, inventario: uniformes };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: `Herramienta desconocida: ${name}` };
  };

  return await conversarConHerramientas(chat, incomingText, ejecutarHerramienta);
}

// ============================================================
// Flujo 2: números desconocidos y candidatos (reclutador RRHH)
// ============================================================
async function chatReclutamiento(
  incomingText: string,
  historial: { role: 'user' | 'model'; parts: { text: string }[] }[],
  candidato: typeof candidatos.$inferSelect | null,
  telefono: string,
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const vacantesActivas = db.select().from(vacantes).where(eq(vacantes.activa, 1)).all();
  const listaVacantes = vacantesActivas.length
    ? vacantesActivas.map((v) =>
        `- [ID ${v.id}] ${v.puesto}${v.ubicacion ? ` | Zona: ${v.ubicacion}` : ''}${v.turno ? ` | Turno: ${v.turno}` : ''}${v.sueldo ? ` | Sueldo: ${v.sueldo}` : ''}${v.requisitos ? ` | Requisitos: ${v.requisitos}` : ''}${v.descripcion ? ` | ${v.descripcion}` : ''}`
      ).join('\n')
    : '(Por el momento no hay vacantes abiertas. Ofrece registrar los datos del candidato para contactarlo cuando se abra una vacante.)';

  const empresaInfo = getConfig('bot_empresa_info') || 'U3 Seguridad Privada es una empresa mexicana de servicios de seguridad privada (guardias intramuros y servicios relacionados).';
  const reglasExtra = getConfig('bot_reglas') || '';
  const horarioEntrevistas = getConfig('bot_horario_entrevistas') || 'Lunes a viernes de 9:00 a 14:00';
  const direccionEntrevistas = getConfig('bot_direccion_entrevistas') || 'nuestras oficinas (se confirma la dirección al agendar)';

  const fichaCandidato = candidato
    ? `\nFICHA DEL CANDIDATO (ya registrado, NO vuelvas a pedir datos que ya tienes):
- ID: ${candidato.id}
- Nombre: ${candidato.nombre || 'aún sin registrar'}
- Ciudad: ${candidato.ciudad || 'aún sin registrar'}
- Edad: ${candidato.edad || 'aún sin registrar'}
- Experiencia: ${candidato.experiencia || 'aún sin registrar'}
- Etapa del proceso: ${candidato.etapa}
- Entrevista agendada: ${candidato.fecha_entrevista || 'ninguna'}`
    : '\nEste número NO está registrado todavía. Es un contacto nuevo.';

  const systemInstruction = `Eres "Uli", el reclutador virtual experto en Recursos Humanos de U3 Seguridad Privada. Chateas por WhatsApp.
Fecha y hora actual: ${fechaHoraLocal()} (hora del centro de México).

SOBRE LA EMPRESA:
${empresaInfo}

VACANTES ACTIVAS HOY:
${listaVacantes}

HORARIO DISPONIBLE PARA ENTREVISTAS: ${horarioEntrevistas}
LUGAR DE LAS ENTREVISTAS: ${direccionEntrevistas}
${fichaCandidato}

TU OBJETIVO PRINCIPAL: conseguir que cada candidato calificado CONSOLIDE UNA CITA DE ENTREVISTA con fecha y hora concretas. Toda la conversación debe avanzar hacia ese cierre.

CÓMO TRABAJAS (técnica de reclutador experto):
1. Primer contacto: preséntate breve y cálido, y detecta la intención: ¿busca empleo o quiere contratar servicios de seguridad?
2. Si quiere CONTRATAR servicios: recolecta nombre, empresa, correo y qué necesita; usa la herramienta registrarProspectoVenta y dile que un asesor comercial lo contactará pronto. No des precios.
3. Si busca EMPLEO: preséntale las vacantes activas que apliquen a su ciudad. Recolecta UNO O DOS datos por mensaje (no interrogatorio): nombre completo, ciudad, edad, experiencia en seguridad. Ve guardando cada dato con la herramienta actualizarDatosCandidato en cuanto lo obtengas.
4. Califica con criterio de RRHH: si cumple el perfil, pasa al cierre de cita SIN esperar a que él lo pida: propón directamente dos opciones concretas de día y hora dentro del horario disponible (ej. "¿Te queda mejor mañana a las 10:00 o el jueves a las 12:00?").
5. Cuando el candidato confirme día y hora, usa la herramienta agendarEntrevista y confírmale por escrito: fecha, hora, lugar y qué documentos llevar (identificación oficial, CURP, comprobante de domicilio y, si tiene, constancias de cursos de seguridad).
6. Si el candidato no confirma, haz UN seguimiento amable proponiendo otra opción. Nunca presiones de más.
7. Maneja objeciones como reclutador: si duda por sueldo o distancia, destaca lo que la vacante sí ofrece, sin inventar nada.

REGLAS ESTRICTAS:
- Responde SIEMPRE en español, mensajes cortos (2-4 líneas), tono cálido y profesional de WhatsApp.
- SOLO usa la información de este mensaje. Si no sabes algo (sueldos exactos, prestaciones no listadas, precios de servicios), di que en la entrevista o un asesor se lo confirmará. NUNCA inventes.
- No prometas contratación; la entrevista es el siguiente paso, no una oferta.
- Agenda entrevistas únicamente dentro del horario disponible indicado.
- Si la persona pide hablar con un humano, indícale que un reclutador le devolverá el mensaje y registra la nota con actualizarDatosCandidato.
${reglasExtra ? `\nREGLAS ADICIONALES DE LA EMPRESA:\n${reglasExtra}` : ''}`;

  const chat = model.startChat({
    history: historial,
    generationConfig: { maxOutputTokens: 600 },
    systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
    tools: [
      {
        functionDeclarations: [
          {
            name: 'actualizarDatosCandidato',
            description: 'Guarda o actualiza los datos del candidato en el sistema de reclutamiento. Úsala en cuanto obtengas un dato nuevo (nombre, ciudad, edad, experiencia, vacante de interés o una nota).',
            parameters: {
              type: 'OBJECT',
              properties: {
                nombre: { type: 'STRING', description: 'Nombre completo del candidato' },
                ciudad: { type: 'STRING', description: 'Ciudad o zona donde vive' },
                edad: { type: 'NUMBER', description: 'Edad en años' },
                experiencia: { type: 'STRING', description: 'Resumen de su experiencia en seguridad u otros trabajos' },
                vacante_id: { type: 'NUMBER', description: 'ID de la vacante que le interesa (de la lista de vacantes activas)' },
                nota: { type: 'STRING', description: 'Observación relevante del reclutador (ej. "pide hablar con humano", "disponible solo turno nocturno")' },
              },
            },
          },
          {
            name: 'agendarEntrevista',
            description: 'Agenda la cita de entrevista presencial del candidato una vez que confirmó día y hora. Crea el evento en el calendario de la empresa.',
            parameters: {
              type: 'OBJECT',
              properties: {
                fecha: { type: 'STRING', description: 'Fecha de la entrevista en formato YYYY-MM-DD' },
                hora: { type: 'STRING', description: 'Hora de la entrevista en formato HH:MM (24 horas)' },
              },
              required: ['fecha', 'hora'],
            },
          },
          {
            name: 'registrarProspectoVenta',
            description: 'Registra a una persona o empresa interesada en CONTRATAR servicios de seguridad, para que el equipo comercial le dé seguimiento.',
            parameters: {
              type: 'OBJECT',
              properties: {
                nombre: { type: 'STRING', description: 'Nombre de la persona de contacto' },
                empresa: { type: 'STRING', description: 'Nombre de la empresa (si aplica)' },
                email: { type: 'STRING', description: 'Correo electrónico de contacto' },
                interes: { type: 'STRING', description: 'Qué servicio necesita y cualquier detalle relevante' },
              },
              required: ['nombre'],
            },
          },
        ],
      },
    ] as any,
  });

  // Asegura que exista la ficha del candidato y devuelve su registro actual
  const obtenerOCrearCandidato = () => {
    const existente = candidato
      ? db.select().from(candidatos).where(eq(candidatos.id, candidato.id)).get()
      : db.select().from(candidatos).all().find((c) => phoneMatches(c.telefono, telefono));
    if (existente) return existente;
    return db.insert(candidatos).values({
      telefono,
      etapa: 'Nuevo',
      etapa_actualizada_en: new Date().toISOString(),
      origen: 'WhatsApp',
    }).returning().get();
  };

  const ejecutarHerramienta = (name: string, args: any): any => {
    try {
      if (name === 'actualizarDatosCandidato') {
        const ficha = obtenerOCrearCandidato();
        const cambios: Record<string, unknown> = {};
        if (args.nombre) cambios.nombre = args.nombre;
        if (args.ciudad) cambios.ciudad = args.ciudad;
        if (args.edad) cambios.edad = Number(args.edad);
        if (args.experiencia) cambios.experiencia = args.experiencia;
        if (args.vacante_id) cambios.vacante_id = Number(args.vacante_id);
        if (args.nota) {
          const stamp = new Date().toISOString().split('T')[0];
          cambios.notas = `${ficha.notas ? `${ficha.notas}\n` : ''}[${stamp}] ${args.nota}`;
        }
        // Con datos capturados el candidato pasa de "Nuevo" a "Contactado"
        if (ficha.etapa === 'Nuevo' && (args.nombre || ficha.nombre)) {
          cambios.etapa = 'Contactado';
          cambios.etapa_actualizada_en = new Date().toISOString();
        }
        const actualizado = db.update(candidatos).set(cambios).where(eq(candidatos.id, ficha.id)).returning().get();
        return { success: true, candidato: { id: actualizado.id, nombre: actualizado.nombre, etapa: actualizado.etapa } };
      }

      if (name === 'agendarEntrevista') {
        const { fecha, hora } = args as { fecha: string; hora: string };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{1,2}:\d{2}$/.test(hora)) {
          return { success: false, error: 'Formato de fecha u hora inválido. Usa YYYY-MM-DD y HH:MM.' };
        }
        const ficha = obtenerOCrearCandidato();
        const inicio = `${fecha}T${hora.padStart(5, '0')}:00`;
        const evento = db.insert(eventos_calendario).values({
          titulo: `Entrevista: ${ficha.nombre || `candidato ${telefono}`}`,
          descripcion: `Entrevista de reclutamiento agendada por el asistente de WhatsApp.\nTeléfono: ${telefono}${ficha.ciudad ? `\nCiudad: ${ficha.ciudad}` : ''}${ficha.experiencia ? `\nExperiencia: ${ficha.experiencia}` : ''}`,
          fecha_inicio: inicio,
          todo_el_dia: 0,
          creado_por: getAdminUserId(),
          notificar_minutos_antes: 60,
        }).returning().get();
        db.update(candidatos).set({
          etapa: 'Entrevista',
          etapa_actualizada_en: new Date().toISOString(),
          fecha_entrevista: inicio,
          evento_id: evento.id,
        }).where(eq(candidatos.id, ficha.id)).run();
        return { success: true, message: `Entrevista agendada el ${fecha} a las ${hora}`, eventoId: evento.id };
      }

      if (name === 'registrarProspectoVenta') {
        const { nombre, empresa, email, interes } = args as { nombre: string; empresa?: string; email?: string; interes?: string };
        const nuevo = db.insert(clientes).values({
          nombre,
          tipo: 'Prospecto',
          empresa: empresa || null,
          email: email || null,
          telefono,
          notas: `Captado por el asistente de WhatsApp.${interes ? ` Interés: ${interes}` : ''}`,
        }).returning().get();
        return { success: true, message: 'Prospecto registrado; el equipo comercial le dará seguimiento', prospectoId: nuevo.id };
      }

      return { success: false, error: `Herramienta desconocida: ${name}` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  return await conversarConHerramientas(chat, incomingText, ejecutarHerramienta);
}

// Envía el mensaje al modelo y resuelve llamadas a herramientas hasta obtener texto final
async function conversarConHerramientas(
  chat: ReturnType<ReturnType<typeof genAI.getGenerativeModel>['startChat']>,
  incomingText: string,
  ejecutarHerramienta: (name: string, args: any) => any,
): Promise<string> {
  let result = await chat.sendMessage(incomingText);

  for (let ronda = 0; ronda < MAX_RONDAS_HERRAMIENTAS; ronda++) {
    const functionCalls = result.response.functionCalls?.();
    if (!functionCalls || functionCalls.length === 0) break;

    const respuestas = functionCalls.map((call) => ({
      functionResponse: {
        name: call.name,
        response: ejecutarHerramienta(call.name, call.args),
      },
    }));
    result = await chat.sendMessage(respuestas);
  }

  return result.response.text();
}

