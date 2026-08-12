import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { puedeVerLibro } from '@/src/lib/librosAcceso';
import { construirReporteFinanzas, normalizarSecciones } from '@/src/lib/reporteFinanzas';
import { enviarCorreo } from '@/src/lib/mailer';

const escapar = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fmtFecha = (iso: string) => {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

/** Envía el reporte de la cuenta como PDF adjunto. */
export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  let cuerpo: any;
  try { cuerpo = await req.json(); } catch { return Response.json({ error: 'Cuerpo inválido' }, { status: 400 }); }

  const { libro: libroId, desde, hasta, secciones, para, cc, asunto, mensaje } = cuerpo ?? {};
  if (!libroId) return Response.json({ error: 'Falta el libro' }, { status: 400 });
  if (!puedeVerLibro(authUser, libroId)) return forbidden();

  const destinatarios = String(para ?? '').trim();
  if (!destinatarios) return Response.json({ error: 'Falta el destinatario' }, { status: 400 });
  // Validación mínima: nodemailer acepta varias separadas por coma.
  const correos = destinatarios.split(',').map((s: string) => s.trim()).filter(Boolean);
  const invalido = correos.find((c: string) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c));
  if (invalido) return Response.json({ error: `Correo inválido: ${invalido}` }, { status: 400 });

  try {
    const reporte = await construirReporteFinanzas({
      libroId,
      desde: desde ?? null,
      hasta: hasta ?? null,
      secciones: normalizarSecciones(Array.isArray(secciones) ? secciones.join(',') : secciones),
      generadoPor: authUser.username ?? '—',
    });
    if (!reporte) return Response.json({ error: 'La cuenta no existe' }, { status: 404 });

    const periodo = `${fmtFecha(reporte.desde)} al ${fmtFecha(reporte.hasta)}`;
    const asuntoFinal = String(asunto ?? '').trim() || `Reporte de ${reporte.libroNombre} · ${periodo}`;
    const textoLibre = String(mensaje ?? '').trim();

    const cuerpoHtml = `
      <p>Se adjunta el reporte de <strong>${escapar(reporte.libroNombre)}</strong> correspondiente al periodo del <strong>${periodo}</strong>.</p>
      ${textoLibre ? `<p>${escapar(textoLibre).replace(/\n/g, '<br/>')}</p>` : ''}
      <p style="color:#6b7280;font-size:13px">El documento contiene ${reporte.movimientos} movimiento(s) del periodo.</p>
    `;

    await enviarCorreo({
      remitenteId: authUser.id,
      para: destinatarios,
      cc: String(cc ?? '').trim() || undefined,
      asunto: asuntoFinal,
      cuerpoHtml,
      adjuntos: [{ filename: reporte.nombreArchivo, content: reporte.pdf, contentType: 'application/pdf' }],
    });

    return Response.json({ ok: true, enviadoA: correos, archivo: reporte.nombreArchivo });
  } catch (e: any) {
    // El error del SMTP es lo único accionable para quien envía: se devuelve tal cual.
    return Response.json({ error: e?.message || 'No se pudo enviar el correo' }, { status: 500 });
  }
}
