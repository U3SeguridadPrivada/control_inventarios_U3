import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { entradas, salidas } from '@/src/db/schema';
import { sql } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();

  const entsDetalle = db.select({
    articulo: entradas.articulo, talla: entradas.talla, estado: entradas.estado,
    total: sql<number>`SUM(${entradas.cantidad})`,
  }).from(entradas).groupBy(entradas.articulo, entradas.talla, entradas.estado).all();

  const salsDetalle = db.select({
    articulo: salidas.articulo, talla: salidas.talla, estado_fisico: salidas.estado_fisico,
    enCampo:      sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Campo'    THEN ${salidas.cantidad} ELSE 0 END)`,
    enBajas:      sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Bajas'    THEN ${salidas.cantidad} ELSE 0 END)`,
    definitivos:  sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Entregado Definitivo' THEN ${salidas.cantidad} ELSE 0 END)`,
    devueltos:    sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Devuelto' THEN ${salidas.cantidad} ELSE 0 END)`,
    extraviados:  sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Extraviado' THEN ${salidas.cantidad} ELSE 0 END)`,
    inutilizables_directos: sql<number>`SUM(CASE WHEN (${salidas.concepto} = 'Inutilizable' AND ${salidas.estado_asignacion} = 'N/A') THEN ${salidas.cantidad} ELSE 0 END)`,
  }).from(salidas).groupBy(salidas.articulo, salidas.talla, salidas.estado_fisico).all();

  const entMap: Record<string, { nuevo: number, usado: number }> = {};
  for (const e of entsDetalle) {
    const key = `${e.articulo}|||${e.talla ?? ''}`;
    if (!entMap[key]) entMap[key] = { nuevo: 0, usado: 0 };
    if (e.estado === 'Nuevo') entMap[key].nuevo += Number(e.total);
    else if (e.estado === 'Usado') entMap[key].usado += Number(e.total);
  }
  const salMap: Record<string, { nuevo: number, usado: number }> = {};
  for (const s of salsDetalle) {
    const key = `${s.articulo}|||${s.talla ?? ''}`;
    if (!salMap[key]) salMap[key] = { nuevo: 0, usado: 0 };
    const sacados = Number(s.enCampo) + Number(s.enBajas) + Number(s.definitivos) + Number(s.devueltos) + Number(s.extraviados) + Number(s.inutilizables_directos);
    if (s.estado_fisico === 'Nuevo') salMap[key].nuevo += sacados;
    else if (s.estado_fisico === 'Usado') salMap[key].usado += sacados;
  }

  const allKeys = new Set([...Object.keys(entMap), ...Object.keys(salMap)]);
  const result = Array.from(allKeys).map(key => {
    const [articulo, tallaRaw] = key.split('|||');
    const e = entMap[key] ?? { nuevo: 0, usado: 0 };
    const s = salMap[key] ?? { nuevo: 0, usado: 0 };
    const almacenNuevo = e.nuevo - s.nuevo;
    const almacenUsado = e.usado - s.usado;
    return { articulo, talla: tallaRaw || null, almacen: almacenNuevo + almacenUsado, almacenNuevo, almacenUsado };
  }).filter(r => r.almacen > 0);

  return Response.json(result);
}
