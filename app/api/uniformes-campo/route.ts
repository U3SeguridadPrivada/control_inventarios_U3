import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { salidas } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();

  const records = db.select({
    id: salidas.id, fecha: salidas.fecha, articulo: salidas.articulo, talla: salidas.talla,
    cantidad: salidas.cantidad, guardiaId: salidas.guardia_id, nombreGuardia: salidas.nombre_guardia,
  }).from(salidas).where(eq(salidas.estado_asignacion, 'Uniforme en Campo')).all();

  const grouped: any = {};
  for (const record of records) {
    if (!record.guardiaId) continue;
    if (!grouped[record.guardiaId]) grouped[record.guardiaId] = { guardiaId: record.guardiaId, nombreGuardia: record.nombreGuardia, articulos: [] };
    const artKey = `${record.articulo}|||${record.talla ?? ''}`;
    const existing = grouped[record.guardiaId].articulos.find((a: any) => a._key === artKey);
    if (existing) { existing.cantidad += record.cantidad; if (record.fecha < existing.fecha) existing.fecha = record.fecha; }
    else grouped[record.guardiaId].articulos.push({ _key: artKey, fecha: record.fecha, articulo: record.articulo, talla: record.talla, cantidad: record.cantidad });
  }
  const output = Object.values(grouped).map((g: any) => ({ ...g, articulos: g.articulos.map(({ _key, ...rest }: any) => rest) }));
  return Response.json(output);
}
