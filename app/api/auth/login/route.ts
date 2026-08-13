import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq, or } from 'drizzle-orm';
import { signToken } from '@/src/lib/auth';
import { accesoDeUsuario } from '@/src/lib/accesoUsuario';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) return Response.json({ error: 'username y password son requeridos' }, { status: 400 });

    // Acepta nombre de usuario o correo indistintamente
    const user = db.select().from(users).where(or(eq(users.username, username), eq(users.email, username))).get();
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return Response.json({ error: 'Credenciales incorrectas' }, { status: 401 });
    }

    const token = signToken({ id: user.id, username: user.username, role: user.role as any });
    const acceso = accesoDeUsuario(user.id);
    return Response.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        areaRole: acceso?.areaRole ?? 'unknown',
        permisos: acceso?.permisos ?? null,
      },
    });
  } catch {
    return Response.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
