import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import path from 'path';
import { db } from '@/src/db';
import { site_config, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';

// Logo U3 para el encabezado de los correos. Se incrusta como adjunto inline
// (cid:u3logo) porque muchos clientes (Gmail) bloquean las imágenes data: URI.
let _logoCache: Buffer | null = null;
export function logoBuffer(): Buffer | null {
  if (_logoCache) return _logoCache;
  try {
    _logoCache = readFileSync(path.join(process.cwd(), 'public', 'LOGO_PDFS.png'));
    return _logoCache;
  } catch {
    return null;
  }
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
  <table cellpadding="0" cellspacing="0" style="margin-top:28px;border-left:3px solid #1e3a5f;">
    <tr><td style="padding:2px 0 2px 14px;">
      <p style="margin:0;font-size:14px;font-weight:bold;color:#1e293b;">${f.nombre ?? ''}</p>
      ${f.puesto ? `<p style="margin:2px 0 0;font-size:11px;color:#64748b;">${f.puesto}</p>` : ''}
      <p style="margin:4px 0 0;font-size:11px;font-weight:bold;color:#1e3a5f;">U3 SEGURIDAD PRIVADA, S.A. DE C.V.</p>
      ${f.telefono ? `<p style="margin:3px 0 0;font-size:11px;color:#475569;">Tel: ${f.telefono}</p>` : ''}
      ${f.correo ? `<p style="margin:1px 0 0;font-size:11px;color:#475569;">${f.correo}</p>` : ''}
    </td></tr>
  </table>`;
}

// ── Plantilla corporativa en tonos claros ──
// `logoSrc` se pasa por separado porque en el envío real es un adjunto inline
// (cid:u3logo) y en la vista previa del navegador es la ruta pública /LOGO_PDFS.png.
export function plantillaCorreo(cuerpoHtml: string, firma?: string, logoSrc: string = 'cid:u3logo'): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:24px 12px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        <!-- Línea superior de acento corporativo (Navy + Oro) -->
        <tr>
          <td height="6" style="background: linear-gradient(to right, #1e3a5f 70%, #d97706 30%); font-size: 0; line-height: 0;">&nbsp;</td>
        </tr>
        <!-- Encabezado corporativo claro con logo U3 -->
        <tr>
          <td style="background-color:#ffffff;border-bottom:1px solid #f1f5f9;padding:22px 28px;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="padding-right:14px;vertical-align:middle;">
                <img src="${logoSrc}" width="52" height="52" alt="U3 Seguridad Privada" style="display:block;width:52px;height:52px;object-fit:contain;border:0;" />
              </td>
              <td style="vertical-align:middle;">
                <p style="margin:0;font-size:18px;font-weight:bold;color:#1e3a5f;letter-spacing:0.8px;">U3 SEGURIDAD PRIVADA</p>
                <p style="margin:3px 0 0;font-size:10px;color:#64748b;letter-spacing:1px;text-transform:uppercase;">Protección, Confianza y Soluciones Integrales</p>
              </td>
            </tr></table>
          </td>
        </tr>
        <!-- Cuerpo del Correo -->
        <tr>
          <td style="padding:28px;font-size:14px;line-height:1.6;color:#334155;">
            <div style="min-height:150px;">
              ${cuerpoHtml}
            </div>
            ${firma ?? ''}
          </td>
        </tr>
        <!-- Pie de página U3 Corporativo -->
        <tr>
          <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-family:Arial,sans-serif;font-size:11px;color:#475569;line-height:1.5;padding-bottom:12px;">
                  <strong>U3 SEGURIDAD PRIVADA, S.A. DE C.V.</strong><br>
                  Av. Paseo de la Reforma #456, Col. Juárez, C.P. 06600, CDMX<br>
                  Tel: 55-8902-1234 · <a href="mailto:contacto@u3seguridad.com" style="color:#1e3a5f;text-decoration:none;">contacto@u3seguridad.com</a> · <a href="https://www.u3seguridadprivada.com" target="_blank" style="color:#1e3a5f;text-decoration:none;">www.u3seguridadprivada.com</a>
                </td>
              </tr>
              <tr>
                <td style="font-family:Arial,sans-serif;font-size:9.5px;color:#94a3b8;line-height:1.4;border-top:1px solid #e2e8f0;padding-top:10px;">
                  <strong>AVISO DE CONFIDENCIALIDAD:</strong> Este correo electrónico y, en su caso, cualquier archivo adjunto, contienen información confidencial y privilegiada de U3 Seguridad Privada y está dirigida exclusivamente al destinatario(s). Si usted ha recibido este mensaje por error, por favor notifíquelo de inmediato al remitente y elimine este mensaje de su sistema sin copiarlo, distribuirlo ni revelarlo.
                </td>
              </tr>
            </table>
          </td>
        </tr>
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

  // Logo U3 del encabezado: preferimos servirlo por su URL pública para que NO
  // aparezca como archivo adjunto en el correo. Solo si no hay app_url configurada
  // caemos al adjunto inline (cid) como respaldo, para que el logo nunca falte.
  const appUrl = getConfig('app_url');
  const attachments: nodemailer.SendMailOptions['attachments'] = [];
  let logoSrc: string;
  if (appUrl) {
    logoSrc = `${appUrl}/LOGO_PDFS.png`;
  } else {
    logoSrc = 'cid:u3logo';
    const logo = logoBuffer();
    if (logo) attachments.push({ filename: 'u3-logo.png', content: logo, cid: 'u3logo', contentType: 'image/png' });
  }
  if (adjuntos?.length) attachments.push(...adjuntos);

  await transporter.sendMail({
    from, to: para,
    cc: cc || undefined,
    bcc: bcc || undefined,
    subject: asunto,
    html: plantillaCorreo(cuerpoHtml, firma, logoSrc),
    attachments: attachments.length ? attachments : undefined,
  });
}

// Notificación best-effort: nunca truena la operación principal si el correo falla.
export function notificarPorCorreo(args: { remitenteId?: number | null; para: string; asunto: string; cuerpoHtml: string; conFirma?: boolean }) {
  enviarCorreo(args).catch((e) => console.error('No se pudo enviar notificación por correo:', e?.message));
}
