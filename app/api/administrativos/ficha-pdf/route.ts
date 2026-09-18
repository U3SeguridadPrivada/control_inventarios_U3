import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { htmlToPdf } from '@/src/lib/pdf';
import { generateFichaAdministrativaHtml, FichaTecnicaData } from '@/src/lib/fichaAdministrativaHtml';

export async function POST(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();

  try {
    const body = (await req.json()) as FichaTecnicaData;
    const html = generateFichaAdministrativaHtml(body);
    const pdfBuffer = await htmlToPdf(html, {
      margin: { top: '6mm', bottom: '6mm', left: '10mm', right: '10mm' }
    });

    const filename = body.nombre ? `ficha_${body.nombre.replace(/[^a-zA-Z0-9]/g, '_')}.pdf` : 'ficha_tecnica_administrativo.pdf';

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error('Error generando ficha administrativa PDF:', err);
    return Response.json({ error: 'Error al generar el PDF de la ficha técnica' }, { status: 500 });
  }
}
