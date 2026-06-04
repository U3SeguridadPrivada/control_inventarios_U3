'use client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Button } from '@/src/components/ui/button';
import { AlertTriangle, Package, Download, Printer } from 'lucide-react';
import { downloadCSV, fmtDate } from '@/src/lib/utils';

export default function InventarioPage() {
  const { data: inventario, isLoading } = useQuery({
    queryKey: ['inventario'],
    queryFn: () => apiFetch<any[]>('/api/inventario'),
  });

  if (isLoading || !inventario) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando inventario...</p>
        </div>
      </div>
    );
  }

  const stockBajoItems = inventario.filter((i: any) => i.stockBajo).length;
  const totales = inventario.reduce((acc: any, curr: any) => ({
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
  }), { totalEntradas: 0, almacen: 0, almacenNuevo: 0, almacenUsado: 0, almacenInutilizable: 0, enCampo: 0, enBajas: 0, definitivos: 0, perdidas: 0, totalExistente: 0 });

  const handleExportCSV = () => {
    const headers = ['Artículo', 'Total Entradas', 'Almacén (Nuevo)', 'Almacén (Usado)', 'Almacén (Inútil)', 'Almacén (Total)', 'En Campo', 'En Bajas', 'Entregados Def.', 'Pérdidas/Bajas', 'Total Existente'];
    const rows = inventario.map((i: any) => [i.articulo, i.totalEntradas, i.almacenNuevo, i.almacenUsado, i.almacenInutilizable, i.almacen, i.enCampo, i.enBajas, i.definitivos, i.perdidas, i.totalExistente]);
    rows.push(['TOTALES', totales.totalEntradas, totales.almacenNuevo, totales.almacenUsado, totales.almacenInutilizable, totales.almacen, totales.enCampo, totales.enBajas, totales.definitivos, totales.perdidas, totales.totalExistente]);
    downloadCSV(`inventario_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  const handleExportPDF = async () => {
    try {
      const token = localStorage.getItem('inv_token');
      const response = await fetch('/api/inventario/export-pdf', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Error al descargar el reporte PDF');
      const blob = new Blob([await response.arrayBuffer()], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `inventario_${new Date().toISOString().split('T')[0]}.pdf`; link.style.display = 'none';
      document.body.appendChild(link); link.click();
      setTimeout(() => { document.body.removeChild(link); window.URL.revokeObjectURL(url); }, 1000);
    } catch (error) { alert('No se pudo generar el reporte PDF.'); }
  };

  const handlePrint = () => {
    const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    const rowsHtml = inventario.map((item: any) => `
      <tr${item.stockBajo ? ' style="background:#fffbeb"' : ''}>
        <td><strong>${item.articulo}</strong>${item.stockBajo ? ` <span class="badge ${item.almacen <= 0 ? 'badge-red' : 'badge-amber'}">${item.almacen <= 0 ? 'Sin stock' : 'Bajo stock'}</span>` : ''}</td>
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
    const stockAlertHtml = stockBajoItems > 0 ? `<div class="alert">&#9651; Stock bajo: ${stockBajoItems} artículo${stockBajoItems > 1 ? 's tienen' : ' tiene'} 5 piezas o menos.</div>` : '';
    const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"/><title>Inventario General</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:28px 36px}
    .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1d4ed8;padding-bottom:10px;margin-bottom:14px}
    .header-left h1{font-size:18px;font-weight:900;color:#1d4ed8;letter-spacing:1px;text-transform:uppercase}.header-left p{font-size:10px;color:#6b7280;margin-top:2px}
    .header-right{text-align:right;font-size:10px;color:#374151}.header-right strong{font-size:12px;display:block;color:#1d4ed8}
    .doc-title{text-align:center;font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;background:#1d4ed8;color:#fff;padding:5px 0;margin-bottom:14px}
    .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}.summary-card{border:1.5px solid #e5e7eb;border-radius:6px;padding:10px 14px;text-align:center}
    .summary-card .value{font-size:22px;font-weight:900}.summary-card .label{font-size:9px;color:#6b7280;text-transform:uppercase;font-weight:700;margin-top:2px}
    table{width:100%;border-collapse:collapse;margin-bottom:10px}thead tr{background:#1d4ed8;color:#fff}
    th{padding:6px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;text-align:left}th.right{text-align:right}
    td{padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px}td.right{text-align:right}tr:nth-child(even) td{background:#f0f4ff}
    .totals-row td{font-weight:800;background:#1e293b!important;color:#fff;font-size:11px}
    .num-green{color:#059669}.num-blue{color:#2563eb}.num-red{color:#dc2626}
    .badge{display:inline-block;padding:1px 7px;border-radius:12px;font-size:10px;font-weight:700}
    .badge-green{background:#d1fae5;color:#065f46}.badge-amber{background:#fef3c7;color:#92400e}.badge-red{background:#fee2e2;color:#991b1b}
    .alert{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:10px;color:#92400e}
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
    <tr class="totals-row"><td>TOTALES</td><td class="right">${totales.totalEntradas}</td><td class="right">${totales.almacenNuevo}</td><td class="right">${totales.almacenUsado}</td><td class="right">${totales.almacenInutilizable}</td><td class="right">${totales.almacen}</td><td class="right">${totales.enCampo||'—'}</td><td class="right">${totales.enBajas||'—'}</td><td class="right">${totales.definitivos||'—'}</td><td class="right">${totales.perdidas||'—'}</td><td class="right">${totales.totalExistente}</td></tr>
    </tbody></table>
    <div class="firmas"><div class="firma"><div class="firma-line"></div><p>Responsable de Almacén</p><small>U3 Seguridad Privada</small></div>
    <div class="firma"><div class="firma-line"></div><p>Supervisor / Jefe de Operaciones</p><small>U3 Seguridad Privada</small></div></div>
    <div class="pie">Documento generado automáticamente · U3 Seguridad Privada · Uso administrativo interno.</div></body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'width=1000,height=720');
    if (win) win.addEventListener('load', () => { setTimeout(() => { win.print(); }, 400); });
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventario General</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Estado actual del almacén, equipo en uso y bajas definitivas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="w-4 h-4 mr-1.5" /> Exportar Excel</Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}><Download className="w-4 h-4 mr-1.5" /> Exportar PDF</Button>
          <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="w-4 h-4 mr-1.5" /> Imprimir Vista</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground">En Almacén</p><p className="text-2xl font-bold text-emerald-700 mt-1">{totales.almacen}</p><p className="text-[11px] text-muted-foreground mt-0.5">piezas disponibles</p></div>
        <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground">En Campo</p><p className="text-2xl font-bold text-blue-700 mt-1">{totales.enCampo}</p><p className="text-[11px] text-muted-foreground mt-0.5">asignadas a guardias</p></div>
        <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground">En Proceso de Baja</p><p className="text-2xl font-bold text-amber-700 mt-1">{totales.enBajas}</p><p className="text-[11px] text-muted-foreground mt-0.5">pendientes de recuperar</p></div>
        <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground">Pérdidas / Bajas</p><p className="text-2xl font-bold text-red-700 mt-1">{totales.perdidas}</p><p className="text-[11px] text-muted-foreground mt-0.5">extraviadas o dañadas</p></div>
      </div>
      {stockBajoItems > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0 text-amber-500" />
          <div><p className="text-sm font-semibold">Stock bajo detectado</p><p className="text-sm mt-0.5">{stockBajoItems} {stockBajoItems === 1 ? 'artículo tiene' : 'artículos tienen'} 5 piezas o menos en almacén.</p></div>
        </div>
      )}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-semibold text-foreground">Artículo</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Entradas</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Alm. Nuevo</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Alm. Usado</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Alm. Inútil</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Alm. Total</TableHead>
              <TableHead className="text-right font-semibold text-foreground">En Campo</TableHead>
              <TableHead className="text-right font-semibold text-foreground">En Bajas</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Entregados Def.</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Pérdidas</TableHead>
              <TableHead className="text-right font-semibold text-foreground">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inventario.map((item: any) => (
              <TableRow key={item.articulo} className={item.stockBajo ? "bg-amber-50/60 hover:bg-amber-50" : ""}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {item.articulo}
                    {item.stockBajo && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 text-[11px] font-medium"><AlertTriangle className="w-3 h-3" />{item.almacen <= 0 ? 'Sin stock' : 'Bajo stock'}</span>}
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">{item.totalEntradas}</TableCell>
                <TableCell className="text-right text-emerald-600 font-medium">{item.almacenNuevo > 0 ? item.almacenNuevo : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right text-blue-600 font-medium">{item.almacenUsado > 0 ? item.almacenUsado : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right text-red-600 font-medium">{item.almacenInutilizable > 0 ? item.almacenInutilizable : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right">
                  <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${item.almacen <= 0 ? 'bg-red-100 text-red-700' : item.stockBajo ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{item.almacen}</span>
                </TableCell>
                <TableCell className="text-right">{item.enCampo > 0 ? item.enCampo : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right">{item.enBajas > 0 ? item.enBajas : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right text-muted-foreground">{item.definitivos > 0 ? item.definitivos : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right">{item.perdidas > 0 ? <span className="text-red-600 font-medium">{item.perdidas}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right font-bold">{item.totalExistente}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/40 font-bold border-t-2">
              <TableCell className="font-bold text-foreground"><div className="flex items-center gap-2"><Package className="w-4 h-4 text-primary" /> TOTALES</div></TableCell>
              <TableCell className="text-right text-muted-foreground">{totales.totalEntradas}</TableCell>
              <TableCell className="text-right text-emerald-700 font-bold">{totales.almacenNuevo}</TableCell>
              <TableCell className="text-right text-blue-700 font-bold">{totales.almacenUsado}</TableCell>
              <TableCell className="text-right text-red-700 font-bold">{totales.almacenInutilizable}</TableCell>
              <TableCell className="text-right"><span className="inline-flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-xs font-bold">{totales.almacen}</span></TableCell>
              <TableCell className="text-right">{totales.enCampo > 0 ? totales.enCampo : '—'}</TableCell>
              <TableCell className="text-right">{totales.enBajas > 0 ? totales.enBajas : '—'}</TableCell>
              <TableCell className="text-right text-muted-foreground">{totales.definitivos > 0 ? totales.definitivos : '—'}</TableCell>
              <TableCell className="text-right">{totales.perdidas > 0 ? <span className="text-red-600 font-bold">{totales.perdidas}</span> : '—'}</TableCell>
              <TableCell className="text-right font-bold text-lg">{totales.totalExistente}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
