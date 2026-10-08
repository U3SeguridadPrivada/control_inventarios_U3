import { validarPayload } from '@/src/lib/inventarioValidacion';
import { NextRequest } from 'next/server';
import { moverAsignacion } from '@/src/lib/asignaciones';
import { autorizarInventario, operarInventario } from '@/src/lib/inventarioOperacion';
import { cantidadEntera, errorInventario, InventarioError, validarArticulo, validarGuardia, validarItems, validarFecha } from '@/src/lib/inventarioValidacion';
export async function POST(req: NextRequest) {
  try {
    const user = autorizarInventario(req, 'uniformes-campo', 'editar');
    const p = validarPayload(await req.json()); validarItems(p.items);
    const result = operarInventario(req, user, p, p.items[0].fecha, 'Extravío', tx => {
      const guardia = validarGuardia(p.items[0].guardia_id, true);
      for (const i of p.items) {
        validarFecha(i.fecha);
        if (Number(i.guardia_id) !== guardia.id || i.fecha !== p.items[0].fecha) throw new InventarioError('El lote debe corresponder a un solo guardia y fecha');
        const { articulo, talla } = validarArticulo(i.articulo, i.talla);
        moverAsignacion(tx, { guardiaId: guardia.id, articulo, talla, cantidad: cantidadEntera(i.cantidad), salidaId: i.salida_id ? cantidadEntera(i.salida_id) : undefined,
          cambios: { estado_asignacion: 'Extraviado', estado_actualizado_en: i.fecha, observaciones: typeof i.observaciones === 'string' ? i.observaciones : null } });
      }
      return { ok: true };
    });
    return Response.json(result, { status: 201 });
  } catch (err) { return errorInventario(err); }
}
