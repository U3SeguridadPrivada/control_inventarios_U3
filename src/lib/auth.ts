import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
}

export function verifyAuth(req: NextRequest): AuthUser | null {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    return jwt.verify(auth.slice(7), secret) as AuthUser;
  } catch {
    return null;
  }
}

export function signToken(payload: AuthUser): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET no configurado');
  return jwt.sign(payload, secret, { expiresIn: '8h' });
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  if (!/[A-Z]/.test(password)) return 'La contraseña debe tener al menos una mayúscula';
  if (!/[0-9]/.test(password)) return 'La contraseña debe tener al menos un número';
  return null;
}

export function unauthorized() {
  return Response.json({ error: 'No autorizado' }, { status: 401 });
}

export function forbidden() {
  return Response.json({ error: 'Sin permisos' }, { status: 403 });
}
