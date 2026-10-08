import type { InventarioResumenRow, InventarioDetalleRow } from '@/src/lib/inventario';
import {
  escapeHtml, fontFaceCss, PILA_FUENTE, FUENTE_PUBLIC_PATH,
  buildHeaderTemplate, buildFooterTemplate, buildMembreteInline, buildPieInline,
} from '@/src/lib/pdfInstitucional';

export interface InventarioTotales {
  totalEntradas: number;
  almacenNuevo: number;
  almacenUsado: number;
  almacenInutilizable: number;
  almacen: number;
  enCampo: number;
  enBajas: number;
  definitivos: number;
  perdidas: number;
  totalExistente: number;
}

export function calcularTotalesInventario(resumen: InventarioResumenRow[]): InventarioTotales {
  return resumen.reduce((acc, curr) => ({
    totalEntradas: acc.totalEntradas + curr.totalEntradas,
    almacenNuevo: acc.almacenNuevo + curr.almacenNuevo,
    almacenUsado: acc.almacenUsado + curr.almacenUsado,
    almacenInutilizable: acc.almacenInutilizable + curr.almacenInutilizable,
    almacen: acc.almacen + curr.almacen,
    enCampo: acc.enCampo + curr.enCampo,
    enBajas: acc.enBajas + curr.enBajas,
    definitivos: acc.definitivos + curr.definitivos,
    perdidas: acc.perdidas + curr.perdidas,
    totalExistente: acc.totalExistente + curr.totalExistente,
  }), { totalEntradas: 0, almacenNuevo: 0, almacenUsado: 0, almacenInutilizable: 0, almacen: 0, enCampo: 0, enBajas: 0, definitivos: 0, perdidas: 0, totalExistente: 0 });
}

export const INVENTARIO_TITULO = 'Reporte de Inventario de Almacén';
export const INVENTARIO_SUBTITULO = 'Control de uniformes y dotaciones · Documento interno';

export function buildInventarioHeaderTemplate(logoSrc: string, fontSrc = FUENTE_PUBLIC_PATH): string {
  return buildHeaderTemplate(logoSrc, INVENTARIO_TITULO, INVENTARIO_SUBTITULO, fontSrc);
}
export const buildInventarioFooterTemplate = buildFooterTemplate;

function fmtFechaIso(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
function fechaLargaMexico(): string {
  return new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'long', year: 'numeric' });
}

export interface InventarioHtmlOpts {
  /** Con `true` el membrete y el pie los pone Chromium en cada hoja; con `false` van dentro del documento. */
  repeatingHeaderFooter?: boolean;
  logoSrc?: string;
  fontSrc?: string;
  generadoPor?: string;
}

/**
 * HTML del reporte de inventario (resumen por artículo + detalle por talla), con el
 * formato institucional de los reportes de Finanzas, en escala de grises.
 * Función pura — sin acceso a base de datos — para que el mismo documento se use tanto
 * en el PDF descargable (Puppeteer, `export-pdf/route.ts`) como en la vista de impresión
 * del navegador (`InventarioApp.tsx`), y ambos muestren siempre exactamente lo mismo.
 */
export function buildInventarioHtml(
  resumen: InventarioResumenRow[],
  detalle: InventarioDetalleRow[],
  corte?: string,
  opts: InventarioHtmlOpts = {},
): string {
  const repeating = !!opts.repeatingHeaderFooter;
  const logoSrc = opts.logoSrc ?? '/LOGO_PDFS.png';
  const fontSrc = opts.fontSrc ?? FUENTE_PUBLIC_PATH;
  const totales = calcularTotalesInventario(resumen);
  const stockBajoItems = resumen.filter((i) => i.stockBajo).length;
  const util = totales.almacenNuevo + totales.almacenUsado;
  const corteTxt = corte ? `${fmtFechaIso(corte)} (cierre del día)` : 'Al momento de la emisión';

  const cifra = (n: number) => (n !== 0 ? String(n) : '<span class="vacio">—</span>');

  let numero = 0;
  const titulo = (t: string) => `<h2 class="section"><span class="num">${String(++numero).padStart(2, '0')}</span><span>${t}</span></h2>`;
  const kpi = (valor: number | string, etiqueta: string) => `<div class="kpi"><div class="kpi-bar"></div><div class="kpi-val">${valor}</div><div class="kpi-lbl">${etiqueta}</div></div>`;
  const fila = (etiqueta: string, valor: string, mod = '') => `<div class="row${mod ? ` ${mod}` : ''}"><span>${etiqueta}</span><b>${valor}</b></div>`;

  const rowsHtml = resumen.map((item) => {
    const util = item.almacenNuevo + item.almacenUsado;
    const marcas = [
      item.archivada ? '<span class="tag">Archivada</span>' : '',
      item.inconsistente ? '<span class="tag">Revisar saldo</span>' : '',
      item.stockBajo ? `<span class="tag">${util <= 0 ? 'Sin stock' : 'Mínimo: ' + item.stockMinimo}</span>` : '',
    ].filter(Boolean).join(' ');
    return `<tr>
      <td class="art"><b>${escapeHtml(item.articulo)}</b>${marcas ? ` ${marcas}` : ''}${item.ajusteNeto ? `<div class="nota-fila">Ajuste neto: ${item.ajusteNeto}</div>` : ''}</td>
      <td class="num">${item.totalEntradas}</td>
      <td class="num">${cifra(item.almacenNuevo)}</td>
      <td class="num">${cifra(item.almacenUsado)}</td>
      <td class="num">${cifra(item.almacenInutilizable)}</td>
      <td class="num strong">${item.almacen}</td>
      <td class="num">${cifra(item.enCampo)}</td>
      <td class="num">${cifra(item.enBajas)}</td>
      <td class="num">${cifra(item.definitivos)}</td>
      <td class="num">${cifra(item.perdidas)}</td>
      <td class="num strong">${item.totalExistente}</td>
    </tr>`;
  }).join('');

  const itemsByArticulo: Record<string, InventarioDetalleRow[]> = {};
  for (const r of detalle) { (itemsByArticulo[r.articulo] ||= []).push(r); }
  const detalleHtml = Object.keys(itemsByArticulo).sort((a, b) => a.localeCompare(b, 'es')).map((articulo) => {
    const items = itemsByArticulo[articulo];
    const sumaUtil = items.reduce((a, d) => a + d.almacen, 0);
    return `<div class="conc-box">
      <div class="conc-head">${escapeHtml(articulo)}</div>
      <table class="data zebra compact">
        <thead><tr><th>Talla</th><th class="r">Nuevo</th><th class="r">Usado</th><th class="r">Inutilizable</th><th class="r">Total útil</th></tr></thead>
        <tbody>${items.map((d) => `<tr><td>${escapeHtml(d.talla) || 'Única / No aplica'}</td><td class="num">${cifra(d.almacenNuevo)}</td><td class="num">${cifra(d.almacenUsado)}</td><td class="num">${cifra(d.almacenInutilizable)}</td><td class="num strong">${d.almacen}</td></tr>`).join('')}
        ${items.length > 1 ? `<tr class="totales"><td colspan="4" style="text-align:right"><span class="tot-lbl">Total ${escapeHtml(articulo)}</span></td><td class="num"><b>${sumaUtil}</b></td></tr>` : ''}</tbody>
      </table></div>`;
  }).join('');

  const notaStock = stockBajoItems > 0
    ? `<div class="note"><b>Stock bajo.</b> ${stockBajoItems} artículo${stockBajoItems > 1 ? 's tienen' : ' tiene'} existencias iguales o inferiores a su mínimo configurado; se marcan en la tabla del inventario.</div>`
    : '';

  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"/><title>Inventario de Almacén</title>
<style>
  ${fontFaceCss(fontSrc)}

  /* Escala de grises: la jerarquía se logra con peso, tamaño y líneas, no con color. */
  :root{
    --ink:#111111; --ink-soft:#f0f0f0; --linea:#dcdcdc; --linea-fuerte:#b5b5b5;
    --tinta:#1b1b1b; --tinta-media:#4d4d4d; --tinta-tenue:#808080; --zebra:#f7f7f7;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:${PILA_FUENTE};font-size:10.5px;color:var(--tinta);line-height:1.5;
    -webkit-font-smoothing:antialiased;font-feature-settings:'kern' 1,'liga' 1;
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
  img{filter:grayscale(1)}
  .page{padding:${repeating ? '2px 0' : '30px 38px'}}

  .header-inline{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:2.5px solid var(--ink);padding-bottom:12px;margin-bottom:4px}
  .header-inline img{width:54px;height:54px;object-fit:contain;flex-shrink:0}
  .header-inline .razon{font-size:12px;font-weight:700;color:var(--ink);letter-spacing:1.4px;text-transform:uppercase}
  .header-inline .datos{font-size:7.6px;color:var(--tinta-media);margin-top:4px;line-height:1.65;letter-spacing:.15px}
  .header-inline .empresa{text-align:right;flex:1}
  .footer-inline{display:flex;align-items:center;justify-content:space-between;gap:6px;border-top:1px solid var(--linea);padding-top:9px;margin-top:26px;font-size:7px;color:var(--tinta-tenue);letter-spacing:.5px;text-transform:uppercase}
  .footer-inline img{width:13px;height:13px;object-fit:contain}
  .footer-inline .brand{display:flex;align-items:center;gap:5px;font-weight:700;letter-spacing:.9px}

  .doc-title{text-align:center;margin:22px 0 18px 0}
  .doc-title .eyebrow{font-size:7.5px;font-weight:700;color:var(--tinta-tenue);letter-spacing:2.4px;text-transform:uppercase}
  .doc-title h1{font-size:20px;font-weight:700;color:var(--ink);letter-spacing:1.6px;text-transform:uppercase;margin-top:7px;line-height:1.25}
  .doc-title .rule{width:54px;height:2.5px;background:var(--ink);margin:11px auto 0}
  .doc-title .sub{font-size:9px;color:var(--tinta-media);margin-top:9px;letter-spacing:.3px}

  .meta-bar{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--linea);border-top:2px solid var(--ink);background:#fcfcfc;margin-bottom:6px}
  .meta-bar .item{padding:8px 12px;border-left:1px solid var(--linea)}
  .meta-bar .item:first-child{border-left:none}
  .meta-bar .k{font-size:6.6px;font-weight:700;color:var(--tinta-tenue);letter-spacing:1.1px;text-transform:uppercase}
  .meta-bar .v{font-size:9.5px;font-weight:600;color:var(--ink);margin-top:3px;line-height:1.35}

  h2.section{display:flex;align-items:center;gap:9px;font-size:11.5px;font-weight:700;color:var(--ink);text-transform:uppercase;letter-spacing:1.5px;
    margin:22px 0 12px 0;padding-bottom:7px;border-bottom:1px solid var(--linea-fuerte);
    page-break-after:avoid;break-after:avoid;page-break-before:always;break-before:page}
  h2.section .num{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;background:var(--ink);color:#fff;font-size:7.5px;font-weight:700;flex-shrink:0}
  h2.section:first-of-type{page-break-before:auto;break-before:auto}

  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;page-break-inside:avoid;break-inside:avoid}
  .kpi{border:1px solid var(--linea);padding:0 10px 12px;text-align:center;background:#fff}
  .kpi-bar{height:2.5px;margin:0 -10px 11px;background:var(--ink)}
  .kpi-val{font-size:16px;font-weight:700;line-height:1.15;color:var(--ink);font-variant-numeric:tabular-nums}
  .kpi-lbl{font-size:6.8px;color:var(--tinta-tenue);text-transform:uppercase;letter-spacing:1.1px;margin-top:7px;font-weight:700}

  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start;margin-top:14px}
  .summary-box{border:1px solid var(--linea);background:#fff;page-break-inside:avoid;break-inside:avoid}
  .summary-box .box-head{background:var(--ink-soft);border-bottom:1px solid var(--linea);padding:6px 12px;font-size:7.2px;font-weight:700;color:var(--ink);text-transform:uppercase;letter-spacing:1.2px}
  .summary-box .row{display:flex;justify-content:space-between;gap:10px;padding:6px 12px;border-bottom:1px solid #eee;font-size:9.5px;color:var(--tinta-media)}
  .summary-box .row:last-child{border-bottom:none}
  .summary-box .row b{color:var(--tinta);white-space:nowrap;font-weight:600;font-variant-numeric:tabular-nums}
  .summary-box .row.destacada{background:#fcfcfc;border-top:1px solid var(--linea-fuerte);color:var(--ink);font-weight:600}
  .summary-box .row.destacada b{color:var(--ink);font-weight:700}

  table.data{width:100%;border-collapse:collapse;margin:0 auto;border-bottom:1.5px solid var(--ink)}
  table.data thead tr{background:var(--ink);color:#fff}
  table.data th{padding:6.5px 6px;font-size:7px;font-weight:700;text-align:left;text-transform:uppercase;letter-spacing:.8px;line-height:1.3}
  table.data td{padding:5px 6px;border-bottom:1px solid var(--linea);font-size:8.4px;vertical-align:top;color:var(--tinta-media)}
  table.data th.r,table.data td.num{text-align:right}
  table.data td.num{white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--tinta)}
  table.data td.strong{font-weight:700;color:var(--ink)}
  table.data td.art{color:var(--ink)}
  table.data thead{display:table-header-group}
  table.data tr{page-break-inside:avoid;break-inside:avoid}
  table.data.zebra tbody tr:nth-child(even):not(.totales){background:var(--zebra)}
  table.compact td{padding:4px 8px;font-size:8px}
  table.compact th{padding:5.5px 8px}
  .nota-fila{font-size:7px;color:var(--tinta-tenue);margin-top:1px}

  tr.totales{page-break-before:avoid;break-before:avoid;background:var(--ink-soft)!important}
  tr.totales td{font-size:8.4px;font-weight:700;color:var(--ink);border-top:1.5px solid var(--ink);border-bottom:none;padding-top:6px;padding-bottom:6px;font-variant-numeric:tabular-nums}
  tr.totales .tot-lbl{font-size:6.8px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--tinta-media)}
  .vacio{color:#bdbdbd}
  .tag{display:inline-block;padding:0 6px;border:1px solid var(--linea-fuerte);background:#fff;color:var(--ink);font-size:6.4px;font-weight:700;letter-spacing:.6px;white-space:nowrap;text-transform:uppercase;vertical-align:1px}

  .conc-wrap{margin-top:6px}
  .conc-box{margin:0 auto 16px;max-width:440px;page-break-inside:avoid;break-inside:avoid}
  .conc-head{font-size:7.6px;font-weight:700;color:var(--ink);letter-spacing:1.2px;text-transform:uppercase;margin-bottom:5px;padding-left:1px}

  .firma{margin-top:44px;display:flex;justify-content:center;gap:70px;page-break-inside:avoid}
  .firma .box{width:220px;text-align:center}
  .firma .line{border-top:1px solid var(--tinta);margin-top:44px;padding-top:7px}
  .firma .line b{display:block;font-size:9.5px;font-weight:600;color:var(--tinta)}
  .firma .line span{display:block;color:var(--tinta-tenue);font-size:7px;text-transform:uppercase;letter-spacing:1.1px;margin-top:3px;font-weight:700}

  .note{font-size:7.8px;color:var(--tinta-media);margin-top:14px;text-align:justify;line-height:1.6;border-left:2px solid var(--linea-fuerte);background:#fcfcfc;padding:8px 11px;page-break-inside:avoid}
</style></head>
<body>
  <div class="page">
  ${!repeating ? buildMembreteInline(logoSrc) : ''}

  <div class="doc-title">
    <div class="eyebrow">Almacén · Control interno</div>
    <h1>Reporte de Inventario de Almacén</h1>
    <div class="rule"></div>
    <div class="sub">Control de uniformes y dotaciones · corte: ${corteTxt}</div>
  </div>

  <div class="meta-bar">
    <div class="item"><div class="k">Fecha de corte</div><div class="v">${corteTxt}</div></div>
    <div class="item"><div class="k">Artículos</div><div class="v">${resumen.length}</div></div>
    <div class="item"><div class="k">Generado por</div><div class="v">${escapeHtml(opts.generadoPor) || '<span class="vacio">—</span>'}</div></div>
    <div class="item"><div class="k">Fecha de emisión</div><div class="v">${fechaLargaMexico()}</div></div>
  </div>

  ${titulo('Resumen ejecutivo')}
  <div class="kpi-grid">
    ${kpi(util, 'En almacén (útil)')}
    ${kpi(totales.enCampo, 'En campo')}
    ${kpi(totales.enBajas, 'En proceso de baja')}
    ${kpi(totales.totalExistente, 'Total existente')}
  </div>
  <div class="two-col">
    <div class="summary-box"><div class="box-head">Existencias en almacén</div>
      ${fila('Nuevo', String(totales.almacenNuevo))}
      ${fila('Usado', String(totales.almacenUsado))}
      ${fila('Inutilizable', String(totales.almacenInutilizable))}
      ${fila('Total en almacén', String(totales.almacen), 'destacada')}
    </div>
    <div class="summary-box"><div class="box-head">Fuera de almacén</div>
      ${fila('En campo', String(totales.enCampo))}
      ${fila('En bajas', String(totales.enBajas))}
      ${fila('Definitivos', String(totales.definitivos))}
      ${fila('Pérdidas', String(totales.perdidas))}
      ${fila('Total existente', String(totales.totalExistente), 'destacada')}
    </div>
  </div>
  ${notaStock}

  ${titulo('Inventario por artículo')}
  <table class="data zebra"><thead><tr><th style="width:26%">Artículo</th><th class="r">Entradas</th><th class="r">Alm. nuevo</th><th class="r">Alm. usado</th><th class="r">Alm. inútil</th><th class="r">Alm. total</th><th class="r">En campo</th><th class="r">En bajas</th><th class="r">Defin.</th><th class="r">Pérdidas</th><th class="r">Total</th></tr></thead>
  <tbody>${rowsHtml || '<tr><td colspan="11" style="text-align:center;padding:16px;color:var(--tinta-tenue)">Sin artículos para mostrar.</td></tr>'}
  <tr class="totales"><td>TOTALES</td><td class="num">${totales.totalEntradas}</td><td class="num">${totales.almacenNuevo}</td><td class="num">${totales.almacenUsado}</td><td class="num">${totales.almacenInutilizable}</td><td class="num">${totales.almacen}</td><td class="num">${totales.enCampo || '—'}</td><td class="num">${totales.enBajas || '—'}</td><td class="num">${totales.definitivos || '—'}</td><td class="num">${totales.perdidas || '—'}</td><td class="num">${totales.totalExistente}</td></tr>
  </tbody></table>

  ${titulo('Detalle de stock por talla')}
  <div class="conc-wrap">${detalleHtml || '<p style="font-size:9px;color:var(--tinta-tenue);text-align:center">Sin existencias por talla en almacén.</p>'}</div>

  <div class="firma">
    <div class="box"><div class="line"><b>&nbsp;</b><span>Responsable de almacén</span></div></div>
    <div class="box"><div class="line"><b>&nbsp;</b><span>Supervisor / Jefe de operaciones</span></div></div>
  </div>

  ${!repeating ? buildPieInline(logoSrc) : ''}
  </div>
</body></html>`;
}
