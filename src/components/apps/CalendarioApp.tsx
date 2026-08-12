'use client';
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { useAuth } from '@/src/context/AuthContext';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select } from '@/src/components/ui/select';
import { Textarea } from '@/src/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import { Badge } from '@/src/components/ui/badge';
import { ChevronLeft, ChevronRight, Plus, Trash2, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { fmtDate } from '@/src/lib/utils';

interface Evento {
  id: number;
  titulo: string;
  descripcion: string | null;
  fecha_inicio: string;
  todo_el_dia: number;
  creado_por: number;
  guardia_id?: number | null;
  notificar_minutos_antes: number | null;
}

interface Guardia { id: number; nombre: string; numero_elemento: string }

interface Incidencia {
  id: number;
  guardia_id: number;
  tipo: string;
  gravedad: string;
  fecha: string;
  descripcion: string;
  estado: string;
}

const GRAVEDAD_BADGE: Record<string, 'default' | 'secondary' | 'destructive'> = { Leve: 'secondary', Moderada: 'default', Grave: 'destructive' };
const TIPOS_INCIDENCIA = ['Falta', 'Retardo', 'Reporte', 'Accidente', 'Llamada de atención', 'Otro'];

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function isoLocal(date: Date) {
  const tz = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tz).toISOString().slice(0, 16);
}

export default function CalendarioApp() {
  const { user, isAdmin, isEditor } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'calendario' | 'incidencias'>('calendario');
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Evento | null>(null);
  const [form, setForm] = useState({ titulo: '', descripcion: '', fecha_inicio: '', notificar_minutos_antes: '', guardia_id: '' });

  const [incModalOpen, setIncModalOpen] = useState(false);
  const [incFiltroGuardia, setIncFiltroGuardia] = useState('');
  const [incForm, setIncForm] = useState({ guardia_id: '', tipo: 'Falta', gravedad: 'Leve', fecha: new Date().toISOString().split('T')[0], descripcion: '' });

  const { data: guardias = [] } = useQuery({ queryKey: ['guardias'], queryFn: () => apiFetch<Guardia[]>('/api/guardias') });
  const guardiaById = useMemo(() => Object.fromEntries(guardias.map((g) => [g.id, g])), [guardias]);

  const { data: incidencias = [], isLoading: loadingIncidencias } = useQuery({
    queryKey: ['incidencias', incFiltroGuardia],
    queryFn: () => apiFetch<Incidencia[]>(`/api/incidencias${incFiltroGuardia ? `?guardia_id=${incFiltroGuardia}` : ''}`),
    enabled: tab === 'incidencias',
  });

  const createIncMutation = useMutation({
    mutationFn: (payload: any) => apiFetch('/api/incidencias', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['incidencias'] }); toast.success('Incidencia registrada'); setIncModalOpen(false); setIncForm({ guardia_id: '', tipo: 'Falta', gravedad: 'Leve', fecha: new Date().toISOString().split('T')[0], descripcion: '' }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const resolverIncMutation = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) => apiFetch(`/api/incidencias/${id}`, { method: 'PUT', body: JSON.stringify({ estado }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['incidencias'] }); toast.success('Incidencia actualizada'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleIncSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!incForm.guardia_id || !incForm.descripcion) return;
    createIncMutation.mutate({ ...incForm, guardia_id: Number(incForm.guardia_id) });
  };

  const inicioMes = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const finMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);

  const { data: eventos = [] } = useQuery({
    queryKey: ['eventos', inicioMes.toISOString()],
    queryFn: () => apiFetch<Evento[]>(`/api/eventos?desde=${inicioMes.toISOString()}&hasta=${finMes.toISOString()}`),
  });

  const eventosPorDia = useMemo(() => {
    const map: Record<string, Evento[]> = {};
    for (const ev of eventos) {
      const key = new Date(ev.fecha_inicio).toDateString();
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [eventos]);

  const proximosEventos = useMemo(() => {
    const now = Date.now();
    return [...eventos].filter((e) => new Date(e.fecha_inicio).getTime() >= now).sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio)).slice(0, 8);
  }, [eventos]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['eventos'] });

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch('/api/eventos', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { invalidate(); toast.success('Evento creado'); setModalOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: any) => apiFetch(`/api/eventos/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => { invalidate(); toast.success('Evento actualizado'); setModalOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/eventos/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); toast.success('Evento eliminado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = (day?: Date) => {
    setEditing(null);
    setForm({ titulo: '', descripcion: '', fecha_inicio: isoLocal(day ?? new Date()), notificar_minutos_antes: '15', guardia_id: '' });
    setModalOpen(true);
  };
  const openEdit = (ev: Evento) => {
    setEditing(ev);
    setForm({
      titulo: ev.titulo,
      descripcion: ev.descripcion ?? '',
      fecha_inicio: isoLocal(new Date(ev.fecha_inicio)),
      notificar_minutos_antes: ev.notificar_minutos_antes != null ? String(ev.notificar_minutos_antes) : '',
      guardia_id: ev.guardia_id != null ? String(ev.guardia_id) : '',
    });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      titulo: form.titulo,
      descripcion: form.descripcion || null,
      fecha_inicio: new Date(form.fecha_inicio).toISOString(),
      notificar_minutos_antes: form.notificar_minutos_antes ? Number(form.notificar_minutos_antes) : null,
      guardia_id: form.guardia_id ? Number(form.guardia_id) : null,
    };
    if (editing) updateMutation.mutate({ id: editing.id, ...payload });
    else createMutation.mutate(payload);
  };

  const puedeEditar = (ev: Evento) => isAdmin || ev.creado_por === user?.id;

  const diasGrid = useMemo(() => {
    const primerDiaSemana = inicioMes.getDay();
    const totalDias = finMes.getDate();
    const dias: (Date | null)[] = [];
    for (let i = 0; i < primerDiaSemana; i++) dias.push(null);
    for (let d = 1; d <= totalDias; d++) dias.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    return dias;
  }, [cursor]);

  const hoy = new Date().toDateString();

  return (
    <div className="flex flex-col h-full -m-4 sm:-m-6 lg:-m-8 p-4 sm:p-6 lg:p-8">
      <div className="flex border-b border-border mb-4 flex-shrink-0 overflow-x-auto scroll-touch no-scrollbar">
        <button onClick={() => setTab('calendario')} className={`flex-shrink-0 px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === 'calendario' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Calendario</button>
        <button onClick={() => setTab('incidencias')} className={`flex-shrink-0 px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === 'incidencias' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>Incidencias por guardia</button>
      </div>

      {tab === 'calendario' ? (
        <div className="flex flex-col lg:flex-row flex-1 gap-4 min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-base sm:text-lg font-bold truncate">{MESES[cursor.getMonth()]} {cursor.getFullYear()}</h2>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Button size="sm" variant="outline" aria-label="Mes anterior" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="w-4 h-4" /></Button>
                <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>Hoy</Button>
                <Button size="sm" variant="outline" aria-label="Mes siguiente" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="w-4 h-4" /></Button>
                <Button size="sm" aria-label="Nuevo evento" onClick={() => openCreate(selectedDay ?? undefined)}>
                  <Plus className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Nuevo evento</span>
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground mb-1">
              {DIAS.map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1 flex-1">
              {diasGrid.map((day, i) => {
                if (!day) return <div key={i} />;
                const key = day.toDateString();
                const evs = eventosPorDia[key] || [];
                const isToday = key === hoy;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(day)}
                    onDoubleClick={() => openCreate(day)}
                    className={`border border-border rounded-lg p-1 sm:p-1.5 text-left flex flex-col gap-0.5 min-h-[54px] sm:min-h-[64px] overflow-hidden hover:border-primary/40 transition-colors ${isToday ? 'bg-primary/5 border-primary/40' : 'bg-card'} ${selectedDay?.toDateString() === key ? 'ring-2 ring-primary/40' : ''}`}
                  >
                    <span className={`text-xs font-semibold ${isToday ? 'text-primary' : ''}`}>{day.getDate()}</span>
                    {evs.slice(0, 2).map((ev) => (
                      <span key={ev.id} className="text-[10px] bg-primary/10 text-primary rounded px-1 truncate">{ev.titulo}</span>
                    ))}
                    {evs.length > 2 && <span className="text-[10px] text-muted-foreground">+{evs.length - 2} más</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-full lg:w-72 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-border pt-4 lg:pt-0 lg:pl-4 space-y-3 overflow-y-auto scroll-touch">
            <h3 className="text-sm font-semibold">Próximos eventos</h3>
            {proximosEventos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin eventos próximos</p>
            ) : (
              proximosEventos.map((ev) => (
                <div key={ev.id} className="p-3 rounded-lg border border-border bg-card">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-tight">{ev.titulo}</p>
                    {puedeEditar(ev) && (
                      <button onClick={() => deleteMutation.mutate(ev.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(ev.fecha_inicio).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  {ev.guardia_id && <p className="text-xs text-primary mt-0.5">{guardiaById[ev.guardia_id]?.nombre ?? `Guardia #${ev.guardia_id}`}</p>}
                  {puedeEditar(ev) && <button onClick={() => openEdit(ev)} className="text-xs text-primary mt-1.5 hover:underline">Editar</button>}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Select value={incFiltroGuardia} onChange={(e) => setIncFiltroGuardia(e.target.value)} className="max-w-xs">
              <option value="">Todos los guardias</option>
              {guardias.map((g) => <option key={g.id} value={g.id}>{g.nombre} ({g.numero_elemento})</option>)}
            </Select>
            {isEditor && <Button size="sm" onClick={() => setIncModalOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> Registrar incidencia</Button>}
          </div>
          <div className="flex-1 overflow-y-auto space-y-2">
            {loadingIncidencias ? (
              <p className="text-sm text-muted-foreground text-center py-8">Cargando incidencias...</p>
            ) : incidencias.length === 0 ? (
              <div className="text-center border border-border border-dashed rounded-xl py-10 text-muted-foreground">
                <AlertTriangle className="w-7 h-7 mx-auto mb-2 text-muted-foreground/60" />
                <p className="text-sm font-medium">Sin incidencias registradas.</p>
              </div>
            ) : incidencias.map((inc) => (
              <div key={inc.id} className="p-3 rounded-lg border border-border bg-card flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{guardiaById[inc.guardia_id]?.nombre ?? `Guardia #${inc.guardia_id}`}</p>
                    <Badge variant={GRAVEDAD_BADGE[inc.gravedad] ?? 'secondary'}>{inc.gravedad}</Badge>
                    <Badge variant="outline">{inc.tipo}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{inc.descripcion}</p>
                  <p className="text-xs text-muted-foreground mt-1">{fmtDate(inc.fecha)}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <Badge variant={inc.estado === 'Resuelta' ? 'success' : 'default'}>{inc.estado}</Badge>
                  {isEditor && inc.estado === 'Abierta' && (
                    <button onClick={() => resolverIncMutation.mutate({ id: inc.id, estado: 'Resuelta' })} className="text-xs text-primary hover:underline">Marcar resuelta</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader><DialogTitle>{editing ? 'Editar evento' : 'Nuevo evento'}</DialogTitle><DialogDescription>Los eventos son visibles para todo el equipo</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><label className="text-sm font-medium">Título</label><Input value={form.titulo} onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))} required /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Fecha y hora</label><Input type="datetime-local" value={form.fecha_inicio} onChange={(e) => setForm((f) => ({ ...f, fecha_inicio: e.target.value }))} required /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Descripción</label><Textarea value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} rows={3} /></div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Guardia relacionado (opcional)</label>
                <Select value={form.guardia_id} onChange={(e) => setForm((f) => ({ ...f, guardia_id: e.target.value }))}>
                  <option value="">Sin asignar</option>
                  {guardias.map((g) => <option key={g.id} value={g.id}>{g.nombre} ({g.numero_elemento})</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Recordatorio</label>
                <Select value={form.notificar_minutos_antes} onChange={(e) => setForm((f) => ({ ...f, notificar_minutos_antes: e.target.value }))}>
                  <option value="">Sin recordatorio</option>
                  <option value="15">15 minutos antes</option>
                  <option value="30">30 minutos antes</option>
                  <option value="60">1 hora antes</option>
                  <option value="1440">1 día antes</option>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{editing ? 'Guardar' : 'Crear'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={incModalOpen} onOpenChange={setIncModalOpen}>
        <DialogContent>
          <form onSubmit={handleIncSubmit}>
            <DialogHeader><DialogTitle>Registrar incidencia</DialogTitle><DialogDescription>Queda asociada al expediente del guardia.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Guardia</label>
                <Select value={incForm.guardia_id} onChange={(e) => setIncForm((f) => ({ ...f, guardia_id: e.target.value }))} required>
                  <option value="">Selecciona un guardia...</option>
                  {guardias.map((g) => <option key={g.id} value={g.id}>{g.nombre} ({g.numero_elemento})</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tipo</label>
                  <Select value={incForm.tipo} onChange={(e) => setIncForm((f) => ({ ...f, tipo: e.target.value }))}>
                    {TIPOS_INCIDENCIA.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Gravedad</label>
                  <Select value={incForm.gravedad} onChange={(e) => setIncForm((f) => ({ ...f, gravedad: e.target.value }))}>
                    <option value="Leve">Leve</option>
                    <option value="Moderada">Moderada</option>
                    <option value="Grave">Grave</option>
                  </Select>
                </div>
              </div>
              <div className="space-y-2"><label className="text-sm font-medium">Fecha</label><Input type="date" value={incForm.fecha} onChange={(e) => setIncForm((f) => ({ ...f, fecha: e.target.value }))} required /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Descripción</label><Textarea value={incForm.descripcion} onChange={(e) => setIncForm((f) => ({ ...f, descripcion: e.target.value }))} rows={3} required /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIncModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createIncMutation.isPending}>Registrar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
