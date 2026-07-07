import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/auth/setup
 * Crea el usuario admin inicial si no existe ninguno.
 * Requiere el header: x-setup-key: <JWT_SECRET>
 * Solo funciona si NO hay ningún admin en la BD.
 */
export async function POST(req: NextRequest) {
  try {
    // Verificar la clave de setup (usa el mismo JWT_SECRET)
    const setupKey = req.headers.get('x-setup-key');
    const expectedKey = process.env.JWT_SECRET;

    if (!expectedKey || setupKey !== expectedKey) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Solo permite si no existe ningún admin todavía
    const adminExistente = db.select().from(users).where(eq(users.role, 'admin')).get();
    if (adminExistente) {
      return Response.json({ error: 'Ya existe un usuario admin. Usa el panel de usuarios para crear más cuentas.' }, { status: 409 });
    }

    const { username, email, password } = await req.json();
    if (!username || !email || !password) {
      return Response.json({ error: 'username, email y password son requeridos' }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 12);
    const nuevoAdmin = db.insert(users).values({
      username,
      email,
      password_hash: hash,
      role: 'admin',
    }).returning().get();

    return Response.json({
      ok: true,
      mensaje: 'Usuario admin creado exitosamente. Ya puedes iniciar sesión.',
      usuario: { id: nuevoAdmin.id, username: nuevoAdmin.username, email: nuevoAdmin.email, role: nuevoAdmin.role },
    }, { status: 201 });

  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      return Response.json({ error: 'El usuario o email ya existe' }, { status: 409 });
    }
    return Response.json({ error: 'Error interno', details: err.message }, { status: 500 });
  }
}
