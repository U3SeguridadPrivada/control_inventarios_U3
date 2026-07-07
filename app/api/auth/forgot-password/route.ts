import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { db } from '@/src/db';
import { users, password_resets } from '@/src/db/schema';
import { eq, or } from 'drizzle-orm';
import { enviarCorreo, smtpDelSitioConfigurado, getConfig } from '@/src/lib/mailer';

export async function POST(req: NextRequest) {
  try {
    const { usuario } = await req.json();
    if (!usuario) return Response.json({ error: 'Indica tu usuario o correo' }, { status: 400 });
    if (!smtpDelSitioConfigurado()) {
      return Response.json({ error: 'El correo del sitio no está configurado. Contacta al administrador.' }, { status: 503 });
    }

    const user = db.select().from(users).where(or(eq(users.username, usuario), eq(users.email, usuario))).get();

    // Respuesta genérica siempre, para no revelar qué usuarios existen
    if (user) {
      const token = randomBytes(32).toString('hex');
      const expira = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      db.insert(password_resets).values({ user_id: user.id, token, expira }).run();

      const enlace = `${getConfig('app_url') || req.nextUrl.origin}/restablecer?token=${token}`;
      await enviarCorreo({
        para: user.email,
        asunto: 'Restablecer tu contraseña — U3 Seguridad Privada',
        conFirma: false,
        cuerpoHtml: `
          <p>Hola <strong>${user.username}</strong>,</p>
          <p>Recibimos una solicitud para restablecer tu contraseña del sistema de control. Haz clic en el botón para crear una nueva:</p>
          <p style="text-align:center;margin:28px 0;">
            <a href="${enlace}" style="background-color:#1e3a5f;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block;">Restablecer contraseña</a>
          </p>
          <p style="font-size:12px;color:#64748b;">El enlace vence en 1 hora. Si no solicitaste este cambio, ignora este correo — tu contraseña seguirá siendo la misma.</p>
        `,
      });
    }

    return Response.json({ ok: true, mensaje: 'Si el usuario existe, se envió un enlace de recuperación a su correo.' });
  } catch (e: any) {
    console.error('forgot-password:', e?.message);
    return Response.json({ error: 'No se pudo enviar el correo de recuperación' }, { status: 500 });
  }
}
