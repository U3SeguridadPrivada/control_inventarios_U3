import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { verifyAuth, unauthorized, forbidden, validatePassword } from '@/src/lib/auth';

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  try {
    const { username, email, password, role } = await req.json();
    if (!username || !email || !password) return Response.json({ error: 'username, email y password son requeridos' }, { status: 400 });

    const pwError = validatePassword(password);
    if (pwError) return Response.json({ error: pwError }, { status: 400 });

    const assignedRole = role === 'admin' && authUser.role === 'admin' ? 'admin' : role === 'editor' ? 'editor' : 'viewer';
    const hash = await bcrypt.hash(password, 12);

    const [user] = db.insert(users).values({ username, email, password_hash: hash, role: assignedRole }).returning({ id: users.id, username: users.username, role: users.role, email: users.email }).all();
    return Response.json(user, { status: 201 });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return Response.json({ error: 'El usuario o email ya existe' }, { status: 409 });
    }
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
