import { NextRequest } from 'next/server';
import { appendFileSync } from 'fs';
import { createHmac } from 'crypto';
import path from 'path';
import { db } from '@/src/db';
import {
  guardias, clientes, incidencias, servicio_guardias, servicios, salidas, users,
  candidatos, vacantes, whatsapp_conversaciones, eventos_calendario, whatsapp_chats,
} from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getConfig } from '@/src/lib/mailer';
import { cleanPhoneNumber, phoneMatches, tocarChat, enviarMensajeWhatsApp, mostrarEscribiendoKapso } from '@/src/lib/whatsapp';

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

// Convierte herramientas en formato Gemini a formato OpenAI/Groq (lowercase types)
function mapGeminiToolsToGroq(geminiTools: any[]) {
  if (!geminiTools) return undefined;
  return geminiTools.map((t) => {
    const cleanParams = JSON.parse(
      JSON.stringify(t.parameters || {})
        .replace(/"type":"OBJECT"/g, '"type":"object"')
        .replace(/"type":"STRING"/g, '"type":"string"')
        .replace(/"type":"NUMBER"/g, '"type":"number"')
        .replace(/"type":"BOOLEAN"/g, '"type":"boolean"')
        .replace(/"type":"ARRAY"/g, '"type":"array"')
    );
    return {
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: cleanParams,
      },
    };
  });
}

// Bucle de conversación con Groq (soporta llamadas a herramientas)
async function conversarConGroq(
  systemInstruction: string,
  historial: { role: 'user' | 'model'; parts: { text: string }[] }[],
  incomingText: string,
  geminiTools: any[],
  ejecutarHerramienta: (name: string, args: any) => any,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  if (!apiKey) {
    throw new Error('GROQ_API_KEY no está configurada.');
  }

  const messages: any[] = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }

  for (const h of historial) {
    messages.push({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.parts?.[0]?.text || '',
    });
  }

  messages.push({ role: 'user', content: incomingText });

  const tools = mapGeminiToolsToGroq(geminiTools);

  const limpiarRespuesta = (texto: string): string => {
    let limpia = texto || '';
    limpia = limpia.replace(/<function=\w+>(\{[\s\S]*?\})?/gi, '');
    limpia = limpia.replace(/<function=\w+>/gi, '');
    limpia = limpia.replace(/<\/function>/gi, '');
    return limpia.trim();
  };

  for (let ronda = 0; ronda < MAX_RONDAS_HERRAMIENTAS; ronda++) {
    const payload: any = {
      model,
      messages,
    };
    if (tools && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Groq API respondió ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const assistantMessage = data.choices?.[0]?.message;
    if (!assistantMessage) {
      throw new Error('Respuesta vacía de Groq API');
    }

    messages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return limpiarRespuesta(assistantMessage.content || '');
    }

    for (const call of toolCalls) {
      const args = typeof call.function.arguments === 'string'
        ? JSON.parse(call.function.arguments)
        : call.function.arguments;
      const result = ejecutarHerramienta(call.function.name, args);

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(result),
      });
    }
  }

  const ultimoMsg = messages[messages.length - 1];
  return limpiarRespuesta(ultimoMsg?.content || 'Operación completada.');
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

  // Agrupar mensajes consecutivos del mismo rol para evitar errores de validación de API
  const agrupados: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  for (const r of rows) {
    const rol = r.rol as 'user' | 'model';
    const texto = r.mensaje;
    if (agrupados.length && agrupados[agrupados.length - 1].role === rol) {
      agrupados[agrupados.length - 1].parts[0].text += '\n' + texto;
    } else {
      agrupados.push({ role: rol, parts: [{ text: texto }] });
    }
  }

  return agrupados;
}

function guardarMensaje(telefono: string, rol: 'user' | 'model', mensaje: string, autor: 'contacto' | 'bot' | 'humano') {
  try {
    return db.insert(whatsapp_conversaciones).values({ telefono, rol, mensaje, autor }).returning().get();
  } catch (e) {
    console.error('No se pudo guardar el mensaje de WhatsApp:', e);
    return null;
  }
}

function getAdminUserId(): number {
  const admin = db.select().from(users).where(eq(users.role, 'admin')).get();
  if (admin) return admin.id;
  const firstUser = db.select().from(users).get();
  return firstUser ? firstUser.id : 1;
}

export async function POST(req: NextRequest) {
  const now = new Date().toISOString();
  const logPath = process.env.SQLITE_DB_PATH
    ? path.join(path.dirname(process.env.SQLITE_DB_PATH), 'webhook_logs.txt')
    : path.join(process.cwd(), 'db', 'webhook_logs.txt');

  let rawBodyText = '';
  try {
    const cloned = req.clone();
    rawBodyText = await cloned.text();
    const logLine = `[${now}] URL: ${req.url} | Header-Sig: ${req.headers.get('x-webhook-signature')} | Body: ${rawBodyText}\n`;
    appendFileSync(logPath, logLine);
  } catch (e: any) {
    try {
      appendFileSync(logPath, `[${now}] ERROR AL LOGUEAR: ${e.message}\n`);
    } catch (fsErr) {
      console.error('No se pudo escribir en logPath:', fsErr);
    }
  }

  try {
    const body = JSON.parse(rawBodyText || '{}');

    // === Meta WhatsApp Cloud API (oficial): tiene su propio formato y seguridad ===
    if (body.object === 'whatsapp_business_account') {
      return await procesarWebhookMeta(body, req, rawBodyText);
    }

    // === Kapso Webhook Nativo ===
    if (body.type?.startsWith('whatsapp.') || body.type === 'message.received' || body.batch === true) {
      return await procesarWebhookKapso(body, req, rawBodyText);
    }

    // === WASender (no oficial) ===
    // 1. Validar Token de Seguridad (Soporta Header o Query Parameter)
    const webhookToken = process.env.WASENDER_WEBHOOK_TOKEN;
    if (webhookToken) {
      const headerSig = req.headers.get('x-webhook-signature') || req.headers.get('X-Webhook-Signature');
      const paramSig = req.nextUrl.searchParams.get('token');
      const sigToCompare = headerSig || paramSig;
      if (sigToCompare !== webhookToken) {
        console.warn('Firma de webhook inválida. Recibida:', sigToCompare);
        return Response.json({ error: 'No autorizado' }, { status: 401 });
      }
    }

    // 2. Solo procesar el evento principal 'messages.upsert' y el evento de test.
    // Esto previene que procesemos eventos duplicados de WaSender (messages.received, messages-personal.received, etc.)
    const event = body.event || '';
    if (event !== 'messages.upsert' && event !== 'webhook.test' && body.event !== 'webhook.test') {
      return Response.json({ status: 'ignored_event', event });
    }

    console.log('Webhook recibido:', JSON.stringify(body));

    // Si es un evento de prueba del simulador de WaSender, responder exitoso inmediatamente
    if (event === 'webhook.test' || body.event === 'webhook.test' || body.test === true || body.data?.test === true) {
      return Response.json({ status: 'success', message: 'Webhook test verified successfully' });
    }

    let rawPhone = body.phone || body.sender || body.from || body.message?.from;
    let incomingText = body.message || body.text || body.message?.text || body.content;
    let fromMe = body.fromMe === true || body.data?.fromMe === true || body.data?.key?.fromMe === true || body.key?.fromMe === true || event === 'message.sent' || event === 'messages.sent';

    // Soporte para estructura anidada de WaSender (body.data.*)
    if (body.data) {
      const d = body.data;
      
      // Soporte para formato d.messages observado en logs
      const messagesObj = d.messages;
      if (messagesObj) {
        const m = Array.isArray(messagesObj) ? messagesObj[0] : messagesObj;
        if (m.key?.senderPn) {
          rawPhone = m.key.senderPn;
        } else if (m.key?.remoteJid) {
          rawPhone = m.key.remoteJid;
        } else if (m.remoteJid) {
          rawPhone = m.remoteJid;
        }

        if (m.messageBody) {
          incomingText = m.messageBody;
        } else if (m.message) {
          incomingText = m.message.conversation || m.message.extendedTextMessage?.text || m.message.text || '';
        }

        if (m.key?.fromMe === true) {
          fromMe = true;
        }
      } else {
        if (d.key?.remoteJid) {
          rawPhone = d.key.remoteJid;
        } else if (d.sender) {
          rawPhone = d.sender;
        } else if (d.from) {
          rawPhone = d.from;
        }

        if (d.message) {
          if (typeof d.message === 'string') {
            incomingText = d.message;
          } else {
            incomingText = d.message.conversation || d.message.extendedTextMessage?.text || d.message.text || '';
          }
        } else if (d.text) {
          incomingText = d.text;
        } else if (d.body) {
          incomingText = d.body;
        }

        if (d.key?.fromMe === true || d.fromMe === true) {
          fromMe = true;
        }
      }
    }

    if (!rawPhone || !incomingText || typeof incomingText !== 'string') {
      console.warn('Payload incompleto. Teléfono:', rawPhone, 'Mensaje:', incomingText);
      return Response.json({ error: 'Payload incompleto o inválido' }, { status: 400 });
    }

    const cleanIncoming = cleanPhoneNumber(rawPhone);

    // 2.1 Si el mensaje es de nosotros mismos (fromMe), lo sincronizamos pero NO disparamos respuesta del bot
    if (fromMe) {
      const existeMensaje = db.select().from(whatsapp_conversaciones)
        .where(eq(whatsapp_conversaciones.telefono, cleanIncoming))
        .orderBy(desc(whatsapp_conversaciones.id))
        .limit(5)
        .all();
      
      const esDuplicado = existeMensaje.some(m => m.mensaje === incomingText);
      if (!esDuplicado) {
        tocarChat(cleanIncoming, { incrementarNoLeidos: false });
        guardarMensaje(cleanIncoming, 'model', incomingText, 'humano');
        db.update(whatsapp_chats).set({ bot_activo: 0 }).where(eq(whatsapp_chats.telefono, cleanIncoming)).run();
        console.log('Mensaje saliente sincronizado (se pausó el bot para esta conversación):', incomingText);
      }
      return Response.json({ status: 'from_me_synced' });
    }

    // 2.2 Activar indicador de "escribiendo" si hay un ID de mensaje disponible en el webhook
    const messagesObj = body.data?.messages;
    const msgId = messagesObj?.key?.id || messagesObj?.id || body.data?.key?.id || body.key?.id || body.message?.id;
    if (msgId) {
      const fromJid = messagesObj?.key?.remoteJid || body.data?.key?.remoteJid || body.key?.remoteJid || body.from || body.phone;
      if (fromJid) {
        mostrarEscribiendoKapso(fromJid, msgId).catch(() => {});
      }
    }

    // 3. Procesar el mensaje (identifica remitente, responde con el bot y envía por el proveedor activo)
    const responseText = await procesarMensajeEntrante(cleanIncoming, incomingText);
    if (responseText === null) return Response.json({ status: 'bot_paused' });
    return Response.json({ status: 'success', response: responseText });
  } catch (error: any) {
    console.error('Error procesando webhook de WhatsApp:', error);
    return Response.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

// Verificación del webhook de Meta (handshake GET inicial que hace Meta al configurar la URL)
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');
  if (mode === 'subscribe' && token && token === process.env.META_VERIFY_TOKEN) {
    return new Response(challenge || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// Procesa el webhook con el formato de Meta Cloud API
async function procesarWebhookMeta(body: any, req: NextRequest, rawBodyText: string): Promise<Response> {
  // Validación opcional de firma (X-Hub-Signature-256) si se configura META_APP_SECRET
  const appSecret = process.env.META_APP_SECRET;
  if (appSecret) {
    const sig = req.headers.get('x-hub-signature-256') || '';
    const esperado = 'sha256=' + createHmac('sha256', appSecret).update(rawBodyText).digest('hex');
    if (sig !== esperado) {
      console.warn('Firma de Meta inválida.');
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
  }

  try {
    const value = body.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    // Meta también envía estados de entrega (statuses) y otros eventos que ignoramos
    if (!msg) return Response.json({ status: 'ignored_no_message' });
    if (msg.type !== 'text') return Response.json({ status: 'ignored_non_text', type: msg.type });

    const cleanIncoming = cleanPhoneNumber(msg.from);
    const incomingText = msg.text?.body || '';
    if (!cleanIncoming || !incomingText) return Response.json({ status: 'ignored_empty' });

    if (msg.id) {
      mostrarEscribiendoKapso(msg.from, msg.id).catch(() => {});
    }

    const responseText = await procesarMensajeEntrante(cleanIncoming, incomingText);
    if (responseText === null) return Response.json({ status: 'bot_paused' });
    return Response.json({ status: 'success', response: responseText });
  } catch (error: any) {
    console.error('Error procesando webhook Meta:', error);
    return Response.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

// Procesa el webhook nativo de Kapso
async function procesarWebhookKapso(body: any, req: NextRequest, rawBodyText: string): Promise<Response> {
  const logPath = process.env.SQLITE_DB_PATH
    ? path.join(path.dirname(process.env.SQLITE_DB_PATH), 'webhook_logs.txt')
    : path.join(process.cwd(), 'db', 'webhook_logs.txt');

  const appSecret = process.env.META_APP_SECRET;
  if (appSecret) {
    const sig = req.headers.get('x-webhook-signature') || req.headers.get('X-Webhook-Signature') || '';
    const esperado = createHmac('sha256', appSecret).update(rawBodyText).digest('hex');
    if (sig !== esperado) {
      const errSigLine = `[${new Date().toISOString()}] [ERROR FIRMA KAPSO] Recibida: ${sig} | Esperada: ${esperado}\n`;
      try { appendFileSync(logPath, errSigLine); } catch (fsErr) {}
      console.warn('Firma de Kapso inválida. Esperada:', esperado, 'Recibida:', sig);
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
  }

  try {
    if (body.type !== 'whatsapp.message.received' && body.type !== 'message.received') {
      return Response.json({ status: 'ignored_event', type: body.type });
    }

    const messages = body.data || [];
    if (!messages.length) {
      return Response.json({ status: 'no_messages_in_batch' });
    }

    const resultados = [];
    for (const item of messages) {
      const msg = item.message;
      if (!msg) continue;

      if (msg.kapso?.direction === 'outbound') continue;

      const cleanIncoming = cleanPhoneNumber(msg.from);
      const incomingText = msg.text?.body || msg.kapso?.content || '';

      if (!cleanIncoming || !incomingText) continue;

      if (msg.id) {
        mostrarEscribiendoKapso(msg.from, msg.id).catch(() => {});
      }

      const responseText = await procesarMensajeEntrante(cleanIncoming, incomingText);
      resultados.push({ telefono: cleanIncoming, respuesta: responseText });
    }

    return Response.json({ status: 'success', processed: resultados });
  } catch (error: any) {
    const errExcLine = `[${new Date().toISOString()}] [EXCEPTION KAPSO] ${error.message}\nStack: ${error.stack}\n`;
    try { appendFileSync(logPath, errExcLine); } catch (fsErr) {}
    console.error('Error procesando webhook nativo de Kapso:', error);
    return Response.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

// Núcleo compartido por ambos proveedores: identifica al remitente, genera la respuesta
// del bot y la envía. Devuelve el texto enviado, o null si el bot está pausado en ese chat.
async function procesarMensajeEntrante(cleanIncoming: string, incomingText: string): Promise<string | null> {
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

  const estadoChat = tocarChat(cleanIncoming, { incrementarNoLeidos: true });
  
  // 1. Guardar el mensaje entrante inmediatamente
  const msgGuardado = guardarMensaje(cleanIncoming, 'user', incomingText, 'contacto');

  // Si un humano tomó el control del chat, solo se guarda el mensaje entrante y salimos
  if (estadoChat.bot_activo === 0) return null;

  // 2. Mecanismo de Debounce / Agrupación de mensajes:
  // Esperamos 4.5 segundos. Si el usuario escribe otro mensaje, un nuevo hilo se activará.
  await new Promise((resolve) => setTimeout(resolve, 4500));

  if (msgGuardado) {
    // Consultamos el último mensaje de la conversación para este teléfono
    const ultimoMensaje = db.select().from(whatsapp_conversaciones)
      .where(eq(whatsapp_conversaciones.telefono, cleanIncoming))
      .orderBy(desc(whatsapp_conversaciones.id))
      .limit(1)
      .get();

    // Si el id del último mensaje en la BD es diferente al de este hilo,
    // significa que el usuario mandó un mensaje más nuevo después.
    // Dejamos que el hilo del último mensaje responda por todos y salimos.
    if (ultimoMensaje && ultimoMensaje.id !== msgGuardado.id) {
      console.log(`[DEBOUNCE] Cancelando respuesta del hilo del mensaje ID ${msgGuardado.id} porque llegó uno más nuevo (${ultimoMensaje.id}).`);
      return null;
    }
  }

  // Si somos el último hilo, cargamos el historial agrupado (que ya contiene todos los mensajes recién guardados)
  const historial = cargarHistorial(cleanIncoming);

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
  await enviarMensajeWhatsApp(cleanIncoming, responseText);
  return responseText;
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

  const geminiTools = [
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
  ];

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

  if (process.env.GROQ_API_KEY) {
    return await conversarConGroq(systemInstruction, historial, incomingText, geminiTools, ejecutarHerramienta);
  } else {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const chat = model.startChat({
      history: historial,
      generationConfig: { maxOutputTokens: 600 },
      systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
      tools: [{ functionDeclarations: geminiTools }] as any,
    });
    return await conversarConHerramientas(chat, incomingText, ejecutarHerramienta);
  }
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
8. Rutas de Transporte Público en CDMX: Las oficinas están ubicadas sobre la Av. Insurgentes Sur, a unas cuadras de la estación del METROBÚS OLIVO (Línea 1). Si el candidato pregunta cómo llegar, indícale de forma muy amable y precisa cómo hacerlo en transporte público:
   - En Metrobús: Tomar la Línea 1 (roja) y bajarse en la estación "Olivo", las oficinas quedan a un par de cuadras caminando.
   - Desde el Norte (ej. Indios Verdes): Tomar el Metrobús Línea 1 directo dirección sur hasta la estación "Olivo".
   - Desde el Oriente (ej. Pantitlán): Tomar Metro Línea 9 hasta Chilpancingo, y transbordar al Metrobús Línea 1 rumbo al sur hasta la estación "Olivo".
   - Desde el Poniente (ej. Observatorio / Tacubaya): Tomar Metro Línea 1 o 9 hasta Chilpancingo, y transbordar al Metrobús Línea 1 rumbo al sur hasta la estación "Olivo".
   - Desde el Sur (ej. El Caminero): Tomar el Metrobús Línea 1 directo rumbo al norte hasta la estación "Olivo".
   - Desde Metro Línea 7 (ej. Barranca del Muerto): Tomar transporte colectivo/bús sobre Av. Altavista o Barranca del Muerto hacia Insurgentes Sur, y bajarse en la estación "Olivo".
   - Desde Metro Línea 3 (ej. Viveros / Coyoacán): Tomar autobús o colectivo que vaya hacia Insurgentes Sur y bajarse en la estación "Olivo".

REGLAS ESTRICTAS:
- Responde SIEMPRE en español, mensajes cortos (2-4 líneas), tono cálido y profesional de WhatsApp.
- SOLO usa la información de este mensaje. Si no sabes algo (sueldos exactos, prestaciones no listadas, precios de servicios), di que en la entrevista o un asesor se lo confirmará. NUNCA inventes.
- No prometas contratación; la entrevista es el siguiente paso, no una oferta.
- Agenda entrevistas únicamente dentro del horario disponible indicado.
- Si la persona pide hablar con un humano, indícale que un reclutador le devolverá el mensaje y registra la nota con actualizarDatosCandidato.
${reglasExtra ? `\nREGLAS ADICIONALES DE LA EMPRESA:\n${reglasExtra}` : ''}`;

  const geminiTools = [
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
  ];

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

  if (process.env.GROQ_API_KEY) {
    return await conversarConGroq(systemInstruction, historial, incomingText, geminiTools, ejecutarHerramienta);
  } else {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const chat = model.startChat({
      history: historial,
      generationConfig: { maxOutputTokens: 600 },
      systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
      tools: [{ functionDeclarations: geminiTools }] as any,
    });
    return await conversarConHerramientas(chat, incomingText, ejecutarHerramienta);
  }
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

