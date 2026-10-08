import { validarPayload } from '@/src/lib/inventarioValidacion';
import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { salidas } from '@/src/db/schema';
import { desc } from 'drizzle-orm';
import { calcularStockDisponible } from '@/src/lib/stock';
import { autorizarConsultaInventario, autorizarInventario, operarInventario } from '@/src/lib/inventarioOperacion';
import { cantidadEntera, estadoFisico, errorInventario, InventarioError, validarArticulo, validarGuardia } from '@/src/lib/inventarioValidacion';

export async function GET(req: NextRequest) {
  try { autorizarConsultaInventario(req, [['salidas','ver'], ['entradas','crear'], ['uniformes-campo','editar']]); return Response.json(db.select().from(salidas).orderBy(desc(salidas.fecha), desc(salidas.id)).all()); }
  catch (err) { return errorInventario(err); }
}
export async function POST(req: NextRequest) {
  try {
    const user = autorizarInventario(req, 'salidas');
    const p = validarPayload(await req.json());
    const result = operarInventario(req, user, p, p.fecha, p.concepto, (tx, operacionId) => {
      if (!['Uniforme en Campo', 'Inutilizable'].includes(p.concepto)) throw new InventarioError('Para reportar un extravío selecciona el equipo asignado en Uniformes en Campo');
      const { articulo, talla } = validarArticulo(p.articulo, p.talla);
      const cantidad = cantidadEntera(p.cantidad);
      const estado = estadoFisico(p.estado_fisico || 'Nuevo', p.concepto !== 'Inutilizable');
      const guardia = p.concepto === 'Uniforme en Campo' ? validarGuardia(p.guardia_id, true) : p.guardia_id ? validarGuardia(p.guardia_id) : null;
      const disponible = calcularStockDisponible(articulo, talla || undefined, estado);
      if (cantidad > disponible) throw new InventarioError('Stock insuficiente. Disponible: ' + disponible);
      return tx.insert(salidas).values({ fecha: p.fecha, concepto: p.concepto, articulo, talla, cantidad, estado_fisico: estado,
        estado_asignacion: p.concepto === 'Uniforme en Campo' ? 'Uniforme en Campo' : 'N/A',
        guardia_id: guardia?.id ?? null, nombre_guardia: guardia?.nombre ?? null, registrado_por: user.username,
        observaciones: typeof p.observaciones === 'string' ? p.observaciones : null, operacion_id: operacionId }).returning().get();
    });
    return Response.json(result, { status: 201 });
  } catch (err) { return errorInventario(err); }
}
