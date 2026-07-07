import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { eventos_calendario } from '@/src/db/schema';
import { and, gte, lte, eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const proximos = req.nextUrl.searchParams.get('proximos');
  if (proximos) {
    const nowIso = new Date().toISOString();
    const eventos = db.select().from(eventos_calendario).where(eq(eventos_calendario.notificado, 0)).all();
    const now = Date.now();
    const listos = eventos.filter((e) => {
      if (!e.notificar_minutos_antes) return false;
      const inicio = new Date(e.fecha_inicio).getTime();
      const avisoDesde = inicio - e.notificar_minutos_antes * 60_000;
      return now >= avisoDesde && now <= inicio;
    });
    return Response.json(listos);
  }

  const desde = req.nextUrl.searchParams.get('desde');
  const hasta = req.nextUrl.searchParams.get('hasta');
  if (desde && hasta) {
    return Response.json(
      db.select().from(eventos_calendario)
        .where(and(gte(eventos_calendario.fecha_inicio, desde), lte(eventos_calendario.fecha_inicio, hasta)))
        .all()
    );
  }

  return Response.json(db.select().from(eventos_calendario).all());
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  try {
    const { titulo, descripcion, fecha_inicio, fecha_fin, todo_el_dia, guardia_id, notificar_minutos_antes } = await req.json();
    if (!titulo || !fecha_inicio) return Response.json({ error: 'Faltan campos requeridos' }, { status: 400 });

    const nuevo = db.insert(eventos_calendario).values({
      titulo,
      descripcion: descripcion || null,
      fecha_inicio,
      fecha_fin: fecha_fin || null,
      todo_el_dia: todo_el_dia ? 1 : 0,
      creado_por: authUser.id,
      guardia_id: guardia_id ? Number(guardia_id) : null,
      notificar_minutos_antes: notificar_minutos_antes ? Number(notificar_minutos_antes) : null,
    }).returning().get();
    return Response.json(nuevo, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al crear el evento' }, { status: 500 });
  }
}
