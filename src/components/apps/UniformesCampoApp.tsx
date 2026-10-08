'use client';
import { fechaMexico } from '@/src/lib/fecha';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select } from '@/src/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import { ShieldCheck, User, AlertTriangle, RotateCcw, ChevronRight, PackagePlus } from 'lucide-react';
import EquipoPrevioDialog from '@/src/components/apps/EquipoPrevioDialog';
import { fmtDate } from '@/src/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';

type ItemModal = { salidaId: number; guardiaId: number; nombreGuardia: string; articulo: string; talla: string | null; cantidadEnCampo: number; };

export default function UniformesCampoApp() {
  const { puede } = useAuth();
  const isEditor = puede('uniformes-campo','editar');
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<ItemModal | null>(null);
  const [isPrevioOpen, setIsPrevioOpen] = useState(false);
  const [tipo, setTipo] = useState<'Extravío' | 'Reposición' | null>(null);
  const [estadoDevolucion, setEstadoDevolucion] = useState<'Nuevo' | 'Usado' | 'Para Baja'>('Usado');
  const [estadoEntregado, setEstadoEntregado] = useState<'Nuevo' | 'Usado'>('Nuevo');
  const [cantidad, setCantidad] = useState(1);
  const [tallaNueva, setTallaNueva] = useState('');
  const { data: prendas = [], error: errorPrendas } = useQuery({ queryKey: ['catalogoPrendas'], queryFn: () => apiFetch<any[]>('/api/prendas') });
  const { data: detalle = [], error: errorDetalle } = useQuery({ queryKey: ['inventarioDetalle'], queryFn: () => apiFetch<any[]>('/api/inventario/detalle') });
  const [fecha, setFecha] = useState(fechaMexico());

  const { data: uniformesCampo = [], isLoading, error, refetch } = useQuery({ queryKey: ['uniformesCampo'], queryFn: () => apiFetch<any[]>('/api/uniformes-campo') });

  const invalidateAll = (guardiaId?: number) => {
    ['uniformesCampo', 'salidas', 'inventario', 'inventarioDetalle', 'dashboardMetrics', 'entradas', 'expediente', 'inventarioHistorial'].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
    if (guardiaId) queryClient.invalidateQueries({ queryKey: ['expediente', guardiaId] });
  };

  const reposicionMutation = useMutation({
    mutationFn: ({ items, estadoDevolucion }: { items: any[]; estadoDevolucion: string }) => apiFetch('/api/salidas/reposicion', { method: 'POST', body: JSON.stringify({ items, estadoDevolucion }) }),
    onSuccess: () => { invalidateAll(modal?.guardiaId); toast.success('Reposición registrada.'); setModal(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const extravioMutation = useMutation({
    mutationFn: (items: any[]) => apiFetch('/api/salidas/extravio', { method: 'POST', body: JSON.stringify({ items }) }),
    onSuccess: () => { invalidateAll(modal?.guardiaId); toast.success('Extravío registrado.'); setModal(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const isPending = (tipo === 'Reposición' && (!!errorPrendas || !!errorDetalle)) || reposicionMutation.isPending || extravioMutation.isPending;

  const openModal = (guardia: any, item: any) => { setTallaNueva(item.talla ?? ''); setModal({ salidaId: item.salidaId, guardiaId: guardia.guardiaId, nombreGuardia: guardia.nombreGuardia, articulo: item.articulo, talla: item.talla ?? null, cantidadEnCampo: item.cantidad }); setTipo(null); setEstadoDevolucion('Usado'); setEstadoEntregado('Nuevo'); setCantidad(1); setFecha(fechaMexico()); };

  const handleSubmit = () => {
    if (!modal || !tipo) { toast.error('Selecciona el tipo de movimiento'); return; }
    if (!Number.isSafeInteger(cantidad) || cantidad < 1) { toast.error('La cantidad debe ser un entero mayor a cero'); return; }
    const payload = { salida_id: modal.salidaId, talla_nueva: tallaNueva || null, fecha, concepto: tipo, articulo: modal.articulo, talla: modal.talla, cantidad, nombre_guardia: modal.nombreGuardia, guardia_id: modal.guardiaId, estado_asignacion: tipo === 'Reposición' ? 'Reposición' : 'N/A', estado_devuelto: tipo === 'Reposición' ? estadoDevolucion : undefined, estado_fisico: tipo === 'Reposición' ? estadoEntregado : undefined };
    if (tipo === 'Reposición') reposicionMutation.mutate({ items: [payload], estadoDevolucion });
    else extravioMutation.mutate([payload]);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight">Uniformes en Campo</h1><p className="text-muted-foreground mt-0.5 text-sm">Equipo activo asignado a elementos operativos.{isEditor && <span className="text-primary"> Haz clic en un artículo para reportar extravío o reposición.</span>}</p></div>
        <div className="flex items-center gap-2">
          {puede('uniformes-campo','crear') && <Button variant="outline" size="sm" onClick={() => setIsPrevioOpen(true)}><PackagePlus className="w-4 h-4 mr-1.5" /> Equipo que ya traen</Button>}
          <div className="flex items-center gap-2 text-sm bg-card border border-border rounded-xl px-4 py-2"><ShieldCheck className="w-4 h-4 text-emerald-600" /><span className="font-medium">{(uniformesCampo as any[]).length}</span><span className="text-muted-foreground">operativos con equipo</span></div>
        </div>
      </div>
      {error ? <p role="alert" className="text-red-600">{error.message} <Button onClick={() => refetch()}>Reintentar</Button></p> : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{[1,2,3].map(i => <div key={i} className="h-48 rounded-xl border border-border bg-card animate-pulse" />)}</div>
      ) : (uniformesCampo as any[]).length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 mt-8 border-2 border-dashed border-border rounded-xl bg-card/50">
          <ShieldCheck className="w-12 h-12 text-muted-foreground/30 mb-4" /><h3 className="font-semibold text-lg">No hay uniformes asignados en campo</h3>
          <p className="text-muted-foreground text-sm max-w-sm text-center mt-1">Registra salidas con concepto "Asignación en Campo" para que aparezcan aquí.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
          {(uniformesCampo as any[]).map((guardia: any) => (
            <Card key={guardia.guardiaId} className="flex flex-col">
              <CardHeader className="pb-3 flex flex-row items-center gap-3 bg-muted/40 rounded-t-xl border-b border-border">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><User className="w-5 h-5" /></div>
                <div><CardTitle className="text-base leading-tight">{guardia.nombreGuardia}</CardTitle><p className="text-xs text-muted-foreground mt-0.5">{guardia.articulos.length} artículo{guardia.articulos.length !== 1 ? 's' : ''} en campo</p></div>
              </CardHeader>
              <CardContent className="pt-3 flex-1 space-y-1 p-3">
                {guardia.articulos.map((item: any, idx: number) => (
                  <button key={idx} onClick={() => isEditor && !guardia.sinResponsable && openModal(guardia, item)} disabled={!isEditor || guardia.sinResponsable}
                    className={`w-full flex items-center justify-between text-sm p-2.5 rounded-lg transition-colors text-left ${isEditor ? 'hover:bg-accent/10 hover:border-accent/30 border border-transparent cursor-pointer group' : 'cursor-default'}`}>
                    <div className="flex flex-col min-w-0"><span className="font-medium text-foreground truncate">{item.articulo}</span><span className="text-xs text-muted-foreground">{fmtDate(item.fecha)}</span></div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {item.talla && <span className="text-[10px] font-semibold bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">T: {item.talla}</span>}
                      <span className="font-bold tabular-nums text-foreground">×{item.cantidad}</span>
                      {isEditor && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-accent transition-colors" />}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={!!modal} onOpenChange={open => { if (!open) setModal(null); }} className="max-w-md">
        <DialogContent>
          {(errorPrendas || errorDetalle) && <p role="alert" className="text-red-600">No se pudo consultar catálogo o existencias. <Button onClick={() => queryClient.invalidateQueries()}>Reintentar</Button></p>}
          <DialogHeader>
            <DialogTitle>Gestionar artículo en campo</DialogTitle>
            <DialogDescription><span className="font-semibold text-foreground">{modal?.nombreGuardia}</span>{' · '}<span>{modal?.articulo}</span>{modal?.talla && <span> — Talla <strong>{modal.talla}</strong></span>}<span className="ml-1 text-muted-foreground">(×{modal?.cantidadEnCampo} en campo)</span></DialogDescription>
          </DialogHeader>
          <div className="space-y-5 mt-1">
            <div className="space-y-2">
              <label className="field-label">¿Qué ocurrió?</label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setTipo('Extravío')} className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${tipo === 'Extravío' ? 'border-red-500 bg-red-50 text-red-700' : 'border-border bg-card hover:border-red-300 hover:bg-red-50/50'}`}>
                  <AlertTriangle className={`w-6 h-6 ${tipo === 'Extravío' ? 'text-red-600' : 'text-muted-foreground'}`} />
                  <div className="text-center"><p className="text-sm font-bold">Extravío</p><p className="text-[10px] text-muted-foreground leading-snug mt-0.5">El guardia perdió el artículo</p></div>
                </button>
                <button type="button" onClick={() => setTipo('Reposición')} className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${tipo === 'Reposición' ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-border bg-card hover:border-violet-300 hover:bg-violet-50/50'}`}>
                  <RotateCcw className={`w-6 h-6 ${tipo === 'Reposición' ? 'text-violet-600' : 'text-muted-foreground'}`} />
                  <div className="text-center"><p className="text-sm font-bold">Reposición</p><p className="text-[10px] text-muted-foreground leading-snug mt-0.5">Lo devuelve y recibe uno nuevo</p></div>
                </button>
              </div>
            </div>
            {tipo === 'Reposición' && (
              <div className="space-y-2">
                <label className="field-label">Estado del artículo devuelto</label>
                <div className="grid grid-cols-3 gap-2">
                  {([{ val: 'Nuevo', label: 'Nuevo', desc: 'Sin uso', color: 'emerald' }, { val: 'Usado', label: 'Usado', desc: 'Funcional', color: 'amber' }, { val: 'Para Baja', label: 'Para Baja', desc: 'Desechar', color: 'red' }] as const).map(op => (
                    <button key={op.val} type="button" onClick={() => setEstadoDevolucion(op.val)} className={`flex flex-col items-center p-2.5 rounded-xl border-2 text-center transition-all ${estadoDevolucion === op.val ? `border-${op.color}-500 bg-${op.color}-50 text-${op.color}-700` : 'border-border bg-card hover:border-primary/30'}`}>
                      <p className="text-xs font-bold">{op.label}</p><p className="text-[10px] text-muted-foreground">{op.desc}</p>
                    </button>
                  ))}
                </div>
                <div className="pt-2 border-t border-border mt-3"><label className="field-label">Estado del nuevo entregado</label>
                  <Select value={estadoEntregado} onChange={e => setEstadoEntregado(e.target.value as any)} className="mt-1.5"><option value="Nuevo">Entregar Nuevo</option><option value="Usado">Entregar Usado</option></Select>
                </div>
              </div>
            )}
            {tipo === 'Extravío' && <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>El artículo será marcado como extraviado y se descontará del inventario permanentemente.</span></div>}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                {tipo === 'Reposición' && <div className="space-y-2 mb-3"><label className="field-label">Talla del reemplazo</label><Select value={tallaNueva} onChange={e=>setTallaNueva(e.target.value)}>{!prendas.find(p=>p.nombre===modal?.articulo)?.requiere_talla && <option value="">Sin talla</option>}{(prendas.find(p=>p.nombre===modal?.articulo)?.tallas || []).map((t: string)=><option key={t}>{t}</option>)}</Select><p className="text-xs text-muted-foreground">Disponible: {detalle.find(d=>d.articulo===modal?.articulo && (d.talla || '')===tallaNueva)?.[estadoEntregado==='Nuevo'?'almacenNuevo':'almacenUsado'] ?? 0} · Se devuelve la talla {modal?.talla || 'única'}.</p></div>}
                <label className="field-label">Cantidad <span className="text-muted-foreground font-normal">(máx. {modal?.cantidadEnCampo})</span></label>
                <div className="flex items-center gap-1">
                  <button type="button" className="w-8 h-9 rounded-l-lg border border-border bg-muted text-sm font-bold hover:bg-muted/70 transition-colors" onClick={() => setCantidad(c => Math.max(1, c - 1))}>−</button>
                  <Input type="number" min="1" max={modal?.cantidadEnCampo ?? 1} value={cantidad} onChange={e => setCantidad(Math.min(modal?.cantidadEnCampo ?? 1, Math.max(1, Number(e.target.value))))} className="h-9 text-center rounded-none border-x-0 px-1" />
                  <button type="button" className="w-8 h-9 rounded-r-lg border border-border bg-muted text-sm font-bold hover:bg-muted/70 transition-colors" onClick={() => setCantidad(c => Math.min(modal?.cantidadEnCampo ?? 1, c + 1))}>+</button>
                </div>
              </div>
              <div className="space-y-1.5"><label className="field-label">Fecha del evento</label><Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="h-9" /></div>
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setModal(null)} disabled={isPending}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isPending || !tipo} className={tipo === 'Extravío' ? 'bg-red-600 hover:bg-red-700 text-white' : tipo === 'Reposición' ? 'bg-violet-600 hover:bg-violet-700 text-white' : ''}>
              {isPending ? 'Guardando...' : tipo === 'Extravío' ? 'Confirmar Extravío' : tipo === 'Reposición' ? 'Confirmar Reposición' : 'Selecciona tipo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <EquipoPrevioDialog open={isPrevioOpen} onOpenChange={setIsPrevioOpen} />
    </div>
  );
}
