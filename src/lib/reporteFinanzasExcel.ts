import { db } from '@/src/db';
import { movimientos_financieros, libros_financieros, users } from '@/src/db/schema';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import type { SeccionId } from '@/src/lib/reporteFinanzasTemplate';
import { buildReporteFinanzasExcel } from '@/src/lib/reporteFinanzasExcelTemplate';

/**
 * Reúne de la base lo que necesita el Excel del reporte y lo arma.
 *
 * Toma exactamente los mismos datos que `construirReporteFinanzas` para el PDF
 * —mismo rango, mismos movimientos, mismos saldos de apertura— para que los dos
 * formatos no puedan contar cosas distintas.
 *
 * No comprueba permisos: eso es responsabilidad de quien la llama.
 */
export async function construirExcelFinanzas(opts: {
  libroId: string;
  desde?: string | null;
  hasta?: string | null;
  secciones: SeccionId[];
  generadoPor: string;
}) {
  const { libroId, secciones, generadoPor } = opts;

  const libro = db.select().from(libros_financieros).where(eq(libros_financieros.id, libroId)).get();
  if (!libro) return null;

  const responsable = libro.usuario_id
    ? db.select({ username: users.username }).from(users).where(eq(users.id, libro.usuario_id)).get()?.username ?? null
    : null;

  // Sin rango explícito se exporta la cuenta completa.
  const limites = db.select({
    desde: sql<string>`MIN(${movimientos_financieros.fecha})`,
    hasta: sql<string>`MAX(${movimientos_financieros.fecha})`,
  }).from(movimientos_financieros).where(eq(movimientos_financieros.libro, libroId)).get();

  const hoy = new Date().toISOString().slice(0, 10);
  const desde = opts.desde || limites?.desde || hoy;
  const hasta = opts.hasta || limites?.hasta || hoy;

  const movimientos = db.select({
    fecha: movimientos_financieros.fecha,
    tipo: movimientos_financieros.tipo,
    categoria: movimientos_financieros.categoria,
    monto: movimientos_financieros.monto,
    descripcion: movimientos_financieros.descripcion,
    medio_pago: movimientos_financieros.medio_pago,
    nombre: movimientos_financieros.nombre,
    tipo_detalle: movimientos_financieros.tipo_detalle,
    turno: movimientos_financieros.turno,
    alimentos: movimientos_financieros.alimentos,
    servicio: movimientos_financieros.servicio,
  }).from(movimientos_financieros)
    .where(and(
      eq(movimientos_financieros.libro, libroId),
      gte(movimientos_financieros.fecha, desde),
      lte(movimientos_financieros.fecha, hasta),
    ))
    .orderBy(asc(movimientos_financieros.fecha), asc(movimientos_financieros.id)).all();

  // Saldos de apertura, para que el corrido arranque donde estaba la cuenta.
  const signo = sql`CASE WHEN ${movimientos_financieros.tipo} = 'Ingreso' THEN ${movimientos_financieros.monto} ELSE -${movimientos_financieros.monto} END`;
  const previos = db.select({
    total: sql<number>`COALESCE(SUM(${signo}), 0)`,
    tarjeta: sql<number>`COALESCE(SUM(CASE WHEN ${movimientos_financieros.medio_pago} = 'TARJETA' THEN (${signo}) ELSE 0 END), 0)`,
    efectivo: sql<number>`COALESCE(SUM(CASE WHEN ${movimientos_financieros.medio_pago} = 'EFECTIVO' THEN (${signo}) ELSE 0 END), 0)`,
  }).from(movimientos_financieros)
    .where(and(eq(movimientos_financieros.libro, libroId), sql`${movimientos_financieros.fecha} < ${desde}`)).get();

  return buildReporteFinanzasExcel({
    libroNombre: libro.nombre,
    responsable,
    desde,
    hasta,
    generadoPor,
    movimientos,
    saldoPrevio: Number(previos?.total ?? 0),
    saldoPrevioTarjeta: Number(previos?.tarjeta ?? 0),
    saldoPrevioEfectivo: Number(previos?.efectivo ?? 0),
    secciones,
  });
}
