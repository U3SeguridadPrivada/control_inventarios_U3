import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const contactos = db.select({ id: users.id, username: users.username, email: users.email }).from(users).all();
  return Response.json(contactos.filter((u) => u.id !== authUser.id));
}
