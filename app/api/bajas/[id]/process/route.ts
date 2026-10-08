import { validarPayload } from '@/src/lib/inventarioValidacion';
import { NextRequest } from 'next/server';
import { bajas, salidas, guardias, entradas } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { fechaMexico } from '@/src/lib/fecha';
import { autorizarInventario, operarInventario } from '@/src/lib/inventarioOperacion';
import { cantidadEntera, estadoFisico, errorInventario, InventarioError } from '@/src/lib/inventarioValidacion';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = autorizarInventario(req, 'bajas', 'editar'); const { id } = await params;
    const p = validarPayload(await req.json()); const fecha = p.fecha || fechaMexico();
    const result = operarInventario(req, user, p, fecha, 'Procesar baja', (tx, operacionId) => {
      if (!['Devuelto', 'Extraviado', 'Cerrar'].includes(p.accion)) throw new InventarioError('Acción inválida');
      const baja = tx.select().from(bajas).where(eq(bajas.id, cantidadEntera(id))).get();
      if (!baja) throw new InventarioError('Baja no encontrada', 404);
      if (baja.estado_general === 'Completada') throw new InventarioError('La baja ya está completada');
      const checklist = [...baja.checklist];
      if (fecha < baja.fecha) throw new InventarioError('La fecha no puede ser anterior al inicio de la baja');
      if (p.accion === 'Cerrar') {
        const pendientes = tx.select().from(salidas).where(and(eq(salidas.guardia_id, baja.guardia_id), eq(salidas.estado_asignacion, 'Uniforme en Bajas'), eq(salidas.anulado, 0))).all();
        if (checklist.some(c => c.estado === 'Pendiente') || pendientes.length) throw new InventarioError('Aún hay equipo pendiente');
      } else {
        const salidaId = cantidadEntera(p.salida_id);
        const index = checklist.findIndex(c => c.salida_id === salidaId);
        if (index < 0 || checklist[index].estado !== 'Pendiente') throw new InventarioError('El renglón ya fue resuelto o no pertenece a esta baja');
        const fila = tx.select().from(salidas).where(eq(salidas.id, salidaId)).get();
        if (!fila || fila.anulado || fila.guardia_id !== baja.guardia_id || fila.estado_asignacion !== 'Uniforme en Bajas') throw new InventarioError('Asignación no disponible para esta baja');
        if (fecha < (fila.estado_actualizado_en || fila.fecha)) throw new InventarioError('La fecha es anterior al último movimiento');
        const cantidad = cantidadEntera(p.cantidadItem);
        if (cantidad > fila.cantidad) throw new InventarioError('La cantidad supera las piezas pendientes');
        const estado = p.accion === 'Devuelto' ? estadoFisico(p.estadoFisicoDevolucion || 'Usado') : null;
        // El resto queda pendiente, nunca se declara perdido de manera implícita.
        let pendienteId: number | null = null;
        if (cantidad < fila.cantidad) {
          const { id: _id, ...copia } = fila;
          pendienteId = tx.insert(salidas).values({ ...copia, cantidad: fila.cantidad - cantidad }).returning().get().id;
        }
        tx.update(salidas).set({ cantidad, estado_asignacion: p.accion, estado_devuelto: estado, estado_actualizado_en: fecha }).where(eq(salidas.id, salidaId)).run();
        if (estado) tx.insert(entradas).values({ fecha, articulo: fila.articulo, talla: fila.talla, cantidad, estado, motivo: 'Devolución de Equipo',
          guardia_id: baja.guardia_id, origen_devolucion: baja.nombre_guardia, registrado_por: user.username, operacion_id: operacionId, salida_origen_id: salidaId }).run();
        checklist[index] = { ...checklist[index], cantidad_adeudada: cantidad, cantidad_devuelta: estado ? cantidad : 0, cantidad_extraviada: estado ? 0 : cantidad, estado: p.accion, estado_fisico: estado, fecha_resolucion: fecha };
        if (pendienteId) checklist.splice(index + 1, 0, { salida_id: pendienteId, articulo: fila.articulo, talla: fila.talla, cantidad_adeudada: fila.cantidad - cantidad, cantidad_devuelta: 0, cantidad_extraviada: 0, estado: 'Pendiente' });
      }
      const allCompleted = checklist.every(c => c.estado !== 'Pendiente');
      const actualizada = tx.update(bajas).set({ checklist, estado_general: allCompleted ? 'Completada' : 'En Proceso' }).where(eq(bajas.id, baja.id)).returning().get();
      if (allCompleted) tx.update(guardias).set({ estado: 'Baja Definitiva' }).where(eq(guardias.id, baja.guardia_id)).run();
      return { success: true, allCompleted, baja: actualizada };
    });
    return Response.json(result);
  } catch (err) { return errorInventario(err); }
}
