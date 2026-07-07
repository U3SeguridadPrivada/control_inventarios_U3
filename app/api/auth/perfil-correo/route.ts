import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { firmaDatosDe } from '@/src/lib/mailer';

// Cada usuario administra su propia firma y su buzón personal (IMAP/SMTP).

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const u = db.select().from(users).where(eq(users.id, authUser.id)).get();
  if (!u) return unauthorized();

  return Response.json({
    firma: firmaDatosDe(u),
    correo_imap_host: u.correo_imap_host || '',
    correo_imap_puerto: u.correo_imap_puerto ?? 993,
    correo_smtp_host: u.correo_smtp_host || '',
    correo_smtp_puerto: u.correo_smtp_puerto ?? 465,
    correo_ssl: u.correo_ssl === 1,
    correo_usuario: u.correo_usuario || '',
    tiene_password: !!u.correo_password,
    buzon_configurado: !!(u.correo_imap_host && u.correo_usuario && u.correo_password),
  });
}

export async function PUT(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  try {
    const body = await req.json();
    const cambios: Record<string, unknown> = {};

    if ('firma' in body) {
      const f = body.firma || {};
      cambios.firma_json = JSON.stringify({
        nombre: f.nombre?.trim() || '',
        puesto: f.puesto?.trim() || '',
        telefono: f.telefono?.trim() || '',
        correo: f.correo?.trim() || '',
      });
    }
    if ('correo_imap_host' in body) cambios.correo_imap_host = body.correo_imap_host?.trim() || null;
    if ('correo_imap_puerto' in body) cambios.correo_imap_puerto = Number(body.correo_imap_puerto) || 993;
    if ('correo_smtp_host' in body) cambios.correo_smtp_host = body.correo_smtp_host?.trim() || null;
    if ('correo_smtp_puerto' in body) cambios.correo_smtp_puerto = Number(body.correo_smtp_puerto) || 465;
    if ('correo_ssl' in body) cambios.correo_ssl = body.correo_ssl ? 1 : 0;
    if ('correo_usuario' in body) cambios.correo_usuario = body.correo_usuario?.trim() || null;
    // La contraseña solo se actualiza si se envía un valor
    if ('correo_password' in body && body.correo_password) cambios.correo_password = body.correo_password;

    if (Object.keys(cambios).length) {
      db.update(users).set(cambios).where(eq(users.id, authUser.id)).run();
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Error al guardar el perfil de correo' }, { status: 500 });
  }
}
