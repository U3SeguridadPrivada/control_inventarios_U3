import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { entradas, salidas } from '@/src/db/schema';
import { sql } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { ARTICULOS_CATALOGO } from '@/src/lib/constants';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();

  const entradasPorArticulo = db.select({
    articulo: entradas.articulo, estado: entradas.estado,
    total: sql<number>`SUM(${entradas.cantidad})`,
  }).from(entradas).groupBy(entradas.articulo, entradas.estado).all();

  const salidasPorArticulo = db.select({
    articulo: salidas.articulo, estado_fisico: salidas.estado_fisico,
    enCampo:      sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Campo'    THEN ${salidas.cantidad} ELSE 0 END)`,
    enBajas:      sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Bajas'    THEN ${salidas.cantidad} ELSE 0 END)`,
    definitivos:  sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Entregado Definitivo' THEN ${salidas.cantidad} ELSE 0 END)`,
    devueltos:    sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Devuelto' THEN ${salidas.cantidad} ELSE 0 END)`,
    extraviados:  sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Extraviado' THEN ${salidas.cantidad} ELSE 0 END)`,
    perdidas:     sql<number>`SUM(CASE WHEN (${salidas.concepto} IN ('Extravío','Inutilizable') AND ${salidas.estado_asignacion} = 'N/A') THEN ${salidas.cantidad} ELSE 0 END)`,
    inutilizables_directos: sql<number>`SUM(CASE WHEN (${salidas.concepto} = 'Inutilizable' AND ${salidas.estado_asignacion} = 'N/A') THEN ${salidas.cantidad} ELSE 0 END)`,
  }).from(salidas).groupBy(salidas.articulo, salidas.estado_fisico).all();

  const entMap: Record<string, { nuevo: number, usado: number, inutilizable: number, total: number }> = {};
  for (const e of entradasPorArticulo) {
    if (!entMap[e.articulo]) entMap[e.articulo] = { nuevo: 0, usado: 0, inutilizable: 0, total: 0 };
    if (e.estado === 'Nuevo') entMap[e.articulo].nuevo += Number(e.total);
    else if (e.estado === 'Usado') entMap[e.articulo].usado += Number(e.total);
    else if (e.estado === 'Inutilizable' || e.estado === 'Para Baja') entMap[e.articulo].inutilizable += Number(e.total);
    entMap[e.articulo].total += Number(e.total);
  }
  const salMap: Record<string, { nuevo: number, usado: number, base: any }> = {};
  for (const s of salidasPorArticulo) {
    if (!salMap[s.articulo]) salMap[s.articulo] = { nuevo: 0, usado: 0, base: { enCampo: 0, enBajas: 0, definitivos: 0, perdidas: 0, devueltos: 0, extraviados: 0 } };
    const sacados = Number(s.enCampo) + Number(s.enBajas) + Number(s.definitivos) + Number(s.devueltos) + Number(s.extraviados) + Number(s.inutilizables_directos);
    if (s.estado_fisico === 'Nuevo') salMap[s.articulo].nuevo += sacados;
    else if (s.estado_fisico === 'Usado') salMap[s.articulo].usado += sacados;
    salMap[s.articulo].base.enCampo += Number(s.enCampo); salMap[s.articulo].base.enBajas += Number(s.enBajas);
    salMap[s.articulo].base.definitivos += Number(s.definitivos); salMap[s.articulo].base.perdidas += Number(s.perdidas);
  }

  const inventario = ARTICULOS_CATALOGO.map(articulo => {
    const e = entMap[articulo] ?? { nuevo: 0, usado: 0, inutilizable: 0, total: 0 };
    const s = salMap[articulo] ?? { nuevo: 0, usado: 0, base: { enCampo: 0, enBajas: 0, definitivos: 0, perdidas: 0 } };
    const almacenNuevo = e.nuevo - s.nuevo;
    const almacenUsado = e.usado - s.usado;
    const almacenInutilizable = e.inutilizable;
    const almacen = almacenNuevo + almacenUsado + almacenInutilizable;
    return { articulo, totalEntradas: e.total, almacen, almacenNuevo, almacenUsado, almacenInutilizable, enCampo: s.base.enCampo, enBajas: s.base.enBajas, perdidas: s.base.perdidas, definitivos: s.base.definitivos, totalExistente: almacen + s.base.enCampo + s.base.enBajas, stockBajo: (almacenNuevo + almacenUsado) <= 5 };
  });

  return Response.json(inventario);
}
