import { db } from '@/src/db';
import { entradas, salidas } from '@/src/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export function calcularStockDisponible(
  articuloNombre: string,
  tallaSolicitada: string | undefined,
  estadoFisico: string
): number {
  const conditions_ent: any[] = [eq(entradas.articulo, articuloNombre), eq(entradas.estado, estadoFisico)];
  if (tallaSolicitada) conditions_ent.push(eq(entradas.talla, tallaSolicitada));
  const entResult = db.select({ total: sql<number>`COALESCE(SUM(${entradas.cantidad}), 0)` }).from(entradas).where(and(...conditions_ent)).get();

  const conditions_sal: any[] = [eq(salidas.articulo, articuloNombre), eq(salidas.estado_fisico, estadoFisico)];
  if (tallaSolicitada) conditions_sal.push(eq(salidas.talla, tallaSolicitada));
  const salResult = db.select({
    enCampo:       sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Campo'    THEN ${salidas.cantidad} ELSE 0 END), 0)`,
    enBajas:       sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Bajas'    THEN ${salidas.cantidad} ELSE 0 END), 0)`,
    definitivos:   sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Entregado Definitivo' THEN ${salidas.cantidad} ELSE 0 END), 0)`,
    devueltos:     sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Devuelto'             THEN ${salidas.cantidad} ELSE 0 END), 0)`,
    extraviados:   sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Extraviado'           THEN ${salidas.cantidad} ELSE 0 END), 0)`,
    inutilizables: sql<number>`COALESCE(SUM(CASE WHEN ${salidas.concepto} = 'Inutilizable' AND ${salidas.estado_asignacion} = 'N/A' THEN ${salidas.cantidad} ELSE 0 END), 0)`,
  }).from(salidas).where(and(...conditions_sal)).get();

  return (
    Number(entResult!.total) -
    Number(salResult!.enCampo) - Number(salResult!.enBajas) - Number(salResult!.definitivos) -
    Number(salResult!.devueltos) - Number(salResult!.extraviados) - Number(salResult!.inutilizables)
  );
}
