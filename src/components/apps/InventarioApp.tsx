'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer } from 'recharts';
import { apiFetch } from '@/src/lib/api';
import { useAuth } from '@/src/context/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Input } from '@/src/components/ui/input';
import {
  AlertTriangle, Package, Download, Printer, ArrowDownToLine,
  ArrowUpFromLine, ShieldCheck, Users, Search, BarChart3, ListOrdered,
} from 'lucide-react';
import { downloadCSV, fmtDate, cn } from '@/src/lib/utils';
import { buildInventarioHtml, calcularTotalesInventario } from '@/src/lib/inventarioTemplate';
import type { InventarioResumenRow, InventarioDetalleRow } from '@/src/lib/inventario';

export default function InventarioApp() {
  const { isEditor } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<'existencias' | 'dashboard'>('existencias');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: inventario, isLoading: loadingInv } = useQuery({
    queryKey: ['inventario'],
    queryFn: () => apiFetch<InventarioResumenRow[]>('/api/inventario'),
  });

  const { data: inventarioDetalle } = useQuery({
    queryKey: ['inventarioDetalle'],
    queryFn: () => apiFetch<InventarioDetalleRow[]>('/api/inventario/detalle'),
  });

  const { data: dashboardMetrics, isLoading: loadingDash } = useQuery({
    queryKey: ['dashboardMetrics'],
    queryFn: () => apiFetch<{ metrics: any; chartData: any[]; recentMovements: any[] }>('/api/dashboard/metrics'),
  });

  if (loadingInv || !inventario) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando inventario y dashboard...</p>
        </div>
      </div>
    );
  }

  const stockBajoItems = inventario.filter((i) => i.stockBajo).length;
  const totales = calcularTotalesInventario(inventario);

  const filteredInventario = inventario.filter((i) =>
    i.articulo.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  const handleExportCSV = () => {
    const headers = [
      'Artículo',
      'Total Entradas',
      'Almacén (Nuevo)',
      'Almacén (Usado)',
      'Almacén (Inútil)',
      'Almacén (Total)',
      'En Campo',
      'En Bajas',
      'Entregados Def.',
      'Pérdidas/Bajas',
      'Total Existente',
    ];
    const rows = inventario.map((i: any) => [
      i.articulo,
      i.totalEntradas,
      i.almacenNuevo,
      i.almacenUsado,
      i.almacenInutilizable,
      i.almacen,
      i.enCampo,
      i.enBajas,
      i.definitivos,
      i.perdidas,
      i.totalExistente,
    ]);
    rows.push([
      'TOTALES',
      totales.totalEntradas,
      totales.almacenNuevo,
      totales.almacenUsado,
      totales.almacenInutilizable,
      totales.almacen,
      totales.enCampo,
      totales.enBajas,
      totales.definitivos,
      totales.perdidas,
      totales.totalExistente,
    ]);
    downloadCSV(`inventario_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  const handleExportPDF = async () => {
    try {
      const token = localStorage.getItem('inv_token');
      const response = await fetch('/api/inventario/export-pdf', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Error al descargar el reporte PDF');
      const blob = new Blob([await response.arrayBuffer()], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventario_${new Date().toISOString().split('T')[0]}.pdf`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 1000);
    } catch {
      alert('No se pudo generar el reporte PDF.');
    }
  };

  const handlePrint = () => {
    const html = buildInventarioHtml(inventario, inventarioDetalle ?? []);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'width=1000,height=720');
    if (win) {
      win.addEventListener('load', () => {
        setTimeout(() => {
          win.print();
        }, 400);
      });
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const metrics = dashboardMetrics?.metrics;
  const chartData = dashboardMetrics?.chartData;
  const recentMovements = dashboardMetrics?.recentMovements;

  const metricCards = [
    { title: 'Total Entradas', value: metrics?.totalEntradas ?? 0, icon: ArrowDownToLine, color: 'text-blue-600', bg: 'bg-blue-50', appId: 'entradas' },
    { title: 'Total Salidas', value: metrics?.totalSalidas ?? 0, icon: ArrowUpFromLine, color: 'text-orange-600', bg: 'bg-orange-50', appId: 'salidas' },
    { title: 'Items en Campo', value: metrics?.itemsEnCampo ?? 0, icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50', appId: 'uniformes-campo' },
    { title: 'Guardias Activos', value: metrics?.guardiasActivos ?? 0, icon: Users, color: 'text-violet-600', bg: 'bg-violet-50', appId: 'guardias' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header General */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventario de Almacén</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Control de existencias, dashboard de movimientos y seguimiento de equipo en campo
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isEditor && (
            <>
              <Button size="sm" onClick={() => router.push('/entradas')}>
                <ArrowDownToLine className="w-4 h-4 mr-1.5" /> Nueva Entrada
              </Button>
              <Button size="sm" onClick={() => router.push('/salidas')} className="bg-accent hover:bg-accent/90 text-white">
                <ArrowUpFromLine className="w-4 h-4 mr-1.5" /> Nueva Salida
              </Button>
              <Button size="sm" onClick={() => router.push('/uniformes-campo')} variant="outline">
                <ShieldCheck className="w-4 h-4 mr-1.5" /> En Campo
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-1.5" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <Download className="w-4 h-4 mr-1.5" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1.5" /> Imprimir
          </Button>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex items-center gap-2 border-b border-border pb-1">
        <button
          onClick={() => setTab('existencias')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
            tab === 'existencias'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <ListOrdered className="w-4 h-4" />
          Tabla de Existencias
        </button>
        <button
          onClick={() => setTab('dashboard')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
            tab === 'dashboard'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <BarChart3 className="w-4 h-4" />
          Dashboard de Movimientos
        </button>
      </div>

      {/* VISTA 1: TABLA DE EXISTENCIAS */}
      {tab === 'existencias' && (
        <div className="space-y-6">
          {/* Tarjetas de Resumen de Almacén */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">En Almacén</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{totales.almacen}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">piezas disponibles</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">En Campo</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{totales.enCampo}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">asignadas a guardias</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">En Proceso de Baja</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{totales.enBajas}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">pendientes de recuperar</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Pérdidas / Bajas</p>
              <p className="text-2xl font-bold text-red-700 mt-1">{totales.perdidas}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">extraviadas o dañadas</p>
            </div>
          </div>

          {/* Alerta de Stock Bajo */}
          {stockBajoItems > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-semibold">Stock bajo detectado</p>
                <p className="text-sm mt-0.5">
                  {stockBajoItems} {stockBajoItems === 1 ? 'artículo tiene' : 'artículos tienen'} 5 piezas o menos en almacén.
                </p>
              </div>
            </div>
          )}

          {/* Buscador de artículos */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative max-w-sm w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar artículo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              Mostrando {filteredInventario.length} de {inventario.length} artículos
            </span>
          </div>

          {/* Tabla de Inventario */}
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
                {filteredInventario.map((item: any) => (
                  <TableRow key={item.articulo} className={item.stockBajo ? 'bg-amber-50/60 hover:bg-amber-50' : ''}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {item.articulo}
                        {item.stockBajo && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 text-[11px] font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            {item.almacen <= 0 ? 'Sin stock' : 'Bajo stock'}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{item.totalEntradas}</TableCell>
                    <TableCell className="text-right text-emerald-600 font-medium">
                      {item.almacenNuevo > 0 ? item.almacenNuevo : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-blue-600 font-medium">
                      {item.almacenUsado > 0 ? item.almacenUsado : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-red-600 font-medium">
                      {item.almacenInutilizable > 0 ? item.almacenInutilizable : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          item.almacen <= 0
                            ? 'bg-red-100 text-red-700'
                            : item.stockBajo
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {item.almacen}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {item.enCampo > 0 ? item.enCampo : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.enBajas > 0 ? item.enBajas : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {item.definitivos > 0 ? item.definitivos : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.perdidas > 0 ? <span className="text-red-600 font-medium">{item.perdidas}</span> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-bold">{item.totalExistente}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-bold border-t-2">
                  <TableCell className="font-bold text-foreground">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary" /> TOTALES
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{totales.totalEntradas}</TableCell>
                  <TableCell className="text-right text-emerald-700 font-bold">{totales.almacenNuevo}</TableCell>
                  <TableCell className="text-right text-blue-700 font-bold">{totales.almacenUsado}</TableCell>
                  <TableCell className="text-right text-red-700 font-bold">{totales.almacenInutilizable}</TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-xs font-bold">
                      {totales.almacen}
                    </span>
                  </TableCell>
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
      )}

      {/* VISTA 2: DASHBOARD DE MOVIMIENTOS Y MÉTRICAS */}
      {tab === 'dashboard' && (
        <div className="space-y-6">
          {/* Métricas de Movimientos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {metricCards.map((card) => {
              const Icon = card.icon;
              return (
                <Card
                  key={card.title}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => router.push(`/${card.appId}`)}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground font-medium">{card.title}</p>
                        <p className="text-3xl font-bold mt-1 tracking-tight">{card.value}</p>
                      </div>
                      <div className={`p-2.5 rounded-xl ${card.bg}`}>
                        <Icon className={`w-5 h-5 ${card.color}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Gráfico y Movimientos Recientes */}
          <div className="grid grid-cols-1 lg:grid-cols-7 gap-5">
            <Card className="col-span-4">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Actividad de Movimientos (Entradas / Salidas)</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {chartData && chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorSalidas" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                      <XAxis dataKey="fecha" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                      <ChartTooltip
                        contentStyle={{
                          background: '#fff',
                          borderColor: 'var(--color-border)',
                          borderRadius: '10px',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                          fontSize: '12px',
                        }}
                      />
                      <Area type="monotone" dataKey="Entradas" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorEntradas)" />
                      <Area type="monotone" dataKey="Salidas" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorSalidas)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                    Registra entradas o salidas para ver la actividad aquí
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="col-span-3">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Movimientos Recientes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentMovements && recentMovements.length > 0 ? (
                    recentMovements.map((move: any) => (
                      <div key={move.id} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                              move.tipo === 'Entrada' ? 'bg-blue-50' : 'bg-orange-50'
                            }`}
                          >
                            {move.tipo === 'Entrada' ? (
                              <ArrowDownToLine className="w-4 h-4 text-blue-600" />
                            ) : (
                              <ArrowUpFromLine className="w-4 h-4 text-orange-600" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-sm leading-tight">
                              {move.cantidad} × {move.articulo}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(move.fecha)}</p>
                          </div>
                        </div>
                        <Badge variant={move.tipo === 'Entrada' ? 'default' : 'outline'} className="text-[11px] ml-2 shrink-0">
                          {move.motivo || move.tipo}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-8">No hay movimientos recientes</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
