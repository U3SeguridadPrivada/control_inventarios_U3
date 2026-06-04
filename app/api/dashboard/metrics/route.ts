import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { entradas, salidas, guardias } from '@/src/db/schema';
import { sql, desc } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();

  const entradasAgg = db.select({ total: sql<number>`COALESCE(SUM(${entradas.cantidad}), 0)` }).from(entradas).get();
  const salidasAgg = db.select({
    total:   sql<number>`COALESCE(SUM(${salidas.cantidad}), 0)`,
    enCampo: sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Campo' THEN ${salidas.cantidad} ELSE 0 END), 0)`,
  }).from(salidas).get();
  const guardiasAgg = db.select({ activos: sql<number>`SUM(CASE WHEN ${guardias.estado} = 'Activo' THEN 1 ELSE 0 END)` }).from(guardias).get();

  const chartEntradas = db.select({ fecha: entradas.fecha, cantidad: sql<number>`SUM(${entradas.cantidad})` }).from(entradas).groupBy(entradas.fecha).orderBy(desc(entradas.fecha)).limit(10).all();
  const chartSalidas  = db.select({ fecha: salidas.fecha,  cantidad: sql<number>`SUM(${salidas.cantidad})`  }).from(salidas).groupBy(salidas.fecha).orderBy(desc(salidas.fecha)).limit(10).all();

  const dateMap: Record<string, { Entradas: number; Salidas: number }> = {};
  for (const e of chartEntradas) { const d = e.fecha.substring(5); if (!dateMap[d]) dateMap[d] = { Entradas: 0, Salidas: 0 }; dateMap[d].Entradas += Number(e.cantidad); }
  for (const s of chartSalidas)  { const d = s.fecha.substring(5); if (!dateMap[d]) dateMap[d] = { Entradas: 0, Salidas: 0 }; dateMap[d].Salidas  += Number(s.cantidad); }
  const chartData = Object.keys(dateMap).sort().slice(-10).map(fecha => ({ fecha, Entradas: dateMap[fecha].Entradas, Salidas: dateMap[fecha].Salidas }));

  const recentEnt = db.select({ id: entradas.id, fecha: entradas.fecha, cantidad: entradas.cantidad, articulo: entradas.articulo, motivo: entradas.motivo }).from(entradas).orderBy(desc(entradas.id)).limit(4).all();
  const recentSal = db.select({ id: salidas.id,  fecha: salidas.fecha,  cantidad: salidas.cantidad,  articulo: salidas.articulo,  concepto: salidas.concepto  }).from(salidas).orderBy(desc(salidas.id)).limit(4).all();

  const recentMovements = [
    ...recentEnt.map(e => ({ id: `ent-${e.id}`, tipo: 'Entrada', fecha: e.fecha, cantidad: e.cantidad, articulo: e.articulo, motivo: e.motivo })),
    ...recentSal.map(s => ({ id: `sal-${s.id}`, tipo: 'Salida',  fecha: s.fecha, cantidad: s.cantidad, articulo: s.articulo, motivo: s.concepto })),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, 8);

  return Response.json({
    metrics: { totalEntradas: Number(entradasAgg!.total), totalSalidas: Number(salidasAgg!.total), itemsEnCampo: Number(salidasAgg!.enCampo), guardiasActivos: Number(guardiasAgg!.activos ?? 0) },
    chartData,
    recentMovements,
  });
}
