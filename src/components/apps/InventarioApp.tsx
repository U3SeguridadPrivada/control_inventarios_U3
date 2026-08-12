'use client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Button } from '@/src/components/ui/button';
import { AlertTriangle, Package, Download, Printer } from 'lucide-react';
import { downloadCSV, fmtDate } from '@/src/lib/utils';
import { buildInventarioHtml, calcularTotalesInventario } from '@/src/lib/inventarioTemplate';
import type { InventarioResumenRow, InventarioDetalleRow } from '@/src/lib/inventario';

export default function InventarioApp() {
  const { data: inventario, isLoading } = useQuery({
    queryKey: ['inventario'],
    queryFn: () => apiFetch<InventarioResumenRow[]>('/api/inventario'),
  });
  const { data: inventarioDetalle } = useQuery({
    queryKey: ['inventarioDetalle'],
    queryFn: () => apiFetch<InventarioDetalleRow[]>('/api/inventario/detalle'),
  });

  if (isLoading || !inventario) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando inventario...</p>
        </div>
      </div>
    );
  }

  const stockBajoItems = inventario.filter((i) => i.stockBajo).length;
  const totales = calcularTotalesInventario(inventario);

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
    const html = buildInventarioHtml(inventario, inventarioDetalle ?? []);
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
        <div className="flex flex-wrap items-center gap-2">
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
