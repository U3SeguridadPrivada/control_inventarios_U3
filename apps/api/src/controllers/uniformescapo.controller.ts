import { Request, Response } from 'express';
import { db } from '../db';
import { salidas, guardias } from '../db/schema';
import { eq } from 'drizzle-orm';

export const getUniformesCampo = async (req: Request, res: Response) => {
  try {
    const records = await db.select({
      id: salidas.id,
      fecha: salidas.fecha,
      articulo: salidas.articulo,
      talla: salidas.talla,
      cantidad: salidas.cantidad,
      guardiaId: salidas.guardia_id,
      nombreGuardia: salidas.nombre_guardia,
    }).from(salidas).where(eq(salidas.estado_asignacion, 'Uniforme en Campo'));
    
    // Group them by guardia to create a nice profile view
    const grouped: any = {};
    for (const record of records) {
      if (!record.guardiaId) continue; // safety check
      
      if (!grouped[record.guardiaId]) {
        grouped[record.guardiaId] = {
          guardiaId: record.guardiaId,
          nombreGuardia: record.nombreGuardia,
          articulos: []
        };
      }

      // Group by articulo+talla so multiple cantidad=1 records appear as a single aggregated line
      const artKey = `${record.articulo}|||${record.talla ?? ''}`;
      const existing = grouped[record.guardiaId].articulos.find((a: any) => a._key === artKey);
      if (existing) {
        existing.cantidad += record.cantidad;
        // Keep the earliest fecha
        if (record.fecha < existing.fecha) existing.fecha = record.fecha;
      } else {
        grouped[record.guardiaId].articulos.push({
          _key: artKey,
          fecha: record.fecha,
          articulo: record.articulo,
          talla: record.talla,
          cantidad: record.cantidad
        });
      }
    }

    // Strip internal _key before sending
    const output = Object.values(grouped).map((g: any) => ({
      ...g,
      articulos: g.articulos.map(({ _key, ...rest }: any) => rest)
    }));
    res.json(output);
  } catch (error) {
    console.error('getUniformesCampo error:', error);
    res.status(500).json({ error: 'Failed to fetch uniformes en campo' });
  }
};
