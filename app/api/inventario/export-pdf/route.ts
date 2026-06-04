import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { entradas, salidas } from '@/src/db/schema';
import { sql } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { ARTICULOS_CATALOGO } from '@/src/lib/constants';
import { htmlToPdf } from '@/src/lib/pdf';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();

  const entradasPorArticulo = db.select({
    articulo: entradas.articulo, estado: entradas.estado,
    total: sql<number>`SUM(${entradas.cantidad})`,
  }).from(entradas).groupBy(entradas.articulo, entradas.estado).all();

  const salidasPorArticulo = db.select({
    articulo: salidas.articulo, estado_fisico: salidas.estado_fisico,
    enCampo:      sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Campo'    THEN ${salidas.cantidad} ELSE 0 END)`,
    enBajas:      sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Bajas'    THEN ${salidas.cantidad} ELSE 0 END)`,
    definitivos:  sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Entregado Definitivo' THEN ${salidas.cantidad} ELSE 0 END)`,
    devueltos:    sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Devuelto' THEN ${salidas.cantidad} ELSE 0 END)`,
    extraviados:  sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Extraviado' THEN ${salidas.cantidad} ELSE 0 END)`,
    inutilizables_directos: sql<number>`SUM(CASE WHEN (${salidas.concepto} = 'Inutilizable' AND ${salidas.estado_asignacion} = 'N/A') THEN ${salidas.cantidad} ELSE 0 END)`,
  }).from(salidas).groupBy(salidas.articulo, salidas.estado_fisico).all();

  const entsDetalle = db.select({
    articulo: entradas.articulo, talla: entradas.talla, estado: entradas.estado,
    total: sql<number>`SUM(${entradas.cantidad})`,
  }).from(entradas).groupBy(entradas.articulo, entradas.talla, entradas.estado).all();

  const salsDetalle = db.select({
    articulo: salidas.articulo, talla: salidas.talla, estado_fisico: salidas.estado_fisico,
    enCampo:      sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Campo'    THEN ${salidas.cantidad} ELSE 0 END)`,
    enBajas:      sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Uniforme en Bajas'    THEN ${salidas.cantidad} ELSE 0 END)`,
    definitivos:  sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Entregado Definitivo' THEN ${salidas.cantidad} ELSE 0 END)`,
    devueltos:    sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Devuelto' THEN ${salidas.cantidad} ELSE 0 END)`,
    extraviados:  sql<number>`SUM(CASE WHEN ${salidas.estado_asignacion} = 'Extraviado' THEN ${salidas.cantidad} ELSE 0 END)`,
    inutilizables_directos: sql<number>`SUM(CASE WHEN (${salidas.concepto} = 'Inutilizable' AND ${salidas.estado_asignacion} = 'N/A') THEN ${salidas.cantidad} ELSE 0 END)`,
  }).from(salidas).groupBy(salidas.articulo, salidas.talla, salidas.estado_fisico).all();

  // Build summary
  const entMap: Record<string, { nuevo: number, usado: number, inutilizable: number, total: number }> = {};
  for (const e of entradasPorArticulo) {
    if (!entMap[e.articulo]) entMap[e.articulo] = { nuevo: 0, usado: 0, inutilizable: 0, total: 0 };
    if (e.estado === 'Nuevo') entMap[e.articulo].nuevo += Number(e.total);
    else if (e.estado === 'Usado') entMap[e.articulo].usado += Number(e.total);
    else if (e.estado === 'Inutilizable' || e.estado === 'Para Baja') entMap[e.articulo].inutilizable += Number(e.total);
    entMap[e.articulo].total += Number(e.total);
  }
  const salMap: Record<string, { nuevo: number, usado: number }> = {};
  for (const s of salidasPorArticulo) {
    if (!salMap[s.articulo]) salMap[s.articulo] = { nuevo: 0, usado: 0 };
    const sacados = Number(s.enCampo) + Number(s.enBajas) + Number(s.definitivos) + Number(s.devueltos) + Number(s.extraviados) + Number(s.inutilizables_directos);
    if (s.estado_fisico === 'Nuevo') salMap[s.articulo].nuevo += sacados;
    else if (s.estado_fisico === 'Usado') salMap[s.articulo].usado += sacados;
  }
  const inventarioResumen = ARTICULOS_CATALOGO.map(articulo => {
    const e = entMap[articulo] ?? { nuevo: 0, usado: 0, inutilizable: 0, total: 0 };
    const s = salMap[articulo] ?? { nuevo: 0, usado: 0 };
    return { articulo, almacen: (e.nuevo - s.nuevo) + (e.usado - s.usado) + e.inutilizable, almacenNuevo: e.nuevo - s.nuevo, almacenUsado: e.usado - s.usado, almacenInutilizable: e.inutilizable };
  });

  // Build detail
  const entMapD: Record<string, { nuevo: number, usado: number }> = {};
  for (const e of entsDetalle) { const key = `${e.articulo}|||${e.talla ?? ''}`; if (!entMapD[key]) entMapD[key] = { nuevo: 0, usado: 0 }; if (e.estado === 'Nuevo') entMapD[key].nuevo += Number(e.total); else if (e.estado === 'Usado') entMapD[key].usado += Number(e.total); }
  const salMapD: Record<string, { nuevo: number, usado: number }> = {};
  for (const s of salsDetalle) { const key = `${s.articulo}|||${s.talla ?? ''}`; if (!salMapD[key]) salMapD[key] = { nuevo: 0, usado: 0 }; const sacados = Number(s.enCampo) + Number(s.enBajas) + Number(s.definitivos) + Number(s.devueltos) + Number(s.extraviados) + Number(s.inutilizables_directos); if (s.estado_fisico === 'Nuevo') salMapD[key].nuevo += sacados; else if (s.estado_fisico === 'Usado') salMapD[key].usado += sacados; }
  const allKeys = new Set([...Object.keys(entMapD), ...Object.keys(salMapD)]);
  const inventarioDetalle = Array.from(allKeys).map(key => { const [articulo, tallaRaw] = key.split('|||'); const e = entMapD[key] ?? { nuevo: 0, usado: 0 }; const s = salMapD[key] ?? { nuevo: 0, usado: 0 }; const almacenNuevo = e.nuevo - s.nuevo; const almacenUsado = e.usado - s.usado; return { articulo, talla: tallaRaw || null, almacen: almacenNuevo + almacenUsado, almacenNuevo, almacenUsado }; }).filter(r => r.almacen > 0);

  const fecha = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  const itemsByArticulo: Record<string, typeof inventarioDetalle> = {};
  for (const r of inventarioDetalle) { if (!itemsByArticulo[r.articulo]) itemsByArticulo[r.articulo] = []; itemsByArticulo[r.articulo].push(r); }

  const detalleRows = ARTICULOS_CATALOGO.map(articulo => {
    const items = itemsByArticulo[articulo];
    if (!items?.length) return '';
    return `<div style="margin-bottom:20px">
      <div style="background:#475569;color:#fff;padding:6px 12px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${articulo}</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#e2e8f0"><th style="padding:5px 8px;font-size:8px;font-weight:700;text-align:left">Talla</th><th style="padding:5px 8px;font-size:8px;font-weight:700;text-align:center">Stock Nuevo</th><th style="padding:5px 8px;font-size:8px;font-weight:700;text-align:center">Stock Usado</th><th style="padding:5px 8px;font-size:8px;font-weight:700;text-align:center">Total</th></tr></thead>
        <tbody>${items.map((d, i) => `<tr style="${i % 2 === 0 ? 'background:#f8fafc' : ''}"><td style="padding:4px 8px;font-size:8px">${d.talla || 'Única / No aplica'}</td><td style="padding:4px 8px;font-size:8px;text-align:center">${d.almacenNuevo}</td><td style="padding:4px 8px;font-size:8px;text-align:center">${d.almacenUsado}</td><td style="padding:4px 8px;font-size:8px;text-align:center;font-weight:700">${d.almacen}</td></tr>`).join('')}</tbody>
      </table></div>`;
  }).join('');

  const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"/>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:28px 36px}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #0f172a;padding-bottom:10px;margin-bottom:14px}
  .header-left h1{font-size:18px;font-weight:900;color:#0f172a;letter-spacing:1px;text-transform:uppercase}.header-left p{font-size:10px;color:#6b7280;margin-top:2px}
  .header-right{text-align:right;font-size:10px;color:#374151}.header-right strong{font-size:12px;display:block;color:#0f172a}
  .doc-title{text-align:center;font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;background:#0f172a;color:#fff;padding:5px 0;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;margin-bottom:10px}thead tr{background:#1e293b;color:#fff}
  th{padding:6px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;text-align:left}th.right{text-align:center}
  td{padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px}tr:nth-child(even) td{background:#f8fafc}
  .section-title{font-size:12px;font-weight:700;color:#0f172a;margin:20px 0 8px 0;border-bottom:2px solid #0f172a;padding-bottom:4px}
  .pie{margin-top:20px;padding-top:8px;border-top:1px solid #d1d5db;font-size:9px;color:#9ca3af;text-align:center}</style>
  </head><body>
  <div class="header"><div class="header-left"><h1>U3 Seguridad Privada</h1><p>Control de Uniformes y Dotaciones · Uso Interno</p></div>
  <div class="header-right"><strong>REPORTE GENERAL DE ALMACÉN</strong>Generado:<br/>${fecha}</div></div>
  <div class="doc-title">INVENTARIO DE UNIFORMES — REPORTE GENERAL</div>
  <div class="section-title">Resumen general por artículo</div>
  <table><thead><tr><th>Artículo</th><th class="right">Stock Nuevo</th><th class="right">Stock Usado</th><th class="right">Inutilizable</th><th class="right">Total Almacén</th></tr></thead>
  <tbody>${inventarioResumen.map((item, i) => `<tr${i%2===0?' style="background:#f8fafc"':''}><td>${item.articulo}</td><td style="text-align:center">${item.almacenNuevo}</td><td style="text-align:center">${item.almacenUsado}</td><td style="text-align:center">${item.almacenInutilizable}</td><td style="text-align:center;font-weight:700">${item.almacen}</td></tr>`).join('')}</tbody></table>
  <div class="section-title">Detalle de stock por talla</div>
  ${detalleRows}
  <div class="pie">U3 Seguridad Privada — Control de Inventario & Almacén · Solo para uso administrativo interno.</div>
  </body></html>`;

  const pdfBuffer = await htmlToPdf(html);
  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=inventario_almacen.pdf',
    },
  });
}
