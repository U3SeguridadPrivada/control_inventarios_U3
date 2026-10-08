import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { entradas, salidas, guardias } from '@/src/db/schema';
import { eq, sql } from 'drizzle-orm';
import { autorizarInventario, operarInventario } from '@/src/lib/inventarioOperacion';
import { cantidadEntera, errorInventario, InventarioError, validarPayload } from '@/src/lib/inventarioValidacion';
import { cambiosParaRestaurar, planDeshacer } from '@/src/lib/inventarioDeshacer';
import { calcularStockDisponible } from '@/src/lib/stock';
import { fechaMexico } from '@/src/lib/fecha';

function tablaValida(valor: unknown): 'entradas' | 'salidas' {
  if (valor !== 'entradas' && valor !== 'salidas') throw new InventarioError('Movimiento inválido');
  return valor;
}

/** Vista previa para la pantalla: qué se deshará al anular esta fila, o por qué no se puede. */
export async function GET(req: NextRequest) {
  try {
    const tabla = tablaValida(req.nextUrl.searchParams.get('tabla'));
    autorizarInventario(req, tabla, 'eliminar');
    const id = cantidadEntera(req.nextUrl.searchParams.get('id'));
    try {
      const plan = planDeshacer(db, tabla, id);
      const filas = new Set(plan.eventos.map(e => e.tabla + ':' + e.registro_id)).size;
      return Response.json({ puede: true, tipo: plan.tipo, fecha: plan.fecha, usuario: plan.usuario, filas });
    } catch (err) {
      if (err instanceof InventarioError) return Response.json({ puede: false, bloqueo: err.message });
      throw err;
    }
  } catch (err) { return errorInventario(err); }
}

/**
 * Deshace la última operación vigente sobre la fila indicada: la captura original si nadie la ha tocado,
 * o el extravío / la devolución / la reposición que la cambió después. La operación se revierte completa
 * (todas las filas que creó o cambió) y el historial se conserva.
 */
export async function POST(req: NextRequest) {
  try {
    const p = validarPayload(await req.json());
    const tabla = tablaValida(p.tabla);
    const user = autorizarInventario(req, tabla, 'eliminar');
    if (typeof p.motivo !== 'string' || p.motivo.trim().length < 5) throw new InventarioError('Explica el motivo de la anulación');
    const result = operarInventario(req, user, p, fechaMexico(), 'Anulación: ' + p.motivo.trim(), (tx, operacionId) => {
      const plan = planDeshacer(tx, tabla, cantidadEntera(p.id));
      for (const e of plan.eventos) {
        const t = e.tabla === 'entradas' ? entradas : salidas;
        if (!e.antes) { tx.update(t).set({ anulado: 1 }).where(eq(t.id, e.registro_id)).run(); continue; }
        const cambios = cambiosParaRestaurar(e);
        if (e.tabla === 'salidas' && cambios.estado_asignacion === 'Uniforme en Campo') {
          const g = tx.select().from(guardias).where(eq(guardias.id, JSON.parse(e.antes).guardia_id)).get();
          if (!g || g.estado !== 'Activo') throw new InventarioError('No se puede restaurar una asignación a un guardia inactivo');
        }
        if (Object.keys(cambios).length) tx.update(t).set(cambios).where(eq(t.id, e.registro_id)).run();
      }

      // Solo importan las existencias de lo que esta operación tocó: un descuadre antiguo en otro
      // artículo no debe impedir corregir un error de captura.
      const revisadas = new Set<string>();
      for (const e of plan.eventos) {
        const fila: any = e.tabla === 'entradas'
          ? tx.select().from(entradas).where(eq(entradas.id, e.registro_id)).get()
          : tx.select().from(salidas).where(eq(salidas.id, e.registro_id)).get();
        const estado: string | null | undefined = e.tabla === 'entradas' ? fila?.estado : fila?.estado_fisico;
        if (!fila || !estado) continue;
        const clave = JSON.stringify([fila.articulo, fila.talla, estado]);
        if (revisadas.has(clave)) continue;
        revisadas.add(clave);
        if (calcularStockDisponible(fila.articulo, fila.talla ?? undefined, estado) < 0) {
          throw new InventarioError(`La anulación dejaría existencias negativas de ${fila.articulo}${fila.talla ? ' talla ' + fila.talla : ''} (${estado}); revisa los movimientos posteriores`);
        }
      }

      // Marca lo deshecho (y esta misma anulación) para que no cuente como "movimiento posterior".
      tx.run(sql`UPDATE inventario_eventos SET deshecho_por=${operacionId} WHERE operacion_id IN (${plan.operacion_id}, ${operacionId})`);
      return { ok: true, tipo: plan.tipo, mensaje: `Se deshizo «${plan.tipo}» del ${plan.fecha}` };
    });
    return Response.json(result);
  } catch (err) { return errorInventario(err); }
}
