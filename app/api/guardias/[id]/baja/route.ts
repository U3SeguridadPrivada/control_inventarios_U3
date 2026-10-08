import { validarPayload } from '@/src/lib/inventarioValidacion';
import { NextRequest } from 'next/server';
import { guardias, salidas, bajas } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { autorizarInventario, operarInventario } from '@/src/lib/inventarioOperacion';
import { errorInventario, validarGuardia, InventarioError } from '@/src/lib/inventarioValidacion';
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = autorizarInventario(req, 'bajas', 'crear'); const { id } = await params; const p = validarPayload(await req.json());
    const result = operarInventario(req, user, p, p.fecha, 'Iniciar baja', tx => {
      const guardia = validarGuardia(id, true);
      const assigned = tx.select().from(salidas).where(and(eq(salidas.guardia_id, guardia.id), eq(salidas.estado_asignacion, 'Uniforme en Campo'), eq(salidas.anulado, 0))).all();
      if (assigned.some(s => p.fecha < (s.estado_actualizado_en || s.fecha))) throw new InventarioError('La fecha de baja es anterior a una asignación');
      const checklist = assigned.map(s => ({ salida_id: s.id, articulo: s.articulo, talla: s.talla, cantidad_adeudada: s.cantidad, cantidad_devuelta: 0, cantidad_extraviada: 0, estado: 'Pendiente' }));
      for (const s of assigned) tx.update(salidas).set({ estado_asignacion: 'Uniforme en Bajas', estado_actualizado_en: p.fecha }).where(eq(salidas.id, s.id)).run();
      const sinEquipo = !checklist.length;
      const baja = tx.insert(bajas).values({ fecha: p.fecha, guardia_id: guardia.id, nombre_guardia: guardia.nombre, numero_elemento: guardia.numero_elemento || 'SIN FOLIO', estado_general: sinEquipo ? 'Completada' : 'Pendiente', checklist }).returning().get();
      tx.update(guardias).set({ estado: sinEquipo ? 'Baja Definitiva' : 'Baja Pendiente', fecha_baja: p.fecha }).where(eq(guardias.id, guardia.id)).run();
      return baja;
    });
    return Response.json(result);
  } catch (err) { return errorInventario(err); }
}
