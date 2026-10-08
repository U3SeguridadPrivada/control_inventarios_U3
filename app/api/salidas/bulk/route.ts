import { validarPayload } from '@/src/lib/inventarioValidacion';
import { NextRequest } from 'next/server';
import { salidas } from '@/src/db/schema';
import { validarStockLote } from '@/src/lib/stock';
import { autorizarInventario, operarInventario } from '@/src/lib/inventarioOperacion';
import { cantidadEntera, estadoFisico, errorInventario, InventarioError, validarArticulo, validarGuardia, validarItems, validarFecha } from '@/src/lib/inventarioValidacion';

export async function POST(req: NextRequest) {
  try {
    const user = autorizarInventario(req, 'salidas');
    const p = validarPayload(await req.json()); validarItems(p.items);
    const result = operarInventario(req, user, p, p.items[0].fecha, 'Asignación en campo', (tx, operacionId) => {
      const guardia = validarGuardia(p.items[0].guardia_id, true);
      const items = p.items.map((i: any) => {
        validarFecha(i.fecha);
        if (Number(i.guardia_id) !== guardia.id || i.fecha !== p.items[0].fecha) throw new InventarioError('El lote debe corresponder a un solo guardia y fecha');
        const { articulo, talla } = validarArticulo(i.articulo, i.talla);
        return { fecha: i.fecha, concepto: 'Uniforme en Campo', articulo, talla, cantidad: cantidadEntera(i.cantidad), estado_fisico: estadoFisico(i.estado_fisico || 'Nuevo', true),
          guardia_id: guardia.id, nombre_guardia: guardia.nombre, estado_asignacion: 'Uniforme en Campo', registrado_por: user.username, operacion_id: operacionId };
      });
      const error = validarStockLote(items); if (error) throw new InventarioError(error);
      const created = tx.insert(salidas).values(items).returning().all();
      return { created: created.reduce((a, i) => a + i.cantidad, 0), items: created };
    });
    return Response.json(result, { status: 201 });
  } catch (err) { return errorInventario(err); }
}
