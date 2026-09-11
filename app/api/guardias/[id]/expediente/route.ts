import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { salidas, entradas, guardias } from '@/src/db/schema';
import { eq, desc, or } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAuth(req)) return unauthorized();
  const { id } = await params;
  const guardiaId = Number(id);

  // Obtener nombre del guardia para recuperar movimientos históricos con nombre
  const guardia = db.select().from(guardias).where(eq(guardias.id, guardiaId)).get();
  const nombre = guardia?.nombre;

  const whereSalidas = nombre
    ? or(eq(salidas.guardia_id, guardiaId), eq(salidas.nombre_guardia, nombre))
    : eq(salidas.guardia_id, guardiaId);

  const expedienteSalidas = db.select().from(salidas).where(whereSalidas).orderBy(desc(salidas.fecha)).all();
  const expedienteEntradas = db.select().from(entradas).where(eq(entradas.guardia_id, guardiaId)).orderBy(desc(entradas.fecha)).all();
  return Response.json({ salidas: expedienteSalidas, entradas: expedienteEntradas });
}
