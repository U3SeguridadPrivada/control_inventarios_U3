import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { db } from '@/src/db';
import { cotizaciones, clientes } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { htmlToPdf } from '@/src/lib/pdf';
import { buildCotizacionHtml, buildCotizacionHeaderTemplate, buildCotizacionFooterTemplate } from '@/src/lib/cotizacionTemplate';

async function getLogoDataUri(): Promise<string> {
  const buf = await readFile(path.join(process.cwd(), 'public', 'LOGO_PDFS.png'));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAuth(req)) return unauthorized();
  const { id } = await params;

  const cot = db.select().from(cotizaciones).where(eq(cotizaciones.id, Number(id))).get();
  if (!cot) return Response.json({ error: 'Cotización no encontrada' }, { status: 404 });
  const cliente = db.select().from(clientes).where(eq(clientes.id, cot.cliente_id)).get();

  const logoSrc = await getLogoDataUri();
  const html = buildCotizacionHtml({
    folio: cot.folio,
    fecha: cot.fecha,
    clienteNombre: cliente?.nombre ?? '—',
    solicitante: cot.solicitante ?? '',
    atencion: cot.atencion ?? '',
    servicio_cotizado: cot.servicio_cotizado ?? '',
    ubicacion: cot.ubicacion ?? '',
    periodicidad: cot.periodicidad ?? 'Quincenal',
    items: cot.items as any,
    vigencia_dias: cot.vigencia_dias ?? 30,
    asesor_nombre: cot.asesor_nombre ?? '',
    asesor_puesto: cot.asesor_puesto ?? 'Asesor Comercial',
    notas: cot.notas,
    estado: cot.estado ?? undefined,
  }, logoSrc, { repeatingHeaderFooter: true });

  const pdfBuffer = await htmlToPdf(html, {
    margin: { top: '26mm', bottom: '16mm', left: '25mm', right: '25mm' },
    headerTemplate: buildCotizacionHeaderTemplate(logoSrc),
    footerTemplate: buildCotizacionFooterTemplate(logoSrc),
  });
  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=${cot.folio}.pdf`,
    },
  });
}
