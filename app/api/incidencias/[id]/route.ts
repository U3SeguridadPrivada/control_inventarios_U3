import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { incidencias } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  const { id } = await params;
  try {
    const { tipo, gravedad, descripcion, estado } = await req.json();
    const updated = db.update(incidencias)
      .set({ tipo, gravedad, descripcion, estado })
      .where(eq(incidencias.id, Number(id)))
      .returning()
      .get();
    if (!updated) return Response.json({ error: 'Incidencia no encontrada' }, { status: 404 });
    return Response.json(updated);
  } catch {
    return Response.json({ error: 'Error al actualizar la incidencia' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const { id } = await params;
  db.delete(incidencias).where(eq(incidencias.id, Number(id))).run();
  return Response.json({ ok: true });
}
