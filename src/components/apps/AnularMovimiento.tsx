'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { fmtDate } from '@/src/lib/utils';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/src/components/ui/dialog';
import { toast } from 'sonner';

type Vista = { puede: boolean; bloqueo?: string; tipo?: string; fecha?: string; usuario?: string; filas?: number };

export default function AnularMovimiento({ tabla, id }: { tabla: 'entradas' | 'salidas'; id: number }) {
  const [open,setOpen] = useState(false); const [motivo,setMotivo] = useState(''); const qc = useQueryClient();
  // Qué se deshace depende de la historia de la fila (captura original, extravío, devolución…): lo dice el servidor.
  const vista = useQuery({ queryKey: ['anularVista', tabla, id], queryFn: () => apiFetch<Vista>(`/api/inventario/anular?tabla=${tabla}&id=${id}`), enabled: open });
  const mutation = useMutation({ mutationFn: () => apiFetch<{ mensaje: string }>('/api/inventario/anular', { method: 'POST', body: JSON.stringify({ tabla,id,motivo }) }),
    onSuccess: r => { ['entradas','salidas','inventario','inventarioDetalle','uniformesCampo','expediente','dashboardMetrics','inventarioHistorial','anularVista'].forEach(k => qc.invalidateQueries({ queryKey:[k] })); setOpen(false); toast.success(r.mensaje); }, onError: (e: Error) => toast.error(e.message) });
  const v = vista.data;
  return <><Button size="sm" variant="outline" onClick={() => { setMotivo(''); setOpen(true); }}>Anular</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent>
    <DialogHeader><DialogTitle>Anular movimiento</DialogTitle><DialogDescription>Se deshace la última operación vigente sobre este movimiento, con todo lo que ella creó o cambió (por ejemplo un extravío, una devolución o la captura original). El historial se conserva y después puedes volver a capturarlo bien.</DialogDescription></DialogHeader>
    {vista.isLoading && <p className="text-sm text-muted-foreground">Revisando qué se deshará…</p>}
    {vista.error && <p role="alert" className="text-sm text-red-600">{vista.error.message}</p>}
    {v?.puede && <p className="rounded-lg bg-muted p-3 text-sm">Se deshará la operación <strong>«{v.tipo}»</strong> del {fmtDate(v.fecha!)}, registrada por {v.usuario}{(v.filas ?? 0) > 1 ? ` (${v.filas} movimientos relacionados)` : ''}.</p>}
    {v && !v.puede && <p role="alert" className="text-sm text-red-600">{v.bloqueo}</p>}
    <label>Motivo<Input value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder="Describe el error de captura" /></label>
    <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button><Button disabled={mutation.isPending || vista.isFetching || !v?.puede || motivo.trim().length<5} onClick={()=>mutation.mutate()}>Confirmar anulación</Button></DialogFooter>
  </DialogContent></Dialog></>;
}
