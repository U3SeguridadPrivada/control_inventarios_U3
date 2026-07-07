import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { enviarCorreo } from '@/src/lib/mailer';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const MAX_ADJUNTOS_BYTES = 15 * 1024 * 1024; // 15 MB total, como Gmail

// Envía un correo real (externo) usando el buzón personal del usuario si está
// configurado, o el SMTP del sitio como respaldo. Siempre sale con la plantilla
// HTML corporativa y la firma individual del usuario. Acepta JSON (sin adjuntos)
// o multipart/form-data (con adjuntos).
export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  try {
    let para = '', cc = '', bcc = '', asunto = '', cuerpo = '', es_html = false;
    let adjuntos: { filename: string; content: Buffer; contentType?: string }[] = [];

    if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
      const fd = await req.formData();
      para = String(fd.get('para') || '');
      cc = String(fd.get('cc') || '');
      bcc = String(fd.get('bcc') || '');
      asunto = String(fd.get('asunto') || '');
      cuerpo = String(fd.get('cuerpo') || '');
      es_html = fd.get('es_html') === '1';

      const files = fd.getAll('file') as File[];
      let total = 0;
      for (const f of files) {
        total += f.size;
        if (total > MAX_ADJUNTOS_BYTES) {
          return Response.json({ error: 'Los adjuntos superan el límite de 15 MB' }, { status: 413 });
        }
        adjuntos.push({ filename: f.name, content: Buffer.from(await f.arrayBuffer()), contentType: f.type || undefined });
      }
    } else {
      const body = await req.json();
      para = body.para || '';
      cc = body.cc || '';
      bcc = body.bcc || '';
      asunto = body.asunto || '';
      cuerpo = body.cuerpo || '';
      es_html = !!body.es_html;
    }

    if (!para || !asunto || !cuerpo) return Response.json({ error: 'Faltan campos requeridos' }, { status: 400 });

    const cuerpoHtml = es_html ? cuerpo : `<p>${escapeHtml(cuerpo).replace(/\n/g, '<br>')}</p>`;
    await enviarCorreo({ remitenteId: authUser.id, para, cc, bcc, asunto, cuerpoHtml, conFirma: true, adjuntos });

    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e?.message || 'No se pudo enviar el correo' }, { status: 500 });
  }
}
