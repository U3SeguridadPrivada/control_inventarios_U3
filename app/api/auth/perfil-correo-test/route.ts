import { NextRequest } from 'next/server';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  try {
    const body = await req.json();
    const u = db.select().from(users).where(eq(users.id, authUser.id)).get();
    if (!u) return unauthorized();

    const imap_host = body.correo_imap_host?.trim() || u.correo_imap_host;
    const imap_puerto = Number(body.correo_imap_puerto) || u.correo_imap_puerto || 993;
    const smtp_host = body.correo_smtp_host?.trim() || u.correo_smtp_host;
    const smtp_puerto = Number(body.correo_smtp_puerto) || u.correo_smtp_puerto || 465;
    const ssl = body.correo_ssl !== undefined ? Boolean(body.correo_ssl) : (u.correo_ssl === 1);
    const usuario = body.correo_usuario?.trim() || u.correo_usuario;
    const password = body.correo_password || u.correo_password;

    if (!usuario) {
      return Response.json({ error: 'Ingresa tu Correo / Usuario para probar la conexión' }, { status: 400 });
    }
    if (!password) {
      return Response.json({ error: 'Ingresa tu contraseña o App Password para probar la conexión' }, { status: 400 });
    }
    if (!imap_host) {
      return Response.json({ error: 'Especifica el Servidor IMAP (Entrada)' }, { status: 400 });
    }
    if (!smtp_host) {
      return Response.json({ error: 'Especifica el Servidor SMTP (Salida)' }, { status: 400 });
    }

    // 1. Probar IMAP (Entrada)
    let imapError: string | null = null;
    try {
      const imapClient = new ImapFlow({
        host: imap_host,
        port: imap_puerto,
        secure: ssl,
        auth: { user: usuario, pass: password },
        logger: false,
        connectionTimeout: 7000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
      });

      await imapClient.connect();
      try {
        await imapClient.logout();
      } catch {
        /* ignore logout err */
      }
    } catch (err: any) {
      const msg = err?.responseText || err?.message || String(err);
      if (msg.includes('AUTHENTICATIONFAILED') || msg.toLowerCase().includes('invalid credentials') || msg.includes('535')) {
        imapError = 'Credenciales IMAP rechazadas. Si usas Gmail u Outlook, debes usar una "Contraseña de aplicación".';
      } else if (msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND')) {
        imapError = `No se pudo encontrar o conectar al servidor IMAP (${imap_host}:${imap_puerto}).`;
      } else {
        imapError = `Error IMAP: ${msg}`;
      }
    }

    if (imapError) {
      return Response.json({ error: imapError }, { status: 400 });
    }

    // 2. Probar SMTP (Salida)
    let smtpError: string | null = null;
    try {
      const smtpTransport = nodemailer.createTransport({
        host: smtp_host,
        port: smtp_puerto,
        secure: ssl,
        auth: { user: usuario, pass: password },
        connectionTimeout: 7000,
        greetingTimeout: 5000,
      });
      await smtpTransport.verify();
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('AUTHENTICATIONFAILED') || msg.toLowerCase().includes('invalid credentials') || msg.includes('535')) {
        smtpError = 'Credenciales SMTP rechazadas. Verifica el usuario y la contraseña de aplicación.';
      } else if (msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND')) {
        smtpError = `No se pudo conectar al servidor SMTP (${smtp_host}:${smtp_puerto}).`;
      } else {
        smtpError = `Error SMTP: ${msg}`;
      }
    }

    if (smtpError) {
      return Response.json({ error: smtpError }, { status: 400 });
    }

    return Response.json({ ok: true, message: '¡Conexión a IMAP (Entrada) y SMTP (Salida) verificada con éxito!' });
  } catch (err: any) {
    return Response.json({ error: err?.message || 'Error al verificar la conexión' }, { status: 500 });
  }
}
