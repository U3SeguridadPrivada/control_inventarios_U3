import { validarPayload } from '@/src/lib/inventarioValidacion';
import { NextRequest } from 'next/server';
import { entradas, salidas } from '@/src/db/schema';
import { autorizarInventario, operarInventario } from '@/src/lib/inventarioOperacion';
import { cantidadEntera, estadoFisico, errorInventario, validarArticulo, validarGuardia, validarItems } from '@/src/lib/inventarioValidacion';
export async function POST(req: NextRequest) {
  try {
    const user = autorizarInventario(req, 'uniformes-campo'); const p = validarPayload(await req.json()); validarItems(p.items);
    const result = operarInventario(req, user, p, p.fecha, 'Equipo previo', (tx, operacionId) => {
      const guardia = validarGuardia(p.guardia_id, true);
      let piezas = 0;
      for (const i of p.items) {
        const { articulo, talla } = validarArticulo(i.articulo, i.talla, true);
        const cantidad = cantidadEntera(i.cantidad); const estado = estadoFisico(i.estado_fisico || 'Usado', true);
        tx.insert(entradas).values({ fecha: p.fecha, articulo, talla, cantidad, estado, motivo: 'Existencia Inicial',
          origen_devolucion: 'Equipo previo en campo de ' + guardia.nombre, registrado_por: user.username, operacion_id: operacionId }).run();
        tx.insert(salidas).values({ fecha: p.fecha, concepto: 'Uniforme en Campo', articulo, talla, cantidad, nombre_guardia: guardia.nombre,
          guardia_id: guardia.id, estado_asignacion: 'Uniforme en Campo', estado_fisico: estado, observaciones: 'Equipo previo al sistema', registrado_por: user.username, operacion_id: operacionId }).run();
        piezas += cantidad;
      }
      return { registradas: p.items.length, piezas };
    });
    return Response.json(result, { status: 201 });
  } catch (err) { return errorInventario(err); }
}
