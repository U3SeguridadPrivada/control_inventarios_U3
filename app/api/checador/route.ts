import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { checador_salidas, protocolos } from '@/src/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { promises as fs } from 'fs';
import path from 'path';

async function guardarFoto(base64Data: string, prefijo: string): Promise<string | null> {
  if (!base64Data || typeof base64Data !== 'string') return null;
  if (!base64Data.startsWith('data:image/')) {
    if (base64Data.startsWith('/api/checador/evidencia/')) return base64Data;
    return null;
  }
  try {
    const matches = base64Data.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches) return null;
    const ext = matches[1].includes('png') ? 'png' : matches[1].includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(matches[2], 'base64');
    const uploadsDir = path.join(process.cwd(), 'uploads', 'checador');
    await fs.mkdir(uploadsDir, { recursive: true });
    const fileName = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await fs.writeFile(path.join(uploadsDir, fileName), buffer);
    return `/api/checador/evidencia/${fileName}`;
  } catch (e) {
    console.error('Error guardando foto evidencia:', e);
    return null;
  }
}

/**
 * Lee y extrae en tiempo real la configuración de descansos y salidas del Capítulo IV
 * del Reglamento Interior de Trabajo (guardado en la base de datos `protocolos`).
 * De esta forma, si el reglamento se modifica, el checador adopta las nuevas reglas automáticamente.
 */
function obtenerConfiguracionSalidasReglamento() {
  const fallback = {
    protocolo_id: 23,
    titulo_seccion: 'Política de Salidas Intermedias (Breaks y Permisos Cortos)',
    actualizado_en: null as string | null,
    total_descansos: 3,
    limite_minutos_defecto: 10,
    descansos: [
      {
        id: '10_min_1',
        numero: 1,
        titulo: 'Descanso 1 (Matutino)',
        limite_minutos: 10,
        descripcion: 'Café, bebidas o paso rápido a la tienda',
        condicion: 'Registro obligatorio en checador con foto de evidencia',
      },
      {
        id: '10_min_2',
        numero: 2,
        titulo: 'Descanso 2 (Intermedio)',
        limite_minutos: 10,
        descripcion: 'Refrigerio, cajero automático o compra menor',
        condicion: 'Registro obligatorio en checador con foto de evidencia',
      },
      {
        id: '10_min_3',
        numero: 3,
        titulo: 'Descanso 3 (Vespertino)',
        limite_minutos: 10,
        descripcion: 'Zona exterior designada, fumar o descanso breve',
        condicion: 'Registro obligatorio en checador con foto de evidencia',
      },
    ],
  };

  try {
    const row =
      db.select().from(protocolos).where(eq(protocolos.id, 23)).get() ||
      db.select().from(protocolos).where(eq(protocolos.categoria, 'Reglamento')).get();

    if (!row || !row.contenido) return fallback;

    const contenido = typeof row.contenido === 'string' ? JSON.parse(row.contenido) : row.contenido;
    const secciones = contenido.secciones || [];
    const secSalidas = secciones.find(
      (s: any) =>
        s.id === 'cap-4' ||
        (s.titulo && s.titulo.toLowerCase().includes('salidas')) ||
        (s.titulo && s.titulo.toLowerCase().includes('descansos'))
    );

    if (!secSalidas) return { ...fallback, actualizado_en: row.actualizado_en };

    const tabla = secSalidas.bloques?.find((b: any) => b.tipo === 'tabla');
    if (!tabla || !Array.isArray(tabla.filas) || tabla.filas.length === 0) {
      return { ...fallback, actualizado_en: row.actualizado_en };
    }

    const descansos = tabla.filas.map((fila: string[], index: number) => {
      const titulo = fila[0] || `Descanso ${index + 1}`;
      const duracionTexto = fila[1] || '10 minutos';
      const matchNum = duracionTexto.match(/\d+/);
      const limite_minutos = matchNum ? parseInt(matchNum[0], 10) : 10;
      const descripcion = fila[2] || '';
      const condicion = fila[3] || '';

      return {
        id: `10_min_${index + 1}`,
        numero: index + 1,
        titulo,
        limite_minutos,
        descripcion,
        condicion,
      };
    });

    return {
      protocolo_id: row.id,
      titulo_seccion: secSalidas.titulo || fallback.titulo_seccion,
      actualizado_en: row.actualizado_en,
      total_descansos: descansos.length,
      limite_minutos_defecto: descansos[0]?.limite_minutos || 10,
      descansos,
    };
  } catch (err) {
    console.error('Error parseando configuración del reglamento para checador:', err);
    return fallback;
  }
}

export async function GET(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth) return unauthorized();

  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get('fecha'); // YYYY-MM-DD o vacío
  const estado = searchParams.get('estado'); // 'en_curso' | 'a_tiempo' | 'excedido' | null
  const empleado = searchParams.get('empleado');
  const soloActivas = searchParams.get('solo_activas') === 'true';

  try {
    const todayStr = new Date().toISOString().slice(0, 10);

    // Configuración viva desde el Capítulo IV del Reglamento Interior
    const configReglamento = obtenerConfiguracionSalidasReglamento();
    const maxDescansosPorReglamento = configReglamento.total_descansos;

    // Obtenemos los registros ordenados por fecha de salida descendente
    const allRecords = await db
      .select()
      .from(checador_salidas)
      .orderBy(desc(checador_salidas.hora_salida));

    // Calculamos métricas globales de HOY
    const registrosHoy = allRecords.filter(
      (r) => r.hora_salida && r.hora_salida.slice(0, 10) === todayStr
    );

    const activasAhora = allRecords.filter((r) => r.estado === 'en_curso');
    const completadasHoy = registrosHoy.filter((r) => r.estado !== 'en_curso');
    const aTiempoHoy = registrosHoy.filter((r) => r.estado === 'a_tiempo');
    const excedidasHoy = registrosHoy.filter((r) => r.estado === 'excedido');

    const totalSegundosHoy = completadasHoy.reduce((acc, r) => acc + (r.duracion_segundos || 0), 0);
    const promedioMinutos = completadasHoy.length > 0
      ? Math.round(((totalSegundosHoy / completadasHoy.length) / 60) * 10) / 10
      : 0;
    const porcentajeCumplimiento = completadasHoy.length > 0
      ? Math.round((aTiempoHoy.length / completadasHoy.length) * 100)
      : 100;

    // Resumen dinámico por oficinista enlazado al cupo del reglamento
    const descansosPorEmpleadoHoy: Record<string, {
      total_10min: number;
      restantes_10min: number;
      cupo_agotado: boolean;
      detalles: Array<{
        id: number;
        numero_descanso: number;
        hora_salida: string;
        hora_entrada: string | null;
        duracion_segundos: number | null;
        estado: string;
        foto_evidencia: string | null;
      }>;
    }> = {};

    registrosHoy.forEach((r) => {
      const emp = (r.nombre_empleado || '').trim();
      if (!emp) return;
      if (!descansosPorEmpleadoHoy[emp]) {
        descansosPorEmpleadoHoy[emp] = {
          total_10min: 0,
          restantes_10min: maxDescansosPorReglamento,
          cupo_agotado: false,
          detalles: [],
        };
      }
      if (r.tipo_salida === '10_min') {
        descansosPorEmpleadoHoy[emp].total_10min += 1;
      }
      descansosPorEmpleadoHoy[emp].detalles.push({
        id: r.id,
        numero_descanso: r.numero_descanso || 1,
        hora_salida: r.hora_salida,
        hora_entrada: r.hora_entrada,
        duracion_segundos: r.duracion_segundos,
        estado: r.estado,
        foto_evidencia: r.foto_evidencia,
      });
    });

    Object.keys(descansosPorEmpleadoHoy).forEach((emp) => {
      const usados = descansosPorEmpleadoHoy[emp].total_10min;
      descansosPorEmpleadoHoy[emp].restantes_10min = Math.max(0, maxDescansosPorReglamento - usados);
      descansosPorEmpleadoHoy[emp].cupo_agotado = usados >= maxDescansosPorReglamento;
    });

    // Filtramos para la respuesta según query params
    let filtrados = allRecords;

    if (soloActivas) {
      filtrados = filtrados.filter((r) => r.estado === 'en_curso');
    } else {
      if (fecha && fecha !== 'todas') {
        filtrados = filtrados.filter((r) => r.hora_salida && r.hora_salida.slice(0, 10) === fecha);
      }
      if (estado && estado !== 'todos') {
        filtrados = filtrados.filter((r) => r.estado === estado);
      }
      if (empleado && empleado.trim()) {
        const busq = empleado.trim().toLowerCase();
        filtrados = filtrados.filter((r) => r.nombre_empleado.toLowerCase().includes(busq));
      }
    }

    // Nombres de empleados sugeridos para autocompletado rápido
    const nombresSet = new Set<string>();
    allRecords.forEach((r) => {
      if (r.nombre_empleado) nombresSet.add(r.nombre_empleado.trim());
    });
    if (auth.username) nombresSet.add(auth.username.trim());

    return Response.json({
      registros: filtrados,
      configuracion_reglamento: configReglamento,
      empleados_sugeridos: Array.from(nombresSet).sort(),
      resumen_oficinistas_hoy: descansosPorEmpleadoHoy,
      metricas: {
        activas_ahora: activasAhora.length,
        total_hoy: registrosHoy.length,
        completadas_hoy: completadasHoy.length,
        a_tiempo_hoy: aTiempoHoy.length,
        excedidas_hoy: excedidasHoy.length,
        porcentaje_cumplimiento: porcentajeCumplimiento,
        promedio_minutos: promedioMinutos,
      },
    });
  } catch (err: any) {
    console.error('Error en GET /api/checador:', err);
    return Response.json({ error: 'Error al consultar el checador' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth) return unauthorized();

  try {
    const body = await req.json();
    const action = body.action || 'salida';

    if (action === 'salida') {
      const nombre_empleado = (body.nombre_empleado || '').trim();
      if (!nombre_empleado) {
        return Response.json({ error: 'El nombre del empleado es obligatorio' }, { status: 400 });
      }

      // Leemos la configuración vigente del reglamento
      const configReglamento = obtenerConfiguracionSalidasReglamento();

      const tipo_salida = body.tipo_salida || '10_min';
      let limite_minutos = Number(body.limite_minutos);

      // Si no viene límite explícito y es salida de reglamento, tomarlo de la configuración
      if (!limite_minutos) {
        limite_minutos = configReglamento.limite_minutos_defecto || 10;
      }

      const departamento = body.departamento || 'Oficinas';
      const motivo = (body.motivo || '').trim();
      const hora_salida = body.hora_salida || new Date().toISOString();
      const todayStr = hora_salida.slice(0, 10);

      // 1. Verificar si ya tiene una salida activa en curso
      const [existente] = await db
        .select()
        .from(checador_salidas)
        .where(
          and(
            eq(checador_salidas.nombre_empleado, nombre_empleado),
            eq(checador_salidas.estado, 'en_curso')
          )
        );

      if (existente) {
        return Response.json(
          {
            error: `${nombre_empleado} ya tiene una salida en curso iniciada a las ${new Date(
              existente.hora_salida
            ).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}. Registre el regreso antes de marcar otra salida.`,
            registro_existente: existente,
          },
          { status: 400 }
        );
      }

      // 2. Calcular qué número de descanso es hoy
      const registrosHoyEmpleado = await db
        .select()
        .from(checador_salidas)
        .where(eq(checador_salidas.nombre_empleado, nombre_empleado));

      const salidas10MinHoy = registrosHoyEmpleado.filter(
        (r) =>
          r.hora_salida &&
          r.hora_salida.slice(0, 10) === todayStr &&
          r.tipo_salida === '10_min'
      );

      const numero_descanso = tipo_salida === '10_min' ? salidas10MinHoy.length + 1 : 1;

      // Si el descanso corresponde a una fila del reglamento, aseguramos el límite exacto
      if (tipo_salida === '10_min' && configReglamento.descansos[numero_descanso - 1]) {
        limite_minutos = configReglamento.descansos[numero_descanso - 1].limite_minutos;
      }

      // 3. Procesar foto de evidencia si fue proporcionada
      const foto_evidencia = await guardarFoto(body.foto_evidencia, 'evidencia');

      const [nuevo] = await db
        .insert(checador_salidas)
        .values({
          usuario_id: body.usuario_id || (auth.id ? auth.id : null),
          nombre_empleado,
          departamento,
          tipo_salida,
          limite_minutos,
          numero_descanso,
          foto_evidencia: foto_evidencia || null,
          foto_regreso: null,
          hora_salida,
          hora_entrada: null,
          duracion_segundos: null,
          estado: 'en_curso',
          motivo: motivo || null,
          justificacion: null,
          registrado_por: auth.username,
        })
        .returning();

      return Response.json({
        success: true,
        registro: nuevo,
        numero_descanso,
        alcanzo_limite: numero_descanso >= configReglamento.total_descansos,
      });
    }

    if (action === 'entrada') {
      const id = Number(body.id);
      if (!id) {
        return Response.json({ error: 'ID de registro requerido' }, { status: 400 });
      }

      const [registro] = await db
        .select()
        .from(checador_salidas)
        .where(eq(checador_salidas.id, id));

      if (!registro) {
        return Response.json({ error: 'Registro de salida no encontrado' }, { status: 404 });
      }

      if (registro.estado !== 'en_curso' && !body.forzar) {
        return Response.json({ error: 'Esta salida ya fue finalizada anteriormente' }, { status: 400 });
      }

      const hora_entrada = body.hora_entrada || new Date().toISOString();
      const salidaMs = new Date(registro.hora_salida).getTime();
      const entradaMs = new Date(hora_entrada).getTime();
      const duracion_segundos = Math.max(0, Math.round((entradaMs - salidaMs) / 1000));

      const limite_segundos = (registro.limite_minutos || 10) * 60;
      // Margen de cortesía de 30 segundos
      const estado = duracion_segundos <= limite_segundos + 30 ? 'a_tiempo' : 'excedido';

      const justificacion = (body.justificacion || registro.justificacion || '').trim();

      // Procesar foto de regreso si se adjuntó
      let foto_regreso = registro.foto_regreso;
      if (body.foto_regreso) {
        foto_regreso = await guardarFoto(body.foto_regreso, 'regreso');
      }

      const [actualizado] = await db
        .update(checador_salidas)
        .set({
          hora_entrada,
          duracion_segundos,
          estado,
          foto_regreso,
          justificacion: justificacion || null,
        })
        .where(eq(checador_salidas.id, id))
        .returning();

      return Response.json({ success: true, registro: actualizado });
    }

    if (action === 'justificar') {
      const id = Number(body.id);
      const justificacion = (body.justificacion || '').trim();
      if (!id) return Response.json({ error: 'ID requerido' }, { status: 400 });

      const [actualizado] = await db
        .update(checador_salidas)
        .set({ justificacion: justificacion || null })
        .where(eq(checador_salidas.id, id))
        .returning();

      return Response.json({ success: true, registro: actualizado });
    }

    return Response.json({ error: 'Acción no soportada' }, { status: 400 });
  } catch (err: any) {
    console.error('Error en POST /api/checador:', err);
    return Response.json({ error: err.message || 'Error al procesar checador' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = verifyAuth(req);
  if (!auth) return unauthorized();
  if (auth.role !== 'admin' && auth.role !== 'editor') return forbidden();

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  if (!id) return Response.json({ error: 'ID requerido' }, { status: 400 });

  try {
    await db.delete(checador_salidas).where(eq(checador_salidas.id, id));
    return Response.json({ success: true });
  } catch (err: any) {
    console.error('Error en DELETE /api/checador:', err);
    return Response.json({ error: 'Error al eliminar registro' }, { status: 500 });
  }
}
