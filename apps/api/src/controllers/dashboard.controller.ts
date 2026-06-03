import { Request, Response } from 'express';
import { db } from '../db';
import { entradas, salidas, guardias } from '../db/schema';
import { sql, eq, desc } from 'drizzle-orm';

export const getDashboardMetrics = async (req: Request, res: Response) => {
  try {
    // Todas las agregaciones en una sola pasada por tabla, no en JS
    const [entradasAgg] = await db
      .select({ total: sql<number>`COALESCE(SUM(${entradas.cantidad}), 0)` })
      .from(entradas);

    const [salidasAgg] = await db
      .select({
        total:    sql<number>`COALESCE(SUM(${salidas.cantidad}), 0)`,
        enCampo:  sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Campo' THEN ${salidas.cantidad} ELSE 0 END), 0)`,
      })
      .from(salidas);

    const [guardiasAgg] = await db
      .select({ activos: sql<number>`COUNT(*) FILTER (WHERE ${guardias.estado} = 'Activo')` })
      .from(guardias);

    // Chart: últimas 10 fechas con actividad — una sola query por tabla
    const chartEntradas = await db
      .select({
        fecha: entradas.fecha,
        cantidad: sql<number>`SUM(${entradas.cantidad})`,
      })
      .from(entradas)
      .groupBy(entradas.fecha)
      .orderBy(desc(entradas.fecha))
      .limit(10);

    const chartSalidas = await db
      .select({
        fecha: salidas.fecha,
        cantidad: sql<number>`SUM(${salidas.cantidad})`,
      })
      .from(salidas)
      .groupBy(salidas.fecha)
      .orderBy(desc(salidas.fecha))
      .limit(10);

    const dateMap: Record<string, { Entradas: number; Salidas: number }> = {};
    for (const e of chartEntradas) {
      const d = e.fecha.substring(5);
      if (!dateMap[d]) dateMap[d] = { Entradas: 0, Salidas: 0 };
      dateMap[d].Entradas += Number(e.cantidad);
    }
    for (const s of chartSalidas) {
      const d = s.fecha.substring(5);
      if (!dateMap[d]) dateMap[d] = { Entradas: 0, Salidas: 0 };
      dateMap[d].Salidas += Number(s.cantidad);
    }
    const chartData = Object.keys(dateMap).sort().slice(-10).map(fecha => ({
      fecha,
      Entradas: dateMap[fecha].Entradas,
      Salidas: dateMap[fecha].Salidas,
    }));

    // Movimientos recientes: últimos 4 de cada tipo
    const recentEnt = await db
      .select({ id: entradas.id, fecha: entradas.fecha, cantidad: entradas.cantidad, articulo: entradas.articulo, motivo: entradas.motivo })
      .from(entradas)
      .orderBy(desc(entradas.id))
      .limit(4);

    const recentSal = await db
      .select({ id: salidas.id, fecha: salidas.fecha, cantidad: salidas.cantidad, articulo: salidas.articulo, concepto: salidas.concepto })
      .from(salidas)
      .orderBy(desc(salidas.id))
      .limit(4);

    const recentMovements = [
      ...recentEnt.map(e => ({ id: `ent-${e.id}`, tipo: 'Entrada', fecha: e.fecha, cantidad: e.cantidad, articulo: e.articulo, motivo: e.motivo })),
      ...recentSal.map(s => ({ id: `sal-${s.id}`, tipo: 'Salida',  fecha: s.fecha, cantidad: s.cantidad, articulo: s.articulo, motivo: s.concepto })),
    ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, 8);

    res.json({
      metrics: {
        totalEntradas: Number(entradasAgg.total),
        totalSalidas:  Number(salidasAgg.total),
        itemsEnCampo:  Number(salidasAgg.enCampo),
        guardiasActivos: Number(guardiasAgg.activos),
      },
      chartData,
      recentMovements,
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
  }
};
