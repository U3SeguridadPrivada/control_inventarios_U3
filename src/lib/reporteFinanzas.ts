import { readFile } from 'fs/promises';
import path from 'path';
import { db } from '@/src/db';
import { movimientos_financieros, libros_financieros, users } from '@/src/db/schema';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { htmlToPdf } from '@/src/lib/pdf';
import {
  buildReporteFinanzasHtml,
  buildReporteHeaderTemplate,
  buildReporteFooterTemplate,
  SECCIONES,
  type SeccionId,
} from '@/src/lib/reporteFinanzasTemplate';

export const IDS_SECCIONES = SECCIONES.map((s) => s.id) as readonly string[];

/** Normaliza la lista de secciones pedida; sin nada válido, van todas. */
export function normalizarSecciones(crudo: string | null | undefined): SeccionId[] {
  const pedidas = (crudo || '').split(',').map((s) => s.trim()).filter(Boolean);
  const validas = pedidas.filter((s) => IDS_SECCIONES.includes(s));
  return (validas.length ? validas : IDS_SECCIONES) as SeccionId[];
}

/**
 * Puppeteer recibe el HTML por `setContent`, sin URL base: logo y tipografía
 * tienen que viajar dentro del documento como data URI. Se leen una sola vez
 * porque no cambian entre reportes.
 */
let assetsCache: Promise<{ logoSrc: string; fontSrc: string }> | null = null;

function assetsDataUri() {
  if (!assetsCache) {
    assetsCache = (async () => {
      const [logo, font] = await Promise.all([
        readFile(path.join(process.cwd(), 'public', 'LOGO_PDFS.png')),
        readFile(path.join(process.cwd(), 'public', 'fonts', 'inter-latin.woff2')),
      ]);
      return {
        logoSrc: `data:image/png;base64,${logo.toString('base64')}`,
        fontSrc: `data:font/woff2;base64,${font.toString('base64')}`,
      };
    })().catch((e) => {
      assetsCache = null; // un fallo puntual de lectura no debe quedar cacheado
      throw e;
    });
  }
  return assetsCache;
}

/**
 * Arma el PDF del reporte de una cuenta. Vive aparte de las rutas porque lo usan
 * dos: la descarga directa y el envío por correo, y deben producir exactamente
 * el mismo documento.
 *
 * No comprueba permisos: eso es responsabilidad de quien la llama.
 */
export async function construirReporteFinanzas(opts: {
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

  // Sin rango explícito se reporta toda la cuenta.
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

  const { logoSrc, fontSrc } = await assetsDataUri();
  const html = buildReporteFinanzasHtml({
    libroNombre: libro.nombre,
    responsable,
    desde,
    hasta,
    saldoPrevio: Number(previos?.total ?? 0),
    saldoPrevioTarjeta: Number(previos?.tarjeta ?? 0),
    saldoPrevioEfectivo: Number(previos?.efectivo ?? 0),
    movimientos,
    generadoPor,
    fecha: new Date().toISOString(),
    secciones,
  }, logoSrc, { repeatingHeaderFooter: true, fontSrc });

  const pdf = await htmlToPdf(html, {
    margin: { top: '20mm', bottom: '16mm', left: '14mm', right: '14mm' },
    headerTemplate: buildReporteHeaderTemplate(logoSrc, libro.nombre, fontSrc),
    footerTemplate: buildReporteFooterTemplate(logoSrc, fontSrc),
  });

  const limpio = libro.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return {
    pdf,
    nombreArchivo: `reporte_${limpio}_${desde}_a_${hasta}.pdf`,
    libroNombre: libro.nombre,
    desde,
    hasta,
    movimientos: movimientos.length,
  };
}
