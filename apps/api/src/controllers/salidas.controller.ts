import { Request, Response } from 'express';
import { db } from '../db';
import { salidas, entradas, guardias } from '../db/schema';
import { and, desc, eq, sql, SQL } from 'drizzle-orm';

// Returns the current available stock for a given articulo+talla+estado_fisico combination
// using aggregated SQL queries instead of fetching all rows into memory.
async function calcularStockDisponible(
  articuloNombre: string,
  tallaSolicitada: string | undefined,
  estadoFisico: string
): Promise<number> {
  const tallaCondEnt = tallaSolicitada ? eq(entradas.talla, tallaSolicitada) : undefined;
  const tallaCondSal = tallaSolicitada ? eq(salidas.talla, tallaSolicitada) : undefined;

  const [entResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${entradas.cantidad}), 0)` })
    .from(entradas)
    .where(and(eq(entradas.articulo, articuloNombre), tallaCondEnt, eq(entradas.estado, estadoFisico)));

  const [salResult] = await db
    .select({
      enCampo:      sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Campo'    THEN ${salidas.cantidad} ELSE 0 END), 0)`,
      enBajas:      sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Bajas'    THEN ${salidas.cantidad} ELSE 0 END), 0)`,
      definitivos:  sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Entregado Definitivo' THEN ${salidas.cantidad} ELSE 0 END), 0)`,
      devueltos:    sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Devuelto'             THEN ${salidas.cantidad} ELSE 0 END), 0)`,
      extraviados:  sql<number>`COALESCE(SUM(CASE WHEN ${salidas.estado_asignacion} = 'Extraviado'           THEN ${salidas.cantidad} ELSE 0 END), 0)`,
      inutilizables: sql<number>`COALESCE(SUM(CASE WHEN ${salidas.concepto} = 'Inutilizable' AND ${salidas.estado_asignacion} = 'N/A' THEN ${salidas.cantidad} ELSE 0 END), 0)`,
    })
    .from(salidas)
    .where(and(eq(salidas.articulo, articuloNombre), tallaCondSal, eq(salidas.estado_fisico, estadoFisico)));

  return (
    Number(entResult.total) -
    Number(salResult.enCampo) -
    Number(salResult.enBajas) -
    Number(salResult.definitivos) -
    Number(salResult.devueltos) -
    Number(salResult.extraviados) -
    Number(salResult.inutilizables)
  );
}

export const getSalidas = async (_req: Request, res: Response) => {
  try {
    const allSalidas = await db.select().from(salidas).orderBy(desc(salidas.fecha), desc(salidas.id));
    res.json(allSalidas);
  } catch (error) {
    console.error('getSalidas error:', error);
    res.status(500).json({ error: 'Failed to fetch salidas' });
  }
};

export const createSalida = async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    // Validate guardia is Activo if one is assigned
    if (payload.guardia_id) {
      const guardia = await db.select().from(guardias).where(eq(guardias.id, Number(payload.guardia_id)));
      if (guardia.length && guardia[0].estado !== 'Activo') {
        return res.status(400).json({
          error: `No se puede asignar equipo a un guardia con estado "${guardia[0].estado}"`
        });
      }
    }

    // Server-side inventory validation: calculate current almacen for this articulo
    const articuloNombre: string = payload.articulo;
    const cantidadSolicitada: number = Number(payload.cantidad);
    const tallaSolicitada: string | undefined = payload.talla;
    const estadoFisico: string = payload.estado_fisico || 'Nuevo';

    const almacenDisponible = await calcularStockDisponible(articuloNombre, tallaSolicitada, estadoFisico);

    if (cantidadSolicitada > almacenDisponible) {
      return res.status(400).json({
        error: `Stock insuficiente para estado ${estadoFisico}. Disponible en almacén: ${almacenDisponible}, solicitado: ${cantidadSolicitada}`
      });
    }

    const result = await db.insert(salidas).values(payload).returning();
    res.status(201).json(result[0]);
  } catch (error) {
    console.error('createSalida error:', error);
    res.status(500).json({ error: 'Failed to create salida' });
  }
};

/**
 * Bulk create: for "Uniforme en Campo" assignments.
 * Receives an array of salida payloads (each with cantidad=1).
 * Validates ALL stock requirements upfront before inserting anything.
 */
export const createSalidasBulk = async (req: Request, res: Response) => {
  try {
    const items: any[] = req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array "items" con al menos un artículo' });
    }

    // Validate guardia is Activo (only need to check once — all items share the same guardia)
    const guardiaId = items[0]?.guardia_id;
    if (!guardiaId) {
      return res.status(400).json({ error: 'Se requiere un guardia para asignaciones en campo' });
    }
    const guardia = await db.select().from(guardias).where(eq(guardias.id, Number(guardiaId)));
    if (!guardia.length) return res.status(404).json({ error: 'Guardia no encontrado' });
    if (guardia[0].estado !== 'Activo') {
      return res.status(400).json({ error: `No se puede asignar equipo a un guardia con estado "${guardia[0].estado}"` });
    }

    // Aggregate total quantity requested per articulo and talla AND estado_fisico across all items
    const solicitadoPorArticuloTalla: Record<string, number> = {};
    for (const item of items) {
      const estadoF = item.estado_fisico || 'Nuevo';
      const key = `${item.articulo}|||${item.talla || ''}|||${estadoF}`;
      solicitadoPorArticuloTalla[key] = (solicitadoPorArticuloTalla[key] ?? 0) + Number(item.cantidad);
    }

    // Validate stock for each distinct articulo+talla+estado combination
    for (const [articuloTallaKey, cantidadSolicitada] of Object.entries(solicitadoPorArticuloTalla)) {
      const [articuloNombre, tallaRaw, estadoFisico] = articuloTallaKey.split('|||');
      const tallaSolicitada = tallaRaw === '' ? undefined : tallaRaw;
      const almacen = await calcularStockDisponible(articuloNombre, tallaSolicitada, estadoFisico);
      if (cantidadSolicitada > almacen) {
        return res.status(400).json({
          error: `Stock insuficiente para "${articuloNombre}${tallaSolicitada ? ` (${tallaSolicitada})` : ''}" [${estadoFisico}]. Disponible: ${almacen}, solicitado: ${cantidadSolicitada}`
        });
      }
    }

    // All validations passed — insert all records
    const created = await db.insert(salidas).values(items).returning();
    res.status(201).json({ created: created.length, items: created });
  } catch (error) {
    console.error('createSalidasBulk error:', error);
    res.status(500).json({ error: 'Failed to create salidas in bulk' });
  }
};

/**
 * Reposición bulk:
 *  1. Marca la asignación "Uniforme en Campo" del guardia como "Devuelto" (guarda condición en estado_devuelto)
 *  2. Crea la nueva salida "Reposición" con estado "Uniforme en Campo"
 *     — NO se crea entrada separada: la liberación de la salida vieja ya balancea el inventario
 */
export const createReposicionBulk = async (req: Request, res: Response) => {
  try {
    const { items, estadoDevolucion, estadoEntregado } = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'Se requiere un array de artículos' });

    const guardiaId = Number(items[0]?.guardia_id);
    if (!guardiaId) return res.status(400).json({ error: 'Se requiere guardia_id' });

    const [guardia] = await db.select().from(guardias).where(eq(guardias.id, guardiaId));

    // Validate stock for each replacement item before the transaction
    const solicitadoPorEstado: Record<string, number> = {};
    for (const item of items) {
      const estadoE = item.estado_fisico || estadoEntregado || 'Nuevo';
      const key = `${item.articulo}|||${item.talla || ''}|||${estadoE}`;
      solicitadoPorEstado[key] = (solicitadoPorEstado[key] ?? 0) + Number(item.cantidad);
    }
    for (const [key, qty] of Object.entries(solicitadoPorEstado)) {
      const [art, tallaRaw, estadoE] = key.split('|||');
      const tallaFilt = tallaRaw || undefined;
      const almacen = await calcularStockDisponible(art, tallaFilt, estadoE);
      if (qty > almacen) {
        return res.status(400).json({
          error: `Stock insuficiente para reponer "${art}${tallaFilt ? ` (${tallaFilt})` : ''}" [${estadoE}]. Disponible: ${almacen}, solicitado: ${qty}`
        });
      }
    }

    await db.transaction(async (tx) => {
      for (const item of items) {
        const { articulo, talla, cantidad, fecha, nombre_guardia } = item;
        const qty = Number(cantidad);
        const estadoEntregadoReq = item.estado_fisico || estadoEntregado || 'Nuevo';

        const conds: SQL[] = [
          eq(salidas.guardia_id, guardiaId),
          eq(salidas.articulo, articulo),
          eq(salidas.estado_asignacion, 'Uniforme en Campo'),
        ];
        if (talla) conds.push(eq(salidas.talla, talla));

        const itemEstadoDevuelto = item.estado_devuelto || estadoDevolucion || 'Usado';

        // 1. Marcar las prendas devolvidas (old)
        const oldRows = await tx.select({ id: salidas.id }).from(salidas)
          .where(and(...conds)).orderBy(desc(salidas.fecha), desc(salidas.id)).limit(qty);
        for (const row of oldRows) {
          await tx.update(salidas)
            .set({ estado_asignacion: 'Devuelto', estado_devuelto: itemEstadoDevuelto })
            .where(eq(salidas.id, row.id));
        }

        // 2. Crear una Entrada al Almacén por la prenda devuelta (para que se sume al inventario y se refleje en docs)
        const estadoEntranteFisico = (itemEstadoDevuelto === 'Para Baja' || itemEstadoDevuelto === 'Inutilizable') ? 'Inutilizable' : itemEstadoDevuelto;
        await tx.insert(entradas).values({
          fecha,
          articulo,
          talla: talla || null,
          cantidad: qty,
          estado: estadoEntranteFisico, // Nuevo o Usado o Inutilizable
          motivo: 'Reposición (Entrada Múltiple)',
          origen_devolucion: guardia?.nombre || nombre_guardia,
          guardia_id: guardiaId,
          registrado_por: (req as any).user?.username ?? null,
        });

        // 3. Crear Salida de la nueva prenda
        await tx.insert(salidas).values({
          fecha,
          concepto: 'Reposición',
          articulo,
          talla: talla || null,
          cantidad: qty,
          nombre_guardia: nombre_guardia || null,
          guardia_id: guardiaId,
          estado_asignacion: 'Uniforme en Campo',
          estado_fisico: estadoEntregadoReq,
          registrado_por: (req as any).user?.username ?? null,
        });
      }
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('createReposicionBulk error:', error);
    res.status(500).json({ error: 'Error al procesar la reposición' });
  }
};

/**
 * Extravío bulk:
 *  1. Marca la asignación "Uniforme en Campo" del guardia como "Extraviado"
 *  2. Crea una salida de evento "Extravío" (estado N/A) para el registro histórico
 */
export const createExtravioBulk = async (req: Request, res: Response) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'Se requiere un array de artículos' });

    const guardiaId = Number(items[0]?.guardia_id);
    if (!guardiaId) return res.status(400).json({ error: 'Se requiere guardia_id' });

    const [guardia] = await db.select().from(guardias).where(eq(guardias.id, guardiaId));
    if (!guardia) return res.status(404).json({ error: 'Guardia no encontrado' });

    await db.transaction(async (tx) => {
      for (const item of items) {
        const { articulo, talla, cantidad, fecha, nombre_guardia, observaciones } = item;
        const qty = Number(cantidad);

        const conds: SQL[] = [
          eq(salidas.guardia_id, guardiaId),
          eq(salidas.articulo, articulo),
          eq(salidas.estado_asignacion, 'Uniforme en Campo'),
        ];
        if (talla) conds.push(eq(salidas.talla, talla));

        // Marca las asignaciones más recientes como "Extraviado"
        const oldRows = await tx.select({ id: salidas.id }).from(salidas)
          .where(and(...conds)).orderBy(desc(salidas.fecha), desc(salidas.id)).limit(qty);
        for (const row of oldRows) {
          await tx.update(salidas)
            .set({ estado_asignacion: 'Extraviado' })
            .where(eq(salidas.id, row.id));
        }

        // Evento de extravío (para el historial y el cálculo de inventario)
        await tx.insert(salidas).values({
          fecha,
          concepto: 'Extravío',
          articulo,
          talla: talla || null,
          cantidad: qty,
          nombre_guardia: nombre_guardia || null,
          guardia_id: guardiaId,
          estado_asignacion: 'N/A',
          observaciones: observaciones || null,
          registrado_por: (req as any).user?.username ?? null,
        });
      }
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('createExtravioBulk error:', error);
    res.status(500).json({ error: 'Error al procesar el extravío' });
  }
};
