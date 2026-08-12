import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { puedeVerLibro } from '@/src/lib/librosAcceso';
import { construirReporteFinanzas, normalizarSecciones } from '@/src/lib/reporteFinanzas';

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const p = req.nextUrl.searchParams;
  const libroId = p.get('libro');
  if (!libroId) return Response.json({ error: 'Falta el libro' }, { status: 400 });
  // Mismo control que el resto del módulo: el reporte expone toda la cuenta.
  if (!puedeVerLibro(authUser, libroId)) return forbidden();

  const reporte = await construirReporteFinanzas({
    libroId,
    desde: p.get('desde'),
    hasta: p.get('hasta'),
    secciones: normalizarSecciones(p.get('secciones')),
    generadoPor: authUser.username ?? '—',
  });
  if (!reporte) return Response.json({ error: 'La cuenta no existe' }, { status: 404 });

  return new Response(new Uint8Array(reporte.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=${reporte.nombreArchivo}`,
    },
  });
}
