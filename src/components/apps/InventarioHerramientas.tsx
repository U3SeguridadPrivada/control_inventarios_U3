'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { useAuth } from '@/src/context/AuthContext';
import { fechaMexico } from '@/src/lib/fecha';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select } from '@/src/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/src/components/ui/dialog';
import { toast } from 'sonner';
import type { InventarioDetalleRow, InventarioResumenRow } from '@/src/lib/inventario';

export default function InventarioHerramientas({ prendas, detalle, corte, onCorte }: { prendas: InventarioResumenRow[]; detalle: InventarioDetalleRow[]; corte: string; onCorte: (v: string) => void }) {
  const { puede } = useAuth(); const qc = useQueryClient();
  const [modal, setModal] = useState<'ajuste' | 'historial' | null>(null);
  const [antes, setAntes] = useState<number | undefined>();
  const [articulo, setArticulo] = useState(''); const [talla, setTalla] = useState('');
  const [estado, setEstado] = useState('Nuevo'); const [contado, setContado] = useState(''); const [motivo, setMotivo] = useState('');
  const historial = useQuery({ queryKey: ['inventarioHistorial', antes], queryFn: () => apiFetch<{ desde: string; eventos: any[] }>('/api/inventario/historial' + (antes ? '?antes=' + antes : '')) });
  const prenda = prendas.find(p => p.articulo === articulo);
  const fila = detalle.find(d => d.articulo === articulo && (d.talla || '') === talla);
  const saldo = estado === 'Nuevo' ? fila?.almacenNuevo ?? 0 : estado === 'Usado' ? fila?.almacenUsado ?? 0 : fila?.almacenInutilizable ?? 0;
  const mutation = useMutation({
    mutationFn: () => apiFetch<{ diferencia: number }>('/api/inventario/ajuste', { method: 'POST', body: JSON.stringify({ articulo, talla: talla || null, estado, contado: Number(contado), saldo_esperado: saldo, motivo }) }),
    onSuccess: r => { ['inventario', 'inventarioDetalle', 'inventarioHistorial', 'dashboardMetrics'].forEach(k => qc.invalidateQueries({ queryKey: [k] })); toast.success('Conteo registrado. Diferencia: ' + r.diferencia); setModal(null); },
    onError: (e: Error) => { toast.error(e.message); qc.invalidateQueries({ queryKey: ['inventarioDetalle'] }); },
  });
  return <div className="rounded-xl border bg-card p-4 space-y-3">
    <div className="flex flex-wrap gap-3 items-end">
      <label className="text-sm space-y-1">Corte al cierre del día<Input aria-label="Fecha de corte" type="date" min={historial.data?.desde} max={fechaMexico()} value={corte} onChange={e => onCorte(e.target.value)} /></label>
      {corte && <Button variant="outline" onClick={() => onCorte('')}>Ver saldo actual</Button>}
      <Button variant="outline" onClick={() => { setAntes(undefined); setModal('historial'); }}>Bitácora de movimientos</Button>
      {puede('inventario', 'editar') && !corte && <Button variant="outline" onClick={() => { setContado(''); setMotivo(''); setModal('ajuste'); }}>Ajuste por conteo físico</Button>}
    </div>
    <p className="text-xs text-muted-foreground">{historial.data ? 'Cortes verificables desde ' + historial.data.desde + '. ' : ''}Los totales y las descargas corresponden a los filtros y al corte seleccionado. El tablero muestra los movimientos actuales.</p>
    {historial.error && <p role="alert" className="text-sm text-red-600">{historial.error.message} <button onClick={() => historial.refetch()}>Reintentar bitácora</button></p>}
    <Dialog open={modal === 'ajuste'} onOpenChange={o => !o && setModal(null)}><DialogContent><DialogHeader><DialogTitle>Ajuste por conteo físico</DialogTitle><DialogDescription>Captura el total contado en almacén para esta talla y estado. Se registra la diferencia con motivo y autor.</DialogDescription></DialogHeader>
      <form className="space-y-3" onSubmit={e => { e.preventDefault(); mutation.mutate(); }}>
        <label className="block text-sm">Artículo<Select required value={articulo} onChange={e => { setArticulo(e.target.value); setTalla(''); setContado(''); }}><option value="">Seleccionar</option>{prendas.map(p => <option key={p.articulo} value={p.articulo}>{p.articulo}{p.archivada ? ' (archivada)' : ''}</option>)}</Select></label>
        {prenda?.requiereTalla && <label className="block text-sm">Talla<Select required value={talla} onChange={e => setTalla(e.target.value)}><option value="">Seleccionar</option>{prenda.tallas?.map(t => <option key={t}>{t}</option>)}</Select></label>}
        <label className="block text-sm">Estado<Select value={estado} onChange={e => setEstado(e.target.value)}><option>Nuevo</option><option>Usado</option><option>Inutilizable</option></Select></label>
        <p className="text-sm">Saldo registrado: <strong>{saldo}</strong></p>
        <label className="block text-sm">Total físico contado<Input required type="number" min="0" max="1000000" step="1" value={contado} onChange={e => setContado(e.target.value)} /></label>
        <label className="block text-sm">Motivo y referencia del conteo<Input required minLength={5} value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
        <Button type="submit" disabled={mutation.isPending}>Registrar conteo</Button>
      </form>
    </DialogContent></Dialog>
    <Dialog open={modal === 'historial'} onOpenChange={o => !o && setModal(null)} className="max-w-3xl"><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Bitácora de inventario</DialogTitle><DialogDescription>Fecha operativa, registro del cambio, autor y valores antes y después.</DialogDescription></DialogHeader>
      {historial.isLoading && <p>Cargando…</p>}
      {historial.data?.eventos.map(e => <details key={e.id} className="border rounded p-3 text-sm"><summary className={'cursor-pointer' + (e.deshecho_por && e.deshecho_por !== e.operacion_id ? ' text-muted-foreground line-through' : '')}>{e.fecha} · {e.usuario} · {e.motivo || e.accion} · {e.tabla} #{e.registro_id}{e.deshecho_por && e.deshecho_por !== e.operacion_id ? ' · deshecho' : ''}</summary><p className="text-xs my-2">Registrado: {new Date(e.registrado_en).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })} · Operación {e.operacion_id || 'histórica'}</p><div className="grid sm:grid-cols-2 gap-2">{[['Antes', e.antes], ['Después', e.despues]].map(([label, value]) => <div key={label}><strong>{label}</strong><pre className="whitespace-pre-wrap break-all text-xs bg-muted p-2">{value ? JSON.stringify(JSON.parse(value), null, 2) : 'Sin registro'}</pre></div>)}</div></details>)}
      <div className="flex gap-2"><Button variant="outline" disabled={!antes} onClick={() => setAntes(undefined)}>Más recientes</Button><Button variant="outline" disabled={historial.data?.eventos.length !== 100} onClick={() => setAntes(historial.data!.eventos.at(-1).id)}>Anteriores</Button></div>
    </DialogContent></Dialog>
  </div>;
}
