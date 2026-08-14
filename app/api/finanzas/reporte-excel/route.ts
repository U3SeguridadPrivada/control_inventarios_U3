import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { puedeVerLibro } from '@/src/lib/librosAcceso';
import { normalizarSecciones } from '@/src/lib/reporteFinanzas';
import { construirExcelFinanzas } from '@/src/lib/reporteFinanzasExcel';

/**
 * GET /api/finanzas/reporte-excel
 * Mismo contenido que el reporte en PDF y con los mismos parámetros
 * (libro, desde, hasta, secciones), pero en un .xlsx con una hoja por sección.
 */
export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const p = req.nextUrl.searchParams;
  const libroId = p.get('libro');
  if (!libroId) return Response.json({ error: 'Falta el libro' }, { status: 400 });
  // Mismo control que el resto del módulo: el archivo expone toda la cuenta.
  if (!puedeVerLibro(authUser, libroId)) return forbidden();

  const excel = await construirExcelFinanzas({
    libroId,
    desde: p.get('desde'),
    hasta: p.get('hasta'),
    secciones: normalizarSecciones(p.get('secciones')),
    generadoPor: authUser.username ?? '—',
  });
  if (!excel) return Response.json({ error: 'La cuenta no existe' }, { status: 404 });

  return new Response(new Uint8Array(excel.buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=${excel.nombreArchivo}`,
    },
  });
}
