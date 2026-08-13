import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { enviarCorreo } from '@/src/lib/mailer';

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  try {
    const { para } = await req.json();
    if (!para) return Response.json({ error: 'Indica el correo destino' }, { status: 400 });

    await enviarCorreo({
      para,
      asunto: 'Correo de prueba — U3 Seguridad Privada',
      conFirma: false,
      cuerpoHtml: '<p>✅ El servidor de correo del sitio está configurado correctamente.</p><p>Este es un envío de prueba desde el sistema de control.</p>',
    });
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: 'Falló el envío: ' + (e?.message || 'error desconocido') }, { status: 500 });
  }
}
