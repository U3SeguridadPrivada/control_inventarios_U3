'use client';
import { fechaMexico } from '@/src/lib/fecha';
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import { toast } from 'sonner';

type Cantidades = { nuevo: string; usado: string; inutilizable: string };

/**
 * Captura de un jalón lo que ya hay físicamente en el almacén (el conteo en papel): un renglón
 * por prenda y talla, con columnas Nuevo / Usado / Inutilizable. Cada cantidad capturada se
 * registra como una entrada con motivo "Existencia Inicial".
 */
export default function CargaInicialAlmacen({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [fecha, setFecha] = useState(fechaMexico());
  const [valores, setValores] = useState<Record<string, Cantidades>>({});

  const { data: prendas = [], error: errorPrendas } = useQuery({ queryKey: ['prendas'], queryFn: () => apiFetch<any[]>('/api/prendas?solo_activas=1') });
  const { data: detalle = [], error: errorDetalle } = useQuery({ queryKey: ['inventarioDetalle'], queryFn: () => apiFetch<any[]>('/api/inventario/detalle'), enabled: open });

  useEffect(() => {
    if (open) { setValores({}); setFecha(fechaMexico()); }
  }, [open]);

  const existente = useMemo(() => {
    const m: Record<string, { n: number; u: number; i: number }> = {};
    for (const d of detalle as any[]) m[`${d.articulo}|||${d.talla ?? ''}`] = { n: d.almacenNuevo ?? 0, u: d.almacenUsado ?? 0, i: d.almacenInutilizable ?? 0 };
    return m;
  }, [detalle]);

  const renglones = useMemo(() => (prendas as any[]).map((p) => ({
    articulo: p.nombre as string,
    tallas: p.requiere_talla ? ((Array.isArray(p.tallas) ? p.tallas : []) as string[]) : [''],
    sinTallas: Boolean(p.requiere_talla) && (!Array.isArray(p.tallas) || p.tallas.length === 0),
  })), [prendas]);

  const setValor = (key: string, campo: keyof Cantidades, v: string) =>
    setValores(prev => ({ ...prev, [key]: { ...(prev[key] ?? { nuevo: '', usado: '', inutilizable: '' }), [campo]: v } }));

  const items = useMemo(() => Object.entries(valores).map(([key, v]) => {
    const [articulo, talla] = key.split('|||');
    return { articulo, talla: talla || null, nuevo: v.nuevo, usado: v.usado, inutilizable: v.inutilizable };
  }).filter(i => [i.nuevo, i.usado, i.inutilizable].some(x => x !== '')), [valores]);

  const totalPiezas = items.reduce((a, i) => a + (Number(i.nuevo) || 0) + (Number(i.usado) || 0) + (Number(i.inutilizable) || 0), 0);

  const mutation = useMutation({
    mutationFn: () => apiFetch<{ creadas: number; piezas: number }>('/api/entradas/lote', { method: 'POST', body: JSON.stringify({ fecha, items }) }),
    onSuccess: (r) => {
      ['entradas', 'inventario', 'inventarioDetalle', 'dashboardMetrics', 'inventarioHistorial'].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(`Carga inicial registrada: ${r.piezas} pieza(s) en ${r.creadas} movimiento(s)`);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (items.length === 0) { toast.error('Captura al menos una cantidad'); return; }
    if (items.some(i => [i.nuevo, i.usado, i.inutilizable].some(x => !Number.isSafeInteger(Number(x)) || Number(x) < 0))) { toast.error('Captura únicamente cantidades enteras de cero en adelante'); return; }
    mutation.mutate();
  };

  const celda = (key: string, campo: keyof Cantidades) => (
    <Input type="number" min="0" inputMode="numeric" value={valores[key]?.[campo] ?? ''} onChange={e => setValor(key, campo, e.target.value)} className="h-8 w-16 text-center px-1 text-sm" placeholder="0" />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Carga inicial de almacén</DialogTitle>
          <DialogDescription>Captura lo que hay físicamente hoy en el almacén. Se suma a lo ya registrado, así que no repitas lo que ya cargaste.</DialogDescription>
        </DialogHeader>
        {(errorPrendas || errorDetalle) && <p role="alert">No se pudo consultar el catálogo o saldo. <Button onClick={() => queryClient.invalidateQueries()}>Reintentar</Button></p>}
        <div className="space-y-1.5 max-w-[12rem]"><label className="field-label">Fecha del conteo</label><Input type="date" max={fechaMexico()} value={fecha} onChange={e => setFecha(e.target.value)} /></div>
        <div className="space-y-4">
          {renglones.length === 0 && <p className="text-sm text-muted-foreground">No hay prendas en el catálogo. Da de alta las prendas primero en Inventario → Catálogo.</p>}
          {renglones.map((r) => (
            <div key={r.articulo} className="border border-border rounded-xl overflow-hidden">
              <div className="bg-muted/50 px-3 py-2 text-sm font-semibold">{r.articulo}</div>
              {r.sinTallas ? (
                <p className="px-3 py-2 text-xs text-amber-600">Esta prenda pide talla pero no tiene tallas configuradas. Agrégalas en Inventario → Catálogo.</p>
              ) : (
                <div className="divide-y divide-border">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground items-center">
                    <span>{r.tallas[0] === '' ? '' : 'Talla'}</span><span className="w-16 text-center text-emerald-700">Nuevo</span><span className="w-16 text-center text-blue-700">Usado</span><span className="w-16 text-center text-red-700">Inutil.</span>
                  </div>
                  {r.tallas.map((t) => {
                    const key = `${r.articulo}|||${t}`;
                    const ya = existente[key];
                    return (
                      <div key={key} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-3 py-1.5 items-center">
                        <div className="text-sm">
                          {t === '' ? 'Única / sin talla' : t}
                          {ya && (ya.n + ya.u + ya.i > 0) && <span className="ml-2 text-[11px] text-muted-foreground">ya hay: {ya.n}N · {ya.u}U · {ya.i}I</span>}
                        </div>
                        {celda(key, 'nuevo')}{celda(key, 'usado')}{celda(key, 'inutilizable')}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={handleSubmit} disabled={mutation.isPending || !!errorPrendas || !!errorDetalle || items.length === 0}>{mutation.isPending ? 'Guardando...' : `Registrar${totalPiezas > 0 ? ` (${totalPiezas} piezas)` : ''}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
