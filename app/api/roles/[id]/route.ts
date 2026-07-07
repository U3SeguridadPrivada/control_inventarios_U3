import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { roles_personalizados } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const { id } = await params;
  try {
    const { nombre, descripcion, permisos, color } = await req.json();
    const updated = db.update(roles_personalizados)
      .set({ nombre, descripcion, permisos, color })
      .where(eq(roles_personalizados.id, Number(id)))
      .returning()
      .get();
    if (!updated) return Response.json({ error: 'Rol no encontrado' }, { status: 404 });
    return Response.json(updated);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) return Response.json({ error: 'Ya existe un rol con ese nombre' }, { status: 409 });
    return Response.json({ error: 'Error al actualizar el rol' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const { id } = await params;
  db.delete(roles_personalizados).where(eq(roles_personalizados.id, Number(id))).run();
  return Response.json({ ok: true });
}
