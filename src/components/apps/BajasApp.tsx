'use client';
import { useState, useMemo } from 'react';
import { apiFetch } from '@/src/lib/api';
import { useAuth } from '@/src/context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Input } from '@/src/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import { Select } from '@/src/components/ui/select';
import { CheckCircle2, ShieldAlert, FileText, Check, X, Search, CheckCheck } from 'lucide-react';
import { fmtDate } from '@/src/lib/utils';
import { toast } from 'sonner';

export default function BajasApp() {
  const { isEditor } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'Pendiente' | 'Completada'>('Pendiente');
  const [selectedBaja, setSelectedBaja] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [returnStates, setReturnStates] = useState<Record<number, string>>({});

  const { data: bajas = [], isLoading } = useQuery({ queryKey: ['bajas'], queryFn: () => apiFetch<any[]>('/api/bajas') });

  const filterData = useMemo(() => {
    const byTab = (bajas as any[]).filter((b: any) => tab === 'Pendiente' ? b.estado_general !== 'Completada' : b.estado_general === 'Completada');
    if (!searchTerm.trim()) return byTab;
    const term = searchTerm.toLowerCase();
    return byTab.filter((b: any) => b.nombre_guardia?.toLowerCase().includes(term) || b.numero_elemento?.toLowerCase().includes(term));
  }, [bajas, tab, searchTerm]);

  const processMutation = useMutation({
    mutationFn: (payload: { bajaId: number, salida_id: number, accion: string, cantidadItem: number, estadoFisicoDevolucion?: string }) =>
      apiFetch<{ allCompleted: boolean }>(`/api/bajas/${payload.bajaId}/process`, { method: 'POST', body: JSON.stringify({ salida_id: payload.salida_id, accion: payload.accion, cantidadItem: payload.cantidadItem, estadoFisicoDevolucion: payload.estadoFisicoDevolucion }) }),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bajas'] }); queryClient.invalidateQueries({ queryKey: ['inventario'] }); queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] }); queryClient.invalidateQueries({ queryKey: ['guardias'] });
      if (selectedBaja) {
        const updatedBaja = { ...selectedBaja, checklist: [...selectedBaja.checklist] };
        const itemIndex = updatedBaja.checklist.findIndex((c: any) => c.salida_id === variables.salida_id);
        if (itemIndex > -1) {
          updatedBaja.checklist[itemIndex] = { ...updatedBaja.checklist[itemIndex], estado: variables.accion };
          if (variables.accion === 'Devuelto') updatedBaja.checklist[itemIndex].cantidad_devuelta = variables.cantidadItem;
          if (variables.accion === 'Extraviado') updatedBaja.checklist[itemIndex].cantidad_extraviada = variables.cantidadItem;
        }
        if (data.allCompleted) { updatedBaja.estado_general = 'Completada'; toast.success(`Proceso de baja completado`); setTimeout(() => setSelectedBaja(null), 1800); }
        setSelectedBaja(updatedBaja);
      }
      if (!data.allCompleted) toast.success(`Artículo marcado como ${variables.accion}`);
    },
    onError: () => toast.error('Error al procesar el artículo'),
  });

  const handleProcessItem = (salida_id: number, accion: string, cantidadItem: number) => {
    if (!selectedBaja) return;
    const estadoFisicoDevolucion = accion === 'Devuelto' ? (returnStates[salida_id] || 'Usado') : undefined;
    processMutation.mutate({ bajaId: selectedBaja.id, salida_id, accion, cantidadItem, estadoFisicoDevolucion });
  };

  const handleMarkAllDevuelto = async () => {
    if (!selectedBaja) return;
    const pending = (selectedBaja.checklist as any[]).filter((c: any) => c.estado === 'Pendiente');
    for (const item of pending) {
      await new Promise<void>(resolve => processMutation.mutate({ bajaId: selectedBaja.id, salida_id: item.salida_id, accion: 'Devuelto', cantidadItem: item.cantidad_adeudada, estadoFisicoDevolucion: returnStates[item.salida_id] || 'Usado' }, { onSettled: () => resolve() }));
    }
  };

  const calculateProgress = (baja: any) => { if (!baja?.checklist?.length) return 100; const completed = (baja.checklist as any[]).filter((c: any) => c.estado !== 'Pendiente').length; return Math.round((completed / baja.checklist.length) * 100); };
  const pendingItemsCount = selectedBaja ? (selectedBaja.checklist as any[]).filter((c: any) => c.estado === 'Pendiente').length : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div><h1 className="text-2xl font-bold tracking-tight">Procesos de Baja</h1><p className="text-muted-foreground mt-0.5 text-sm">Gestión del checklist de equipo adeudado por guardias dados de baja.</p></div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div className="flex space-x-0 border-b border-border">
          <button className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'Pendiente' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`} onClick={() => setTab('Pendiente')}>
            Pendientes
            {(bajas as any[]).filter((b: any) => b.estado_general !== 'Completada').length > 0 && <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4">{(bajas as any[]).filter((b: any) => b.estado_general !== 'Completada').length}</span>}
          </button>
          <button className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'Completada' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`} onClick={() => setTab('Completada')}>Completadas</button>
        </div>
        <div className="relative max-w-xs w-full"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Buscar por guardia o elemento..." className="pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm print:hidden">
        <Table>
          <TableHeader><TableRow><TableHead>Fecha Inicio</TableHead><TableHead>Guardia</TableHead><TableHead>Nº Elemento</TableHead><TableHead>Progreso</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Acción</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
              : filterData.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No hay procesos en esta categoría.</TableCell></TableRow>
              : filterData.map((item: any) => {
                const progress = calculateProgress(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{fmtDate(item.fecha)}</TableCell>
                    <TableCell className="font-medium">{item.nombre_guardia}</TableCell>
                    <TableCell className="text-muted-foreground">{item.numero_elemento}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-muted rounded-full h-2"><div className={`h-2 rounded-full transition-all ${progress === 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${progress}%` }} /></div>
                        <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant={item.estado_general === 'Completada' ? 'success' : item.estado_general === 'En Proceso' ? 'default' : 'outline'}>{item.estado_general}</Badge></TableCell>
                    <TableCell className="text-right"><Button variant="secondary" size="sm" onClick={() => setSelectedBaja(item)}>{item.estado_general === 'Completada' || !isEditor ? 'Ver Detalles' : 'Procesar'}</Button></TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>
      {selectedBaja && (
        <Dialog open={!!selectedBaja} onOpenChange={open => !open && setSelectedBaja(null)} className="max-w-2xl">
          <DialogContent className="max-h-[90vh] overflow-y-auto print:max-w-full print:shadow-none print:bg-white print:text-black print:p-0 print:border-none">
            <div id="print-area">
              <DialogHeader className="print:mb-8">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <DialogTitle className="text-xl print:text-black">Checklist — {selectedBaja.nombre_guardia}</DialogTitle>
                    <DialogDescription className="print:text-gray-600 mt-1">Elemento: <span className="font-medium">{selectedBaja.numero_elemento}</span> &nbsp;·&nbsp; Fecha: {fmtDate(selectedBaja.fecha)}</DialogDescription>
                  </div>
                  <Badge variant={selectedBaja.estado_general === 'Completada' ? 'success' : 'outline'} className="print:hidden shrink-0">{selectedBaja.estado_general}</Badge>
                </div>
              </DialogHeader>
              {selectedBaja.checklist?.length > 0 && (
                <div className="mt-4 p-3 bg-muted/50 rounded-lg flex items-center justify-between print:hidden">
                  <span className="text-sm text-muted-foreground">{(selectedBaja.checklist as any[]).filter((c: any) => c.estado !== 'Pendiente').length} de {selectedBaja.checklist.length} artículos procesados</span>
                  {isEditor && pendingItemsCount > 0 && selectedBaja.estado_general !== 'Completada' && (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleMarkAllDevuelto} disabled={processMutation.isPending}><CheckCheck className="w-4 h-4 mr-1.5" />Marcar todos como Devuelto</Button>
                  )}
                </div>
              )}
              <div className="mt-4 space-y-3">
                {selectedBaja.checklist?.length > 0 ? (
                  (selectedBaja.checklist as any[]).map((c: any, index: number) => (
                    <div key={index} className={`p-4 border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${c.estado === 'Devuelto' ? 'bg-emerald-50 border-emerald-200' : c.estado === 'Extraviado' ? 'bg-red-50 border-red-200' : 'bg-card border-border'}`}>
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-foreground">{c.cantidad_adeudada}× {c.articulo}{c.talla ? <span className="font-normal text-muted-foreground ml-1.5">(Talla {c.talla})</span> : null}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{c.estado === 'Pendiente' && 'Pendiente de resolución'}{c.estado === 'Devuelto' && `Devuelto — ${c.cantidad_devuelta ?? c.cantidad_adeudada} unid.`}{c.estado === 'Extraviado' && `Extraviado — ${c.cantidad_extraviada ?? c.cantidad_adeudada} unid.`}</p>
                      </div>
                      <div className="print:hidden flex items-center gap-2 shrink-0">
                        {c.estado === 'Pendiente' && isEditor ? (
                          <>
                            <Select value={returnStates[c.salida_id] || 'Usado'} onChange={e => setReturnStates(prev => ({ ...prev, [c.salida_id]: e.target.value }))} className="h-8 text-xs w-28">
                              <option value="Nuevo">Nuevo</option><option value="Usado">Usado</option><option value="Inutilizable">Inutilizable</option><option value="Para Baja">Para Baja</option>
                            </Select>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleProcessItem(c.salida_id, 'Devuelto', c.cantidad_adeudada)} disabled={processMutation.isPending}><Check className="w-3.5 h-3.5 mr-1" /> Devuelto</Button>
                            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => handleProcessItem(c.salida_id, 'Extraviado', c.cantidad_adeudada)} disabled={processMutation.isPending}><X className="w-3.5 h-3.5 mr-1" /> Extraviado</Button>
                          </>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${c.estado === 'Devuelto' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                            {c.estado === 'Devuelto' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}{c.estado}
                          </span>
                        )}
                      </div>
                      <div className="hidden print:block border-2 border-gray-400 p-2 text-center w-28 text-xs">{c.estado === 'Pendiente' ? '☐  Firma' : '✓ Procesado'}</div>
                    </div>
                  ))
                ) : <p className="text-muted-foreground italic text-sm text-center py-4">Sin equipo en campo asignado.</p>}
              </div>
              <div className="hidden print:block mt-16 pt-8 border-t border-gray-300">
                <div className="flex justify-between px-12">
                  <div className="text-center"><div className="w-48 border-b border-black mb-2" /><p className="text-sm">Firma del Guardia</p></div>
                  <div className="text-center"><div className="w-48 border-b border-black mb-2" /><p className="text-sm">Supervisor / Almacén</p></div>
                </div>
              </div>
            </div>
            <DialogFooter className="print:hidden mt-4">
              <Button type="button" variant="outline" onClick={() => setSelectedBaja(null)}>Cerrar</Button>
              <Button type="button" variant="secondary" onClick={() => window.print()}><FileText className="w-4 h-4 mr-2" /> Imprimir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
