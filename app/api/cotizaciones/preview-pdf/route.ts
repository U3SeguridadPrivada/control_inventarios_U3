import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { db } from '@/src/db';
import { clientes } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { htmlToPdf } from '@/src/lib/pdf';
import { buildCotizacionHtml, buildCotizacionHeaderTemplate, buildCotizacionFooterTemplate } from '@/src/lib/cotizacionTemplate';

async function getLogoDataUri(): Promise<string> {
  const buf = await readFile(path.join(process.cwd(), 'public', 'LOGO_PDFS.png'));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

export async function POST(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();

  try {
    const { cliente_id, fecha, items, notas, solicitante, atencion, servicio_cotizado, ubicacion, periodicidad, vigencia_dias, asesor_nombre, asesor_puesto } = await req.json();
    if (!cliente_id || !fecha || !Array.isArray(items) || items.length === 0) {
      return Response.json({ error: 'Faltan campos requeridos para la vista previa' }, { status: 400 });
    }

    const cliente = db.select().from(clientes).where(eq(clientes.id, Number(cliente_id))).get();
    const logoSrc = await getLogoDataUri();
    const html = buildCotizacionHtml({
      folio: 'BORRADOR',
      fecha,
      clienteNombre: cliente?.nombre ?? '—',
      solicitante: solicitante ?? '',
      atencion: atencion ?? '',
      servicio_cotizado: servicio_cotizado ?? '',
      ubicacion: ubicacion ?? '',
      periodicidad: periodicidad || 'Quincenal',
      items,
      vigencia_dias: vigencia_dias ? Number(vigencia_dias) : 30,
      asesor_nombre: asesor_nombre ?? '',
      asesor_puesto: asesor_puesto || 'Asesor Comercial',
      notas: notas ?? null,
      estado: 'Borrador',
    }, logoSrc, { repeatingHeaderFooter: true });

    const pdfBuffer = await htmlToPdf(html, {
      margin: { top: '26mm', bottom: '16mm', left: '25mm', right: '25mm' },
      headerTemplate: buildCotizacionHeaderTemplate(logoSrc),
      footerTemplate: buildCotizacionFooterTemplate(logoSrc),
    });
    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=cotizacion_borrador.pdf',
      },
    });
  } catch {
    return Response.json({ error: 'Error al generar la vista previa' }, { status: 500 });
  }
}
