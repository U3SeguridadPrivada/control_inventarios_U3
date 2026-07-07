import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { librosVisibles } from '@/src/lib/librosAcceso';

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const esAdmin = authUser.role === 'admin';
  const libros = librosVisibles(authUser).map((l) => {
    const responsable = l.usuario_id ? db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, l.usuario_id)).get() : null;
    return {
      id: l.id,
      nombre: l.nombre,
      usuario_id: l.usuario_id,
      responsable: responsable?.username || null,
      puede_editar: esAdmin || (authUser.role !== 'viewer' && l.usuario_id === authUser.id),
      // Config IMAP solo visible para el admin; la contraseña nunca se devuelve
      ...(esAdmin ? {
        imap_correo: l.imap_correo,
        imap_host: l.imap_host,
        imap_puerto: l.imap_puerto,
        imap_ssl: l.imap_ssl,
        imap_tiene_password: !!l.imap_password,
      } : {}),
    };
  });

  return Response.json(libros);
}
