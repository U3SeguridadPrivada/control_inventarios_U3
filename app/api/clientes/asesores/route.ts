import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { accesoDeUsuario } from '@/src/lib/accesoUsuario';
import { puedeVerModulo } from '@/src/lib/permisosModulos';

/**
 * Usuarios a los que se les puede asignar cartera: los que tienen acceso al
 * módulo de clientes. No expone correos ni nada más que el nombre, porque solo
 * alimenta el selector de asesor.
 */
export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();

  const todos = db.select({ id: users.id, username: users.username, role: users.role }).from(users).all();
  const asesores = todos
    .filter((u) => u.role !== 'viewer' && puedeVerModulo('clientes', accesoDeUsuario(u.id)))
    .map((u) => ({ id: u.id, username: u.username }));

  return Response.json(asesores);
}
