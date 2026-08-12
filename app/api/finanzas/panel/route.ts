import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { movimientos_financieros } from '@/src/db/schema';
import { sql, desc, and, eq, ne, gte, lte, type SQL } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { puedeVerLibro } from '@/src/lib/librosAcceso';

// Movimiento interno entre tarjeta y efectivo: no entra ni sale dinero de la
// cuenta, así que no cuenta como ingreso ni como egreso (pero sí para el saldo
// de cada medio de pago, donde se anulan entre sí).
const CAT_TRASPASO = 'TRASPASO';
const CAT_INGRESOS = 'INGRESOS';

/** Lunes de la semana a la que pertenece una fecha ISO. */
function lunesDe(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const redondear = (n: number) => Math.round(Number(n ?? 0) * 100) / 100;

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const libro = req.nextUrl.searchParams.get('libro');
  if (!libro) return Response.json({ error: 'Falta el libro' }, { status: 400 });
  // El panel resume toda la cuenta, así que se comprueba el acceso a ese libro
  // igual que en el resto del módulo: aquí no hay atajos de cliente.
  if (!puedeVerLibro(authUser, libro)) return forbidden();

  const delLibro = eq(movimientos_financieros.libro, libro);
  const noTraspaso = ne(movimientos_financieros.categoria, CAT_TRASPASO);
  const monto = movimientos_financieros.monto;
  const signo = sql`CASE WHEN ${movimientos_financieros.tipo} = 'Ingreso' THEN ${monto} ELSE -${monto} END`;

  // Los extremos de lo que existe se calculan siempre sobre la cuenta completa:
  // el selector necesita saber qué se puede pedir, no solo qué se está viendo.
  const disponible = db.select({
    movimientos: sql<number>`COUNT(*)`,
    desde: sql<string>`MIN(${movimientos_financieros.fecha})`,
    hasta: sql<string>`MAX(${movimientos_financieros.fecha})`,
  }).from(movimientos_financieros).where(delLibro).get();

  if (!disponible || !disponible.movimientos) {
    return Response.json({
      movimientos: 0, existencia: 0, tarjeta: 0, efectivo: 0, ingresos: 0, egresos: 0,
      desde: null, hasta: null, rangoDisponible: { desde: null, hasta: null },
      serieSemanal: [], porCategoria: [], topBeneficiarios: [], topServicios: [],
    });
  }

  const p = req.nextUrl.searchParams;
  const desdeParam = p.get('desde');
  const hastaParam = p.get('hasta');
  const filtros: SQL[] = [delLibro];
  if (desdeParam) filtros.push(gte(movimientos_financieros.fecha, desdeParam));
  if (hastaParam) filtros.push(lte(movimientos_financieros.fecha, hastaParam));
  const enRango = and(...filtros)!;

  const totales = db.select({
    movimientos: sql<number>`COUNT(*)`,
    existencia: sql<number>`COALESCE(SUM(${signo}), 0)`,
    tarjeta: sql<number>`COALESCE(SUM(CASE WHEN ${movimientos_financieros.medio_pago} = 'TARJETA' THEN (${signo}) ELSE 0 END), 0)`,
    efectivo: sql<number>`COALESCE(SUM(CASE WHEN ${movimientos_financieros.medio_pago} = 'EFECTIVO' THEN (${signo}) ELSE 0 END), 0)`,
    desde: sql<string>`MIN(${movimientos_financieros.fecha})`,
    hasta: sql<string>`MAX(${movimientos_financieros.fecha})`,
  }).from(movimientos_financieros).where(enRango).get();

  const rangoDisponible = { desde: disponible.desde, hasta: disponible.hasta };

  if (!totales || !totales.movimientos) {
    return Response.json({
      movimientos: 0, existencia: 0, tarjeta: 0, efectivo: 0, ingresos: 0, egresos: 0,
      desde: desdeParam, hasta: hastaParam, rangoDisponible,
      serieSemanal: [], porCategoria: [], topBeneficiarios: [], topServicios: [],
    });
  }

  // Saldos con los que abre el rango: sin ellos la evolución arrancaría en cero
  // y el saldo del periodo no coincidiría con el real de la cuenta.
  const previos = desdeParam
    ? db.select({
        total: sql<number>`COALESCE(SUM(${signo}), 0)`,
        tarjeta: sql<number>`COALESCE(SUM(CASE WHEN ${movimientos_financieros.medio_pago} = 'TARJETA' THEN (${signo}) ELSE 0 END), 0)`,
        efectivo: sql<number>`COALESCE(SUM(CASE WHEN ${movimientos_financieros.medio_pago} = 'EFECTIVO' THEN (${signo}) ELSE 0 END), 0)`,
      }).from(movimientos_financieros)
        .where(and(delLibro, sql`${movimientos_financieros.fecha} < ${desdeParam}`)).get()
    : { total: 0, tarjeta: 0, efectivo: 0 };
  const saldoPrevio = redondear(Number(previos?.total ?? 0));

  const flujo = db.select({
    ingresos: sql<number>`COALESCE(SUM(CASE WHEN ${movimientos_financieros.tipo} = 'Ingreso' THEN ${monto} ELSE 0 END), 0)`,
    egresos: sql<number>`COALESCE(SUM(CASE WHEN ${movimientos_financieros.tipo} <> 'Ingreso' THEN ${monto} ELSE 0 END), 0)`,
  }).from(movimientos_financieros).where(and(enRango, noTraspaso)).get();

  // Serie diaria; el agrupado por semana se hace aquí porque son pocas filas.
  const porDia = db.select({
    fecha: movimientos_financieros.fecha,
    ingresos: sql<number>`COALESCE(SUM(CASE WHEN ${movimientos_financieros.tipo} = 'Ingreso' THEN ${monto} ELSE 0 END), 0)`,
    egresos: sql<number>`COALESCE(SUM(CASE WHEN ${movimientos_financieros.tipo} <> 'Ingreso' THEN ${monto} ELSE 0 END), 0)`,
  }).from(movimientos_financieros).where(and(enRango, noTraspaso))
    .groupBy(movimientos_financieros.fecha).orderBy(movimientos_financieros.fecha).all();

  const semanas = new Map<string, { semana: string; ingresos: number; egresos: number }>();
  for (const d of porDia) {
    const k = lunesDe(d.fecha);
    const acc = semanas.get(k) || { semana: k, ingresos: 0, egresos: 0 };
    acc.ingresos += Number(d.ingresos);
    acc.egresos += Number(d.egresos);
    semanas.set(k, acc);
  }
  let corrido = saldoPrevio;
  const serieSemanal = [...semanas.values()]
    .sort((a, b) => a.semana.localeCompare(b.semana))
    .map((s) => {
      corrido += s.ingresos - s.egresos;
      return { semana: s.semana, ingresos: redondear(s.ingresos), egresos: redondear(s.egresos), saldo: redondear(corrido) };
    });

  const noIngreso = ne(movimientos_financieros.categoria, CAT_INGRESOS);

  const porCategoria = db.select({
    categoria: movimientos_financieros.categoria,
    total: sql<number>`COALESCE(SUM(${monto}), 0)`,
    movimientos: sql<number>`COUNT(*)`,
  }).from(movimientos_financieros).where(and(enRango, noTraspaso, noIngreso))
    .groupBy(movimientos_financieros.categoria).orderBy(desc(sql`SUM(${monto})`)).all();

  const topBeneficiarios = db.select({
    nombre: movimientos_financieros.nombre,
    total: sql<number>`COALESCE(SUM(${monto}), 0)`,
    movimientos: sql<number>`COUNT(*)`,
  }).from(movimientos_financieros)
    .where(and(enRango, noTraspaso, noIngreso, sql`${movimientos_financieros.nombre} IS NOT NULL AND ${movimientos_financieros.nombre} <> ''`))
    .groupBy(movimientos_financieros.nombre).orderBy(desc(sql`SUM(${monto})`)).limit(8).all();

  const topServicios = db.select({
    servicio: movimientos_financieros.servicio,
    total: sql<number>`COALESCE(SUM(${monto}), 0)`,
    movimientos: sql<number>`COUNT(*)`,
  }).from(movimientos_financieros)
    .where(and(enRango, noTraspaso, sql`${movimientos_financieros.servicio} IS NOT NULL AND ${movimientos_financieros.servicio} <> ''`))
    .groupBy(movimientos_financieros.servicio).orderBy(desc(sql`SUM(${monto})`)).limit(6).all();

  return Response.json({
    movimientos: Number(totales.movimientos),
    // El saldo es acumulado: lo que traía la cuenta al abrir el rango más lo
    // que se movió dentro. Ingresos y egresos sí son solo del rango.
    existencia: redondear(saldoPrevio + Number(totales.existencia)),
    tarjeta: redondear(Number(previos?.tarjeta ?? 0) + Number(totales.tarjeta)),
    efectivo: redondear(Number(previos?.efectivo ?? 0) + Number(totales.efectivo)),
    saldoPrevio,
    ingresos: redondear(flujo?.ingresos ?? 0),
    egresos: redondear(flujo?.egresos ?? 0),
    desde: totales.desde ?? null,
    hasta: totales.hasta ?? null,
    rangoDisponible,
    serieSemanal,
    porCategoria: porCategoria.map((c) => ({ categoria: c.categoria, total: redondear(c.total), movimientos: Number(c.movimientos) })),
    topBeneficiarios: topBeneficiarios.map((b) => ({ nombre: b.nombre, total: redondear(b.total), movimientos: Number(b.movimientos) })),
    topServicios: topServicios.map((s) => ({ servicio: s.servicio, total: redondear(s.total), movimientos: Number(s.movimientos) })),
  });
}
