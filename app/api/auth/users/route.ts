import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const result = db.select({ id: users.id, username: users.username, email: users.email, role: users.role, created_at: users.created_at }).from(users).orderBy(users.created_at).all();
  return Response.json(result);
}
