import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { eventos_calendario, candidatos } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

function puedeEditar(evento: { creado_por: number }, authUser: { id: number; role: string }) {
  return evento.creado_por === authUser.id || authUser.role === 'admin';
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  try {
    const { id } = await params;
    const eventoId = Number(id);
    const evento = db.select().from(eventos_calendario).where(eq(eventos_calendario.id, eventoId)).get();
    if (!evento) return Response.json({ error: 'Evento no encontrado' }, { status: 404 });
    if (!puedeEditar(evento, authUser)) return Response.json({ error: 'Sin permisos' }, { status: 403 });

    const { titulo, descripcion, fecha_inicio, fecha_fin, todo_el_dia, guardia_id, notificar_minutos_antes } = await req.json();
    const actualizado = db.update(eventos_calendario).set({
      titulo, descripcion: descripcion || null, fecha_inicio, fecha_fin: fecha_fin || null,
      todo_el_dia: todo_el_dia ? 1 : 0, guardia_id: guardia_id ? Number(guardia_id) : null,
      notificar_minutos_antes: notificar_minutos_antes ? Number(notificar_minutos_antes) : null,
      notificado: 0,
    }).where(eq(eventos_calendario.id, eventoId)).returning().get();

    // Si este evento es la entrevista de un candidato, sincroniza la fecha en Reclutamiento.
    db.update(candidatos).set({ fecha_entrevista: actualizado.fecha_inicio }).where(eq(candidatos.evento_id, eventoId)).run();

    return Response.json(actualizado);
  } catch {
    return Response.json({ error: 'Error al actualizar el evento' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const { id } = await params;
  const eventoId = Number(id);
  const { accion } = await req.json();
  if (accion === 'notificado') {
    db.update(eventos_calendario).set({ notificado: 1 }).where(eq(eventos_calendario.id, eventoId)).run();
    return Response.json({ success: true });
  }
  return Response.json({ error: 'Acción no reconocida' }, { status: 400 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const { id } = await params;
  const eventoId = Number(id);
  const evento = db.select().from(eventos_calendario).where(eq(eventos_calendario.id, eventoId)).get();
  if (!evento) return Response.json({ error: 'Evento no encontrado' }, { status: 404 });
  if (!puedeEditar(evento, authUser)) return Response.json({ error: 'Sin permisos' }, { status: 403 });

  // Si es la entrevista de un candidato, limpia su cita en Reclutamiento para no dejarla huérfana.
  db.update(candidatos).set({ fecha_entrevista: null, evento_id: null }).where(eq(candidatos.evento_id, eventoId)).run();
  db.delete(eventos_calendario).where(eq(eventos_calendario.id, eventoId)).run();
  return Response.json({ success: true });
}
