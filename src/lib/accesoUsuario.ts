import { db } from '@/src/db';
import { users, roles_personalizados } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { getRoleByEmail } from '@/src/utils/roleMapping';
import type { AccesoUsuario } from '@/src/lib/permisosModulos';

/**
 * Resuelve el acceso del usuario leyendo la base de datos. A proposito no
 * viaja dentro del token: asi un cambio de rol, de correo o de .env.local
 * aplica de inmediato, sin esperar a que caduque la sesion.
 *
 * Solo debe usarse en el servidor (importa la base de datos).
 */
export function accesoDeUsuario(userId: number): AccesoUsuario | null {
  const fila = db
    .select({
      email: users.email,
      role: users.role,
      permisos: roles_personalizados.permisos,
    })
    .from(users)
    .leftJoin(roles_personalizados, eq(users.role_personalizado_id, roles_personalizados.id))
    .where(eq(users.id, userId))
    .get();

  if (!fila) return null;

  return {
    role: fila.role as AccesoUsuario['role'],
    areaRole: getRoleByEmail(fila.email),
    permisos: fila.permisos ?? null,
  };
}
