import { validarPayload } from '@/src/lib/inventarioValidacion';
import { NextRequest } from 'next/server';
import { salidas, entradas } from '@/src/db/schema';
import { validarStockLote } from '@/src/lib/stock';
import { moverAsignacion } from '@/src/lib/asignaciones';
import { autorizarInventario, operarInventario } from '@/src/lib/inventarioOperacion';
import { cantidadEntera, estadoFisico, errorInventario, InventarioError, validarArticulo, validarGuardia, validarItems, validarFecha } from '@/src/lib/inventarioValidacion';

export async function POST(req: NextRequest) {
  try {
    const user = autorizarInventario(req, 'uniformes-campo', 'editar');
    const p = validarPayload(await req.json()); validarItems(p.items);
    const result = operarInventario(req, user, p, p.items[0].fecha, 'Reposición', (tx, operacionId) => {
      const guardia = validarGuardia(p.items[0].guardia_id, true);
      const items = p.items.map((i: any) => {
        validarFecha(i.fecha);
        if (Number(i.guardia_id) !== guardia.id || i.fecha !== p.items[0].fecha) throw new InventarioError('El lote debe corresponder a un solo guardia y fecha');
        const anterior = validarArticulo(i.articulo, i.talla);
        const nuevo = validarArticulo(i.articulo, i.talla_nueva === undefined ? i.talla : i.talla_nueva);
        return { ...i, articulo: anterior.articulo, talla_anterior: anterior.talla, talla: nuevo.talla,
          cantidad: cantidadEntera(i.cantidad), estado_fisico: estadoFisico(i.estado_fisico || p.estadoEntregado || 'Nuevo', true),
          devuelto: estadoFisico(i.estado_devuelto || p.estadoDevolucion || 'Usado') };
      });
      const error = validarStockLote(items); if (error) throw new InventarioError(error);
      for (const i of items) {
        const movidas = moverAsignacion(tx, { guardiaId: guardia.id, articulo: i.articulo, talla: i.talla_anterior, cantidad: i.cantidad,
          salidaId: i.salida_id ? cantidadEntera(i.salida_id) : undefined,
          cambios: { estado_asignacion: 'Devuelto', estado_devuelto: i.devuelto, estado_actualizado_en: i.fecha } });
        for (const s of movidas) {
          tx.insert(entradas).values({ fecha: i.fecha, articulo: s.articulo, talla: s.talla, cantidad: s.cantidad, estado: i.devuelto,
            motivo: 'Reposición (Entrada Múltiple)', origen_devolucion: guardia.nombre, guardia_id: guardia.id, registrado_por: user.username, operacion_id: operacionId, salida_origen_id: s.id }).run();
          tx.insert(salidas).values({ fecha: i.fecha, concepto: 'Reposición', articulo: i.articulo, talla: i.talla, cantidad: s.cantidad, nombre_guardia: guardia.nombre,
            guardia_id: guardia.id, estado_asignacion: 'Uniforme en Campo', estado_fisico: i.estado_fisico, registrado_por: user.username, operacion_id: operacionId, salida_origen_id: s.id }).run();
        }
      }
      return { ok: true };
    });
    return Response.json(result, { status: 201 });
  } catch (err) { return errorInventario(err); }
}
