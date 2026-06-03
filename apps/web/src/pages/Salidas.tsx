import { useState, useMemo, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { ArrowUpFromLine, Search, AlertCircle, Download, Check, ShieldCheck } from 'lucide-react';
import { fmtDate, downloadCSV } from '../lib/utils';
import { ARTICULOS, CONCEPTOS_SALIDA, getEstadoAsignacion, requiereTalla as articuloRequiereTalla } from '../lib/constants';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────
type ArticuloSeleccion = { cantidad: number; talla: string; estadoFisico?: 'Nuevo' | 'Usado'; estadoDevolucion?: 'Nuevo' | 'Usado' | 'Inutilizable' | 'Para Baja' };
type Seleccion = Record<string, ArticuloSeleccion>;

// ─── Component ────────────────────────────────────────────────────────────────
export default function Salidas() {
  const { isEditor } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: salidas = [], isLoading } = useQuery({
    queryKey: ['salidas'],
    queryFn: async () => {
      return apiFetch<any[]>('/api/salidas');
    }
  });

  // Per-talla stock: [{ articulo, talla, almacen }]
  const { data: inventarioDetalle = [], refetch: refetchDetalle } = useQuery({
    queryKey: ['inventarioDetalle'],
    queryFn: async () => {
      return apiFetch<any[]>('/api/inventario/detalle');
    },
    staleTime: 0   // always re-fetch when invalidated
  });



  const { data: guardias = [] } = useQuery({
    queryKey: ['guardias'],
    queryFn: async () => {
      return apiFetch<any[]>('/api/guardias');
    }
  });

  // estadoFisico se declara aquí solo para el modo simple
  const [estadoFisico, setEstadoFisico] = useState<'Nuevo' | 'Usado'>('Nuevo');

  // ── Derived: stock maps (para TODOS los estados simultáneamente) ─────────
  const stockPorArticulo = useMemo(() => {
    const mapNuevo: Record<string, number> = {};
    const mapUsado: Record<string, number> = {};
    (inventarioDetalle as any[]).forEach((i: any) => {
      mapNuevo[i.articulo] = (mapNuevo[i.articulo] ?? 0) + (i.almacenNuevo ?? 0);
      mapUsado[i.articulo] = (mapUsado[i.articulo] ?? 0) + (i.almacenUsado ?? 0);
    });
    return { Nuevo: mapNuevo, Usado: mapUsado };
  }, [inventarioDetalle]);

  const stockPorTalla = useMemo(() => {
    const mapNuevo: Record<string, Record<string, number>> = {};
    const mapUsado: Record<string, Record<string, number>> = {};
    (inventarioDetalle as any[]).forEach((i: any) => {
      if (!mapNuevo[i.articulo]) mapNuevo[i.articulo] = {};
      if (!mapUsado[i.articulo]) mapUsado[i.articulo] = {};
      mapNuevo[i.articulo][i.talla ?? ''] = (i.almacenNuevo ?? 0);
      mapUsado[i.articulo][i.talla ?? ''] = (i.almacenUsado ?? 0);
    });
    return { Nuevo: mapNuevo, Usado: mapUsado };
  }, [inventarioDetalle]);



  const guardiasActivos = useMemo(
    () => (guardias as any[]).filter((g: any) => g.estado === 'Activo'),
    [guardias]
  );

  // ── Shared form state ────────────────────────────────────────────────────
  const [concepto, setConcepto] = useState('Uniforme en Campo');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [guardiaId, setGuardiaId] = useState('');

  // Simple form state (Dotación / Reposición / Inutilizable)
  const [articulo, setArticulo] = useState('');
  const [talla, setTalla] = useState('');
  const [cantidad, setCantidad] = useState(1);

  // Multi-article state (Uniforme en Campo / Reposición / Extravío)
  const [seleccion, setSeleccion] = useState<Seleccion>({});

  const [observaciones, setObservaciones] = useState('');

  // Reset form and force-refresh stock when modal opens
  useEffect(() => {
    if (isModalOpen) {
      refetchDetalle();
      setFecha(new Date().toISOString().split('T')[0]);
      setConcepto('Uniforme en Campo');
      setGuardiaId('');
      setArticulo('');
      setTalla('');
      setCantidad(1);
      setSeleccion({});
      setObservaciones('');
      setEstadoFisico('Nuevo');

    }
  }, [isModalOpen]);

  // Reset article/talla/cantidad when concepto changes
  useEffect(() => {
    setSeleccion({});
    setArticulo('');
    setTalla('');
    setCantidad(1);
  }, [concepto]);

  // Reset talla when article changes
  useEffect(() => {
    setTalla('');
    setCantidad(1);
  }, [articulo]);

  // Reset seleccion when guardia changes (para Reposición/Extravío los ítems dependen del guardia)
  useEffect(() => {
    if (!isCampo) setSeleccion({});
  }, [guardiaId]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['salidas'] });
    queryClient.invalidateQueries({ queryKey: ['inventario'] });
    queryClient.invalidateQueries({ queryKey: ['inventarioDetalle'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
    queryClient.invalidateQueries({ queryKey: ['uniformesCampo'] });
    queryClient.invalidateQueries({ queryKey: ['expediente'] });
  };

  const simpleMutation = useMutation({
    mutationFn: async (payload: any) => {
      return apiFetch('/api/salidas', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => { invalidateAll(); toast.success('Salida registrada exitosamente'); setIsModalOpen(false); },
    onError: (e: Error) => toast.error(`Error: ${e.message}`)
  });

  const bulkMutation = useMutation({
    mutationFn: async (items: any[]) => {
      return apiFetch<{ created: number }>('/api/salidas/bulk', { method: 'POST', body: JSON.stringify({ items }) });
    },
    onSuccess: (data) => { invalidateAll(); toast.success(`Asignación registrada: ${data.created} pieza(s)`); setIsModalOpen(false); },
    onError: (e: Error) => toast.error(`Error: ${e.message}`)
  });

  const extravioMutation = useMutation({
    mutationFn: async (items: any[]) =>
      apiFetch('/api/salidas/extravio', { method: 'POST', body: JSON.stringify({ items }) }),
    onSuccess: () => { invalidateAll(); toast.success('Extravío registrado correctamente'); setIsModalOpen(false); },
    onError: (e: Error) => toast.error(`Error: ${e.message}`)
  });

  // ── Derived: form helpers ─────────────────────────────────────────────────
  const isCampo = concepto === 'Uniforme en Campo';
  const isMultiArticle = isCampo || concepto === 'Extravío';
  const isInutilizable = concepto === 'Inutilizable';
  const guardia = (guardias as any[]).find((g: any) => g.id.toString() === guardiaId);
  const totalPiezas = Object.values(seleccion).reduce((s, v) => s + v.cantidad, 0);

  // Articles available for simple mode — only those with stock in almacén
  const articulosSimple = useMemo(() => {
    return ARTICULOS.filter(art => (stockPorArticulo[estadoFisico][art] ?? 0) > 0);
  }, [stockPorArticulo, estadoFisico]);

  // Tallas for selected article in simple mode — only tallas with stock in almacén
  const tallasConStock = useMemo(() => {
    if (!articulo || !articuloRequiereTalla(articulo)) return [];
    return Object.entries(stockPorTalla[estadoFisico][articulo] ?? {})
      .filter(([, qty]) => qty > 0)
      .map(([t]) => t);
  }, [articulo, stockPorTalla, estadoFisico]);

  const maxCantidadSimple = useMemo(() => {
    if (!articulo) return 0;
    if (articuloRequiereTalla(articulo)) {
      if (!talla) return 0;
      return stockPorTalla[estadoFisico]?.[articulo]?.[talla] ?? 0;
    }
    return stockPorArticulo[estadoFisico]?.[articulo] ?? 0;
  }, [articulo, talla, stockPorArticulo, stockPorTalla, estadoFisico]);

  // Items que el guardia seleccionado tiene actualmente "Uniforme en Campo"
  // Solo se usa para Reposición/Extravío — agrupa por articulo+talla
  const articulosEnCampoDelGuardia = useMemo(() => {
    if (!guardiaId || isCampo) return [];
    const mapa: Record<string, { articulo: string; talla: string | null; cantidad: number }> = {};
    (salidas as any[])
      .filter((s: any) => s.guardia_id?.toString() === guardiaId && s.estado_asignacion === 'Uniforme en Campo')
      .forEach((s: any) => {
        const key = `${s.articulo}|||${s.talla ?? ''}`;
        if (!mapa[key]) mapa[key] = { articulo: s.articulo, talla: s.talla ?? null, cantidad: 0 };
        mapa[key].cantidad += s.cantidad;
      });
    return Object.values(mapa).filter(v => v.cantidad > 0);
  }, [salidas, guardiaId, isCampo]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const toggleArticulo = (art: string) => {
    setSeleccion(prev => {
      if (prev[art]) {
        const next = { ...prev };
        delete next[art];
        return next;
      }
      return { ...prev, [art]: { cantidad: 1, talla: '' } };
    });
  };

  const updateSeleccion = (key: string, field: keyof ArticuloSeleccion, value: any) => {
    setSeleccion(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value }
    }));
  };

  const handleSubmitMulti = () => {
    if (!guardiaId) { toast.error('Debes seleccionar un guardia'); return; }
    const artSeleccionados = Object.entries(seleccion);
    if (artSeleccionados.length === 0) { toast.error('Selecciona al menos un artículo'); return; }

    if (isCampo) {
      // Modo Campo: clave = nombre de artículo, talla elegida en vals.talla
      for (const [art, vals] of artSeleccionados) {
        if (articuloRequiereTalla(art) && !vals.talla) { toast.error(`Selecciona la talla para: ${art}`); return; }
        const estadoSelect = vals.estadoFisico || 'Nuevo';
        const disponible = articuloRequiereTalla(art)
          ? (stockPorTalla[estadoSelect][art]?.[vals.talla] ?? 0)
          : (stockPorArticulo[estadoSelect][art] ?? 0);
        if (vals.cantidad > disponible) { toast.error(`Stock insuficiente para "${art}" (${estadoSelect}). Disponible: ${disponible}`); return; }
      }
      const expanded: any[] = [];
      for (const [art, vals] of artSeleccionados) {
        for (let i = 0; i < vals.cantidad; i++) {
          expanded.push({ fecha, concepto, articulo: art, talla: vals.talla || null, cantidad: 1,
            nombre_guardia: guardia?.nombre ?? null, guardia_id: guardia?.id ?? null,
            estado_asignacion: getEstadoAsignacion(concepto), estado_fisico: vals.estadoFisico || 'Nuevo' });
        }
      }
      bulkMutation.mutate(expanded);
    } else {
      const items = artSeleccionados.map(([key, vals]) => {
        const sepIdx = key.indexOf('|||');
        const art = key.slice(0, sepIdx);
        const tallaKey = key.slice(sepIdx + 3) || null;
        return {
          fecha, concepto,
          articulo: art,
          talla: tallaKey,
          cantidad: vals.cantidad,
          nombre_guardia: guardia?.nombre ?? null,
          guardia_id: guardia?.id ?? null,
          estado_asignacion: getEstadoAsignacion(concepto),
          estado_fisico: vals.estadoFisico || 'Nuevo',
          observaciones: concepto === 'Extravío' ? observaciones : undefined
        };
      });
      extravioMutation.mutate(items);
    }
  };

  const handleSubmitSimple = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!articulo) { toast.error('Selecciona un artículo'); return; }
    if (articuloRequiereTalla(articulo) && !talla) { toast.error('Selecciona una talla'); return; }
    if (cantidad > maxCantidadSimple) { toast.error(`Stock insuficiente. Disponible: ${maxCantidadSimple}`); return; }
    simpleMutation.mutate({
      fecha,
      concepto,
      articulo,
      talla: talla || null,
      cantidad: Number(cantidad),
      nombre_guardia: guardia?.nombre ?? null,
      guardia_id: guardia?.id ?? null,
      estado_asignacion: getEstadoAsignacion(concepto),
      estado_fisico: estadoFisico
    });
  };

  // ── Table filter ─────────────────────────────────────────────────────────
  const filteredData = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return (salidas as any[]).filter((s: any) =>
      s.articulo.toLowerCase().includes(term) ||
      s.concepto.toLowerCase().includes(term) ||
      (s.nombre_guardia && s.nombre_guardia.toLowerCase().includes(term))
    );
  }, [salidas, searchTerm]);

  const isPending = simpleMutation.isPending || bulkMutation.isPending || extravioMutation.isPending;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Salidas de Equipo</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">Registro de dotaciones, asignaciones a campo y extravíos. Las reposiciones se gestionan desde Uniformes en Campo.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            const rows = (salidas as any[]).map((s: any) => [
              fmtDate(s.fecha), s.concepto, s.articulo, s.talla || '—',
              s.cantidad, s.nombre_guardia || '—', s.estado_asignacion
            ]);
            downloadCSV(`salidas_${new Date().toISOString().split('T')[0]}.csv`,
              ['Fecha', 'Concepto', 'Artículo', 'Talla', 'Cantidad', 'Guardia', 'Estado'], rows);
          }}>
            <Download className="w-4 h-4 mr-1.5" /> Exportar
          </Button>
          {isEditor && (
            <Button onClick={() => setIsModalOpen(true)} className="bg-accent hover:bg-accent/90 text-white">
              <ArrowUpFromLine className="w-4 h-4 mr-2" /> Nueva Salida
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por artículo, concepto o guardia..."
          className="pl-9"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Artículo</TableHead>
              <TableHead>Talla</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead>Guardia</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : filteredData.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                {searchTerm ? 'Sin resultados para la búsqueda.' : 'No hay registros de salidas.'}
              </TableCell></TableRow>
            ) : filteredData.map((item: any) => {
              const est = item.estado_asignacion;
              const cfg: Record<string, string> = {
                'Uniforme en Campo':    'bg-blue-100 text-blue-700 border-blue-200',
                'Uniforme en Bajas':    'bg-amber-100 text-amber-700 border-amber-200',
                'Entregado Definitivo': 'bg-emerald-100 text-emerald-700 border-emerald-200',
                'Reposición':           'bg-violet-100 text-violet-700 border-violet-200',
                'Devuelto':             'bg-emerald-50 text-emerald-600 border-emerald-200',
                'Extraviado':           'bg-orange-100 text-orange-700 border-orange-200',
                'N/A':                  'bg-red-100 text-red-700 border-red-200',
              };
              const cls = cfg[est] ?? 'bg-secondary text-secondary-foreground border-border';
              const label = est === 'N/A'
                ? (item.concepto === 'Inutilizable' ? 'Dado de Baja' : 'Extravío')
                : (est || '—');
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium tabular-nums">{fmtDate(item.fecha)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.concepto}</TableCell>
                  <TableCell className="font-medium">{item.articulo}</TableCell>
                  <TableCell className="text-muted-foreground">{item.talla || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.cantidad}</TableCell>
                  <TableCell className="text-muted-foreground">{item.nombre_guardia || '—'}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>
                      {label}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ── Dialog ── */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className={isMultiArticle ? 'max-w-2xl max-h-[90vh] overflow-y-auto' : 'max-w-lg'}>
          <DialogHeader>
            <DialogTitle>Registrar Salida de Equipo</DialogTitle>
            <DialogDescription>Elige el tipo de movimiento y completa los datos</DialogDescription>
          </DialogHeader>

          {/* ── Tipo de movimiento ── */}
          <div className="space-y-2 mt-2">
            <label className="text-sm font-medium">Tipo de Movimiento</label>
            <div className="grid grid-cols-2 gap-2">
              {CONCEPTOS_SALIDA.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setConcepto(c.value)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    concepto === c.value
                      ? c.value === 'Inutilizable'
                        ? 'border-red-500 bg-red-50'
                        : 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/30 bg-card'
                  }`}
                >
                  <p className={`text-xs font-bold ${
                    concepto === c.value
                      ? c.value === 'Inutilizable' ? 'text-red-700' : 'text-primary'
                      : 'text-foreground'
                  }`}>{c.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{c.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-border my-1" />

          {/* ══════════════════════════════════════════════════════════════
              MODO "UNIFORME EN CAMPO" — multi-artículo
          ══════════════════════════════════════════════════════════════ */}
          {isMultiArticle ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Guardia <span className="text-destructive">*</span></label>
                  <Select value={guardiaId} onChange={e => setGuardiaId(e.target.value)} required>
                    <option value="">— Seleccionar guardia —</option>
                    {guardiasActivos.map((g: any) => (
                      <option key={g.id} value={g.id}>{g.nombre} · {g.numero_elemento}</option>
                    ))}
                  </Select>
                  {guardiasActivos.length === 0 && (
                    <p className="text-xs text-destructive">No hay guardias activos</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Fecha de Asignación</label>
                  <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
                </div>
              </div>

              {/* Global properties removed to per-item configuration */}

              {/* Observaciones — solo para Extravío */}
              {concepto === 'Extravío' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Observaciones (Ej. Descuento de nómina)</label>
                  <Input value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Ej. Se descuenta de nómina la prenda extraviada" />
                </div>
              )}

              {/* Global estado físico removed, now handled per-item */}

              {/* Article checklist */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    {concepto === 'Uniforme en Campo' ? 'Artículos a Asignar' : 'Artículos Extraviados'}
                  </label>
                  {totalPiezas > 0 && (
                    <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
                      {Object.keys(seleccion).length} artículo(s) · {totalPiezas} pieza(s)
                    </span>
                  )}
                </div>

                {/* ── Checklist: modo CAMPO (catálogo + stock almacén) ── */}
                {isCampo && (
                <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                  {ARTICULOS.map(art => {
                    const tieneTalla = articuloRequiereTalla(art);
                    const seleccionado = !!seleccion[art];
                    const estadoItem = seleccion[art]?.estadoFisico || 'Nuevo';
                    const disponibleTotal = stockPorArticulo[estadoItem][art] ?? 0;
                    const sinStock = !seleccionado && (stockPorArticulo['Nuevo'][art] ?? 0) === 0 && (stockPorArticulo['Usado'][art] ?? 0) === 0;
                    
                    const tallasConStockCampo = tieneTalla
                      ? Array.from(new Set([
                          ...Object.entries(stockPorTalla['Nuevo'][art] ?? {}).filter(([, qty]) => qty > 0).map(([t]) => t),
                          ...Object.entries(stockPorTalla['Usado'][art] ?? {}).filter(([, qty]) => qty > 0).map(([t]) => t)
                        ]))
                      : [];
                      
                    if (tieneTalla && tallasConStockCampo.length === 0) return null;
                    const tallaSel = seleccion[art]?.talla ?? '';
                    const disponibleParaTalla = tieneTalla && tallaSel ? (stockPorTalla[estadoItem][art]?.[tallaSel] ?? 0) : disponibleTotal;
                    
                    let maxCantidadParaAñadir = disponibleTotal;
                    if (tieneTalla && tallaSel) maxCantidadParaAñadir = disponibleParaTalla;
                    
                    return (
                      <div key={art} className={`transition-colors ${sinStock ? 'opacity-40 cursor-not-allowed bg-muted/30' : seleccionado ? 'bg-primary/5' : 'bg-card hover:bg-muted/30 cursor-pointer'}`}>
                        <div className="flex items-center gap-3 px-4 py-3" onClick={() => !sinStock && toggleArticulo(art)}>
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${seleccionado ? 'bg-primary border-primary' : sinStock ? 'border-muted-foreground/30' : 'border-border'}`}>
                            {seleccionado && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                          </div>
                          <span className={`text-sm font-medium flex-1 ${sinStock ? 'line-through text-muted-foreground' : ''}`}>{art}</span>
                          {!seleccionado && (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sinStock ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
                              {sinStock ? 'Sin stock' : 'Disponible'}
                            </span>
                          )}
                        </div>

                        {seleccionado && (
                          <div className="px-4 pb-3 flex flex-wrap items-center gap-3 bg-primary/5 border-t border-primary/10">
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-muted-foreground flex-shrink-0">Dar como:</label>
                              <Select value={seleccion[art].estadoFisico || 'Nuevo'} onChange={e => { updateSeleccion(art, 'estadoFisico', e.target.value); updateSeleccion(art, 'cantidad', 1); }} className="h-8 py-1 text-xs w-28">
                                <option value="Nuevo">Nuevo</option>
                                <option value="Usado">Usado</option>
                              </Select>
                            </div>

                            {tieneTalla && (
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-muted-foreground flex-shrink-0">Talla:</label>
                                <Select value={seleccion[art].talla} onChange={e => { updateSeleccion(art, 'talla', e.target.value); updateSeleccion(art, 'cantidad', 1); }} className="h-8 py-1 text-xs w-32">
                                  <option value="">—</option>
                                  {tallasConStockCampo.map((t: string) => <option key={t} value={t}>{t} ({(stockPorTalla[estadoItem][art]?.[t] ?? 0)} disp.)</option>)}
                                </Select>
                                {!seleccion[art].talla && <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <label className="text-xs text-muted-foreground flex-shrink-0">Cant:</label>
                              <div className="flex items-center gap-1">
                                <button type="button" className="w-7 h-7 rounded border border-border bg-card text-sm font-bold hover:bg-muted transition-colors flex items-center justify-center" onClick={() => updateSeleccion(art, 'cantidad', Math.max(1, seleccion[art].cantidad - 1))}>−</button>
                                <Input type="number" min="1" max={maxCantidadParaAñadir} value={seleccion[art].cantidad} onChange={e => { updateSeleccion(art, 'cantidad', Math.min(maxCantidadParaAñadir, Math.max(1, Number(e.target.value)))); }} className="w-16 h-7 text-center text-sm px-1" />
                                <button type="button" className="w-7 h-7 rounded border border-border bg-card text-sm font-bold hover:bg-muted transition-colors flex items-center justify-center" onClick={() => { updateSeleccion(art, 'cantidad', Math.min(maxCantidadParaAñadir, seleccion[art].cantidad + 1)); }}>+</button>
                              </div>
                              <span className={`text-xs ${maxCantidadParaAñadir === 0 ? 'text-red-500 font-bold' : 'text-muted-foreground'}`}>/ {tieneTalla ? (tallaSel ? maxCantidadParaAñadir : '?') : maxCantidadParaAñadir} disp.
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                )}

                {/* ── Checklist: modo REPOSICIÓN / EXTRAVÍO (artículos del guardia en campo) ── */}
                {!isCampo && (
                  !guardiaId ? (
                    <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
                      Selecciona primero un guardia para ver su equipo en campo.
                    </div>
                  ) : articulosEnCampoDelGuardia.length === 0 ? (
                    <div className="border border-dashed border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
                      Este guardia no tiene artículos asignados en campo.
                    </div>
                  ) : (
                    <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                      {articulosEnCampoDelGuardia.map(item => {
                        const key = `${item.articulo}|||${item.talla ?? ''}`;
                        const seleccionado = !!seleccion[key];
                        return (
                          <div key={key} className={`transition-colors ${seleccionado ? 'bg-primary/5' : 'bg-card hover:bg-muted/30 cursor-pointer'}`}>
                            <div className="flex items-center gap-3 px-4 py-3" onClick={() => {
                              setSeleccion(prev => {
                                if (prev[key]) { const next = { ...prev }; delete next[key]; return next; }
                                return { ...prev, [key]: { cantidad: 1, talla: item.talla ?? '' } };
                              });
                            }}>
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${seleccionado ? 'bg-primary border-primary' : 'border-border'}`}>
                                {seleccionado && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                              </div>
                              <span className="text-sm font-medium flex-1">
                                {item.articulo}
                                {item.talla && <span className="text-muted-foreground font-normal"> — Talla {item.talla}</span>}
                              </span>
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                En campo: {item.cantidad}
                              </span>
                            </div>
                            
                            {seleccionado && (
                              <div className="px-4 pb-3 flex flex-col gap-3 bg-primary/5 border-t border-primary/10">
                                <div className="flex items-center gap-3 mt-2">
                                  <label className="text-xs text-muted-foreground flex-shrink-0">Cantidad:</label>
                                  <div className="flex items-center gap-1">
                                    <button type="button" className="w-7 h-7 rounded border border-border bg-card text-sm font-bold hover:bg-muted transition-colors flex items-center justify-center"
                                      onClick={() => updateSeleccion(key, 'cantidad', Math.max(1, seleccion[key].cantidad - 1))}>−</button>
                                    <Input type="number" min="1" max={item.cantidad} value={seleccion[key].cantidad}
                                      onChange={e => updateSeleccion(key, 'cantidad', Math.min(item.cantidad, Math.max(1, Number(e.target.value))))}
                                      className="w-16 h-7 text-center text-sm px-1" />
                                    <button type="button" className="w-7 h-7 rounded border border-border bg-card text-sm font-bold hover:bg-muted transition-colors flex items-center justify-center"
                                      onClick={() => updateSeleccion(key, 'cantidad', Math.min(item.cantidad, seleccion[key].cantidad + 1))}>+</button>
                                  </div>
                                  <span className="text-xs text-muted-foreground">/ {item.cantidad} en posesión</span>
                                </div>
                                
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>

              {/* Summary */}
              {Object.keys(seleccion).length > 0 && (
                <div className="bg-muted/50 rounded-xl p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Resumen:</p>
                  {Object.entries(seleccion).map(([key, vals]) => {
                    const [art, tallaKey] = isCampo ? [key, vals.talla] : key.split('|||');
                    const talla = isCampo ? tallaKey : (tallaKey || null);
                    return (
                      <div key={key} className="flex flex-col text-sm border-b border-border/50 pb-2 mb-2 last:border-0 last:pb-0 last:mb-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {art}{talla ? <span className="text-muted-foreground font-normal"> — Talla {talla}</span> : ''}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {vals.cantidad} {vals.cantidad === 1 ? 'pieza' : 'piezas'}
                          </span>
                        </div>
                        {concepto === 'Uniforme en Campo' && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Entregado como: {vals.estadoFisico || 'Nuevo'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button
                  type="button"
                  onClick={handleSubmitMulti}
                  disabled={isPending || Object.keys(seleccion).length === 0 || !guardiaId}
                  className="gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {isPending ? 'Guardando...' : `${concepto === 'Uniforme en Campo' ? 'Asignar' : 'Registrar Extravío'}${totalPiezas > 0 ? ` (${totalPiezas} piezas)` : ''}`}
                </Button>
              </DialogFooter>
            </div>

          ) : (
            /* ══════════════════════════════════════════════════════════════
               MODO SIMPLE — Dotación / Reposición / Inutilizable
            ══════════════════════════════════════════════════════════════ */
            <form onSubmit={handleSubmitSimple} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Fecha</label>
                  <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Artículo
                  </label>
                  <Select
                    value={articulo}
                    onChange={e => setArticulo(e.target.value)}
                    required
                  >
                    <option value="" disabled>Seleccionar...</option>
                    {articulosSimple.map(art => {
                      const stock = (stockPorArticulo as any)[estadoFisico][art] ?? 0;
                      return (
                        <option key={art} value={art}>
                          {art} — Disp TOTAL: {stock}
                        </option>
                      );
                    })}
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Estado Físico Sacado</label>
                  <Select value={estadoFisico} onChange={e => setEstadoFisico(e.target.value as any)}>
                    <option value="Nuevo">Nuevo</option>
                    <option value="Usado">Usado</option>
                  </Select>
                </div>
                {articulo && articuloRequiereTalla(articulo) && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Talla</label>
                    <Select value={talla} onChange={e => setTalla(e.target.value)} required>
                      <option value="" disabled>Seleccionar...</option>
                      {tallasConStock.map((t: string) => (
                        <option key={t} value={t}>
                          {t} — {(stockPorTalla as any)[estadoFisico]?.[articulo]?.[t] ?? 0} disp.
                        </option>
                      ))}
                    </Select>
                    {tallasConStock.length === 0 && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Sin tallas con stock
                      </p>
                    )}
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Cantidad
                    {maxCantidadSimple > 0 && (
                      <span className="text-muted-foreground font-normal ml-1">(máx: {maxCantidadSimple})</span>
                    )}
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max={maxCantidadSimple || undefined}
                    value={cantidad}
                    onChange={e => setCantidad(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              {/* Guardia (opcional) */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Guardia <span className="text-muted-foreground font-normal">(opcional)</span>
                </label>
                <Select value={guardiaId} onChange={e => setGuardiaId(e.target.value)}>
                  <option value="">— Sin asignar / Entrega general —</option>
                  {guardiasActivos.map((g: any) => (
                    <option key={g.id} value={g.id}>{g.nombre} · {g.numero_elemento}</option>
                  ))}
                </Select>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className={isInutilizable ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
                >
                  {isPending ? 'Guardando...' : isInutilizable ? 'Confirmar Baja de Artículo' : 'Registrar Salida'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
