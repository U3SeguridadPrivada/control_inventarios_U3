import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { calcularInventarioResumen, calcularInventarioDetalle } from '@/src/lib/inventario';
import { buildInventarioHtml } from '@/src/lib/inventarioTemplate';
import { htmlToPdf } from '@/src/lib/pdf';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();

  const resumen = calcularInventarioResumen();
  const detalle = calcularInventarioDetalle();
  const html = buildInventarioHtml(resumen, detalle);

  const pdfBuffer = await htmlToPdf(html);
  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=inventario_almacen.pdf',
    },
  });
}
