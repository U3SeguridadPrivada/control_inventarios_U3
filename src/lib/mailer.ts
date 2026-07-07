import nodemailer from 'nodemailer';
import { db } from '@/src/db';
import { site_config, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';

export interface FirmaDatos { nombre?: string; puesto?: string; telefono?: string; correo?: string }

// ── Configuración del sitio (clave-valor) ──
export function getConfig(clave: string): string | null {
  return db.select().from(site_config).where(eq(site_config.clave, clave)).get()?.valor ?? null;
}

export function setConfig(clave: string, valor: string | null) {
  db.insert(site_config).values({ clave, valor })
    .onConflictDoUpdate({ target: site_config.clave, set: { valor } })
    .run();
}

export function smtpDelSitioConfigurado(): boolean {
  return !!(getConfig('smtp_host') && getConfig('smtp_usuario') && getConfig('smtp_password'));
}

// ── Firma individual ──
export function firmaDatosDe(usuario: { firma_json: string | null; username: string; email: string }): FirmaDatos {
  try {
    const datos = usuario.firma_json ? JSON.parse(usuario.firma_json) : {};
    return { nombre: datos.nombre || usuario.username, puesto: datos.puesto || '', telefono: datos.telefono || '', correo: datos.correo || usuario.email };
  } catch {
    return { nombre: usuario.username, correo: usuario.email };
  }
}

export function firmaHtml(f: FirmaDatos): string {
  return `
  <table cellpadding="0" cellspacing="0" style="margin-top:28px;border-left:3px solid #1e3a5f;">
    <tr><td style="padding:2px 0 2px 14px;">
      <p style="margin:0;font-size:15px;font-weight:bold;color:#1e293b;">${f.nombre ?? ''}</p>
      ${f.puesto ? `<p style="margin:2px 0 0;font-size:12px;color:#64748b;">${f.puesto}</p>` : ''}
      <p style="margin:6px 0 0;font-size:12px;font-weight:bold;color:#1e3a5f;">U3 SEGURIDAD PRIVADA, S.A. DE C.V.</p>
      ${f.telefono ? `<p style="margin:4px 0 0;font-size:12px;color:#475569;">Tel: ${f.telefono}</p>` : ''}
      ${f.correo ? `<p style="margin:2px 0 0;font-size:12px;color:#475569;">${f.correo}</p>` : ''}
    </td></tr>
  </table>`;
}

// ── Plantilla corporativa ──
export function plantillaCorreo(cuerpoHtml: string, firma?: string): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background-color:#1e3a5f;padding:18px 28px;">
          <p style="margin:0;font-size:16px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;">U3 SEGURIDAD PRIVADA</p>
        </td></tr>
        <tr><td style="padding:28px;font-size:14px;line-height:1.6;color:#334155;">
          ${cuerpoHtml}
          ${firma ?? ''}
        </td></tr>
        <tr><td style="background-color:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">Este correo fue enviado desde el sistema de control de U3 Seguridad Privada. Por favor no compartas su contenido.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── Transporters ──
function transporterDelSitio() {
  const host = getConfig('smtp_host');
  const usuario = getConfig('smtp_usuario');
  const password = getConfig('smtp_password');
  if (!host || !usuario || !password) return null;
  const puerto = Number(getConfig('smtp_puerto') || 465);
  return nodemailer.createTransport({
    host, port: puerto, secure: (getConfig('smtp_ssl') ?? '1') === '1',
    auth: { user: usuario, pass: password },
  });
}

export function transporterDeUsuario(u: { correo_smtp_host: string | null; correo_smtp_puerto: number | null; correo_ssl: number; correo_usuario: string | null; correo_password: string | null }) {
  if (!u.correo_smtp_host || !u.correo_usuario || !u.correo_password) return null;
  return nodemailer.createTransport({
    host: u.correo_smtp_host, port: u.correo_smtp_puerto ?? 465, secure: u.correo_ssl === 1,
    auth: { user: u.correo_usuario, pass: u.correo_password },
  });
}

// Envía un correo HTML con la plantilla corporativa. Si se indica remitenteId,
// usa el buzón personal del usuario cuando está configurado (con su firma);
// si no, cae al SMTP del sitio.
export async function enviarCorreo({ remitenteId, para, cc, bcc, asunto, cuerpoHtml, conFirma = true, adjuntos }: {
  remitenteId?: number | null; para: string; cc?: string; bcc?: string; asunto: string; cuerpoHtml: string; conFirma?: boolean;
  adjuntos?: { filename: string; content: Buffer; contentType?: string }[];
}) {
  let transporter = null;
  let from = '';
  let firma: string | undefined;

  if (remitenteId) {
    const u = db.select().from(users).where(eq(users.id, remitenteId)).get();
    if (u) {
      if (conFirma) firma = firmaHtml(firmaDatosDe(u));
      const personal = transporterDeUsuario(u);
      if (personal) {
        transporter = personal;
        from = `"${firmaDatosDe(u).nombre}" <${u.correo_usuario}>`;
      }
    }
  }

  if (!transporter) {
    transporter = transporterDelSitio();
    if (!from) from = `"${getConfig('smtp_from_nombre') || 'U3 Seguridad Privada'}" <${getConfig('smtp_usuario')}>`;
  }
  if (!transporter) throw new Error('No hay un servidor de correo (SMTP) configurado');

  await transporter.sendMail({
    from, to: para,
    cc: cc || undefined,
    bcc: bcc || undefined,
    subject: asunto,
    html: plantillaCorreo(cuerpoHtml, firma),
    attachments: adjuntos?.length ? adjuntos : undefined,
  });
}

// Notificación best-effort: nunca truena la operación principal si el correo falla.
export function notificarPorCorreo(args: { remitenteId?: number | null; para: string; asunto: string; cuerpoHtml: string; conFirma?: boolean }) {
  enviarCorreo(args).catch((e) => console.error('No se pudo enviar notificación por correo:', e?.message));
}
