'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer } from 'recharts';
import { apiFetch } from '@/src/lib/api';
import { useAuth } from '@/src/context/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Input } from '@/src/components/ui/input';
import { Select } from '@/src/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import {
  AlertTriangle, Package, Download, Printer, ArrowDownToLine,
  ArrowUpFromLine, ShieldCheck, Users, Search, BarChart3, ListOrdered,
  Plus, Tag, Layers, Edit3, Trash2, CheckCircle2, Sparkles, X, SlidersHorizontal
} from 'lucide-react';
import { downloadCSV, fmtDate, cn } from '@/src/lib/utils';
import { buildInventarioHtml, calcularTotalesInventario } from '@/src/lib/inventarioTemplate';
import type { InventarioResumenRow, InventarioDetalleRow } from '@/src/lib/inventario';
import { toast } from 'sonner';

const CATEGORIAS_PRESET = [
  'Uniformes',
  'Calzado',
  'Abrigo',
  'Equipo Táctico',
  'Accesorios',
  'Protección Personal',
  'Otro',
];

const PRESETS_TALLAS: Record<string, { label: string; tallas: string[] }> = {
  ropa_mx: {
    label: 'Ropa Mex (XCH a XXG)',
    tallas: ['XCH', 'CH', 'M', 'G', 'XG', 'XXG', 'XXXG'],
  },
  ropa_std: {
    label: 'Ropa Estándar (XS a XXL)',
    tallas: ['XS', 'S', 'M', 'G', 'XG', 'XXG'],
  },
  pantalones: {
    label: 'Pantalón / Camisola (28 a 44)',
    tallas: ['28', '29', '30', '31', '32', '33', '34', '36', '38', '40', '42', '44'],
  },
  calzado: {
    label: 'Calzado (24 a 31)',
    tallas: ['24', '24.5', '25', '25.5', '26', '26.5', '27', '27.5', '28', '28.5', '29', '30', '31'],
  },
};

export default function InventarioApp() {
  const { isEditor } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<'existencias' | 'dashboard' | 'catalogo'>('existencias');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('TODAS');

  // Modal State for Garment Management
  const [isPrendaModalOpen, setIsPrendaModalOpen] = useState(false);
  const [editingPrenda, setEditingPrenda] = useState<any | null>(null);
  const [prendaForm, setPrendaForm] = useState({
    nombre: '',
    categoria: 'Uniformes',
    categoriaCustom: '',
    requiereTalla: false,
    tallas: [] as string[],
    stockMinimo: 5,
    costoEstimado: '',
  });
  const [nuevaTallaInput, setNuevaTallaInput] = useState('');

  const { data: inventario, isLoading: loadingInv } = useQuery({
    queryKey: ['inventario'],
    queryFn: () => apiFetch<InventarioResumenRow[]>('/api/inventario'),
  });

  const { data: inventarioDetalle } = useQuery({
    queryKey: ['inventarioDetalle'],
    queryFn: () => apiFetch<InventarioDetalleRow[]>('/api/inventario/detalle'),
  });

  const { data: catalogoPrendas = [], isLoading: loadingPrendas } = useQuery({
    queryKey: ['catalogoPrendas'],
    queryFn: () => apiFetch<any[]>('/api/prendas'),
  });

  const { data: dashboardMetrics, isLoading: loadingDash } = useQuery({
    queryKey: ['dashboardMetrics'],
    queryFn: () => apiFetch<{ metrics: any; chartData: any[]; recentMovements: any[] }>('/api/dashboard/metrics'),
  });

  const invalidateInventory = () => {
    queryClient.invalidateQueries({ queryKey: ['inventario'] });
    queryClient.invalidateQueries({ queryKey: ['inventarioDetalle'] });
    queryClient.invalidateQueries({ queryKey: ['catalogoPrendas'] });
    queryClient.invalidateQueries({ queryKey: ['prendas'] });
  };

  const createPrendaMutation = useMutation({
    mutationFn: (payload: any) => apiFetch('/api/prendas', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: (data: any) => {
      invalidateInventory();
      toast.success(`Prenda "${data.nombre}" agregada al catálogo exitosamente`);
      setIsPrendaModalOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updatePrendaMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) =>
      apiFetch(`/api/prendas/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: (data: any) => {
      invalidateInventory();
      toast.success(`Prenda "${data.nombre}" actualizada exitosamente`);
      setIsPrendaModalOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deletePrendaMutation = useMutation({
    mutationFn: (id: number) => apiFetch<{ ok: boolean; archivado: boolean; mensaje: string }>(`/api/prendas/${id}`, { method: 'DELETE' }),
    onSuccess: (res) => {
      invalidateInventory();
      toast.success(res.mensaje);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleOpenNewPrenda = () => {
    setEditingPrenda(null);
    setPrendaForm({
      nombre: '',
      categoria: 'Uniformes',
      categoriaCustom: '',
      requiereTalla: true,
      tallas: [...PRESETS_TALLAS.ropa_mx.tallas],
      stockMinimo: 5,
      costoEstimado: '',
    });
    setNuevaTallaInput('');
    setIsPrendaModalOpen(true);
  };

  const handleOpenEditPrenda = (item: any) => {
    setEditingPrenda(item);
    const catIsPreset = CATEGORIAS_PRESET.includes(item.categoria);
    setPrendaForm({
      nombre: item.nombre || item.articulo,
      categoria: catIsPreset ? item.categoria : 'Otro',
      categoriaCustom: catIsPreset ? '' : item.categoria,
      requiereTalla: Boolean(item.requiere_talla ?? item.requiereTalla),
      tallas: Array.isArray(item.tallas) ? [...item.tallas] : [],
      stockMinimo: item.stock_minimo ?? item.stockMinimo ?? 5,
      costoEstimado: item.costo_estimado ?? item.costoEstimado ?? '',
    });
    setNuevaTallaInput('');
    setIsPrendaModalOpen(true);
  };

  const handleAddTalla = () => {
    const val = nuevaTallaInput.trim().toUpperCase();
    if (!val) return;
    if (prendaForm.tallas.includes(val)) {
      toast.error(`La talla "${val}" ya está en la lista`);
      return;
    }
    setPrendaForm(prev => ({ ...prev, tallas: [...prev.tallas, val] }));
    setNuevaTallaInput('');
  };

  const handleRemoveTalla = (tallaToRemove: string) => {
    setPrendaForm(prev => ({
      ...prev,
      tallas: prev.tallas.filter(t => t !== tallaToRemove),
    }));
  };

  const handleApplyPreset = (presetKey: string) => {
    const preset = PRESETS_TALLAS[presetKey];
    if (preset) {
      setPrendaForm(prev => ({
        ...prev,
        requiereTalla: true,
        tallas: [...preset.tallas],
      }));
      toast.info(`Plantilla "${preset.label}" aplicada`);
    }
  };

  const handleSubmitPrenda = (e: React.FormEvent) => {
    e.preventDefault();
    const finalNombre = prendaForm.nombre.trim();
    if (!finalNombre) {
      toast.error('Ingresa el nombre de la prenda');
      return;
    }

    const finalCategoria = prendaForm.categoria === 'Otro' && prendaForm.categoriaCustom.trim()
      ? prendaForm.categoriaCustom.trim()
      : prendaForm.categoria;

    if (prendaForm.requiereTalla && prendaForm.tallas.length === 0) {
      toast.error('Si la prenda requiere talla, agrega al menos una talla disponible');
      return;
    }

    const payload = {
      nombre: finalNombre,
      categoria: finalCategoria,
      requiere_talla: prendaForm.requiereTalla,
      tallas: prendaForm.requiereTalla ? prendaForm.tallas : [],
      stock_minimo: Number(prendaForm.stockMinimo) || 5,
      costo_estimado: prendaForm.costoEstimado ? Number(prendaForm.costoEstimado) : null,
    };

    if (editingPrenda?.id) {
      updatePrendaMutation.mutate({ id: editingPrenda.id, payload });
    } else {
      createPrendaMutation.mutate(payload);
    }
  };

  if (loadingInv || !inventario) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando inventario y catálogo de almacén...</p>
        </div>
      </div>
    );
  }

  const stockBajoItems = inventario.filter((i) => i.stockBajo).length;
  const totales = calcularTotalesInventario(inventario);

  // Categorías presentes en el inventario actual
  const categoriasDisponibles = Array.from(
    new Set(inventario.map(i => i.categoria || 'Uniformes'))
  ).sort();

  const filteredInventario = inventario.filter((i) => {
    const matchTerm = i.articulo.toLowerCase().includes(searchTerm.toLowerCase().trim());
    const matchCat = categoriaFiltro === 'TODAS' || (i.categoria || 'Uniformes') === categoriaFiltro;
    return matchTerm && matchCat;
  });

  const handleExportCSV = () => {
    const headers = [
      'Artículo',
      'Categoría',
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
      'Stock Mínimo',
    ];
    const rows = inventario.map((i: any) => [
      i.articulo,
      i.categoria || 'Uniformes',
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
      i.stockMinimo ?? 5,
    ]);
    rows.push([
      'TOTALES',
      '—',
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
      '—',
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
            Control de existencias, catálogo de prendas, movimientos y equipo en campo
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isEditor && (
            <>
              <Button size="sm" onClick={handleOpenNewPrenda} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                <Plus className="w-4 h-4 mr-1.5" /> Nueva Prenda
              </Button>
              <Button size="sm" onClick={() => router.push('/entradas')}>
                <ArrowDownToLine className="w-4 h-4 mr-1.5" /> Entrada
              </Button>
              <Button size="sm" onClick={() => router.push('/salidas')} className="bg-accent hover:bg-accent/90 text-white">
                <ArrowUpFromLine className="w-4 h-4 mr-1.5" /> Salida
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
          onClick={() => setTab('catalogo')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all',
            tab === 'catalogo'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          <Tag className="w-4 h-4" />
          Catálogo de Prendas
          <span className="text-xs px-1.5 py-0.2 bg-background/20 rounded-full">
            {catalogoPrendas.length}
          </span>
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
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">En Almacén</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{totales.almacen}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">piezas disponibles</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">En Campo</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{totales.enCampo}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">asignadas a guardias</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">En Proceso de Baja</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{totales.enBajas}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">pendientes de recuperar</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">Pérdidas / Bajas</p>
              <p className="text-2xl font-bold text-red-700 mt-1">{totales.perdidas}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">extraviadas o dañadas</p>
            </div>
          </div>

          {/* Alerta de Stock Bajo */}
          {stockBajoItems > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-xl flex items-start gap-3 shadow-sm">
              <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold">Stock bajo detectado</p>
                <p className="text-sm mt-0.5 text-amber-800">
                  {stockBajoItems} {stockBajoItems === 1 ? 'prenda ha alcanzado' : 'prendas han alcanzado'} o superado su límite mínimo de alerta en almacén.
                </p>
              </div>
            </div>
          )}

          {/* Barra de Filtros y Búsqueda */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-3">
              <div className="relative max-w-sm w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar prenda o artículo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-card"
                />
              </div>

              {/* Selector de Categoría */}
              <div className="w-48">
                <Select
                  value={categoriaFiltro}
                  onChange={(e) => setCategoriaFiltro(e.target.value)}
                  className="bg-card text-xs"
                >
                  <option value="TODAS">Todas las categorías</option>
                  {categoriasDisponibles.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Mostrando <strong>{filteredInventario.length}</strong> de {inventario.length} prendas
              </span>
            </div>
          </div>

          {/* Tabla de Inventario */}
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-semibold text-foreground">Prenda / Artículo</TableHead>
                  <TableHead className="font-semibold text-foreground">Categoría</TableHead>
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
                  {isEditor && <TableHead className="w-12 text-center"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInventario.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                      No se encontraron prendas con los filtros aplicados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInventario.map((item: any) => (
                    <TableRow key={item.articulo} className={item.stockBajo ? 'bg-amber-50/50 hover:bg-amber-50/80' : ''}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{item.articulo}</span>
                          {item.stockBajo && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 text-[11px] font-medium">
                              <AlertTriangle className="w-3 h-3" />
                              {item.almacen <= 0 ? 'Sin stock' : `Stock bajo (≤${item.stockMinimo ?? 5})`}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground font-medium">
                          {item.categoria || 'Uniformes'}
                        </span>
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
                      {isEditor && (
                        <TableCell className="text-center p-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => handleOpenEditPrenda(item)}
                            title="Editar configuración de prenda"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
                <TableRow className="bg-muted/40 font-bold border-t-2">
                  <TableCell className="font-bold text-foreground">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-primary" /> TOTALES
                    </div>
                  </TableCell>
                  <TableCell>—</TableCell>
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
                  {isEditor && <TableCell></TableCell>}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* VISTA 2: CATÁLOGO Y GESTIÓN DE PRENDAS */}
      {tab === 'catalogo' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-card border border-border p-4 rounded-xl shadow-sm">
            <div>
              <h2 className="text-lg font-semibold">Catálogo Maestro de Prendas y Artículos</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configura tallas, categorías y umbrales mínimos de stock para cada prenda sin modificar código.
              </p>
            </div>
            {isEditor && (
              <Button onClick={handleOpenNewPrenda} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="w-4 h-4 mr-1.5" /> Agregar Nueva Prenda
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {catalogoPrendas.map((item: any) => {
              const tallasArray = Array.isArray(item.tallas) ? item.tallas : [];
              return (
                <Card key={item.id} className={cn('flex flex-col border', item.activo === 0 ? 'opacity-60 bg-muted/20' : 'bg-card')}>
                  <CardHeader className="pb-3 flex flex-row items-start justify-between border-b border-border/50">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-semibold">{item.nombre}</CardTitle>
                        {item.activo === 0 && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">Archivada</Badge>
                        )}
                      </div>
                      <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-medium">
                        {item.categoria}
                      </span>
                    </div>
                    {isEditor && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => handleOpenEditPrenda(item)}
                          title="Editar prenda"
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600"
                          onClick={() => {
                            if (confirm(`¿Deseas eliminar o archivar "${item.nombre}"?`)) {
                              deletePrendaMutation.mutate(item.id);
                            }
                          }}
                          title="Eliminar o archivar prenda"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="pt-3 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {item.requiere_talla ? 'Tallas disponibles:' : 'Prenda Unitalla / Sin talla'}
                      </p>
                      {item.requiere_talla && tallasArray.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {tallasArray.map((t: string) => (
                            <span key={t} className="text-[11px] font-medium px-2 py-0.5 bg-secondary text-secondary-foreground rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : item.requiere_talla ? (
                        <p className="text-xs text-amber-600 font-medium">Sin tallas configuradas</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">No aplica desglose por talla</p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-border/40 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Alerta Stock Mínimo:</span>
                        <p className="font-semibold text-foreground">{item.stock_minimo ?? 5} pzas</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Costo Estimado:</span>
                        <p className="font-semibold text-foreground">
                          {item.costo_estimado ? `$${Number(item.costo_estimado).toFixed(2)}` : 'No asignado'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* VISTA 3: DASHBOARD DE MOVIMIENTOS Y MÉTRICAS */}
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

      {/* MODAL DE CREACIÓN / EDICIÓN DE PRENDAS */}
      <Dialog open={isPrendaModalOpen} onOpenChange={setIsPrendaModalOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Tag className="w-5 h-5 text-primary" />
              {editingPrenda ? 'Editar Prenda / Artículo' : 'Agregar Nueva Prenda al Almacén'}
            </DialogTitle>
            <DialogDescription>
              Configura los datos del producto para que esté disponible de inmediato en entradas, salidas e inventario.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitPrenda} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nombre de la Prenda o Artículo *</label>
              <Input
                placeholder="Ej. Camisola Táctica Manga Larga, Chaleco Reflejante..."
                value={prendaForm.nombre}
                onChange={(e) => setPrendaForm({ ...prendaForm, nombre: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Categoría *</label>
                <Select
                  value={prendaForm.categoria}
                  onChange={(e) => setPrendaForm({ ...prendaForm, categoria: e.target.value })}
                >
                  {CATEGORIAS_PRESET.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>

              {prendaForm.categoria === 'Otro' ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Escribe la Categoría</label>
                  <Input
                    placeholder="Ej. Protección Solar"
                    value={prendaForm.categoriaCustom}
                    onChange={(e) => setPrendaForm({ ...prendaForm, categoriaCustom: e.target.value })}
                    required
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Stock Mínimo de Alerta</label>
                  <Input
                    type="number"
                    min={0}
                    value={prendaForm.stockMinimo}
                    onChange={(e) => setPrendaForm({ ...prendaForm, stockMinimo: Number(e.target.value) })}
                    placeholder="5"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Costo Estimado de Reposición ($ MXN Opcional)</label>
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="Ej. 350.00"
                value={prendaForm.costoEstimado}
                onChange={(e) => setPrendaForm({ ...prendaForm, costoEstimado: e.target.value })}
              />
            </div>

            {/* SECCIÓN DE TALLAS */}
            <div className="border border-border rounded-xl p-3.5 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-foreground">Gestión de Tallas</p>
                  <p className="text-[11px] text-muted-foreground">¿Esta prenda se maneja en diferentes tallas o números?</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prendaForm.requiereTalla}
                    onChange={(e) => setPrendaForm({ ...prendaForm, requiereTalla: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {prendaForm.requiereTalla && (
                <div className="space-y-3 pt-2 border-t border-border/60">
                  {/* Plantillas Rápidas */}
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                      Cargar plantilla rápida de tallas:
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(PRESETS_TALLAS).map(([key, preset]) => (
                        <Button
                          key={key}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleApplyPreset(key)}
                          className="text-[11px] h-7 px-2.5 bg-background"
                        >
                          <Sparkles className="w-3 h-3 mr-1 text-amber-500" />
                          {preset.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Entrada de nueva talla manual */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Escribe una talla (ej. 38, G, 27.5) y pulsa Agregar"
                      value={nuevaTallaInput}
                      onChange={(e) => setNuevaTallaInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTalla();
                        }
                      }}
                      className="bg-background text-xs"
                    />
                    <Button type="button" size="sm" onClick={handleAddTalla} variant="secondary">
                      Agregar
                    </Button>
                  </div>

                  {/* Chips de tallas configuradas */}
                  <div>
                    <span className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
                      Tallas configuradas ({prendaForm.tallas.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-background rounded-lg border border-border">
                      {prendaForm.tallas.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">No hay tallas agregadas. Agrega al menos una.</span>
                      ) : (
                        prendaForm.tallas.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-primary/10 text-primary rounded-md"
                          >
                            {t}
                            <button
                              type="button"
                              onClick={() => handleRemoveTalla(t)}
                              className="text-primary/60 hover:text-red-600 rounded-full"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-3 gap-2">
              <Button type="button" variant="outline" onClick={() => setIsPrendaModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createPrendaMutation.isPending || updatePrendaMutation.isPending}
                className="bg-primary"
              >
                {editingPrenda ? 'Guardar Cambios' : 'Crear Prenda'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
