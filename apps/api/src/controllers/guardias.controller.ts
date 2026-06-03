import { Request, Response } from 'express';
import { db } from '../db';
import { guardias, salidas, entradas, uniformes_campo, bajas } from '../db/schema';
import { eq, or, and, desc } from 'drizzle-orm';

export const getGuardias = async (req: Request, res: Response) => {
  try {
    const allGuardias = await db.select().from(guardias);
    res.json(allGuardias);
  } catch (error) {
    console.error('getGuardias error:', error);
    res.status(500).json({ error: 'Failed to fetch guardias' });
  }
};

export const createGuardia = async (req: Request, res: Response) => {
  try {
    const { numero_elemento, nombre, fecha_alta } = req.body;
    const newGuardia = await db.insert(guardias).values({
      numero_elemento,
      nombre,
      fecha_alta,
      estado: 'Activo'
    }).returning();
    res.status(201).json(newGuardia[0]);
  } catch (error) {
    console.error('createGuardia error:', error);
    res.status(500).json({ error: 'Failed to create guardia' });
  }
};

export const getExpediente = async (req: Request, res: Response) => {
  try {
    const guardiaId = Number(req.params.id);
    const expedienteSalidas = await db.select().from(salidas).where(eq(salidas.guardia_id, guardiaId)).orderBy(desc(salidas.fecha));
    const expedienteEntradas = await db.select().from(entradas).where(eq(entradas.guardia_id, guardiaId)).orderBy(desc(entradas.fecha));
    
    // Devolvemos ambas para que el frontend las agrupe
    res.json({
      salidas: expedienteSalidas,
      entradas: expedienteEntradas
    });
  } catch (error) {
    console.error('getExpediente error:', error);
    res.status(500).json({ error: 'Failed to fetch expediente' });
  }
};



export const initiateBaja = async (req: Request, res: Response) => {
  try {
    const guardiaId = Number(req.params.id);
    const { fecha } = req.body;
    
    const guardia = await db.select().from(guardias).where(eq(guardias.id, guardiaId));
    if (!guardia.length) return res.status(404).json({ error: 'Guardia not found' });

    if (guardia[0].estado !== 'Activo') {
      return res.status(400).json({ error: `No se puede dar de baja a un guardia con estado "${guardia[0].estado}"` });
    }

    const assigned = await db.select().from(salidas).where(
      and(
        eq(salidas.guardia_id, guardiaId),
        eq(salidas.estado_asignacion, 'Uniforme en Campo')
      )
    );
    
    const checklist = assigned.map(s => ({
      salida_id: s.id,
      articulo: s.articulo,
      talla: s.talla,
      cantidad_adeudada: s.cantidad,
      cantidad_devuelta: 0,
      cantidad_extraviada: 0,
      estado: 'Pendiente' // Pendiente, Devuelto, Extraviado
    }));

    // Move all campo items to 'Uniforme en Bajas' so inventory reflects them correctly
    for (const s of assigned) {
      await db.update(salidas)
        .set({ estado_asignacion: 'Uniforme en Bajas' })
        .where(eq(salidas.id, s.id));
    }

    const newBaja = await db.insert(bajas).values({
      fecha,
      guardia_id: guardiaId,
      nombre_guardia: guardia[0].nombre,
      numero_elemento: guardia[0].numero_elemento,
      estado_general: 'Pendiente',
      checklist: checklist
    }).returning();

    await db.update(guardias).set({ estado: 'Baja Pendiente', fecha_baja: fecha }).where(eq(guardias.id, guardiaId));

    res.json(newBaja[0]);
  } catch (error) {
    console.error('initiateBaja error:', error);
    res.status(500).json({ error: 'Failed to initiate baja' });
  }
};
