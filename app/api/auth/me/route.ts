import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const user = db.select({ id: users.id, username: users.username, email: users.email, role: users.role }).from(users).where(eq(users.id, authUser.id)).get();
  if (!user) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
  return Response.json(user);
}
