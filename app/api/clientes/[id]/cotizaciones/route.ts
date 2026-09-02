import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { cotizaciones } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { accesoDeUsuario } from '@/src/lib/accesoUsuario';
import { puedeVerModulo } from '@/src/lib/permisosModulos';

/** Cotizaciones emitidas a este cliente, para mostrarlas dentro de su perfil. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();

  const { id } = await params;
  const filas = db.select().from(cotizaciones)
    .where(eq(cotizaciones.cliente_id, Number(id)))
    .orderBy(desc(cotizaciones.id))
    .all();

  return Response.json(filas);
}
