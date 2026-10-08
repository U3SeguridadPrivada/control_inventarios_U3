'use client';
import { fechaMexico } from '@/src/lib/fecha';
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select } from '@/src/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Renglon = { articulo: string; talla: string; cantidad: number; estado: 'Nuevo' | 'Usado' };
const renglonVacio = (): Renglon => ({ articulo: '', talla: '', cantidad: 1, estado: 'Usado' });

/**
 * Registra el equipo que un guardia ya trae de antes de usar el sistema. No sale del almacén
 * (nunca estuvo en él): deja al guardia con el equipo a su cargo para que luego pueda
 * devolverlo, reponerlo o reportarlo extraviado como cualquier otra asignación.
 */
export default function EquipoPrevioDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [guardiaId, setGuardiaId] = useState('');
  const [fecha, setFecha] = useState(fechaMexico());
  const [renglones, setRenglones] = useState<Renglon[]>([renglonVacio()]);

  const { data: guardias = [], error: errorGuardias } = useQuery({ queryKey: ['guardias'], queryFn: () => apiFetch<any[]>('/api/guardias') });
  const { data: prendas = [], error: errorPrendas } = useQuery({ queryKey: ['prendas'], queryFn: () => apiFetch<any[]>('/api/prendas?solo_activas=1') });
  const { data: campo = [], error: errorCampo } = useQuery({ queryKey: ['uniformesCampo'], queryFn: () => apiFetch<any[]>('/api/uniformes-campo'), enabled: open });
  const activos = useMemo(() => (guardias as any[]).filter(g => g.estado === 'Activo'), [guardias]);

  useEffect(() => {
    if (open) { setGuardiaId(''); setFecha(fechaMexico()); setRenglones([renglonVacio()]); }
  }, [open]);

  const prendaDe = (nombre: string) => (prendas as any[]).find(p => p.nombre === nombre);
  const actualizar = (i: number, cambios: Partial<Renglon>) => setRenglones(prev => prev.map((r, idx) => idx === i ? { ...r, ...cambios } : r));

  const mutation = useMutation({
    mutationFn: (items: any[]) => apiFetch<{ registradas: number; piezas: number }>('/api/salidas/equipo-previo', { method: 'POST', body: JSON.stringify({ guardia_id: Number(guardiaId), fecha, items }) }),
    onSuccess: (r) => {
      ['uniformesCampo', 'salidas', 'entradas', 'inventario', 'inventarioDetalle', 'dashboardMetrics', 'expediente', 'inventarioHistorial'].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(`Equipo previo registrado: ${r.piezas} pieza(s)`);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!guardiaId) { toast.error('Selecciona el guardia'); return; }
    const capturados = renglones.filter(r => r.articulo);
    if (capturados.length === 0) { toast.error('Agrega al menos un artículo'); return; }
    for (const r of capturados) {
      if (prendaDe(r.articulo)?.requiere_talla && !r.talla) { toast.error(`Selecciona la talla de "${r.articulo}"`); return; }
      if (!Number.isInteger(r.cantidad) || r.cantidad <= 0) { toast.error(`Cantidad inválida para "${r.articulo}"`); return; }
    }
    mutation.mutate(capturados.map(r => ({ articulo: r.articulo, talla: r.talla || null, cantidad: r.cantidad, estado_fisico: r.estado })));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar equipo que ya traen</DialogTitle>
          <DialogDescription>Para el equipo que el guardia recibió antes del sistema. No se descuenta del almacén.</DialogDescription>
        </DialogHeader>
        {(errorGuardias || errorPrendas || errorCampo) && <p role="alert">No se pudo consultar la información. <Button onClick={() => queryClient.invalidateQueries()}>Reintentar</Button></p>}
        {guardiaId && <div className="text-sm bg-muted p-3 rounded">Equipo ya registrado: {campo.filter((g: any) => String(g.guardiaId) === guardiaId).flatMap((g: any) => g.articulos).map((i: any) => i.articulo + ' ' + (i.talla || '') + ': ' + i.cantidad).join(', ') || 'Sin asignaciones'}. Captura solo piezas adicionales.</div>}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><label className="field-label">Guardia</label>
            <Select value={guardiaId} onChange={e => setGuardiaId(e.target.value)}><option value="">— Seleccionar —</option>{activos.map((g: any) => <option key={g.id} value={g.id}>{g.nombre}{g.numero_elemento ? ` · ${g.numero_elemento}` : ''}</option>)}</Select>
          </div>
          <div className="space-y-1.5"><label className="field-label">Fecha de entrega</label><Input type="date" max={fechaMexico()} value={fecha} onChange={e => setFecha(e.target.value)} /></div>
        </div>
        <div className="space-y-2">
          {renglones.map((r, i) => {
            const prenda = prendaDe(r.articulo);
            const tallas: string[] = prenda?.requiere_talla && Array.isArray(prenda.tallas) ? prenda.tallas : [];
            return (
              <div key={i} className="grid grid-cols-[1fr_5.5rem_4rem_6rem_auto] gap-2 items-center">
                <Select value={r.articulo} onChange={e => actualizar(i, { articulo: e.target.value, talla: '' })}>
                  <option value="">— Artículo —</option>{(prendas as any[]).map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                </Select>
                {prenda?.requiere_talla ? (
                  <Select value={r.talla} onChange={e => actualizar(i, { talla: e.target.value })}><option value="">Talla</option>{tallas.map(t => <option key={t} value={t}>{t}</option>)}</Select>
                ) : <span className="text-xs text-muted-foreground text-center">{r.articulo ? 'sin talla' : ''}</span>}
                <Input type="number" min="1" value={r.cantidad} onChange={e => actualizar(i, { cantidad: Number(e.target.value) })} className="text-center px-1" />
                <Select value={r.estado} onChange={e => actualizar(i, { estado: e.target.value as any })}><option value="Nuevo">Nuevo</option><option value="Usado">Usado</option></Select>
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600" onClick={() => setRenglones(prev => prev.length === 1 ? [renglonVacio()] : prev.filter((_, idx) => idx !== i))} title="Quitar renglón"><Trash2 className="w-4 h-4" /></Button>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" onClick={() => setRenglones(prev => [...prev, renglonVacio()])}><Plus className="w-4 h-4 mr-1.5" /> Agregar artículo</Button>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={handleSubmit} disabled={mutation.isPending || !!errorGuardias || !!errorPrendas || !!errorCampo}>{mutation.isPending ? 'Guardando...' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
