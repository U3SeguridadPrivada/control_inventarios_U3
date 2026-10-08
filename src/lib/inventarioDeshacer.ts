import { db } from '@/src/db';
import { sql } from 'drizzle-orm';
import { InventarioError } from '@/src/lib/inventarioValidacion';

/** Lo que `anular` y `corregir` necesitan: sirve igual dentro de una transacción que fuera de ella. */
export type Consulta = Pick<typeof db, 'get' | 'all' | 'run'>;

/**
 * El arranque ya agrega `deshecho_por` a la bitácora (src/db/inventarioMigracion.ts). Esto solo cubre a un
 * proceso que siguió vivo desde antes de la actualización y todavía no la tiene: sin ella, la primera
 * anulación fallaría con un error interno hasta reiniciar el servidor. Es idempotente.
 */
export function asegurarColumnaDeshecho(q: Consulta) {
  const columnas = q.all<{ name: string }>(sql`PRAGMA table_info(inventario_eventos)`);
  if (!columnas.some(c => c.name === 'deshecho_por')) q.run(sql`ALTER TABLE inventario_eventos ADD COLUMN deshecho_por TEXT`);
}

export interface EventoInventario {
  id: number; tabla: string; registro_id: number; accion: string; fecha: string; usuario: string;
  operacion_id: string | null; motivo: string | null; antes: string | null; despues: string | null; deshecho_por: string | null;
}

/**
 * Operaciones que solo propagan un renombre (prenda o guardia) a filas ya capturadas. No cambian
 * cantidades ni estados, así que no cuentan como "movimiento posterior" ni se deshacen: si contaran,
 * corregir una letra del nombre de un guardia bloquearía anular o corregir todo lo que se le entregó.
 */
export const OPERACIONES_COSMETICAS = ['Editar prenda', 'Actualizar expediente del guardia'];

/**
 * Último evento de una fila que sigue vigente. Se ignora lo que ya se deshizo (incluidas las propias
 * anulaciones, que se marcan a sí mismas) y los renombres. Si la fila no ha cambiado desde que se creó,
 * es el evento de su creación; si alguien reportó un extravío, es el del extravío.
 */
export function ultimoEventoVigente(q: Consulta, tabla: string, id: number): EventoInventario | undefined {
  return q.get<EventoInventario | undefined>(sql`
    SELECT * FROM inventario_eventos
    WHERE tabla=${tabla} AND registro_id=${id} AND deshecho_por IS NULL
      AND COALESCE(motivo,'') NOT IN (${OPERACIONES_COSMETICAS[0]}, ${OPERACIONES_COSMETICAS[1]})
    ORDER BY id DESC LIMIT 1`);
}

export interface PlanDeshacer {
  operacion_id: string;
  /** Motivo con el que se registró la operación («Compra», «Extravío», «Reposición»…). */
  tipo: string;
  fecha: string;
  usuario: string;
  /** Eventos de la operación, del más reciente al más antiguo: así se revierten en orden inverso. */
  eventos: EventoInventario[];
}

/**
 * Decide qué operación se deshace al anular una fila: la última que sigue vigente sobre ella. Para una
 * fila intacta es la captura original; para una pieza reportada como extraviada, el extravío. Lanza
 * `InventarioError` con el motivo si no se puede (anterior a la bitácora, parte de una baja, o con
 * movimientos posteriores sobre alguna de las piezas que esa operación tocó).
 */
export function planDeshacer(q: Consulta, tabla: 'entradas' | 'salidas', id: number): PlanDeshacer {
  asegurarColumnaDeshecho(q);
  const fila = tabla === 'entradas'
    ? q.get<{ anulado: number } | undefined>(sql`SELECT anulado FROM entradas WHERE id=${id}`)
    : q.get<{ anulado: number } | undefined>(sql`SELECT anulado FROM salidas WHERE id=${id}`);
  if (!fila || fila.anulado) throw new InventarioError('El movimiento no existe o ya está anulado');

  const ultimo = ultimoEventoVigente(q, tabla, id);
  if (!ultimo?.operacion_id) throw new InventarioError('Este registro es anterior a la bitácora. Corrige su saldo con un ajuste físico justificado');
  const operacion_id = ultimo.operacion_id;

  const eventos = q.all<EventoInventario>(sql`SELECT * FROM inventario_eventos WHERE operacion_id=${operacion_id} AND deshecho_por IS NULL ORDER BY id DESC`);
  const origen = eventos[eventos.length - 1];
  const tipo = origen.motivo ?? 'operación';
  if (tipo === 'Procesar baja') throw new InventarioError('Esta devolución pertenece a un proceso de baja. Su checklist y expediente deben conservarse; registra un conteo físico para corregir diferencias de almacén');
  if (tipo === 'Iniciar baja') throw new InventarioError('Este equipo pertenece a un proceso de baja abierto; se resuelve desde Procesos de Baja');
  if (eventos.some(e => e.tabla !== 'entradas' && e.tabla !== 'salidas')) throw new InventarioError('Esta operación no se puede anular desde movimientos');

  const revisadas = new Set<string>();
  for (const e of eventos) {
    const clave = e.tabla + ':' + e.registro_id;
    if (revisadas.has(clave)) continue;
    revisadas.add(clave);
    const vigente = ultimoEventoVigente(q, e.tabla, e.registro_id);
    if (vigente?.operacion_id !== operacion_id) {
      throw new InventarioError(`Hay un movimiento posterior («${vigente?.motivo ?? 'sin identificar'}») sobre estas piezas. Deshazlo primero desde su propia fila`);
    }
  }
  return { operacion_id, tipo, fecha: origen.fecha, usuario: origen.usuario, eventos };
}

/**
 * Columnas que un evento cambió, con su valor anterior. Se restaura solo eso (no la fila entera) para no
 * pisar un renombre posterior de la prenda o del guardia.
 */
export function cambiosParaRestaurar(e: EventoInventario): Record<string, any> {
  const antes = JSON.parse(e.antes ?? '{}') as Record<string, unknown>;
  const despues = JSON.parse(e.despues ?? '{}') as Record<string, unknown>;
  const cambios: Record<string, any> = {};
  for (const [campo, valor] of Object.entries(antes)) {
    if (campo !== 'id' && JSON.stringify(valor) !== JSON.stringify(despues[campo])) cambios[campo] = valor;
  }
  return cambios;
}
