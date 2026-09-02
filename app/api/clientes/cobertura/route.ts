import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { clientes } from '@/src/db/schema';
import { sql } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { accesoDeUsuario } from '@/src/lib/accesoUsuario';
import { puedeVerModulo } from '@/src/lib/permisosModulos';

/**
 * Cobertura por lote: cuánto de cada lote importado ya se trabajó. Contactado
 * es todo el que tiene sello de `ultimo_contacto`; avanzado es el que además
 * pasó de "Contactado" (interesado, cotizado o ganado).
 */
export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();

  const filas = db.select({
    lote: clientes.lote,
    total: sql<number>`COUNT(*)`,
    contactados: sql<number>`SUM(CASE WHEN ${clientes.ultimo_contacto} IS NOT NULL THEN 1 ELSE 0 END)`,
    avanzados: sql<number>`SUM(CASE WHEN ${clientes.etapa} IN ('Interesado','Cotizado','Ganado') THEN 1 ELSE 0 END)`,
    ganados: sql<number>`SUM(CASE WHEN ${clientes.etapa} = 'Ganado' THEN 1 ELSE 0 END)`,
    perdidos: sql<number>`SUM(CASE WHEN ${clientes.etapa} = 'Perdido' THEN 1 ELSE 0 END)`,
    conCorreo: sql<number>`SUM(CASE WHEN ${clientes.email} IS NOT NULL AND ${clientes.email} != '' THEN 1 ELSE 0 END)`,
    conTelefono: sql<number>`SUM(CASE WHEN ${clientes.telefono} IS NOT NULL AND ${clientes.telefono} != '' THEN 1 ELSE 0 END)`,
  })
    .from(clientes)
    .groupBy(clientes.lote)
    .orderBy(clientes.lote)
    .all();

  return Response.json(filas.map((f) => ({ ...f, lote: f.lote ?? 'Alta manual' })));
}
