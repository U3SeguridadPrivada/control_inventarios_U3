import { COMPANY } from './company';

/**
 * Piezas comunes del formato institucional de los reportes en PDF (el mismo de
 * Finanzas), en escala de grises: encabezado y pie repetidos en cada hoja,
 * tipografía Inter y portada con ficha de identificación.
 *
 * `logoSrc` y `fontSrc` son rutas públicas en el navegador y data URI en el
 * servidor, porque Puppeteer recibe el HTML por `setContent` y no hay URL base.
 */

export const FUENTE_PUBLIC_PATH = '/fonts/inter-latin.woff2';
export const PILA_FUENTE = `'Inter','Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif`;

export const fontFaceCss = (src: string) =>
  `@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:block;src:url("${src}") format('woff2');}`;

export const escapeHtml = (v: string | null | undefined) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildHeaderTemplate(logoSrc: string, titulo: string, subtitulo: string, fontSrc = FUENTE_PUBLIC_PATH): string {
  return `<style>${fontFaceCss(fontSrc)}</style>
  <div style="width:100%;font-family:${PILA_FUENTE};color:#111;padding:0 14mm 7px 14mm;display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:0.8px solid #bdbdbd;box-sizing:border-box;">
    <span style="display:flex;align-items:center;gap:7px;">
      <img src="${logoSrc}" style="width:22px;height:22px;object-fit:contain;flex-shrink:0;filter:grayscale(1);" />
      <span style="font-size:6.5px;font-weight:700;color:#777;letter-spacing:1.1px;text-transform:uppercase;">U3 Seguridad Privada</span>
    </span>
    <div style="flex:1;text-align:right;">
      <div style="font-size:8px;font-weight:700;color:#111;letter-spacing:1.2px;text-transform:uppercase;">${escapeHtml(titulo)}</div>
      <div style="font-size:6.2px;color:#777;margin-top:1.5px;letter-spacing:.4px;">${escapeHtml(subtitulo)}</div>
    </div>
  </div>`;
}

export function buildFooterTemplate(logoSrc: string, fontSrc = FUENTE_PUBLIC_PATH): string {
  return `<style>${fontFaceCss(fontSrc)}</style>
  <div style="width:100%;font-family:${PILA_FUENTE};font-size:6.5px;color:#777;padding:6px 14mm 0 14mm;display:flex;align-items:center;justify-content:space-between;gap:6px;border-top:0.8px solid #d9d9d9;box-sizing:border-box;letter-spacing:.3px;">
    <span style="display:flex;align-items:center;gap:4px;"><img src="${logoSrc}" style="width:9px;height:9px;object-fit:contain;filter:grayscale(1);" /><span style="font-weight:700;letter-spacing:.8px;text-transform:uppercase;">${COMPANY.razonSocial}</span></span>
    <span style="text-transform:uppercase;letter-spacing:.8px;">Documento confidencial · Uso interno</span>
    <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
  </div>`;
}

/** Membrete y pie dentro del documento, para la vista de impresión del navegador (sin plantillas nativas). */
export function buildMembreteInline(logoSrc: string): string {
  return `<div class="header-inline">
    <img src="${logoSrc}" alt="U3" />
    <div class="empresa">
      <div class="razon">${COMPANY.razonSocial}</div>
      <div class="datos">${COMPANY.domicilio}<br/>Tel: ${COMPANY.telefono}.<br/>CDMX Permiso DGSPyCI: ${COMPANY.permisoDGSPyCI}; Expediente: ${COMPANY.expediente}<br/>${COMPANY.web}</div>
    </div>
  </div>`;
}

export function buildPieInline(logoSrc: string): string {
  return `<div class="footer-inline">
    <span class="brand"><img src="${logoSrc}" alt="" /> ${COMPANY.razonSocial}</span>
    <span>Documento confidencial · Uso interno</span>
  </div>`;
}
