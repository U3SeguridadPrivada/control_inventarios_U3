import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { ShieldCheck, User, AlertTriangle, RotateCcw, ChevronRight } from 'lucide-react';
import { fmtDate } from '../lib/utils';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

type ItemModal = {
  guardiaId: number;
  nombreGuardia: string;
  articulo: string;
  talla: string | null;
  cantidadEnCampo: number;
};

export default function UniformesCampo() {
  const { isEditor } = useAuth();
  const queryClient = useQueryClient();

  // ── Modal state ──────────────────────────────────────────────────────────
  const [modal, setModal] = useState<ItemModal | null>(null);
  const [tipo, setTipo] = useState<'Extravío' | 'Reposición' | null>(null);
  const [estadoDevolucion, setEstadoDevolucion] = useState<'Nuevo' | 'Usado' | 'Para Baja'>('Usado');
  const [estadoEntregado, setEstadoEntregado] = useState<'Nuevo' | 'Usado'>('Nuevo');
  const [cantidad, setCantidad] = useState(1);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: uniformesCampo = [], isLoading } = useQuery({
    queryKey: ['uniformesCampo'],
    queryFn: () => apiFetch<any[]>('/api/uniformes-campo'),
  });

  // ── Invalidation ─────────────────────────────────────────────────────────
  const invalidateAll = (guardiaId?: number) => {
    queryClient.invalidateQueries({ queryKey: ['uniformesCampo'] });
    queryClient.invalidateQueries({ queryKey: ['salidas'] });
    queryClient.invalidateQueries({ queryKey: ['inventario'] });
    queryClient.invalidateQueries({ queryKey: ['inventarioDetalle'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
    if (guardiaId) queryClient.invalidateQueries({ queryKey: ['expediente', guardiaId] });
  };

  // ── Mutations ────────────────────────────────────────────────────────────
  const reposicionMutation = useMutation({
    mutationFn: ({ items, estadoDevolucion }: { items: any[]; estadoDevolucion: string }) =>
      apiFetch('/api/salidas/reposicion', { method: 'POST', body: JSON.stringify({ items, estadoDevolucion }) }),
    onSuccess: () => {
      invalidateAll(modal?.guardiaId);
      toast.success('Reposición registrada. El expediente del guardia fue actualizado.');
      setModal(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const extravioMutation = useMutation({
    mutationFn: (items: any[]) =>
      apiFetch('/api/salidas/extravio', { method: 'POST', body: JSON.stringify({ items }) }),
    onSuccess: () => {
      invalidateAll(modal?.guardiaId);
      toast.success('Extravío registrado. El expediente del guardia fue actualizado.');
      setModal(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isPending = reposicionMutation.isPending || extravioMutation.isPending;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const openModal = (guardia: any, item: any) => {
    setModal({
      guardiaId: guardia.guardiaId,
      nombreGuardia: guardia.nombreGuardia,
      articulo: item.articulo,
      talla: item.talla ?? null,
      cantidadEnCampo: item.cantidad,
    });
    setTipo(null);
    setEstadoDevolucion('Usado');
    setEstadoEntregado('Nuevo');
    setCantidad(1);
    setFecha(new Date().toISOString().split('T')[0]);
  };

  const handleSubmit = () => {
    if (!modal || !tipo) { toast.error('Selecciona el tipo de movimiento'); return; }
    const payload = {
      fecha,
      concepto: tipo,
      articulo: modal.articulo,
      talla: modal.talla,
      cantidad,
      nombre_guardia: modal.nombreGuardia,
      guardia_id: modal.guardiaId,
      estado_asignacion: tipo === 'Reposición' ? 'Reposición' : 'N/A',
      estado_devuelto: tipo === 'Reposición' ? estadoDevolucion : undefined,
      estado_fisico: tipo === 'Reposición' ? estadoEntregado : undefined,
    };
    if (tipo === 'Reposición') {
      reposicionMutation.mutate({ items: [payload], estadoDevolucion });
    } else {
      extravioMutation.mutate([payload]);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Uniformes en Campo</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Equipo activo asignado a elementos operativos.
            {isEditor && <span className="text-primary"> Haz clic en un artículo para reportar extravío o reposición.</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm bg-card border border-border rounded-xl px-4 py-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span className="font-medium">{(uniformesCampo as any[]).length}</span>
          <span className="text-muted-foreground">operativos con equipo</span>
        </div>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (uniformesCampo as any[]).length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 mt-8 border-2 border-dashed border-border rounded-xl bg-card/50">
          <ShieldCheck className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <h3 className="font-semibold text-lg">No hay uniformes asignados en campo</h3>
          <p className="text-muted-foreground text-sm max-w-sm text-center mt-1">
            Registra salidas con concepto "Asignación en Campo" para que aparezcan aquí.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(uniformesCampo as any[]).map((guardia: any) => (
            <Card key={guardia.guardiaId} className="flex flex-col">
              <CardHeader className="pb-3 flex flex-row items-center gap-3 bg-muted/40 rounded-t-xl border-b border-border">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-base leading-tight">{guardia.nombreGuardia}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {guardia.articulos.length} artículo{guardia.articulos.length !== 1 ? 's' : ''} en campo
                  </p>
                </div>
              </CardHeader>

              <CardContent className="pt-3 flex-1 space-y-1 p-3">
                {guardia.articulos.map((item: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => isEditor && openModal(guardia, item)}
                    disabled={!isEditor}
                    className={`w-full flex items-center justify-between text-sm p-2.5 rounded-lg transition-colors text-left ${
                      isEditor
                        ? 'hover:bg-accent/10 hover:border-accent/30 border border-transparent cursor-pointer group'
                        : 'cursor-default'
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-foreground truncate">{item.articulo}</span>
                      <span className="text-xs text-muted-foreground">{fmtDate(item.fecha)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {item.talla && (
                        <span className="text-[10px] font-semibold bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
                          T: {item.talla}
                        </span>
                      )}
                      <span className="font-bold tabular-nums text-foreground">×{item.cantidad}</span>
                      {isEditor && (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-accent transition-colors" />
                      )}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Modal: Extravío / Reposición ── */}
      <Dialog open={!!modal} onOpenChange={open => { if (!open) setModal(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gestionar artículo en campo</DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-foreground">{modal?.nombreGuardia}</span>
              {' · '}
              <span>{modal?.articulo}</span>
              {modal?.talla && <span> — Talla <strong>{modal.talla}</strong></span>}
              <span className="ml-1 text-muted-foreground">(×{modal?.cantidadEnCampo} en campo)</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-1">
            {/* Tipo */}
            <div className="space-y-2">
              <label className="text-sm font-medium">¿Qué ocurrió con este artículo?</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTipo('Extravío')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    tipo === 'Extravío'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-border bg-card hover:border-red-300 hover:bg-red-50/50'
                  }`}
                >
                  <AlertTriangle className={`w-6 h-6 ${tipo === 'Extravío' ? 'text-red-600' : 'text-muted-foreground'}`} />
                  <div className="text-center">
                    <p className="text-sm font-bold">Extravío</p>
                    <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">El guardia perdió el artículo</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTipo('Reposición')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    tipo === 'Reposición'
                      ? 'border-violet-500 bg-violet-50 text-violet-700'
                      : 'border-border bg-card hover:border-violet-300 hover:bg-violet-50/50'
                  }`}
                >
                  <RotateCcw className={`w-6 h-6 ${tipo === 'Reposición' ? 'text-violet-600' : 'text-muted-foreground'}`} />
                  <div className="text-center">
                    <p className="text-sm font-bold">Reposición</p>
                    <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">El guardia lo devuelve y recibe uno nuevo</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Estado de devolución — solo para Reposición */}
            {tipo === 'Reposición' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Estado del artículo devuelto</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { val: 'Nuevo',    label: 'Nuevo',     desc: 'Sin uso',          color: 'emerald' },
                    { val: 'Usado',    label: 'Usado',     desc: 'Funcional',        color: 'amber'   },
                    { val: 'Para Baja', label: 'Para Baja', desc: 'Desechar',         color: 'red'     },
                  ] as const).map(op => (
                    <button
                      key={op.val}
                      type="button"
                      onClick={() => setEstadoDevolucion(op.val)}
                      className={`flex flex-col items-center p-2.5 rounded-xl border-2 text-center transition-all ${
                        estadoDevolucion === op.val
                          ? `border-${op.color}-500 bg-${op.color}-50 text-${op.color}-700`
                          : 'border-border bg-card hover:border-primary/30'
                      }`}
                    >
                      <p className="text-xs font-bold">{op.label}</p>
                      <p className="text-[10px] text-muted-foreground">{op.desc}</p>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {estadoDevolucion === 'Nuevo'
                    ? 'La prenda regresa al almacén como nueva.'
                    : estadoDevolucion === 'Usado'
                    ? 'La prenda regresa al almacén para posible reúso.'
                    : 'La prenda será dada de baja; no se reusará.'}
                </p>
                <div className="pt-2 border-t border-border mt-3">
                  <label className="text-sm font-medium">Estado del nuevo entregado</label>
                  <Select value={estadoEntregado} onChange={e => setEstadoEntregado(e.target.value as any)} className="mt-1.5">
                    <option value="Nuevo">Entregar Nuevo</option>
                    <option value="Usado">Entregar Usado</option>
                  </Select>
                </div>
              </div>
            )}

            {/* Info extra para extravío */}
            {tipo === 'Extravío' && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>El artículo será marcado como extraviado en el expediente del guardia y se descontará del inventario permanentemente.</span>
              </div>
            )}

            {/* Cantidad y fecha */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Cantidad <span className="text-muted-foreground font-normal">(máx. {modal?.cantidadEnCampo})</span>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="w-8 h-9 rounded-l-lg border border-border bg-muted text-sm font-bold hover:bg-muted/70 transition-colors"
                    onClick={() => setCantidad(c => Math.max(1, c - 1))}
                  >−</button>
                  <Input
                    type="number" min="1" max={modal?.cantidadEnCampo ?? 1}
                    value={cantidad}
                    onChange={e => setCantidad(Math.min(modal?.cantidadEnCampo ?? 1, Math.max(1, Number(e.target.value))))}
                    className="h-9 text-center rounded-none border-x-0 px-1"
                  />
                  <button
                    type="button"
                    className="w-8 h-9 rounded-r-lg border border-border bg-muted text-sm font-bold hover:bg-muted/70 transition-colors"
                    onClick={() => setCantidad(c => Math.min(modal?.cantidadEnCampo ?? 1, c + 1))}
                  >+</button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Fecha del evento</label>
                <Input
                  type="date"
                  value={fecha}
                  onChange={e => setFecha(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setModal(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending || !tipo}
              className={
                tipo === 'Extravío'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : tipo === 'Reposición'
                  ? 'bg-violet-600 hover:bg-violet-700 text-white'
                  : ''
              }
            >
              {isPending
                ? 'Guardando...'
                : tipo === 'Extravío'
                ? 'Confirmar Extravío'
                : tipo === 'Reposición'
                ? 'Confirmar Reposición'
                : 'Selecciona tipo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
