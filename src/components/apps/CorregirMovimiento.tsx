'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select } from '@/src/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/src/components/ui/dialog';
import { toast } from 'sonner';

type Tabla = 'entradas' | 'salidas';

/** Movimientos de un solo paso que se pueden corregir en el lugar; el servidor tiene la última palabra. */
export function puedeCorregir(tabla: Tabla, fila: any): boolean {
  if (fila.anulado || fila.salida_origen_id) return false;
  if (tabla === 'entradas') return ['Compra', 'Existencia Inicial', 'Ingreso externo'].includes(fila.motivo);
  return (fila.concepto === 'Uniforme en Campo' && fila.estado_asignacion === 'Uniforme en Campo')
    || (fila.concepto === 'Inutilizable' && fila.estado_asignacion === 'N/A');
}

export default function CorregirMovimiento({ tabla, fila }: { tabla: Tabla; fila: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [cantidad, setCantidad] = useState('');
  const [talla, setTalla] = useState('');
  const [estado, setEstado] = useState('');
  const [motivo, setMotivo] = useState('');
  const estadoActual: string = (tabla === 'entradas' ? fila.estado : fila.estado_fisico) || 'Nuevo';
  const catalogo = useQuery({ queryKey: ['catalogoPrendas'], queryFn: () => apiFetch<any[]>('/api/prendas'), enabled: open });
  const prenda = (catalogo.data ?? []).find(p => p.nombre === fila.articulo);
  const usaTalla = Boolean(prenda?.requiere_talla);
  // Lo que sale de almacén hacia un guardia solo puede ser Nuevo o Usado; una compra o una baja por daño, también Inutilizable.
  const soloEntregable = (tabla === 'salidas' && fila.concepto === 'Uniforme en Campo') || String(fila.origen_devolucion ?? '').startsWith('Equipo previo en campo de');
  const estados = soloEntregable ? ['Nuevo', 'Usado'] : ['Nuevo', 'Usado', 'Inutilizable'];
  // Sin catálogo cargado no se toca la talla: se conserva la actual.
  const tallaFinal = prenda ? (usaTalla ? talla : '') : (fila.talla ?? '');
  const sinCambios = Number(cantidad) === fila.cantidad && tallaFinal === (fila.talla ?? '') && estado === estadoActual;
  const valida = Number.isSafeInteger(Number(cantidad)) && Number(cantidad) >= 1 && Number(cantidad) <= 1000000 && motivo.trim().length >= 5 && (!usaTalla || !!talla);

  const abrir = () => { setCantidad(String(fila.cantidad)); setTalla(fila.talla ?? ''); setEstado(estadoActual); setMotivo(''); setOpen(true); };
  const mutation = useMutation({
    mutationFn: () => apiFetch<{ mensaje: string }>('/api/inventario/corregir', { method: 'POST', body: JSON.stringify({ tabla, id: fila.id, cantidad: Number(cantidad), talla: tallaFinal || null, estado, motivo }) }),
    onSuccess: r => {
      ['entradas', 'salidas', 'inventario', 'inventarioDetalle', 'uniformesCampo', 'expediente', 'dashboardMetrics', 'inventarioHistorial', 'anularVista'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
      setOpen(false); toast.success(r.mensaje);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return <><Button size="sm" variant="outline" onClick={abrir}>Corregir</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent>
      <form onSubmit={e => { e.preventDefault(); if (valida && !sinCambios) mutation.mutate(); }}>
        <DialogHeader>
          <DialogTitle>Corregir movimiento</DialogTitle>
          <DialogDescription>Cambia la cantidad, la talla o el estado. Queda en la bitácora con tu nombre, el motivo y los valores anteriores. Si ya hubo devoluciones, extravíos u otros cambios sobre estas piezas, primero deshazlos con «Anular».</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-4">
          <p className="rounded-lg bg-muted p-3 text-sm">Ahora: <strong>{fila.articulo}</strong>{fila.talla ? ` · talla ${fila.talla}` : ''} · {fila.cantidad} pieza(s) · {estadoActual}</p>
          {catalogo.error && <p role="alert" className="text-sm text-red-600">No se pudo consultar el catálogo: la talla se conservará tal cual.</p>}
          <label>Cantidad correcta<Input type="number" min={1} max={1000000} step={1} required value={cantidad} onChange={e => setCantidad(e.target.value)} /></label>
          {usaTalla && <label>Talla<Select value={talla} required onChange={e => setTalla(e.target.value)}><option value="">Seleccionar talla</option>{(prenda?.tallas ?? []).map((t: string) => <option key={t}>{t}</option>)}</Select></label>}
          <label>Estado físico<Select value={estado} onChange={e => setEstado(e.target.value)}>{estados.map(s => <option key={s}>{s}</option>)}</Select></label>
          <label>Motivo de la corrección<Input required minLength={5} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. Se capturaron 10 pero eran 5" /></label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="submit" disabled={mutation.isPending || !valida || sinCambios}>Guardar corrección</Button>
        </DialogFooter>
      </form>
    </DialogContent></Dialog></>;
}
