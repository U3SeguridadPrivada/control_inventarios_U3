import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { checador_salidas } from '@/src/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

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

    // Obtenemos los registros
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
    const promedioMinutos = completadasHoy.length > 0 ? Math.round((totalSegundosHoy / completadasHoy.length) / 60 * 10) / 10 : 0;
    const porcentajeCumplimiento = completadasHoy.length > 0
      ? Math.round((aTiempoHoy.length / completadasHoy.length) * 100)
      : 100;

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
    // Agregamos el usuario actual
    if (auth.username) nombresSet.add(auth.username.trim());

    return Response.json({
      registros: filtrados,
      empleados_sugeridos: Array.from(nombresSet).sort(),
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

      const limite_minutos = Number(body.limite_minutos) || 10;
      const tipo_salida = body.tipo_salida || '10_min';
      const departamento = body.departamento || 'Oficinas';
      const motivo = (body.motivo || '').trim();
      const hora_salida = body.hora_salida || new Date().toISOString();

      // Verificar si ya tiene una salida activa en curso
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

      const [nuevo] = await db
        .insert(checador_salidas)
        .values({
          usuario_id: body.usuario_id || (auth.id ? auth.id : null),
          nombre_empleado,
          departamento,
          tipo_salida,
          limite_minutos,
          hora_salida,
          hora_entrada: null,
          duracion_segundos: null,
          estado: 'en_curso',
          motivo: motivo || null,
          justificacion: null,
          registrado_por: auth.username,
        })
        .returning();

      return Response.json({ success: true, registro: nuevo });
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
      // Se da un margen de cortesía de 30 segundos antes de considerar retardo
      const estado = duracion_segundos <= limite_segundos + 30 ? 'a_tiempo' : 'excedido';

      const justificacion = (body.justificacion || registro.justificacion || '').trim();

      const [actualizado] = await db
        .update(checador_salidas)
        .set({
          hora_entrada,
          duracion_segundos,
          estado,
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
