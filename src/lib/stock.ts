import { db } from '@/src/db';
import { entradas, salidas, inventario_ajustes } from '@/src/db/schema';
import { eq, and, sql, isNull } from 'drizzle-orm';
import { validarArticulo } from '@/src/lib/inventarioValidacion';

/**
 * Columnas de agregación de `salidas` que definen qué resta del almacén disponible.
 * Única fuente de verdad — antes esta fórmula estaba triplicada letra por letra en
 * `stock.ts`, `inventario/route.ts` e `inventario/detalle/route.ts`.
 *
 * `estado_asignacion` es el estado terminal único de una salida ya asignada: cuando
 * un artículo se pierde, la fila original se re-etiqueta a 'Extraviado' (ver
 * `salidas/extravio/route.ts` y `bajas/[id]/process/route.ts`) y esa fila sigue
 * restando del almacén desde ese bucket — no desde uno nuevo. El bucket `perdidas`
 * es distinto: cubre bajas de inventario directas de almacén (`concepto='Inutilizable'`)
 * que nunca pasaron por una asignación, así que nunca tuvieron un `estado_asignacion`
 * previo que resimbolizar.
 */
export const SALIDA_STOCK_COLUMNS = {
  enCampo: sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Campo' THEN ${salidas.cantidad} ELSE 0 END), 0)`,
  enBajas: sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Bajas' THEN ${salidas.cantidad} ELSE 0 END), 0)`,
  definitivos: sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Entregado Definitivo' THEN ${salidas.cantidad} ELSE 0 END), 0)`,
  devueltos: sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Devuelto' THEN ${salidas.cantidad} ELSE 0 END), 0)`,
  extraviados: sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Extraviado' THEN ${salidas.cantidad} ELSE 0 END), 0)`,
  perdidas: sql<number>`COALESCE(SUM(CASE WHEN (${salidas.concepto} = 'Inutilizable' AND ${salidas.estado_asignacion} = 'N/A') THEN ${salidas.cantidad} ELSE 0 END), 0)`,
};

export interface SalidaAgregada {
  enCampo: number;
  enBajas: number;
  definitivos: number;
  devueltos: number;
  extraviados: number;
  perdidas: number;
}

/** Total que resta del almacén para un grupo de `salidas` ya agregado con `SALIDA_STOCK_COLUMNS`. */
export function sumarSalidasQueRestan(row: SalidaAgregada): number {
  return (
    Number(row.enCampo) + Number(row.enBajas) + Number(row.definitivos) +
    Number(row.devueltos) + Number(row.extraviados) + Number(row.perdidas)
  );
}

export function calcularStockDisponible(
  articuloNombre: string,
  tallaSolicitada: string | undefined,
  estadoFisico: string
): number {
  const conditions_ent = [eq(entradas.anulado, 0), eq(entradas.articulo, articuloNombre), eq(entradas.estado, estadoFisico), tallaSolicitada ? eq(entradas.talla, tallaSolicitada) : isNull(entradas.talla)];
  const entResult = db.select({ total: sql<number>`COALESCE(SUM(${entradas.cantidad}), 0)` }).from(entradas).where(and(...conditions_ent)).get();

  const conditions_sal = [eq(salidas.anulado, 0), eq(salidas.articulo, articuloNombre), eq(salidas.estado_fisico, estadoFisico), tallaSolicitada ? eq(salidas.talla, tallaSolicitada) : isNull(salidas.talla)];
  const salResult = db.select(SALIDA_STOCK_COLUMNS).from(salidas).where(and(...conditions_sal)).get();

  const ajuste = db.select({ total: sql<number>`COALESCE(SUM(${inventario_ajustes.cantidad}),0)` }).from(inventario_ajustes).where(and(eq(inventario_ajustes.articulo, articuloNombre), eq(inventario_ajustes.estado, estadoFisico), tallaSolicitada ? eq(inventario_ajustes.talla, tallaSolicitada) : isNull(inventario_ajustes.talla))).get();
  return Number(entResult!.total) - sumarSalidasQueRestan(salResult!) + Number(ajuste!.total);
}

interface ItemSolicitado {
  articulo: string;
  talla?: string | null;
  cantidad: number | string;
  estado_fisico?: string | null;
}

/**
 * Agrupa un lote de items por artículo+talla+estado y valida cada grupo contra el
 * stock disponible. Devuelve el mensaje de error del primer grupo insuficiente, o
 * `null` si todo el lote cabe. Compartido por `/salidas/bulk` y `/salidas/reposicion`,
 * que antes repetían este mismo bloque de agrupación letra por letra.
 */
export function validarStockLote(items: ItemSolicitado[], estadoDefault = 'Nuevo'): string | null {
  const solicitado: Record<string, number> = {};
  for (const item of items) {
    validarArticulo(item.articulo, item.talla);
    if (!Number.isInteger(Number(item.cantidad)) || Number(item.cantidad) <= 0) {
      return `Cantidad inválida para "${item.articulo}": debe ser un entero mayor a 0`;
    }
    const estadoF = item.estado_fisico || estadoDefault;
    const key = `${item.articulo}|||${item.talla || ''}|||${estadoF}`;
    solicitado[key] = (solicitado[key] ?? 0) + Number(item.cantidad);
  }
  for (const [key, cantidadSolicitada] of Object.entries(solicitado)) {
    const [articuloNombre, tallaRaw, estadoFisico] = key.split('|||');
    const tallaSolicitada = tallaRaw === '' ? undefined : tallaRaw;
    const almacen = calcularStockDisponible(articuloNombre, tallaSolicitada, estadoFisico);
    if (cantidadSolicitada > almacen) {
      return `Stock insuficiente para "${articuloNombre}${tallaSolicitada ? ` (${tallaSolicitada})` : ''}" [${estadoFisico}]. Disponible: ${almacen}`;
    }
  }
  return null;
}
