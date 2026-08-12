'use client';
import { useMemo, useState } from 'react';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { Select } from '@/src/components/ui/select';
import { Badge } from '@/src/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import {
  UserPlus, Briefcase, Phone, MapPin, CalendarClock, MessageCircle,
  Edit, Trash2, ShieldCheck, KanbanSquare, ArrowRight, FileText, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';
import { generarPdfConFallback } from '@/src/lib/generatePdfBlob';
import { buildReporteReclutamientoHtml } from '@/src/lib/reporteReclutamientoTemplate';
import DocumentViewerModal from '@/src/components/DocumentViewerModal';

interface Candidato {
  id: number;
  nombre: string | null;
  telefono: string;
  ciudad: string | null;
  edad: number | null;
  experiencia: string | null;
  vacante_id: number | null;
  vacante_puesto?: string | null;
  etapa: string;
  etapa_actualizada_en: string | null;
  fecha_entrevista: string | null;
  guardia_id: number | null;
  origen: string | null;
  notas: string | null;
  created_at: string | null;
}

interface MensajeChat { id: number; rol: string; mensaje: string; created_at: string | null }

interface Vacante {
  id: number;
  puesto: string;
  ubicacion: string | null;
  turno: string | null;
  sueldo: string | null;
  requisitos: string | null;
  descripcion: string | null;
  activa: number;
}

const ETAPAS = ['Nuevo', 'Contactado', 'Documentos', 'Entrevista', 'Contratado', 'Rechazado'] as const;

const ETAPA_COLORS: Record<string, string> = {
  Nuevo: 'bg-sky-500/10 text-sky-600 border-sky-500/30',
  Contactado: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  Documentos: 'bg-violet-500/10 text-violet-600 border-violet-500/30',
  Entrevista: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  Contratado: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
  Rechazado: 'bg-rose-500/10 text-rose-600 border-rose-500/30',
};

const VACANTE_FORM_INICIAL = { puesto: '', ubicacion: '', turno: '', sueldo: '', requisitos: '', descripcion: '', activa: true };

function formatFechaHora(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Convierte la fecha almacenada (formato naïve del bot "YYYY-MM-DDTHH:MM:SS") al valor
// que espera un <input type="datetime-local"> ("YYYY-MM-DDTHH:MM").
function toInputDateTime(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(iso);
  if (m) return `${m[1]}T${m[2]}`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// ---------------- Detalle de candidato ----------------
function CandidatoDetalle({ candidato, vacantes, onClose }: { candidato: Candidato; vacantes: Vacante[]; onClose: () => void }) {
  const { isEditor, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [numeroElemento, setNumeroElemento] = useState('');
  const [notas, setNotas] = useState(candidato.notas ?? '');
  const [form, setForm] = useState({
    nombre: candidato.nombre ?? '',
    ciudad: candidato.ciudad ?? '',
    edad: candidato.edad ? String(candidato.edad) : '',
    experiencia: candidato.experiencia ?? '',
    vacante_id: candidato.vacante_id ? String(candidato.vacante_id) : '',
    etapa: candidato.etapa,
    fecha_entrevista: toInputDateTime(candidato.fecha_entrevista),
  });

  const { data: detalle } = useQuery({
    queryKey: ['candidato', candidato.id],
    queryFn: () => apiFetch<Candidato & { conversacion: MensajeChat[] }>(`/api/candidatos/${candidato.id}`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['candidatos'] });
    queryClient.invalidateQueries({ queryKey: ['candidato', candidato.id] });
  };

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiFetch(`/api/candidatos/${candidato.id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => { invalidate(); toast.success('Candidato actualizado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const convertirMutation = useMutation({
    mutationFn: () => apiFetch(`/api/candidatos/${candidato.id}/convertir`, { method: 'POST', body: JSON.stringify({ numero_elemento: numeroElemento }) }),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['guardias'] });
      toast.success('Candidato contratado y dado de alta como guardia');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/api/candidatos/${candidato.id}`, { method: 'DELETE' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['candidatos'] }); toast.success('Candidato eliminado'); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const guardar = () => updateMutation.mutate({
    nombre: form.nombre || null,
    ciudad: form.ciudad || null,
    edad: form.edad || null,
    experiencia: form.experiencia || null,
    vacante_id: form.vacante_id || null,
    etapa: form.etapa,
    fecha_entrevista: form.fecha_entrevista ? `${form.fecha_entrevista}:00` : null,
    notas: notas || null,
  });

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>{candidato.nombre || `Candidato ${candidato.telefono}`}</DialogTitle>
        <DialogDescription className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {candidato.telefono}</span>
          <span>Origen: {candidato.origen || 'WhatsApp'}</span>
          {candidato.fecha_entrevista && <span className="flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Entrevista: {formatFechaHora(candidato.fecha_entrevista)}</span>}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 py-2">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Nombre</label><Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} disabled={!isEditor} /></div>
            <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Ciudad</label><Input value={form.ciudad} onChange={(e) => setForm((f) => ({ ...f, ciudad: e.target.value }))} disabled={!isEditor} /></div>
            <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Edad</label><Input type="number" value={form.edad} onChange={(e) => setForm((f) => ({ ...f, edad: e.target.value }))} disabled={!isEditor} /></div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Etapa</label>
              <Select value={form.etapa} onChange={(e) => setForm((f) => ({ ...f, etapa: e.target.value }))} disabled={!isEditor}>
                {ETAPAS.map((et) => <option key={et} value={et}>{et}</option>)}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Vacante de interés</label>
            <Select value={form.vacante_id} onChange={(e) => setForm((f) => ({ ...f, vacante_id: e.target.value }))} disabled={!isEditor}>
              <option value="">Sin vacante</option>
              {vacantes.map((v) => <option key={v.id} value={v.id}>{v.puesto}{v.ubicacion ? ` — ${v.ubicacion}` : ''}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Fecha y hora de entrevista</label>
            <Input type="datetime-local" value={form.fecha_entrevista} onChange={(e) => setForm((f) => ({ ...f, fecha_entrevista: e.target.value }))} disabled={!isEditor} />
            <p className="text-[11px] text-muted-foreground">Ajusta aquí la cita si el bot la agendó en un día equivocado. Déjala vacía para quitarla.</p>
          </div>
          <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Experiencia</label><Textarea rows={2} value={form.experiencia} onChange={(e) => setForm((f) => ({ ...f, experiencia: e.target.value }))} disabled={!isEditor} /></div>
          <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Notas del reclutador</label><Textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} disabled={!isEditor} /></div>

          {isEditor && !candidato.guardia_id && (
            <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold flex items-center gap-1.5 text-emerald-600"><ShieldCheck className="w-4 h-4" /> Contratar: convertir a guardia</p>
              <div className="flex gap-2">
                <Input placeholder="Número de elemento" value={numeroElemento} onChange={(e) => setNumeroElemento(e.target.value)} />
                <Button size="sm" disabled={!numeroElemento || convertirMutation.isPending} onClick={() => convertirMutation.mutate()}>
                  <ArrowRight className="w-3.5 h-3.5 mr-1" /> Alta
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">Crea el guardia con los datos del candidato y lo marca como Contratado.</p>
            </div>
          )}
          {candidato.guardia_id && <Badge variant="success">Ya es guardia (ID {candidato.guardia_id})</Badge>}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground"><MessageCircle className="w-4 h-4" /> Conversación de WhatsApp</p>
          <div className="border border-border rounded-lg bg-muted/30 h-[340px] overflow-y-auto p-3 space-y-2">
            {!detalle?.conversacion?.length ? (
              <p className="text-xs text-muted-foreground text-center pt-8">Sin mensajes registrados todavía.</p>
            ) : detalle.conversacion.map((m) => (
              <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-xs whitespace-pre-wrap ${m.rol === 'user' ? 'bg-card border border-border' : 'bg-primary/10 text-foreground ml-auto'}`}>
                {m.mensaje}
                <div className="text-[10px] text-muted-foreground mt-1">{m.rol === 'user' ? 'Candidato' : 'Bot'} · {formatFechaHora(m.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter className="flex-row justify-between sm:justify-between">
        <div>
          {isAdmin && (
            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => { if (confirm('¿Eliminar este candidato?')) deleteMutation.mutate(); }}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Eliminar
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          {isEditor && <Button disabled={updateMutation.isPending} onClick={guardar}>{updateMutation.isPending ? 'Guardando...' : 'Guardar'}</Button>}
        </div>
      </DialogFooter>
    </DialogContent>
  );
}

// ---------------- Pestaña: pipeline kanban ----------------
function PipelineCandidatos({ vacantes }: { vacantes: Vacante[] }) {
  const { isEditor } = useAuth();
  const queryClient = useQueryClient();
  const [seleccionado, setSeleccionado] = useState<Candidato | null>(null);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [nuevoForm, setNuevoForm] = useState({ nombre: '', telefono: '', ciudad: '', vacante_id: '' });

  const { data: candidatosList = [], isLoading } = useQuery({ queryKey: ['candidatos'], queryFn: () => apiFetch<Candidato[]>('/api/candidatos') });

  const moverMutation = useMutation({
    mutationFn: ({ id, etapa }: { id: number; etapa: string }) => apiFetch(`/api/candidatos/${id}`, { method: 'PUT', body: JSON.stringify({ etapa }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['candidatos'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const crearMutation = useMutation({
    mutationFn: () => apiFetch('/api/candidatos', { method: 'POST', body: JSON.stringify({ ...nuevoForm, vacante_id: nuevoForm.vacante_id || null }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidatos'] });
      toast.success('Candidato registrado');
      setNuevoOpen(false);
      setNuevoForm({ nombre: '', telefono: '', ciudad: '', vacante_id: '' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const porEtapa = useMemo(() => {
    const map: Record<string, Candidato[]> = {};
    for (const et of ETAPAS) map[et] = [];
    for (const c of candidatosList) (map[c.etapa] ?? (map[c.etapa] = [])).push(c);
    return map;
  }, [candidatosList]);

  if (isLoading) return <p className="text-sm text-muted-foreground animate-pulse py-8">Cargando candidatos...</p>;

  return (
    <div className="space-y-4">
      {isEditor && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setNuevoOpen(true)}><UserPlus className="w-4 h-4 mr-1.5" /> Candidato manual</Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {ETAPAS.map((etapa) => (
          <div key={etapa} className="rounded-xl border border-border bg-card/60 flex flex-col min-h-[120px]">
            <div className={`px-3 py-2 border-b border-border flex items-center justify-between rounded-t-xl ${ETAPA_COLORS[etapa]}`}>
              <span className="text-xs font-bold">{etapa}</span>
              <span className="text-[11px] font-semibold">{porEtapa[etapa]?.length ?? 0}</span>
            </div>
            <div className="p-2 space-y-2 flex-1">
              {(porEtapa[etapa] ?? []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSeleccionado(c)}
                  className="w-full text-left rounded-lg border border-border bg-card p-2.5 hover:border-primary/50 transition-colors space-y-1"
                >
                  <p className="text-xs font-semibold line-clamp-1">{c.nombre || `Sin nombre (${c.telefono.slice(-4)})`}</p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {c.telefono}</p>
                  {c.ciudad && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> {c.ciudad}</p>}
                  {c.vacante_puesto && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Briefcase className="w-3 h-3" /> {c.vacante_puesto}</p>}
                  {c.fecha_entrevista && etapa === 'Entrevista' && (
                    <p className="text-[11px] font-medium text-blue-600 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> {formatFechaHora(c.fecha_entrevista)}</p>
                  )}
                  {isEditor && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <Select
                        className="h-7 text-[11px] mt-1"
                        value={c.etapa}
                        onChange={(e) => moverMutation.mutate({ id: c.id, etapa: e.target.value })}
                      >
                        {ETAPAS.map((et) => <option key={et} value={et}>{et}</option>)}
                      </Select>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!seleccionado} onOpenChange={(open) => { if (!open) setSeleccionado(null); }}>
        {seleccionado && <CandidatoDetalle candidato={seleccionado} vacantes={vacantes} onClose={() => setSeleccionado(null)} />}
      </Dialog>

      <Dialog open={nuevoOpen} onOpenChange={setNuevoOpen}>
        <DialogContent>
          <form onSubmit={(e) => { e.preventDefault(); crearMutation.mutate(); }}>
            <DialogHeader><DialogTitle>Registrar candidato manualmente</DialogTitle><DialogDescription>Para candidatos que llegan por otro medio (referido, bolsa de trabajo, etc.).</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><label className="text-sm font-medium">Nombre</label><Input value={nuevoForm.nombre} onChange={(e) => setNuevoForm((f) => ({ ...f, nombre: e.target.value }))} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Teléfono (WhatsApp)</label><Input value={nuevoForm.telefono} onChange={(e) => setNuevoForm((f) => ({ ...f, telefono: e.target.value }))} required /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Ciudad</label><Input value={nuevoForm.ciudad} onChange={(e) => setNuevoForm((f) => ({ ...f, ciudad: e.target.value }))} /></div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Vacante de interés</label>
                <Select value={nuevoForm.vacante_id} onChange={(e) => setNuevoForm((f) => ({ ...f, vacante_id: e.target.value }))}>
                  <option value="">Sin vacante</option>
                  {vacantes.map((v) => <option key={v.id} value={v.id}>{v.puesto}</option>)}
                </Select>
              </div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setNuevoOpen(false)}>Cancelar</Button><Button type="submit" disabled={crearMutation.isPending}>Registrar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- Pestaña: vacantes ----------------
function VacantesTab({ vacantes, isLoading }: { vacantes: Vacante[]; isLoading: boolean }) {
  const { isEditor, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vacante | null>(null);
  const [form, setForm] = useState(VACANTE_FORM_INICIAL);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['vacantes'] });

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch('/api/vacantes', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { invalidate(); toast.success('Vacante publicada — el bot ya puede ofrecerla'); setModalOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: any) => apiFetch(`/api/vacantes/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => { invalidate(); toast.success('Vacante actualizada'); setModalOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/vacantes/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); toast.success('Vacante eliminada'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm(VACANTE_FORM_INICIAL); setModalOpen(true); };
  const openEdit = (v: Vacante) => {
    setEditing(v);
    setForm({ puesto: v.puesto, ubicacion: v.ubicacion ?? '', turno: v.turno ?? '', sueldo: v.sueldo ?? '', requisitos: v.requisitos ?? '', descripcion: v.descripcion ?? '', activa: v.activa === 1 });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) updateMutation.mutate({ id: editing.id, ...form });
    else createMutation.mutate(form);
  };

  return (
    <div className="space-y-4">
      {isEditor && (
        <div className="flex justify-end">
          <Button size="sm" onClick={openCreate}><Briefcase className="w-4 h-4 mr-1.5" /> Nueva vacante</Button>
        </div>
      )}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Puesto</TableHead>
              <TableHead>Zona / Turno</TableHead>
              <TableHead>Sueldo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Cargando...</TableCell></TableRow>
              : vacantes.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Sin vacantes. Publica la primera para que el bot pueda ofrecerla.</TableCell></TableRow>
              : vacantes.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <div className="font-medium">{v.puesto}</div>
                    {v.requisitos && <div className="text-xs text-muted-foreground line-clamp-1">{v.requisitos}</div>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{[v.ubicacion, v.turno].filter(Boolean).join(' · ') || '—'}</TableCell>
                  <TableCell className="text-xs">{v.sueldo || '—'}</TableCell>
                  <TableCell><Badge variant={v.activa === 1 ? 'success' : 'secondary'}>{v.activa === 1 ? 'Activa' : 'Cerrada'}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-1.5">
                      {isEditor && (
                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => updateMutation.mutate({ ...v, id: v.id, activa: v.activa !== 1 })}>
                          {v.activa === 1 ? 'Cerrar' : 'Reabrir'}
                        </Button>
                      )}
                      {isEditor && <Button variant="ghost" size="sm" className="h-8" onClick={() => openEdit(v)}><Edit className="w-3.5 h-3.5" /></Button>}
                      {isAdmin && <Button variant="ghost" size="sm" className="h-8 text-destructive hover:bg-destructive/10" onClick={() => { if (confirm(`¿Eliminar la vacante "${v.puesto}"?`)) deleteMutation.mutate(v.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader><DialogTitle>{editing ? 'Editar vacante' : 'Nueva vacante'}</DialogTitle><DialogDescription>El bot de WhatsApp ofrece automáticamente las vacantes activas a los candidatos.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><label className="text-sm font-medium">Puesto</label><Input value={form.puesto} onChange={(e) => setForm((f) => ({ ...f, puesto: e.target.value }))} required placeholder="Guardia intramuros" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><label className="text-sm font-medium">Zona / Ciudad</label><Input value={form.ubicacion} onChange={(e) => setForm((f) => ({ ...f, ubicacion: e.target.value }))} /></div>
                <div className="space-y-2"><label className="text-sm font-medium">Turno</label><Input value={form.turno} onChange={(e) => setForm((f) => ({ ...f, turno: e.target.value }))} placeholder="12x12 diurno" /></div>
              </div>
              <div className="space-y-2"><label className="text-sm font-medium">Sueldo (texto que el bot puede decir)</label><Input value={form.sueldo} onChange={(e) => setForm((f) => ({ ...f, sueldo: e.target.value }))} placeholder="$2,200 - $2,600 semanales aprox." /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Requisitos</label><Textarea rows={2} value={form.requisitos} onChange={(e) => setForm((f) => ({ ...f, requisitos: e.target.value }))} placeholder="Mayor de edad, secundaria, disponibilidad de horario..." /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Descripción adicional</label><Textarea rows={2} value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} /></div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.activa} onChange={(e) => setForm((f) => ({ ...f, activa: e.target.checked }))} className="rounded border-border" /> Vacante activa (visible para el bot)
              </label>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{editing ? 'Guardar' : 'Publicar'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------- App principal ----------------
export default function ReclutamientoApp() {
  const [tab, setTab] = useState<'pipeline' | 'vacantes'>('pipeline');
  const { user } = useAuth();
  const { data: vacantesList = [], isLoading: loadingVacantes } = useQuery({ queryKey: ['vacantes'], queryFn: () => apiFetch<Vacante[]>('/api/vacantes') });
  const { data: candidatosList = [] } = useQuery({ queryKey: ['candidatos'], queryFn: () => apiFetch<Candidato[]>('/api/candidatos') });

  const [viewer, setViewer] = useState<{ url: string; viaFallback: boolean } | null>(null);
  const [generando, setGenerando] = useState(false);

  const generarInforme = async () => {
    setGenerando(true);
    try {
      const token = localStorage.getItem('inv_token');
      const fallbackHtml = buildReporteReclutamientoHtml({
        candidatos: candidatosList.map((c) => ({
          nombre: c.nombre, telefono: c.telefono, ciudad: c.ciudad, edad: c.edad,
          vacante_puesto: c.vacante_puesto ?? null, etapa: c.etapa,
          fecha_entrevista: c.fecha_entrevista, origen: c.origen, created_at: c.created_at,
        })),
        vacantes: vacantesList.map((v) => ({
          puesto: v.puesto, ubicacion: v.ubicacion, turno: v.turno, sueldo: v.sueldo, activa: v.activa,
        })),
        generadoPor: user?.username ?? '—',
        fecha: new Date().toISOString(),
      }, '/LOGO_PDFS.png');

      const { blob, viaFallback } = await generarPdfConFallback(
        () => fetch('/api/reclutamiento/reporte-pdf', { headers: { Authorization: `Bearer ${token}` } }),
        fallbackHtml,
      );
      setViewer({ url: URL.createObjectURL(blob), viaFallback });
      if (viaFallback) toast.warning('El servidor no respondió: se generó el informe en tu navegador como respaldo');
    } catch {
      toast.error('No se pudo generar el informe');
    } finally {
      setGenerando(false);
    }
  };

  const cerrarViewer = () => {
    if (viewer) URL.revokeObjectURL(viewer.url);
    setViewer(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reclutamiento</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Candidatos captados por el asistente de WhatsApp y vacantes publicadas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={generarInforme} disabled={generando}>
            {generando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileText className="w-4 h-4 mr-1.5" />}
            {generando ? 'Generando...' : 'Generar informe'}
          </Button>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button onClick={() => setTab('pipeline')} className={`px-4 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors ${tab === 'pipeline' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
              <KanbanSquare className="w-4 h-4" /> Candidatos
            </button>
            <button onClick={() => setTab('vacantes')} className={`px-4 py-2 text-sm font-medium flex items-center gap-1.5 transition-colors ${tab === 'vacantes' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
              <Briefcase className="w-4 h-4" /> Vacantes
            </button>
          </div>
        </div>
      </div>

      {tab === 'pipeline'
        ? <PipelineCandidatos vacantes={vacantesList} />
        : <VacantesTab vacantes={vacantesList} isLoading={loadingVacantes} />}

      {viewer && (
        <DocumentViewerModal
          title="Informe de reclutamiento"
          url={viewer.url}
          downloadName={`informe_reclutamiento_${new Date().toISOString().slice(0, 10)}.pdf`}
          viaFallback={viewer.viaFallback}
          onClose={cerrarViewer}
        />
      )}
    </div>
  );
}
