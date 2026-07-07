import { db } from '@/src/db';
import { libros_financieros } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import type { AuthUser } from '@/src/lib/auth';

// Reglas de acceso a los libros/cuentas de finanzas:
// - admin: ve y modifica todos, y asigna responsables.
// - viewer: ve todos en solo lectura.
// - editor: solo ve y modifica el libro donde es el responsable asignado.

export function librosVisibles(user: AuthUser) {
  const todos = db.select().from(libros_financieros).orderBy(libros_financieros.id).all();
  if (user.role === 'admin' || user.role === 'viewer') return todos;
  return todos.filter((l) => l.usuario_id === user.id);
}

export function puedeVerLibro(user: AuthUser, libroId: string): boolean {
  if (user.role === 'admin' || user.role === 'viewer') return true;
  const libro = db.select().from(libros_financieros).where(eq(libros_financieros.id, libroId)).get();
  return !!libro && libro.usuario_id === user.id;
}

export function puedeEditarLibro(user: AuthUser, libroId: string): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'viewer') return false;
  const libro = db.select().from(libros_financieros).where(eq(libros_financieros.id, libroId)).get();
  return !!libro && libro.usuario_id === user.id;
}
