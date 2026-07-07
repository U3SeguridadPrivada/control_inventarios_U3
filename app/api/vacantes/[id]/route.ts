import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { vacantes } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  const { id } = await params;
  try {
    const { puesto, ubicacion, turno, sueldo, requisitos, descripcion, activa } = await req.json();
    const updated = db.update(vacantes)
      .set({ puesto, ubicacion, turno, sueldo, requisitos, descripcion, activa: activa === false || activa === 0 ? 0 : 1 })
      .where(eq(vacantes.id, Number(id)))
      .returning()
      .get();
    if (!updated) return Response.json({ error: 'Vacante no encontrada' }, { status: 404 });
    return Response.json(updated);
  } catch {
    return Response.json({ error: 'Error al actualizar la vacante' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const { id } = await params;
  db.delete(vacantes).where(eq(vacantes.id, Number(id))).run();
  return Response.json({ ok: true });
}
