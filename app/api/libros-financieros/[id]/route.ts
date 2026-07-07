import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { libros_financieros, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { notificarPorCorreo, smtpDelSitioConfigurado, getConfig } from '@/src/lib/mailer';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role !== 'admin') return forbidden();

  const { id } = await params;
  const libro = db.select().from(libros_financieros).where(eq(libros_financieros.id, id)).get();
  if (!libro) return Response.json({ error: 'Libro no encontrado' }, { status: 404 });

  try {
    const body = await req.json();
    const cambios: Record<string, unknown> = {};
    if ('nombre' in body) {
      if (!body.nombre?.trim()) return Response.json({ error: 'El nombre es requerido' }, { status: 400 });
      cambios.nombre = body.nombre.trim();
    }
    if ('usuario_id' in body) {
      if (body.usuario_id) {
        const usuario = db.select().from(users).where(eq(users.id, Number(body.usuario_id))).get();
        if (!usuario) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
        cambios.usuario_id = usuario.id;
      } else {
        cambios.usuario_id = null;
      }
    }
    if ('imap_correo' in body) cambios.imap_correo = body.imap_correo?.trim() || null;
    if ('imap_host' in body) cambios.imap_host = body.imap_host?.trim() || null;
    if ('imap_puerto' in body) cambios.imap_puerto = body.imap_puerto ? Number(body.imap_puerto) : 993;
    if ('imap_ssl' in body) cambios.imap_ssl = body.imap_ssl ? 1 : 0;
    // La contraseña solo se actualiza si se envía un valor; cadena vacía = conservar la actual
    if ('imap_password' in body && body.imap_password) cambios.imap_password = body.imap_password;
    if (body.imap_borrar_password) cambios.imap_password = null;
    if (!Object.keys(cambios).length) return Response.json({ error: 'Sin cambios' }, { status: 400 });

    const actualizado = db.update(libros_financieros).set(cambios).where(eq(libros_financieros.id, id)).returning().get();

    // Notifica por correo al nuevo responsable asignado (best-effort)
    if (cambios.usuario_id && cambios.usuario_id !== libro.usuario_id && smtpDelSitioConfigurado()) {
      const responsable = db.select().from(users).where(eq(users.id, Number(cambios.usuario_id))).get();
      if (responsable?.email) {
        const enlace = getConfig('app_url') || req.nextUrl.origin;
        notificarPorCorreo({
          para: responsable.email,
          conFirma: false,
          asunto: `Se te asignó la cuenta "${actualizado.nombre}"`,
          cuerpoHtml: `
            <p>Hola <strong>${responsable.username}</strong>,</p>
            <p>El administrador te asignó como responsable de la cuenta <strong>${actualizado.nombre}</strong> en el módulo de Finanzas. A partir de ahora eres la única persona (además del administrador) que puede capturar y modificar sus movimientos.</p>
            <p><a href="${enlace}/finanzas" style="color:#1e3a5f;font-weight:bold;">Ir a Finanzas →</a></p>
          `,
        });
      }
    }

    const { imap_password, ...sinPassword } = actualizado;
    return Response.json({ ...sinPassword, imap_tiene_password: !!imap_password });
  } catch {
    return Response.json({ error: 'Error al actualizar el libro' }, { status: 500 });
  }
}
