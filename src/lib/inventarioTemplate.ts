import type { InventarioResumenRow, InventarioDetalleRow } from '@/src/lib/inventario';

function escapeHtml(s: string | undefined | null): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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

/**
 * HTML del reporte completo de inventario (resumen por artículo + detalle por talla).
 * Función pura — sin acceso a base de datos — para que el mismo documento se use tanto
 * en el PDF descargable (Puppeteer, `export-pdf/route.ts`) como en la vista de impresión
 * del navegador (`InventarioApp.tsx`), y ambos muestren siempre exactamente lo mismo.
 * Mismo patrón que `buildCotizacionHtml` en `cotizacionTemplate.ts`.
 */
export function buildInventarioHtml(resumen: InventarioResumenRow[], detalle: InventarioDetalleRow[]): string {
  const totales = calcularTotalesInventario(resumen);
  const stockBajoItems = resumen.filter((i) => i.stockBajo).length;
  const fecha = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'long', timeStyle: 'short' });

  const rowsHtml = resumen.map((item, i) => `
    <tr${item.stockBajo ? ' style="background:#fffbeb"' : i % 2 === 0 ? ' style="background:#f0f4ff"' : ''}>
      <td><strong>${escapeHtml(item.articulo)}</strong>${item.stockBajo ? ` <span class="badge ${item.almacen <= 0 ? 'badge-red' : 'badge-amber'}">${item.almacen <= 0 ? 'Sin stock' : 'Bajo stock'}</span>` : ''}</td>
      <td class="right">${item.totalEntradas}</td>
      <td class="right num-green">${item.almacenNuevo > 0 ? item.almacenNuevo : '—'}</td>
      <td class="right num-blue">${item.almacenUsado > 0 ? item.almacenUsado : '—'}</td>
      <td class="right num-red">${item.almacenInutilizable > 0 ? item.almacenInutilizable : '—'}</td>
      <td class="right"><span class="badge ${item.almacen <= 0 ? 'badge-red' : item.stockBajo ? 'badge-amber' : 'badge-green'}">${item.almacen}</span></td>
      <td class="right">${item.enCampo > 0 ? item.enCampo : '—'}</td>
      <td class="right">${item.enBajas > 0 ? item.enBajas : '—'}</td>
      <td class="right">${item.definitivos > 0 ? item.definitivos : '—'}</td>
      <td class="right${item.perdidas > 0 ? ' num-red' : ''}">${item.perdidas > 0 ? item.perdidas : '—'}</td>
      <td class="right"><strong>${item.totalExistente}</strong></td>
    </tr>`).join('');

  const itemsByArticulo: Record<string, InventarioDetalleRow[]> = {};
  for (const r of detalle) { if (!itemsByArticulo[r.articulo]) itemsByArticulo[r.articulo] = []; itemsByArticulo[r.articulo].push(r); }
  const detalleRows = Object.keys(itemsByArticulo).sort().map((articulo) => {
    const items = itemsByArticulo[articulo];
    return `<div style="margin-bottom:16px">
      <div style="background:#1e293b;color:#fff;padding:6px 12px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(articulo)}</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#e2e8f0"><th style="padding:5px 8px;font-size:8px;font-weight:700;text-align:left">Talla</th><th style="padding:5px 8px;font-size:8px;font-weight:700;text-align:center">Stock Nuevo</th><th style="padding:5px 8px;font-size:8px;font-weight:700;text-align:center">Stock Usado</th><th style="padding:5px 8px;font-size:8px;font-weight:700;text-align:center">Total</th></tr></thead>
        <tbody>${items.map((d, i) => `<tr style="${i % 2 === 0 ? 'background:#f8fafc' : ''}"><td style="padding:4px 8px;font-size:8px">${escapeHtml(d.talla) || 'Única / No aplica'}</td><td style="padding:4px 8px;font-size:8px;text-align:center">${d.almacenNuevo}</td><td style="padding:4px 8px;font-size:8px;text-align:center">${d.almacenUsado}</td><td style="padding:4px 8px;font-size:8px;text-align:center;font-weight:700">${d.almacen}</td></tr>`).join('')}</tbody>
      </table></div>`;
  }).join('');

  const stockAlertHtml = stockBajoItems > 0 ? `<div class="alert">&#9651; Stock bajo: ${stockBajoItems} artículo${stockBajoItems > 1 ? 's tienen' : ' tiene'} 5 piezas o menos.</div>` : '';

  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"/><title>Inventario General</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:28px 36px}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1d4ed8;padding-bottom:10px;margin-bottom:14px}
  .header-left h1{font-size:18px;font-weight:900;color:#1d4ed8;letter-spacing:1px;text-transform:uppercase}.header-left p{font-size:10px;color:#6b7280;margin-top:2px}
  .header-right{text-align:right;font-size:10px;color:#374151}.header-right strong{font-size:12px;display:block;color:#1d4ed8}
  .doc-title{text-align:center;font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;background:#1d4ed8;color:#fff;padding:5px 0;margin-bottom:14px}
  .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}.summary-card{border:1.5px solid #e5e7eb;border-radius:6px;padding:10px 14px;text-align:center}
  .summary-card .value{font-size:22px;font-weight:900}.summary-card .label{font-size:9px;color:#6b7280;text-transform:uppercase;font-weight:700;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-bottom:10px}thead tr{background:#1d4ed8;color:#fff}
  th{padding:6px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;text-align:left}th.right{text-align:right}
  td{padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px}td.right{text-align:right}
  .totals-row td{font-weight:800;background:#1e293b!important;color:#fff;font-size:11px}
  .num-green{color:#059669}.num-blue{color:#2563eb}.num-red{color:#dc2626}
  .badge{display:inline-block;padding:1px 7px;border-radius:12px;font-size:10px;font-weight:700}
  .badge-green{background:#d1fae5;color:#065f46}.badge-amber{background:#fef3c7;color:#92400e}.badge-red{background:#fee2e2;color:#991b1b}
  .alert{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:10px;color:#92400e}
  .section-title{font-size:12px;font-weight:700;color:#0f172a;margin:20px 0 8px 0;border-bottom:2px solid #0f172a;padding-bottom:4px}
  .firmas{display:flex;justify-content:space-around;margin-top:36px}.firma{text-align:center;width:200px}
  .firma-line{border-bottom:1.5px solid #111;margin-bottom:6px;height:36px}.firma p{font-size:10px;font-weight:700;text-transform:uppercase}.firma small{font-size:9px;color:#6b7280}
  .pie{margin-top:20px;padding-top:8px;border-top:1px solid #d1d5db;font-size:9px;color:#9ca3af;text-align:center}</style></head>
  <body>
  <div class="header"><div class="header-left"><h1>U3 Seguridad Privada</h1><p>Control de Uniformes y Dotaciones · Uso Interno</p></div>
  <div class="header-right"><strong>REPORTE DE INVENTARIO</strong>Ciudad de México, México.<br/>Fecha de corte:<br/>${fecha}</div></div>
  <div class="doc-title">REPORTE GENERAL DE ALMACÉN — INVENTARIO DE UNIFORMES</div>
  <div class="summary-grid">
    <div class="summary-card"><div class="value" style="color:#059669">${totales.almacen}</div><div class="label">En Almacén</div></div>
    <div class="summary-card"><div class="value" style="color:#2563eb">${totales.enCampo}</div><div class="label">En Campo</div></div>
    <div class="summary-card"><div class="value" style="color:#f59e0b">${totales.enBajas}</div><div class="label">En Proceso de Baja</div></div>
    <div class="summary-card"><div class="value" style="color:#111">${totales.totalExistente}</div><div class="label">Total Existente</div></div>
  </div>
  ${stockAlertHtml}
  <table><thead><tr><th>Artículo</th><th class="right">Entradas</th><th class="right">Alm. Nuevo</th><th class="right">Alm. Usado</th><th class="right">Alm. Inútil</th><th class="right">Alm. Total</th><th class="right">En Campo</th><th class="right">En Bajas</th><th class="right">Def.</th><th class="right">Pérdidas</th><th class="right">Total</th></tr></thead>
  <tbody>${rowsHtml}
  <tr class="totals-row"><td>TOTALES</td><td class="right">${totales.totalEntradas}</td><td class="right">${totales.almacenNuevo}</td><td class="right">${totales.almacenUsado}</td><td class="right">${totales.almacenInutilizable}</td><td class="right">${totales.almacen}</td><td class="right">${totales.enCampo || '—'}</td><td class="right">${totales.enBajas || '—'}</td><td class="right">${totales.definitivos || '—'}</td><td class="right">${totales.perdidas || '—'}</td><td class="right">${totales.totalExistente}</td></tr>
  </tbody></table>
  <div class="section-title">Detalle de stock por talla</div>
  ${detalleRows || '<p style="font-size:10px;color:#6b7280">Sin existencias por talla en almacén.</p>'}
  <div class="firmas"><div class="firma"><div class="firma-line"></div><p>Responsable de Almacén</p><small>U3 Seguridad Privada</small></div>
  <div class="firma"><div class="firma-line"></div><p>Supervisor / Jefe de Operaciones</p><small>U3 Seguridad Privada</small></div></div>
  <div class="pie">Documento generado automáticamente · U3 Seguridad Privada · Uso administrativo interno.</div></body></html>`;
}
