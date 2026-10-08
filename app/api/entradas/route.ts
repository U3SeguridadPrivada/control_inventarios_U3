import { validarPayload } from '@/src/lib/inventarioValidacion';
import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { entradas, salidas } from '@/src/db/schema';
import { desc, eq } from 'drizzle-orm';
import { moverAsignacion } from '@/src/lib/asignaciones';
import { autorizarInventario, operarInventario } from '@/src/lib/inventarioOperacion';
import { cantidadEntera, estadoFisico, errorInventario, InventarioError, validarArticulo, validarGuardia } from '@/src/lib/inventarioValidacion';

export async function GET(req: NextRequest) {
  try {
    autorizarInventario(req, 'entradas', 'ver');
    return Response.json(db.select().from(entradas).orderBy(desc(entradas.fecha), desc(entradas.id)).all());
  } catch (err) { return errorInventario(err); }
}

export async function POST(req: NextRequest) {
  try {
    const user = autorizarInventario(req, 'entradas');
    const p = validarPayload(await req.json());
    const result = operarInventario(req, user, p, p.fecha, p.motivo, (tx, operacionId) => {
      if (!['Compra', 'Existencia Inicial', 'Devolución de Equipo', 'Recuperado', 'Ingreso externo'].includes(p.motivo)) throw new InventarioError('Motivo inválido');
      const cantidad = cantidadEntera(p.cantidad);
      const estado = estadoFisico(p.estado);
      const devuelve = ['Devolución de Equipo', 'Recuperado'].includes(p.motivo);
      if (devuelve) {
        const guardia = validarGuardia(p.guardia_id);
        if (guardia.estado === 'Baja Pendiente') throw new InventarioError('Registra la devolución desde Procesos de Baja');
        const salidaId = cantidadEntera(p.salida_id);
        const origen = tx.select().from(salidas).where(eq(salidas.id, salidaId)).get();
        if (!origen || origen.guardia_id !== guardia.id || origen.anulado || !['Uniforme en Campo', 'Extraviado'].includes(origen.estado_asignacion || '')) throw new InventarioError('Selecciona una asignación pendiente del guardia');
        const movidas = moverAsignacion(tx, { guardiaId: guardia.id, salidaId, articulo: origen.articulo, talla: origen.talla, cantidad,
          desde: p.motivo === 'Recuperado' ? ['Uniforme en Campo', 'Extraviado'] : ['Uniforme en Campo'],
          cambios: { estado_asignacion: 'Devuelto', estado_devuelto: estado, estado_actualizado_en: p.fecha },
        });
        return tx.insert(entradas).values(movidas.map(s => ({ fecha: p.fecha, articulo: s.articulo, talla: s.talla, cantidad: s.cantidad, estado, motivo: p.motivo,
          guardia_id: guardia.id, origen_devolucion: guardia.nombre, registrado_por: user.username, operacion_id: operacionId, salida_origen_id: s.id }))).returning().all();
      }
      const { articulo, talla } = validarArticulo(p.articulo, p.talla, true);
      if (p.motivo === 'Ingreso externo' && (typeof p.origen_devolucion !== 'string' || !p.origen_devolucion.trim())) throw new InventarioError('Indica la procedencia del equipo externo sin asignación');
      return tx.insert(entradas).values({ fecha: p.fecha, articulo, talla, cantidad, estado, motivo: p.motivo,
        origen_devolucion: p.motivo === 'Ingreso externo' ? p.origen_devolucion.trim() : null, registrado_por: user.username, operacion_id: operacionId }).returning().get();
    });
    return Response.json(result, { status: 201 });
  } catch (err) { return errorInventario(err); }
}
