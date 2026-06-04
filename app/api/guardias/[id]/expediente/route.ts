import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { salidas, entradas } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAuth(req)) return unauthorized();
  const { id } = await params;
  const guardiaId = Number(id);
  const expedienteSalidas = db.select().from(salidas).where(eq(salidas.guardia_id, guardiaId)).orderBy(desc(salidas.fecha)).all();
  const expedienteEntradas = db.select().from(entradas).where(eq(entradas.guardia_id, guardiaId)).orderBy(desc(entradas.fecha)).all();
  return Response.json({ salidas: expedienteSalidas, entradas: expedienteEntradas });
}
