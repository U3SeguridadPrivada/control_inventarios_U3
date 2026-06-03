import { Request, Response } from 'express';
import { db } from '../db';
import { entradas } from '../db/schema';
import { desc } from 'drizzle-orm';

export const getEntradas = async (req: Request, res: Response) => {
  try {
    const allEntradas = await db.select().from(entradas).orderBy(desc(entradas.fecha), desc(entradas.id));
    res.json(allEntradas);
  } catch (error) {
    console.error('getEntradas error:', error);
    res.status(500).json({ error: 'Failed to fetch entradas' });
  }
};

export const createEntrada = async (req: Request, res: Response) => {
  try {
    const { fecha, articulo, talla, cantidad, estado, motivo, origen_devolucion, guardia_id, registrado_por } = req.body;
    if (!fecha || !articulo || !cantidad || !estado || !motivo) {
      return res.status(400).json({ error: 'Faltan campos requeridos: fecha, articulo, cantidad, estado, motivo' });
    }
    const result = await db.insert(entradas).values({
      fecha,
      articulo,
      talla,
      cantidad: Number(cantidad),
      estado,
      motivo,
      origen_devolucion,
      guardia_id: guardia_id ? Number(guardia_id) : null,
      registrado_por
    }).returning();
    res.status(201).json(result[0]);
  } catch (error) {
    console.error('createEntrada error:', error);
    res.status(500).json({ error: 'Failed to create entrada' });
  }
};
