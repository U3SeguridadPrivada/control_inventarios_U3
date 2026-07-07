'use client';
import { useState, useMemo } from 'react';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { Select } from '@/src/components/ui/select';
import { Badge } from '@/src/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import { Plus, ShoppingCart } from 'lucide-react';
import { fmtDate } from '@/src/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';

interface Cliente { id: number; nombre: string; empresa: string | null }
interface Venta { id: number; folio: string; cliente_id: number; fecha: string; monto_total: number; estado: string; metodo_pago: string | null; notas: string | null }

const fmtMoney = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ESTADO_BADGE: Record<string, 'default' | 'secondary' | 'success' | 'destructive'> = { Pendiente: 'default', Pagada: 'success', Cancelada: 'destructive' };
const FORM_INICIAL = { cliente_id: '', fecha: new Date().toISOString().split('T')[0], monto_total: '', metodo_pago: '', notas: '' };

export default function VentasApp() {
  const { isEditor } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'listado' | 'reportes'>('listado');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);

  const { data: ventas = [], isLoading } = useQuery({ queryKey: ['ventas'], queryFn: () => apiFetch<Venta[]>('/api/ventas') });
  const { data: clientes = [] } = useQuery({ queryKey: ['clientes'], queryFn: () => apiFetch<Cliente[]>('/api/clientes') });
  const clienteById = useMemo(() => Object.fromEntries(clientes.map((c) => [c.id, c])), [clientes]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ventas'] });

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch('/api/ventas', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { invalidate(); toast.success('Venta registrada'); setModalOpen(false); setForm(FORM_INICIAL); },
    onError: (e: Error) => toast.error(e.message),
  });
  const estadoMutation = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) => apiFetch(`/api/ventas/${id}`, { method: 'PUT', body: JSON.stringify({ estado }) }),
    onSuccess: () => { invalidate(); toast.success('Estado actualizado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cliente_id || !form.monto_total) return;
    createMutation.mutate({ ...form, cliente_id: Number(form.cliente_id), monto_total: Number(form.monto_total) });
  };

  const reportes = useMemo(() => {
    const pagadas = ventas.filter((v) => v.estado === 'Pagada');
    const totalPagado = pagadas.reduce((acc, v) => acc + v.monto_total, 0);
    const totalPendiente = ventas.filter((v) => v.estado === 'Pendiente').reduce((acc, v) => acc + v.monto_total, 0);
    const porMes: Record<string, number> = {};
    for (const v of pagadas) {
      const mes = v.fecha.slice(0, 7);
      porMes[mes] = (porMes[mes] ?? 0) + v.monto_total;
    }
    const chartData = Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b)).map(([mes, total]) => ({ mes, Ventas: Math.round(total * 100) / 100 }));
    return { totalPagado, totalPendiente, totalVentas: ventas.length, chartData };
  }, [ventas]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight">Ventas</h1><p className="text-sm text-muted-foreground mt-0.5">Registro de ventas y reportes</p></div>
        {isEditor && <Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4 mr-2" /> Nueva venta</Button>}
      </div>

      <div className="flex border-b border-border">
        <button onClick={() => setTab('listado')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'listado' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Listado</button>
        <button onClick={() => setTab('reportes')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === 'reportes' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Reportes</button>
      </div>

      {tab === 'listado' ? (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Cargando...</TableCell></TableRow>
                : ventas.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Sin ventas registradas.</TableCell></TableRow>
                : ventas.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-bold">{v.folio}</TableCell>
                    <TableCell>{clienteById[v.cliente_id]?.nombre ?? '—'}</TableCell>
                    <TableCell>{fmtDate(v.fecha)}</TableCell>
                    <TableCell className="text-right font-medium">{fmtMoney(v.monto_total)}</TableCell>
                    <TableCell className="text-muted-foreground">{v.metodo_pago || '—'}</TableCell>
                    <TableCell>
                      {isEditor ? (
                        <Select value={v.estado} onChange={(e) => estadoMutation.mutate({ id: v.id, estado: e.target.value })} className="h-8 text-xs w-32">
                          <option value="Pendiente">Pendiente</option>
                          <option value="Pagada">Pagada</option>
                          <option value="Cancelada">Cancelada</option>
                        </Select>
                      ) : <Badge variant={ESTADO_BADGE[v.estado] ?? 'secondary'}>{v.estado}</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground">Total cobrado</p><p className="text-2xl font-bold text-emerald-700 mt-1">{fmtMoney(reportes.totalPagado)}</p></div>
            <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground">Pendiente de cobro</p><p className="text-2xl font-bold text-amber-700 mt-1">{fmtMoney(reportes.totalPendiente)}</p></div>
            <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground">Ventas registradas</p><p className="text-2xl font-bold mt-1">{reportes.totalVentas}</p></div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Ventas pagadas por mes</h3>
            <div className="h-[260px]">
              {reportes.chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">Aún no hay ventas pagadas para graficar</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reportes.chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                    <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                    <ChartTooltip contentStyle={{ background: '#fff', borderColor: 'var(--color-border)', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: '12px' }} />
                    <Bar dataKey="Ventas" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader><DialogTitle className="flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-primary" /> Nueva venta</DialogTitle><DialogDescription>El folio se genera automáticamente.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Cliente</label>
                <Select value={form.cliente_id} onChange={(e) => setForm((f) => ({ ...f, cliente_id: e.target.value }))} required>
                  <option value="">Selecciona un cliente...</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.empresa ? ` (${c.empresa})` : ''}</option>)}
                </Select>
              </div>
              <div className="space-y-2"><label className="text-sm font-medium">Fecha</label><Input type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} required /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Monto total</label><Input type="number" min={0} step="0.01" value={form.monto_total} onChange={(e) => setForm((f) => ({ ...f, monto_total: e.target.value }))} required /></div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Método de pago</label>
                <Select value={form.metodo_pago} onChange={(e) => setForm((f) => ({ ...f, metodo_pago: e.target.value }))}>
                  <option value="">Sin especificar</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Cheque">Cheque</option>
                </Select>
              </div>
              <div className="space-y-2"><label className="text-sm font-medium">Notas</label><Textarea value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} rows={2} /></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={createMutation.isPending}>Registrar venta</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
