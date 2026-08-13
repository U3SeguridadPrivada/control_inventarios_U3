import nodemailer from 'nodemailer';
import { db } from '@/src/db';
import { site_config, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';

// URL pública del logo U3 para el encabezado de los correos. Se referencia por
// URL (no como adjunto) para que NO aparezca como archivo adjunto en el cliente.
// Alojado en el hosting institucional; se puede sobrescribir en site_config.
const LOGO_CORREO_URL_DEFAULT = 'https://mail.u3seguridadprivada.com/img_email/LOGO_U3_SEG_PRIV.png';
export function logoCorreoUrl(): string {
  return getConfig('logo_correo_url') || LOGO_CORREO_URL_DEFAULT;
}

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
  <table cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border-collapse:collapse;">
    <tr>
      <td style="padding-left:16px;border-left:3px solid #1e3a5f;">
        <p style="margin:0 0 2px 0;font-size:15px;font-weight:700;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${f.nombre ?? ''}</p>
        ${f.puesto ? `<p style="margin:0 0 6px 0;font-size:12px;font-weight:500;color:#64748b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${f.puesto}</p>` : ''}
        <p style="margin:0 0 4px 0;font-size:11px;font-weight:700;color:#1e3a5f;letter-spacing:0.5px;text-transform:uppercase;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">U3 SEGURIDAD PRIVADA, S.A. DE C.V.</p>
        ${f.telefono ? `<p style="margin:0 0 2px 0;font-size:12px;color:#475569;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><span style="color:#94a3b8;font-weight:600;margin-right:4px;">T.</span>${f.telefono}</p>` : ''}
        ${f.correo ? `<p style="margin:0;font-size:12px;color:#475569;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><span style="color:#94a3b8;font-weight:600;margin-right:4px;">E.</span><a href="mailto:${f.correo}" style="color:#1e3a5f;text-decoration:none;">${f.correo}</a></p>` : ''}
      </td>
    </tr>
  </table>`;
}

// ── Plantilla corporativa en tonos claros ──
// `logoSrc` es la URL pública del logo (misma en el envío y en la vista previa).
export function plantillaCorreo(cuerpoHtml: string, firma?: string, logoSrc: string = logoCorreoUrl()): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--[if mso]>
  <style type="text/css">
    table, td { font-family: Arial, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <!-- Contenedor Principal (Max 600px) -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;border-collapse:separate;">
          <!-- Barra Superior Corporativa Azul Marino -->
          <tr>
            <td height="4" style="background-color:#1e3a5f;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <!-- Encabezado Corporativo -->
          <tr>
            <td align="center" style="background-color:#ffffff;border-bottom:1px solid #f1f5f9;padding:32px 36px 24px;">
              <img src="${logoSrc}" width="140" alt="U3 Seguridad Privada" style="display:block;width:140px;max-width:60%;height:auto;border:0;margin:0 auto;" />
              <p style="margin:14px 0 0 0;font-size:10px;font-weight:600;color:#64748b;letter-spacing:1.2px;text-transform:uppercase;">Protección, Confianza y Soluciones Integrales</p>
            </td>
          </tr>
          <!-- Cuerpo del Mensaje -->
          <tr>
            <td style="padding:36px;font-size:15px;line-height:1.65;color:#1e293b;background-color:#ffffff;">
              <div style="min-height:140px;">
                ${cuerpoHtml}
              </div>
              ${firma ?? ''}
            </td>
          </tr>
          <!-- Pie de Página Institucional -->
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:11px;color:#475569;line-height:1.6;padding-bottom:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <strong style="color:#0f172a;letter-spacing:0.3px;">U3 SEGURIDAD PRIVADA, S.A. DE C.V.</strong><br>
                    Av. Paseo de la Reforma #456, Col. Juárez, C.P. 06600, CDMX<br>
                    Tel: 55-8902-1234 &middot; <a href="mailto:contacto@u3seguridad.com" style="color:#1e3a5f;text-decoration:none;font-weight:500;">contacto@u3seguridad.com</a> &middot; <a href="https://www.u3seguridadprivada.com" target="_blank" style="color:#1e3a5f;text-decoration:none;font-weight:500;">www.u3seguridadprivada.com</a>
                  </td>
                </tr>
                <tr>
                  <td style="font-size:10px;color:#94a3b8;line-height:1.5;border-top:1px solid #e2e8f0;padding-top:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <strong style="color:#64748b;">AVISO DE CONFIDENCIALIDAD:</strong> Este correo electrónico y cualquier archivo adjunto contienen información confidencial y privileged propiedad de U3 Seguridad Privada y está dirigida exclusivamente a su destinatario. Si ha recibido este mensaje por error, notifíquelo de inmediato al remitente y elimínelo sin copiarlo ni distribuirlo.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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

  // El logo del encabezado se referencia por URL pública (logoCorreoUrl), NO se
  // adjunta, para que no aparezca como archivo adjunto en el correo.
  await transporter.sendMail({
    from, to: para,
    cc: cc || undefined,
    bcc: bcc || undefined,
    subject: asunto,
    html: plantillaCorreo(cuerpoHtml, firma, logoCorreoUrl()),
    attachments: adjuntos?.length ? adjuntos : undefined,
  });
}

// Notificación best-effort: nunca truena la operación principal si el correo falla.
export function notificarPorCorreo(args: { remitenteId?: number | null; para: string; asunto: string; cuerpoHtml: string; conFirma?: boolean }) {
  enviarCorreo(args).catch((e) => console.error('No se pudo enviar notificación por correo:', e?.message));
}
