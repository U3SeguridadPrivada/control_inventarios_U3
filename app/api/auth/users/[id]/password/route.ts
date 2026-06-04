import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden, validatePassword } from '@/src/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const { id: idStr } = await params;
  const { password } = await req.json();
  const pwError = validatePassword(password);
  if (pwError) return Response.json({ error: pwError }, { status: 400 });

  const hash = await bcrypt.hash(password, 12);
  const updated = db.update(users).set({ password_hash: hash }).where(eq(users.id, Number(idStr))).returning({ id: users.id, username: users.username }).get();
  if (!updated) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
  return Response.json({ ok: true, username: updated.username });
}
