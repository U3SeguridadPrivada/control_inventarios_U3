import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const { id: idStr } = await params;
  const id = Number(idStr);
  const body = await req.json();

  const updates: { role?: string; role_personalizado_id?: number | null } = {};

  if (body.role !== undefined) {
    if (!['admin', 'editor', 'viewer'].includes(body.role)) return Response.json({ error: 'Rol inválido' }, { status: 400 });
    if (id === authUser.id && body.role !== 'admin') return Response.json({ error: 'No puedes cambiar tu propio rol' }, { status: 400 });
    updates.role = body.role;
  }
  if (body.role_personalizado_id !== undefined) {
    updates.role_personalizado_id = body.role_personalizado_id ? Number(body.role_personalizado_id) : null;
  }
  if (Object.keys(updates).length === 0) return Response.json({ error: 'Nada que actualizar' }, { status: 400 });

  const updated = db.update(users).set(updates).where(eq(users.id, id)).returning({ id: users.id, username: users.username, email: users.email, role: users.role, role_personalizado_id: users.role_personalizado_id }).get();
  if (!updated) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
  return Response.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (id === authUser.id) return Response.json({ error: 'No puedes eliminar tu propia cuenta' }, { status: 400 });

  const deleted = db.delete(users).where(eq(users.id, id)).returning({ id: users.id }).get();
  if (!deleted) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
  return Response.json({ ok: true });
}
