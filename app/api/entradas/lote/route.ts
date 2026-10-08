import { validarPayload } from '@/src/lib/inventarioValidacion';
import { NextRequest } from 'next/server';
import { entradas } from '@/src/db/schema';
import { autorizarInventario, operarInventario } from '@/src/lib/inventarioOperacion';
import { cantidadEntera, errorInventario, InventarioError, validarArticulo, validarItems } from '@/src/lib/inventarioValidacion';
export async function POST(req: NextRequest) {
  try {
    const user = autorizarInventario(req, 'entradas'); const p = validarPayload(await req.json()); validarItems(p.items);
    const result = operarInventario(req, user, p, p.fecha, 'Carga inicial', (tx, operacionId) => {
      const filas: (typeof entradas.$inferInsert)[] = [];
      for (const item of p.items) {
        const { articulo, talla } = validarArticulo(item.articulo, item.talla, true);
        for (const [key, estado] of Object.entries({ nuevo: 'Nuevo', usado: 'Usado', inutilizable: 'Inutilizable' })) {
          const cantidad = cantidadEntera(item[key] === '' || item[key] == null ? 0 : item[key], true);
          if (cantidad) filas.push({ fecha: p.fecha, articulo, talla, cantidad, estado, motivo: 'Existencia Inicial', registrado_por: user.username, operacion_id: operacionId });
        }
      }
      if (!filas.length) throw new InventarioError('Captura al menos una cantidad mayor a cero');
      for (const fila of filas) tx.insert(entradas).values(fila).run();
      return { creadas: filas.length, piezas: filas.reduce((a, f) => a + f.cantidad, 0) };
    });
    return Response.json(result, { status: 201 });
  } catch (err) { return errorInventario(err); }
}
