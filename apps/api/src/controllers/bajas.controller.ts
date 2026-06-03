import { Request, Response } from 'express';
import { db } from '../db';
import { bajas, salidas, guardias, entradas } from '../db/schema';
import { eq, desc } from 'drizzle-orm';

export const getBajas = async (req: Request, res: Response) => {
  try {
    const allBajas = await db.select().from(bajas).orderBy(desc(bajas.fecha));
    res.json(allBajas);
  } catch (error) {
    console.error('getBajas error:', error);
    res.status(500).json({ error: 'Failed to fetch bajas' });
  }
};

export const processBajaItem = async (req: Request, res: Response) => {
  try {
    const bajaId = Number(req.params.id);
    const { salida_id, accion, cantidadItem, estadoFisicoDevolucion } = req.body; 
    // accion can be 'Devuelto' or 'Extraviado'

    const bajaRecord = await db.select().from(bajas).where(eq(bajas.id, bajaId));
    if (!bajaRecord.length) return res.status(404).json({ error: 'Baja not found' });

    let checklist: any[] = bajaRecord[0].checklist as any[];
    const itemIndex = checklist.findIndex(c => c.salida_id === salida_id);
    if (itemIndex === -1) return res.status(404).json({ error: 'Item not in checklist' });

    const item = checklist[itemIndex];

    if (accion === 'Devuelto') {
      item.cantidad_devuelta = cantidadItem;
      item.estado = 'Devuelto';
      
      // Update original salida to clear it from Campo
      await db.update(salidas).set({ estado_asignacion: 'Devuelto' }).where(eq(salidas.id, salida_id));
      
      // Create entrada to restore stock
      await db.insert(entradas).values({
        fecha: new Date().toISOString().split('T')[0],
        articulo: item.articulo,
        talla: item.talla,
        cantidad: cantidadItem,
        estado: estadoFisicoDevolucion || 'Usado',
        motivo: 'Devolución de Equipo',
        origen_devolucion: bajaRecord[0].nombre_guardia,
        registrado_por: 'Sistema (Baja)'
      });
      
    } else if (accion === 'Extraviado') {
      item.cantidad_extraviada = cantidadItem;
      item.estado = 'Extraviado';
      
      // Update original salida to shift it from Campo to Perdidas
      await db.update(salidas).set({ 
        concepto: 'Extravío', 
        estado_asignacion: 'N/A' 
      }).where(eq(salidas.id, salida_id));
    }

    checklist[itemIndex] = item;

    // Check if process finished
    const allCompleted = checklist.every(c => c.estado !== 'Pendiente');
    const newState = allCompleted ? 'Completada' : 'En Proceso';

    await db.update(bajas).set({ 
      checklist: checklist,
      estado_general: newState
    }).where(eq(bajas.id, bajaId));

    if (allCompleted) {
      await db.update(guardias).set({ estado: 'Baja Definitiva' }).where(eq(guardias.id, bajaRecord[0].guardia_id));
    }

    res.json({ success: true, allCompleted });
  } catch (error) {
    console.error('processBajaItem error:', error);
    res.status(500).json({ error: 'Failed to process item' });
  }
};
