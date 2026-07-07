import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { mensajes, users } from '@/src/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { notificarPorCorreo, smtpDelSitioConfigurado, getConfig } from '@/src/lib/mailer';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  const folder = req.nextUrl.searchParams.get('folder') || 'inbox';

  if (folder === 'sent') {
    return Response.json(
      db.select().from(mensajes)
        .where(and(eq(mensajes.remitente_id, authUser.id), eq(mensajes.eliminado_remitente, 0)))
        .orderBy(desc(mensajes.fecha_envio)).all()
    );
  }

  if (folder === 'trash') {
    return Response.json(
      db.select().from(mensajes)
        .where(and(eq(mensajes.destinatario_id, authUser.id), eq(mensajes.eliminado_destinatario, 1)))
        .orderBy(desc(mensajes.fecha_envio)).all()
    );
  }

  return Response.json(
    db.select().from(mensajes)
      .where(and(eq(mensajes.destinatario_id, authUser.id), eq(mensajes.eliminado_destinatario, 0)))
      .orderBy(desc(mensajes.fecha_envio)).all()
  );
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();

  try {
    const { destinatario_id, asunto, cuerpo, responde_a_id, es_html } = await req.json();
    if (!destinatario_id || !asunto || !cuerpo) {
      return Response.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }
    const nuevo = db.insert(mensajes).values({
      remitente_id: authUser.id,
      destinatario_id: Number(destinatario_id),
      asunto,
      cuerpo,
      responde_a_id: responde_a_id ? Number(responde_a_id) : null,
      es_html: es_html ? 1 : 0,
    }).returning().get();

    // Notificación por correo al destinatario (best-effort, no bloquea el envío)
    if (smtpDelSitioConfigurado()) {
      const destinatario = db.select().from(users).where(eq(users.id, Number(destinatario_id))).get();
      if (destinatario?.email) {
        const enlace = getConfig('app_url') || req.nextUrl.origin;
        notificarPorCorreo({
          remitenteId: authUser.id,
          para: destinatario.email,
          asunto: `Nuevo mensaje: ${asunto}`,
          cuerpoHtml: `
            <p>Hola <strong>${destinatario.username}</strong>, tienes un nuevo mensaje de <strong>${authUser.username}</strong> en el sistema:</p>
            <div style="border-left:3px solid #e2e8f0;padding:10px 16px;margin:16px 0;background-color:#f8fafc;border-radius:6px;">
              <p style="margin:0 0 6px;font-weight:bold;">${escapeHtml(asunto)}</p>
              ${es_html ? cuerpo : `<p style="margin:0;white-space:pre-wrap;">${escapeHtml(cuerpo)}</p>`}
            </div>
            <p><a href="${enlace}/correo" style="color:#1e3a5f;font-weight:bold;">Responder en el sistema →</a></p>
          `,
        });
      }
    }

    return Response.json(nuevo, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: 'Error al enviar el mensaje' }, { status: 500 });
  }
}
