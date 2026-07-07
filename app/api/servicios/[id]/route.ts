import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { servicios, servicio_guardias } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  try {
    const { id } = await params;
    const servicioId = Number(id);
    const { nombre, direccion, lat, lng } = await req.json();

    const actualizado = db.update(servicios).set({
      ...(nombre !== undefined ? { nombre } : {}),
      ...(direccion !== undefined ? { direccion } : {}),
      ...(lat !== undefined ? { lat: Number(lat) } : {}),
      ...(lng !== undefined ? { lng: Number(lng) } : {}),
    }).where(eq(servicios.id, servicioId)).returning().get();

    if (!actualizado) return Response.json({ error: 'Servicio no encontrado' }, { status: 404 });
    return Response.json(actualizado);
  } catch {
    return Response.json({ error: 'Error al actualizar el servicio' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  const { id } = await params;
  const servicioId = Number(id);
  db.delete(servicio_guardias).where(eq(servicio_guardias.servicio_id, servicioId)).run();
  db.delete(servicios).where(eq(servicios.id, servicioId)).run();
  return Response.json({ success: true });
}
