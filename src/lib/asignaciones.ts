import { db } from '@/src/db';
import { salidas, catalogo_prendas } from '@/src/db/schema';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { cantidadEntera, InventarioError, validarArticulo } from '@/src/lib/inventarioValidacion';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Error de negocio (400) lanzado dentro de una transacción para revertirla. */
export class AsignacionError extends InventarioError {}

/**
 * Mueve `cantidad` piezas que el guardia tiene asignadas a otro estado (Devuelto, Extraviado...).
 * Toma primero las piezas del primer estado de `desde` y, si no alcanzan, las del siguiente.
 * Si la cantidad pedida es menor que la de una fila, la fila se parte en dos: la parte movida
 * toma el nuevo estado y el resto conserva el anterior. Así el cálculo de existencias (que suma
 * `cantidad`) y los conteos por fila nunca se desfasan, sin importar si la asignación original
 * se guardó como una fila de varias piezas o como varias filas de una.
 *
 * Lanza `AsignacionError` (y por tanto revierte la transacción) si el guardia no tiene tantas
 * piezas: antes se re-etiquetaban "las que hubiera" y la API respondía OK aunque no coincidiera
 * con lo pedido.
 */
export function moverAsignacion(
  tx: Tx,
  opts: {
    guardiaId: number;
    articulo: string;
    talla?: string | null;
    cantidad: number;
    cambios: Partial<typeof salidas.$inferInsert>;
    desde?: string[];
    salidaId?: number;
  },
): (typeof salidas.$inferSelect)[] {
  const { guardiaId, articulo, talla, cantidad, cambios, desde = ['Uniforme en Campo'] } = opts;

  cantidadEntera(cantidad);
  const filas = desde.flatMap((estado) => {
    const conds = [eq(salidas.anulado, 0), eq(salidas.guardia_id, guardiaId), eq(salidas.articulo, articulo), eq(salidas.estado_asignacion, estado), talla ? eq(salidas.talla, talla) : isNull(salidas.talla)];
    if (opts.salidaId) conds.push(eq(salidas.id, opts.salidaId));
    return tx.select().from(salidas).where(and(...conds)).orderBy(desc(salidas.fecha), desc(salidas.id)).all();
  });
  const enPosesion = filas.reduce((a, f) => a + f.cantidad, 0);
  if (cantidad > enPosesion) {
    throw new AsignacionError(`El guardia solo tiene ${enPosesion} pieza(s) de "${articulo}${talla ? ` (${talla})` : ''}" y se pidieron ${cantidad}`);
  }

  let restante = cantidad;
  const movidas: (typeof salidas.$inferSelect)[] = [];
  for (const fila of filas) {
    if (restante <= 0) break;
    if (cambios.estado_actualizado_en && cambios.estado_actualizado_en < (fila.estado_actualizado_en || fila.fecha)) throw new AsignacionError('La fecha no puede ser anterior al último movimiento de esta asignación');
    if (fila.cantidad <= restante) {
      movidas.push(tx.update(salidas).set(cambios).where(eq(salidas.id, fila.id)).returning().get());
      restante -= fila.cantidad;
    } else {
      const { id: _id, ...copia } = fila;
      tx.update(salidas).set({ cantidad: fila.cantidad - restante }).where(eq(salidas.id, fila.id)).run();
      movidas.push(tx.insert(salidas).values({ ...copia, ...cambios, cantidad: restante }).returning().get());
      restante = 0;
    }
  }
  return movidas;
}

/**
 * Regla de talla de una prenda según el catálogo (que el usuario puede editar), con las
 * constantes como respaldo para artículos que aún no están en él. Devuelve un mensaje de error
 * si falta la talla, o la talla normalizada (null si la prenda no la lleva) para guardarla.
 */
export function normalizarTalla(articulo: string, talla: string | null | undefined): { talla: string | null; error?: string } {
  try { return { talla: validarArticulo(articulo, talla).talla }; }
  catch (err) { return { talla: null, error: err instanceof Error ? err.message : 'Artículo inválido' }; }
}
