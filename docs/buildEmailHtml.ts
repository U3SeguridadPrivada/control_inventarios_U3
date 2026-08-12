// Envoltura HTML "email-safe" (tablas, sin flexbox/grid) para clientes de
// correo. Basada en la función `chrome()` de app/correo/page.tsx del CRM
// Bionordi, generalizada para cualquier proyecto: logo, nombre de empresa,
// texto de pie y colores de acento son parámetros, no valores fijos.

export interface BrandConfig {
  /** URL absoluta y pública del logo (https://...). Debe ser accesible sin
   *  login: los clientes de correo la cargan desde sus propios servidores,
   *  no desde el navegador del destinatario. */
  logoUrl: string;
  logoAlt: string;
  /** Ancho/alto en px del logo tal como se renderiza en el correo. */
  logoWidth?: number;
  logoHeight?: number;
  companyName: string;
  /** Línea descriptiva bajo el nombre de la empresa en el pie. */
  footerTagline?: string;
  /** Aviso final del pie (p. ej. nota de opt-out). */
  unsubscribeNote?: string;
  /** Colores del gradiente de las barras de acento superior/inferior. */
  accentFrom?: string;
  accentTo?: string;
}

const DEFAULTS: Required<Pick<BrandConfig, "logoWidth" | "logoHeight" | "accentFrom" | "accentTo" | "footerTagline" | "unsubscribeNote">> = {
  logoWidth: 160,
  logoHeight: 38,
  accentFrom: "#4E60A9",
  accentTo: "#38AD64",
  footerTagline: "",
  unsubscribeNote: "Si no desea recibir estos correos, por favor ignore este mensaje.",
};

/**
 * Envuelve el HTML del cuerpo (lo que salió del editor WYSIWYG) en el
 * layout completo del correo: barra de acento, header con logo, cuerpo,
 * footer con remitente + tagline, barra de acento inferior.
 *
 * @param bodyHtml HTML del cuerpo (contentEditable.innerHTML)
 * @param senderName Nombre de quien envía, se muestra en negrita en el pie
 * @param brand Configuración de marca (logo, colores, textos)
 */
export function buildEmailHtml(bodyHtml: string, senderName: string, brand: BrandConfig): string {
  const b = { ...DEFAULTS, ...brand };

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${b.companyName}</title>
  <style type="text/css">
    @media only screen and (max-width: 600px) {
      .outer-cell { padding: 10px 0 !important; }
      .main-table { width: 100% !important; border-radius: 0px !important; border-left: none !important; border-right: none !important; }
      .header-cell { padding: 18px 20px 14px !important; }
      .body-cell { padding: 24px 20px 20px !important; }
      .footer-cell { padding: 20px 20px 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9" style="border-collapse:collapse;padding:40px 0;">
  <tr><td class="outer-cell" align="center" style="padding:40px 0;">
    <table class="main-table" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="border-collapse:collapse;border:1px solid #E8EDF4;border-radius:16px;overflow:hidden;max-width:600px;">

      <!-- Barra de acento superior -->
      <tr><td height="5" style="background:linear-gradient(90deg,${b.accentFrom},${b.accentTo});font-size:1px;line-height:5px;">&nbsp;</td></tr>

      <!-- Header con logo -->
      <tr><td class="header-cell" style="background:#ffffff;padding:22px 40px 18px;border-bottom:1px solid #E8EDF4;">
        <img src="${b.logoUrl}" alt="${b.logoAlt}" width="${b.logoWidth}" height="${b.logoHeight}" border="0" style="display:block;height:${b.logoHeight}px;width:${b.logoWidth}px;" />
      </td></tr>

      <!-- Cuerpo -->
      <tr><td class="body-cell" style="background:#ffffff;padding:34px 40px 30px;font-family:Arial,Helvetica,sans-serif;">
        ${bodyHtml}
      </td></tr>

      <!-- Footer -->
      <tr><td class="footer-cell" style="padding:24px 40px 28px;background:#F8FAFC;border-top:1px solid #E8EDF4;">
        <p style="font-size:11px;color:#94A3B8;line-height:1.7;margin:0;font-family:Arial,Helvetica,sans-serif;">
          <strong style="color:#64748B;">${senderName}</strong> · ${b.companyName}<br>
          ${b.footerTagline ? `${b.footerTagline}<br>` : ""}
          <span style="color:#CBD5E1;font-size:10px;">${b.unsubscribeNote}</span>
        </p>
      </td></tr>

      <!-- Barra de acento inferior -->
      <tr><td height="5" style="background:linear-gradient(90deg,${b.accentFrom},${b.accentTo});font-size:1px;line-height:5px;">&nbsp;</td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

/** HTML -> texto plano, para el campo `text` de un envío multipart. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
