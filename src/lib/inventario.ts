import { db } from '@/src/db';
import { entradas, salidas } from '@/src/db/schema';
import { sql } from 'drizzle-orm';
import { ARTICULOS_CATALOGO } from '@/src/lib/constants';
import { SALIDA_STOCK_COLUMNS, sumarSalidasQueRestan } from '@/src/lib/stock';

export interface InventarioResumenRow {
  articulo: string;
  totalEntradas: number;
  almacen: number;
  almacenNuevo: number;
  almacenUsado: number;
  almacenInutilizable: number;
  enCampo: number;
  enBajas: number;
  perdidas: number;
  definitivos: number;
  totalExistente: number;
  stockBajo: boolean;
}

export interface InventarioDetalleRow {
  articulo: string;
  talla: string | null;
  almacen: number;
  almacenNuevo: number;
  almacenUsado: number;
}

/**
 * Resumen de inventario por artículo (sin desglosar por talla). Única fuente de verdad —
 * usada tanto por `/api/inventario` (tabla en pantalla) como por `/api/inventario/export-pdf`
 * (reporte descargable), para que ambos siempre muestren exactamente los mismos números.
 */
export function calcularInventarioResumen(): InventarioResumenRow[] {
  const entradasPorArticulo = db.select({
    articulo: entradas.articulo, estado: entradas.estado,
    total: sql<number>`SUM(${entradas.cantidad})`,
  }).from(entradas).groupBy(entradas.articulo, entradas.estado).all();

  const salidasPorArticulo = db.select({
    articulo: salidas.articulo, estado_fisico: salidas.estado_fisico,
    ...SALIDA_STOCK_COLUMNS,
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
    if (!salMap[s.articulo]) salMap[s.articulo] = { nuevo: 0, usado: 0, base: { enCampo: 0, enBajas: 0, definitivos: 0, perdidas: 0 } };
    const sacados = sumarSalidasQueRestan(s);
    if (s.estado_fisico === 'Nuevo') salMap[s.articulo].nuevo += sacados;
    else if (s.estado_fisico === 'Usado') salMap[s.articulo].usado += sacados;
    salMap[s.articulo].base.enCampo += Number(s.enCampo); salMap[s.articulo].base.enBajas += Number(s.enBajas);
    salMap[s.articulo].base.definitivos += Number(s.definitivos);
    // "Pérdidas" para reporte = bajas directas de almacén (Inutilizable) + asignaciones marcadas Extraviado
    // (venga de Uniformes en Campo o de un proceso de Baja — ambos flujos terminan en el mismo estado).
    salMap[s.articulo].base.perdidas += Number(s.perdidas) + Number(s.extraviados);
  }

  return ARTICULOS_CATALOGO.map(articulo => {
    const e = entMap[articulo] ?? { nuevo: 0, usado: 0, inutilizable: 0, total: 0 };
    const s = salMap[articulo] ?? { nuevo: 0, usado: 0, base: { enCampo: 0, enBajas: 0, definitivos: 0, perdidas: 0 } };
    const almacenNuevo = e.nuevo - s.nuevo;
    const almacenUsado = e.usado - s.usado;
    const almacenInutilizable = e.inutilizable;
    const almacen = almacenNuevo + almacenUsado + almacenInutilizable;
    return { articulo, totalEntradas: e.total, almacen, almacenNuevo, almacenUsado, almacenInutilizable, enCampo: s.base.enCampo, enBajas: s.base.enBajas, perdidas: s.base.perdidas, definitivos: s.base.definitivos, totalExistente: almacen + s.base.enCampo + s.base.enBajas, stockBajo: (almacenNuevo + almacenUsado) <= 5 };
  });
}

/**
 * Detalle de inventario por artículo + talla (solo lo que queda en almacén). Única fuente
 * de verdad — usada por `/api/inventario/detalle` (UI) y `/api/inventario/export-pdf`.
 */
export function calcularInventarioDetalle(): InventarioDetalleRow[] {
  const entsDetalle = db.select({
    articulo: entradas.articulo, talla: entradas.talla, estado: entradas.estado,
    total: sql<number>`SUM(${entradas.cantidad})`,
  }).from(entradas).groupBy(entradas.articulo, entradas.talla, entradas.estado).all();

  const salsDetalle = db.select({
    articulo: salidas.articulo, talla: salidas.talla, estado_fisico: salidas.estado_fisico,
    ...SALIDA_STOCK_COLUMNS,
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
    const sacados = sumarSalidasQueRestan(s);
    if (s.estado_fisico === 'Nuevo') salMap[key].nuevo += sacados;
    else if (s.estado_fisico === 'Usado') salMap[key].usado += sacados;
  }

  const allKeys = new Set([...Object.keys(entMap), ...Object.keys(salMap)]);
  return Array.from(allKeys).map(key => {
    const [articulo, tallaRaw] = key.split('|||');
    const e = entMap[key] ?? { nuevo: 0, usado: 0 };
    const s = salMap[key] ?? { nuevo: 0, usado: 0 };
    const almacenNuevo = e.nuevo - s.nuevo;
    const almacenUsado = e.usado - s.usado;
    return { articulo, talla: tallaRaw || null, almacen: almacenNuevo + almacenUsado, almacenNuevo, almacenUsado };
  }).filter(r => r.almacen > 0);
}
