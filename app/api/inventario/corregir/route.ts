import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { entradas, salidas } from '@/src/db/schema';
import { eq, sql } from 'drizzle-orm';
import { autorizarInventario, operarInventario } from '@/src/lib/inventarioOperacion';
import { cantidadEntera, errorInventario, estadoFisico, InventarioError, validarArticulo, validarPayload } from '@/src/lib/inventarioValidacion';
import { asegurarColumnaDeshecho, EventoInventario, ultimoEventoVigente } from '@/src/lib/inventarioDeshacer';
import { calcularStockDisponible } from '@/src/lib/stock';
import { fechaMexico } from '@/src/lib/fecha';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Tabla = 'entradas' | 'salidas';
type Valores = { cantidad: number; talla: string | null; estado: string };

/**
 * Operaciones de un solo paso: cambiar su cantidad no obliga a rehacer otras filas. Las demás
 * (devoluciones, reposiciones, extravíos, bajas…) se deshacen con «Anular» y se vuelven a registrar.
 */
const SIMPLES: Record<Tabla, string[]> = {
  entradas: ['Compra', 'Existencia Inicial', 'Ingreso externo', 'Carga inicial', 'Equipo previo'],
  salidas: ['Uniforme en Campo', 'Asignación en campo', 'Inutilizable', 'Equipo previo'],
};

const leer = (tx: Tx, tabla: Tabla, id: number): any =>
  tabla === 'entradas' ? tx.select().from(entradas).where(eq(entradas.id, id)).get() : tx.select().from(salidas).where(eq(salidas.id, id)).get();

const valoresDe = (tabla: Tabla, fila: any): Valores =>
  ({ cantidad: fila.cantidad, talla: fila.talla ?? null, estado: tabla === 'entradas' ? fila.estado : fila.estado_fisico });

function aplicar(tx: Tx, tabla: Tabla, id: number, v: Valores) {
  if (tabla === 'entradas') tx.update(entradas).set({ cantidad: v.cantidad, talla: v.talla, estado: v.estado }).where(eq(entradas.id, id)).run();
  else tx.update(salidas).set({ cantidad: v.cantidad, talla: v.talla, estado_fisico: v.estado }).where(eq(salidas.id, id)).run();
}

/** Ninguna combinación talla/estado que se toque puede quedar con saldo negativo. */
function verificarExistencias(articulo: string, cubetas: { talla: string | null; estado: string }[]) {
  const vistas = new Set<string>();
  for (const { talla, estado } of cubetas) {
    const clave = (talla ?? '') + '|' + estado;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    if (calcularStockDisponible(articulo, talla ?? undefined, estado) < 0) {
      throw new InventarioError(`La corrección dejaría existencias negativas de ${articulo}${talla ? ' talla ' + talla : ''} (${estado}). Registra antes lo que falta o usa un conteo físico`);
    }
  }
}

/**
 * Corrige la cantidad, talla o estado físico de un movimiento de un solo paso (compra, carga inicial,
 * asignación, baja por daño, equipo previo). Es un cambio en el lugar: la bitácora conserva quién lo hizo,
 * por qué y los valores anteriores. Se agrupa con la operación original, de modo que «Anular» después
 * sigue cancelando el movimiento completo y devuelve los valores con que se capturó.
 */
export async function POST(req: NextRequest) {
  try {
    const p = validarPayload(await req.json());
    if (p.tabla !== 'entradas' && p.tabla !== 'salidas') throw new InventarioError('Movimiento inválido');
    const tabla: Tabla = p.tabla;
    const user = autorizarInventario(req, tabla, 'editar');
    if (typeof p.motivo !== 'string' || p.motivo.trim().length < 5) throw new InventarioError('Explica el motivo de la corrección');
    const result = operarInventario(req, user, p, fechaMexico(), 'Corrección: ' + p.motivo.trim(), tx => {
      asegurarColumnaDeshecho(tx);
      const id = cantidadEntera(p.id);
      const fila = leer(tx, tabla, id);
      if (!fila || fila.anulado) throw new InventarioError('El movimiento no existe o ya está anulado');

      const creacion = tx.get<{ operacion_id: string | null; motivo: string | null } | undefined>(
        sql`SELECT operacion_id, motivo FROM inventario_eventos WHERE tabla=${tabla} AND registro_id=${id} AND accion='INSERT' ORDER BY id LIMIT 1`);
      if (!creacion?.operacion_id) throw new InventarioError('Este registro es anterior a la bitácora. Corrige su saldo con un ajuste físico justificado');
      if (!SIMPLES[tabla].includes(creacion.motivo ?? '')) {
        throw new InventarioError(`Este movimiento nació de «${creacion.motivo}», una operación de varios pasos. Para cambiarlo usa «Anular» y vuelve a registrarlo`);
      }
      const op = creacion.operacion_id;
      const vigente = ultimoEventoVigente(tx, tabla, id);
      if (vigente?.operacion_id !== op) {
        throw new InventarioError(`Este movimiento ya tuvo un cambio posterior («${vigente?.motivo ?? 'sin identificar'}»). Deshazlo primero con «Anular» o registra un conteo físico`);
      }

      // El equipo previo crea una entrada y una salida por renglón, siempre de una en una y en ese orden:
      // la pareja es la que está justo antes o después en los INSERT de la operación.
      let par: { tabla: Tabla; id: number } | null = null;
      const actual = valoresDe(tabla, fila);
      if (creacion.motivo === 'Equipo previo') {
        const inserts = tx.all<EventoInventario>(sql`SELECT * FROM inventario_eventos WHERE operacion_id=${op} AND accion='INSERT' ORDER BY id`);
        const i = inserts.findIndex(e => e.tabla === tabla && e.registro_id === id);
        const otro = i < 0 ? undefined : tabla === 'entradas' ? inserts[i + 1] : inserts[i - 1];
        if (!otro || otro.tabla === tabla) throw new InventarioError('No se pudo identificar la pareja de este equipo previo. Usa «Anular» y vuelve a registrarlo');
        const tablaPar = otro.tabla as Tabla;
        const filaPar = leer(tx, tablaPar, otro.registro_id);
        const vp = filaPar && valoresDe(tablaPar, filaPar);
        const intacta = filaPar && !filaPar.anulado && filaPar.articulo === fila.articulo
          && vp.cantidad === actual.cantidad && vp.talla === actual.talla && vp.estado === actual.estado
          && ultimoEventoVigente(tx, tablaPar, otro.registro_id)?.operacion_id === op;
        if (!intacta) throw new InventarioError('La pareja de este equipo previo ya cambió. Usa «Anular» y vuelve a registrarlo');
        par = { tabla: tablaPar, id: otro.registro_id };
      }

      // Una asignación solo sale de almacén en Nuevo/Usado; una baja por daño sí puede ser Inutilizable.
      const entregable = tabla === 'salidas' ? fila.concepto !== 'Inutilizable' : creacion.motivo === 'Equipo previo';
      const nuevo: Valores = {
        cantidad: p.cantidad === undefined ? actual.cantidad : cantidadEntera(p.cantidad),
        talla: p.talla === undefined ? actual.talla : validarArticulo(fila.articulo, p.talla).talla,
        estado: p.estado === undefined ? actual.estado : estadoFisico(p.estado, entregable),
      };
      if (nuevo.cantidad === actual.cantidad && nuevo.talla === actual.talla && nuevo.estado === actual.estado) {
        throw new InventarioError('No hay cambios: los valores son iguales a los actuales');
      }

      tx.run(sql`UPDATE inventario_contexto SET operacion_id=${op} WHERE id=1`);
      aplicar(tx, tabla, id, nuevo);
      if (par) aplicar(tx, par.tabla, par.id, nuevo);
      verificarExistencias(fila.articulo, [{ talla: actual.talla, estado: actual.estado }, { talla: nuevo.talla, estado: nuevo.estado }]);
      return { ok: true, mensaje: 'Movimiento corregido', antes: actual, despues: nuevo };
    });
    return Response.json(result);
  } catch (err) { return errorInventario(err); }
}
