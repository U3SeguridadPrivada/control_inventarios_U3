import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/src/db';
import { users, password_resets } from '@/src/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();
    if (!token || !password) return Response.json({ error: 'Token y contraseña son requeridos' }, { status: 400 });
    if (String(password).length < 6) return Response.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });

    const reset = db.select().from(password_resets).where(eq(password_resets.token, token)).get();
    if (!reset || reset.usado || reset.expira < new Date().toISOString()) {
      return Response.json({ error: 'El enlace no es válido o ya venció. Solicita uno nuevo.' }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 10);
    db.update(users).set({ password_hash: hash }).where(eq(users.id, reset.user_id)).run();
    db.update(password_resets).set({ usado: 1 }).where(eq(password_resets.id, reset.id)).run();

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'No se pudo restablecer la contraseña' }, { status: 500 });
  }
}
