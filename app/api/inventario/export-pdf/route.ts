import { NextRequest } from 'next/server';
import { autorizarInventario } from '@/src/lib/inventarioOperacion';
import { errorInventario } from '@/src/lib/inventarioValidacion';
import { datosReporte } from '@/src/lib/inventarioReporte';
import { buildInventarioHtml, buildInventarioHeaderTemplate, buildInventarioFooterTemplate } from '@/src/lib/inventarioTemplate';
import { assetsDataUri } from '@/src/lib/pdfAssets';
import { htmlToPdf } from '@/src/lib/pdf';
export async function GET(req: NextRequest) {
  try {
    const user = autorizarInventario(req, 'inventario', 'ver');
    const { resumen, detalle, corte } = datosReporte(req.nextUrl.searchParams);
    const { logoSrc, fontSrc } = await assetsDataUri();
    const html = buildInventarioHtml(resumen, detalle, corte, { repeatingHeaderFooter: true, logoSrc, fontSrc, generadoPor: user.username });
    const pdf = await htmlToPdf(html, {
      margin: { top: '20mm', bottom: '16mm', left: '14mm', right: '14mm' },
      headerTemplate: buildInventarioHeaderTemplate(logoSrc, fontSrc),
      footerTemplate: buildInventarioFooterTemplate(logoSrc, fontSrc),
    });
    return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename=inventario_almacen.pdf' } });
  } catch (err) { return errorInventario(err); }
}
