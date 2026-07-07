import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { mensajes } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  try {
    const { id } = await params;
    const mensajeId = Number(id);
    const { accion } = await req.json();

    const mensaje = db.select().from(mensajes).where(eq(mensajes.id, mensajeId)).get();
    if (!mensaje) return Response.json({ error: 'Mensaje no encontrado' }, { status: 404 });

    const esDestinatario = mensaje.destinatario_id === authUser.id;
    const esRemitente = mensaje.remitente_id === authUser.id;
    if (!esDestinatario && !esRemitente) return Response.json({ error: 'Sin permisos' }, { status: 403 });

    if (accion === 'leido') {
      if (!esDestinatario) return Response.json({ error: 'Sin permisos' }, { status: 403 });
      db.update(mensajes).set({ leido: 1 }).where(eq(mensajes.id, mensajeId)).run();
    } else if (accion === 'destacado') {
      db.update(mensajes).set({ destacado: 1 }).where(eq(mensajes.id, mensajeId)).run();
    } else if (accion === 'quitar-destacado') {
      db.update(mensajes).set({ destacado: 0 }).where(eq(mensajes.id, mensajeId)).run();
    } else if (accion === 'papelera') {
      if (esDestinatario) db.update(mensajes).set({ eliminado_destinatario: 1 }).where(eq(mensajes.id, mensajeId)).run();
      else db.update(mensajes).set({ eliminado_remitente: 1 }).where(eq(mensajes.id, mensajeId)).run();
    } else if (accion === 'restaurar') {
      if (esDestinatario) db.update(mensajes).set({ eliminado_destinatario: 0 }).where(eq(mensajes.id, mensajeId)).run();
      else db.update(mensajes).set({ eliminado_remitente: 0 }).where(eq(mensajes.id, mensajeId)).run();
    } else {
      return Response.json({ error: 'Acción no reconocida' }, { status: 400 });
    }

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Error al actualizar el mensaje' }, { status: 500 });
  }
}
