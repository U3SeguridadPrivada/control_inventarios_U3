import { validarPayload } from '@/src/lib/inventarioValidacion';
import { NextRequest } from 'next/server';
import { inventario_ajustes } from '@/src/db/schema';
import { autorizarInventario, operarInventario } from '@/src/lib/inventarioOperacion';
import { cantidadEntera, estadoFisico, errorInventario, InventarioError, validarArticulo } from '@/src/lib/inventarioValidacion';
import { calcularStockDisponible } from '@/src/lib/stock';
import { fechaMexico } from '@/src/lib/fecha';
export async function POST(req: NextRequest) {
  try {
    const user = autorizarInventario(req, 'inventario', 'editar'); const p = validarPayload(await req.json());
    if (typeof p.motivo !== 'string' || p.motivo.trim().length < 5) throw new InventarioError('Explica el motivo y la referencia del conteo físico');
    return Response.json(operarInventario(req, user, p, fechaMexico(), 'Ajuste físico: ' + p.motivo.trim(), (tx, operacionId) => {
      const { articulo, talla } = validarArticulo(p.articulo, p.talla);
      const estado = estadoFisico(p.estado); const contado = cantidadEntera(p.contado, true);
      const actual = calcularStockDisponible(articulo, talla || undefined, estado);
      if (Number(p.saldo_esperado) !== actual) throw new InventarioError('El saldo cambió desde que abriste el conteo. Actualízalo antes de confirmar', 409);
      if (contado === actual) return { ok: true, diferencia: 0 };
      tx.insert(inventario_ajustes).values({ fecha: fechaMexico(), articulo, talla, estado, cantidad: contado - actual, motivo: p.motivo.trim(), registrado_por: user.username, operacion_id: operacionId }).run();
      return { ok: true, diferencia: contado - actual };
    }));
  } catch (err) { return errorInventario(err); }
}
