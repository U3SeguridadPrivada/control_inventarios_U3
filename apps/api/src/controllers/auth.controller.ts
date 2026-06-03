import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const JWT_SECRET = () => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET no configurado');
  return s;
};

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!/[A-Z]/.test(password)) return 'La contraseña debe tener al menos una mayúscula';
  if (!/[0-9]/.test(password)) return 'La contraseña debe tener al menos un número';
  return null;
}

// POST /api/auth/register — solo admin puede registrar nuevos usuarios
export async function register(req: Request, res: Response) {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
      res.status(400).json({ error: 'username, email y password son requeridos' });
      return;
    }

    const pwError = validatePassword(password);
    if (pwError) {
      res.status(400).json({ error: pwError });
      return;
    }

    // Solo admin puede asignar rol admin
    const assignedRole =
      role === 'admin' && req.user?.role === 'admin' ? 'admin' :
      role === 'editor' ? 'editor' : 'viewer';

    const hash = await bcrypt.hash(password, 12);

    const [user] = await db
      .insert(users)
      .values({ username, email, password_hash: hash, role: assignedRole })
      .returning({ id: users.id, username: users.username, role: users.role, email: users.email });

    res.status(201).json(user);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'El usuario o email ya existe' });
      return;
    }
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/auth/login
export async function login(req: Request, res: Response) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'username y password son requeridos' });
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.username, username));

    // Mismo mensaje para usuario no encontrado y contraseña incorrecta (evita enumerar usuarios)
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Credenciales incorrectas' });
      return;
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET(),
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
    });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/auth/users — lista todos los usuarios (solo admin)
export async function listUsers(req: Request, res: Response) {
  try {
    const result = await db
      .select({ id: users.id, username: users.username, email: users.email, role: users.role, created_at: users.created_at })
      .from(users)
      .orderBy(users.created_at);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PATCH /api/auth/users/:id — cambiar rol (solo admin)
export async function updateUser(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const { role } = req.body;

    if (!['admin', 'editor', 'viewer'].includes(role)) {
      res.status(400).json({ error: 'Rol inválido' });
      return;
    }
    // No puede quitarse el rol admin a sí mismo
    if (id === req.user!.id && role !== 'admin') {
      res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
      return;
    }

    const [updated] = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, id))
      .returning({ id: users.id, username: users.username, email: users.email, role: users.role });

    if (!updated) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// DELETE /api/auth/users/:id — eliminar usuario (solo admin)
export async function deleteUser(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (id === req.user!.id) {
      res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
      return;
    }

    const [deleted] = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning({ id: users.id });

    if (!deleted) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PATCH /api/auth/users/:id/password — el admin resetea contraseña de otro usuario
export async function resetPassword(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const { password } = req.body;

    const pwError = validatePassword(password);
    if (pwError) {
      res.status(400).json({ error: pwError });
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    const [updated] = await db
      .update(users)
      .set({ password_hash: hash })
      .where(eq(users.id, id))
      .returning({ id: users.id, username: users.username });

    if (!updated) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    res.json({ ok: true, username: updated.username });
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/auth/me — datos del usuario autenticado
export async function me(req: Request, res: Response) {
  try {
    const [user] = await db
      .select({ id: users.id, username: users.username, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, req.user!.id));

    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}
