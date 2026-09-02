'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { Select } from '@/src/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import {
  Search, UserPlus, Trash2, Mail, Phone, Building2, Shuffle, ChevronLeft, ChevronRight,
  Radar, Loader2, CheckCircle2, MapPin, Target, Sparkles, Flame, Trophy,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';
import { cn } from '@/src/lib/utils';
import {
  ETAPAS, COLOR_ETAPA, COLOR_PRIORIDAD, PLANTILLAS_CORREO, PLANTILLAS_WHATSAPP, type Etapa,
} from '@/src/lib/pipeline';

export interface Prospecto {
  id: number;
  nombre: string;
  tipo: string;
  empresa: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  notas: string | null;
  etapa: string;
  asignado_a: number | null;
  asignado_nombre: string | null;
  ultimo_contacto: string | null;
  proximo_seguimiento: string | null;
  motivo_perdida: string | null;
  origen: string | null;
  id_denue: string | null;
  giro: string | null;
  codigo_scian: string | null;
  tamano: string | null;
  prioridad: string | null;
  puntaje: number | null;
  sitio_web: string | null;
  colonia: string | null;
  cp: string | null;
  alcaldia: string | null;
  latitud: string | null;
  longitud: string | null;
}

export interface Asesor { id: number; username: string }

interface Cobertura {
  lote: string;
  total: number;
  contactados: number;
  avanzados: number;
  ganados: number;
  perdidos: number;
  conCorreo: number;
  conTelefono: number;
}

interface Barrido {
  id: number;
  canal: string;
  plantilla: string;
  lote: string | null;
  objetivo: number;
  enviados: number;
  fallidos: number;
  estado: string;
  detalle: string | null;
  created_at: string;
  usuario: string | null;
}

interface Respuesta {
  total: number;
  pagina: number;
  porPagina: number;
  items: Prospecto[];
  porEtapa: { etapa: string; n: number }[];
}

interface TandaStats {
  total: number;
  nuevos: number;
  trabajados: number;
  contactados: number;
  interesados: number;
  cotizados: number;
  ganados: number;
  perdidos: number;
  porcentaje: number;
}

const FORM_INICIAL = { nombre: '', tipo: 'Prospecto', empresa: '', email: '', telefono: '', direccion: '', notas: '' };

export default function ClientesApp() {
  const router = useRouter();
  const { user, isEditor, isAdmin, puedeVer } = useAuth();
  const puedeVerClientes = puedeVer('clientes');
  const queryClient = useQueryClient();

  const [busqueda, setBusqueda] = useState('');
  const [etapa, setEtapa] = useState('Todas');
  const [asignado, setAsignado] = useState('mios');
  const [prioridad, setPrioridad] = useState('Todas');
  const [origen, setOrigen] = useState('Todos');
  const [pagina, setPagina] = useState(1);
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalBarrido, setModalBarrido] = useState(false);
  const [modalReparto, setModalReparto] = useState(false);
  const [modalTanda, setModalTanda] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);

  const filtros = new URLSearchParams({
    q: busqueda, etapa, asignado, prioridad, origen, pagina: String(pagina),
  }).toString();

  const { data, isLoading } = useQuery({
    queryKey: ['clientes', filtros],
    queryFn: () => apiFetch<Respuesta>(`/api/clientes?${filtros}`),
    enabled: puedeVerClientes,
    placeholderData: keepPreviousData,
  });

  const { data: asesores = [] } = useQuery({
    queryKey: ['asesores'],
    queryFn: () => apiFetch<Asesor[]>('/api/clientes/asesores'),
    enabled: puedeVerClientes,
  });

  const { data: cobertura = [] } = useQuery({
    queryKey: ['cobertura'],
    queryFn: () => apiFetch<Cobertura[]>('/api/clientes/cobertura'),
    enabled: puedeVerClientes,
  });

  // Mientras haya un barrido corriendo se relee seguido: es la barra de progreso.
  const { data: estadoBarrido } = useQuery({
    queryKey: ['barridos'],
    queryFn: () => apiFetch<{ recientes: Barrido[]; disponibles: number; maximo: number }>('/api/clientes/barrido'),
    enabled: puedeVerClientes,
    refetchInterval: (q) => (q.state.data?.recientes?.[0]?.estado === 'en_proceso' ? 3000 : false),
  });
  const barridoActivo = estadoBarrido?.recientes?.find((b) => b.estado === 'en_proceso');

  // Estadísticas de la tanda activa del asesor
  const { data: tandaData } = useQuery({
    queryKey: ['tanda-stats', user?.id],
    queryFn: () => apiFetch<{ ok: boolean; tanda: TandaStats; poolSinAsignar: number }>('/api/clientes/tanda'),
    enabled: puedeVerClientes,
  });
  const tandaStats = tandaData?.tanda;

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['clientes'] });
    queryClient.invalidateQueries({ queryKey: ['cobertura'] });
    queryClient.invalidateQueries({ queryKey: ['barridos'] });
    queryClient.invalidateQueries({ queryKey: ['tanda-stats'] });
  };

  const crear = useMutation({
    mutationFn: (payload: typeof FORM_INICIAL) => apiFetch('/api/clientes', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { invalidar(); toast.success('Registro creado'); setModalNuevo(false); setForm(FORM_INICIAL); },
    onError: (e: Error) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/clientes/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidar(); toast.success('Registro eliminado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const asignarSeleccion = useMutation({
    mutationFn: (asesorId: number | null) => apiFetch<{ asignados: number; asesor: string | null }>('/api/clientes/asignar', {
      method: 'POST', body: JSON.stringify({ ids: seleccion, asignado_a: asesorId }),
    }),
    onSuccess: (r) => {
      invalidar(); setSeleccion([]);
      toast.success(r.asesor ? `${r.asignados} prospectos para ${r.asesor}` : `${r.asignados} prospectos sin asignar`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = data?.items ?? [];
  const totalPaginas = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.porPagina ?? 50)));
  const conteoEtapa = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const e of data?.porEtapa ?? []) mapa.set(e.etapa, e.n);
    return mapa;
  }, [data]);

  const cambiarFiltro = (accion: () => void) => { accion(); setPagina(1); setSeleccion([]); };
  const todosSeleccionados = items.length > 0 && seleccion.length === items.length;

  // El corte va despues de los hooks: si se hace antes, React cambia la
  // cantidad de hooks entre renders y revienta al resolverse la sesion.
  if (!puedeVerClientes) {
    return <div className="p-4 text-muted-foreground">No tiene permiso para ver esta sección.</div>;
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes y Prospectos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Embudo comercial · {(data?.total ?? 0).toLocaleString('es-MX')} registros en el filtro actual
          </p>
        </div>
        {isEditor && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setModalTanda(true)} className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
              <Sparkles className="w-4 h-4 mr-2" /> Sacar Tanda (200)
            </Button>
            <a
              href="/mapa-prospectos.html"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-3"
            >
              <MapPin className="w-4 h-4 mr-2 text-sky-500" /> Ver Mapa CDMX
            </a>
            <Button variant="outline" onClick={() => setModalBarrido(true)}>
              <Radar className="w-4 h-4 mr-2" /> Barrido
            </Button>
            {isAdmin && (
              <Button variant="outline" onClick={() => setModalReparto(true)}>
                <Shuffle className="w-4 h-4 mr-2" /> Repartir cartera
              </Button>
            )}
            <Button onClick={() => setModalNuevo(true)}><UserPlus className="w-4 h-4 mr-2" /> Nuevo</Button>
          </div>
        )}
      </div>

      {/* --- Tarjeta de Tanda Activa de Trabajo con Barra de Progreso --- */}
      <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/5 via-card to-card p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-base">Mi Tanda de Trabajo Activa</h2>
              <span className="text-xs bg-primary/15 text-primary font-bold px-2.5 py-0.5 rounded-full tabular-nums">
                {tandaStats?.total ? `${tandaStats.trabajados} de ${tandaStats.total} trabajados (${tandaStats.porcentaje}%)` : 'Sin tanda activa'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Trabaja tu tanda de 200 prospectos por llamada, WhatsApp o correo. Al avanzar tu barra podrás sacar el siguiente barrido.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setModalTanda(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Sparkles className="w-4 h-4 mr-1.5" /> Sacar Nueva Tanda (200)
            </Button>
            {tandaStats && tandaStats.nuevos > 0 && (
              <Button size="sm" variant="outline" onClick={() => setModalBarrido(true)}>
                <Radar className="w-4 h-4 mr-1.5 text-sky-500" /> Barrido a mi tanda ({tandaStats.nuevos})
              </Button>
            )}
          </div>
        </div>

        {/* Barra de progreso interactiva */}
        {tandaStats && tandaStats.total > 0 ? (
          <div className="space-y-2 pt-1">
            <div className="h-3 w-full rounded-full bg-muted overflow-hidden relative">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500 transition-all duration-700"
                style={{ width: `${Math.max(tandaStats.porcentaje, 2)}%` }}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs pt-1">
              <div className="bg-slate-100 dark:bg-slate-800/60 p-2 rounded-lg text-center">
                <span className="block font-bold text-slate-800 dark:text-slate-200 text-sm tabular-nums">{tandaStats.nuevos}</span>
                <span className="text-muted-foreground text-[11px]">⏳ Pendientes</span>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/40 p-2 rounded-lg text-center">
                <span className="block font-bold text-blue-600 dark:text-blue-400 text-sm tabular-nums">{tandaStats.contactados}</span>
                <span className="text-muted-foreground text-[11px]">📩 Contactados</span>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/40 p-2 rounded-lg text-center">
                <span className="block font-bold text-amber-600 dark:text-amber-400 text-sm tabular-nums">{tandaStats.interesados}</span>
                <span className="text-muted-foreground text-[11px]">🔥 Interesados</span>
              </div>
              <div className="bg-violet-50 dark:bg-violet-950/40 p-2 rounded-lg text-center">
                <span className="block font-bold text-violet-600 dark:text-violet-400 text-sm tabular-nums">{tandaStats.cotizados}</span>
                <span className="text-muted-foreground text-[11px]">📄 Cotizados</span>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-lg text-center">
                <span className="block font-bold text-emerald-600 dark:text-emerald-400 text-sm tabular-nums">{tandaStats.ganados}</span>
                <span className="text-muted-foreground text-[11px]">🏆 Ganados</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>No tienes prospectos asignados en este momento. Elige tu giro objetivo (Condominios, Hoteles, Fábricas, etc.) y saca tu primera tanda de 200.</span>
            <Button size="sm" variant="secondary" onClick={() => setModalTanda(true)}>
              <Sparkles className="w-3.5 h-3.5 mr-1 text-primary" /> Comenzar tanda
            </Button>
          </div>
        )}
      </div>

      {/* --- Embudo --- */}
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
        <BotonEtapa activo={etapa === 'Todas'} etiqueta="Todas" total={[...conteoEtapa.values()].reduce((a, b) => a + b, 0)}
          onClick={() => cambiarFiltro(() => setEtapa('Todas'))} />
        {ETAPAS.map((et) => (
          <BotonEtapa key={et} activo={etapa === et} etiqueta={et} total={conteoEtapa.get(et) ?? 0}
            color={COLOR_ETAPA[et]} onClick={() => cambiarFiltro(() => setEtapa(et))} />
        ))}
      </div>

      {/* --- Barrido en curso --- */}
      {barridoActivo && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Barrido por {barridoActivo.canal === 'correo' ? 'correo' : 'WhatsApp'} en proceso
            </span>
            <span className="tabular-nums text-muted-foreground">
              {barridoActivo.enviados + barridoActivo.fallidos} de {barridoActivo.objetivo}
              {barridoActivo.fallidos > 0 && ` · ${barridoActivo.fallidos} fallidos`}
            </span>
          </div>
          <Barra porcentaje={((barridoActivo.enviados + barridoActivo.fallidos) / barridoActivo.objetivo) * 100} />
        </div>
      )}

      {/* --- Cobertura por lote --- */}
      {cobertura.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold">Cobertura por lote</h2>
          {cobertura.map((c) => {
            const pct = c.total ? (c.contactados / c.total) * 100 : 0;
            return (
              <div key={c.lote} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium">{c.lote}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {c.contactados.toLocaleString('es-MX')} de {c.total.toLocaleString('es-MX')} contactados
                    {' · '}{pct.toFixed(1)}%
                  </span>
                </div>
                <Barra porcentaje={pct} />
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>{c.avanzados.toLocaleString('es-MX')} avanzados</span>
                  <span>{c.ganados.toLocaleString('es-MX')} ganados</span>
                  <span>{c.perdidos.toLocaleString('es-MX')} perdidos</span>
                  <span>{c.conCorreo.toLocaleString('es-MX')} con correo</span>
                  <span>{c.conTelefono.toLocaleString('es-MX')} con teléfono</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- Selector de Vista Rápida (Mi Tanda vs Padrón CDMX) --- */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg text-xs font-medium">
          <button
            type="button"
            onClick={() => cambiarFiltro(() => setAsignado('mios'))}
            className={cn(
              'px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer',
              asignado === 'mios' ? 'bg-background shadow-sm text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Target className="w-3.5 h-3.5 text-primary" /> Mi Tanda Activa {tandaStats?.total ? `(${tandaStats.total})` : ''}
          </button>
          <button
            type="button"
            onClick={() => cambiarFiltro(() => setAsignado('Todos'))}
            className={cn(
              'px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer',
              asignado === 'Todos' ? 'bg-background shadow-sm text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            🌐 Padrón General CDMX (42k)
          </button>
          <button
            type="button"
            onClick={() => cambiarFiltro(() => setAsignado('sin'))}
            className={cn(
              'px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer',
              asignado === 'sin' ? 'bg-background shadow-sm text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            ⏳ Sin Asignar (Reserva)
          </button>
        </div>
        <div className="text-xs text-muted-foreground font-medium">
          {asignado === 'mios' ? (
            <span className="text-emerald-600 dark:text-emerald-400">🎯 Enfocado en tus {tandaStats?.total ?? 0} prospectos asignados</span>
          ) : (
            <span>Explorando el universo completo de Ciudad de México</span>
          )}
        </div>
      </div>

      {/* --- Filtros --- */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2 relative flex-1">
          <Search className="w-4 h-4 absolute left-3 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, empresa, giro, correo o teléfono..." className="pl-9"
            value={busqueda} onChange={(e) => cambiarFiltro(() => setBusqueda(e.target.value))} />
        </div>
        <Select value={asignado} onChange={(e) => cambiarFiltro(() => setAsignado(e.target.value))} className="sm:w-44">
          <option value="Todos">Todos los asesores</option>
          <option value="mios">Mi cartera{user ? ` (${user.username})` : ''}</option>
          <option value="sin">Sin asignar</option>
          {asesores.map((a) => <option key={a.id} value={a.id}>{a.username}</option>)}
        </Select>
        <Select value={prioridad} onChange={(e) => cambiarFiltro(() => setPrioridad(e.target.value))} className="sm:w-36">
          <option value="Todas">Prioridad</option>
          <option value="A">A — alta</option>
          <option value="B">B — media</option>
          <option value="C">C — baja</option>
        </Select>
        <Select value={origen} onChange={(e) => cambiarFiltro(() => setOrigen(e.target.value))} className="sm:w-36">
          <option value="Todos">Origen</option>
          <option value="DENUE">Padrón CDMX</option>
          <option value="Manual">Manual</option>
        </Select>
      </div>

      {/* --- Barra de selección --- */}
      {seleccion.length > 0 && isEditor && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <span className="text-sm font-medium">{seleccion.length} seleccionados</span>
          <Select className="w-auto text-sm" defaultValue=""
            onChange={(e) => { if (e.target.value) asignarSeleccion.mutate(e.target.value === 'sin' ? null : Number(e.target.value)); }}>
            <option value="">Asignar a...</option>
            {asesores.map((a) => <option key={a.id} value={a.id}>{a.username}</option>)}
            <option value="sin">Quitar asignación</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setSeleccion([])}>Limpiar</Button>
        </div>
      )}

      {/* --- Tabla --- */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {isEditor && (
                  <TableHead className="w-8">
                    <input type="checkbox" checked={todosSeleccionados} aria-label="Seleccionar todo"
                      onChange={(e) => setSeleccion(e.target.checked ? items.map((i) => i.id) : [])} />
                  </TableHead>
                )}
                <TableHead>Establecimiento</TableHead>
                <TableHead className="hidden md:table-cell">Giro y tamaño</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead className="hidden sm:table-cell">Asesor</TableHead>
                {isAdmin && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Cargando...</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Sin registros con estos filtros.</TableCell></TableRow>
              ) : items.map((c) => (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => router.push(`/clientes/${c.id}`)}>
                  {isEditor && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={seleccion.includes(c.id)} aria-label={`Seleccionar ${c.nombre}`}
                        onChange={(e) => setSeleccion((s) => e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id))} />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {c.prioridad && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${COLOR_PRIORIDAD[c.prioridad] || ''}`}>{c.prioridad}</span>
                      )}
                      <span className="font-medium text-foreground line-clamp-1">{c.nombre}</span>
                    </div>
                    {c.alcaldia && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3" /> {c.alcaldia}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="text-xs text-muted-foreground line-clamp-1 max-w-[240px]">{c.giro || '—'}</div>
                    {c.tamano && <div className="text-xs text-muted-foreground/70 mt-0.5">{c.tamano}</div>}
                  </TableCell>
                  <TableCell>
                    {c.email && <div className="text-xs text-muted-foreground flex items-center gap-1 line-clamp-1"><Mail className="w-3 h-3 shrink-0" /> {c.email}</div>}
                    {c.telefono && <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3 shrink-0" /> {c.telefono}</div>}
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${COLOR_ETAPA[c.etapa as Etapa] || ''}`}>{c.etapa}</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{c.asignado_nombre || 'Sin asignar'}</TableCell>
                  {isAdmin && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-8 text-destructive hover:bg-destructive/10"
                        onClick={() => { if (confirm(`¿Eliminar ${c.nombre}?`)) eliminar.mutate(c.id); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* --- Paginación --- */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Página {pagina} de {totalPaginas.toLocaleString('es-MX')}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => { setPagina((p) => p - 1); setSeleccion([]); }}>
              <ChevronLeft className="w-4 h-4" /> Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={pagina >= totalPaginas} onClick={() => { setPagina((p) => p + 1); setSeleccion([]); }}>
              Siguiente <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {modalReparto && <ModalReparto asesores={asesores} onCerrar={() => setModalReparto(false)} onListo={invalidar} />}
      {modalBarrido && <ModalBarrido lotes={cobertura.map((c) => c.lote)} onCerrar={() => setModalBarrido(false)} onListo={invalidar} />}
      {modalTanda && <ModalNuevaTanda asesores={asesores} onCerrar={() => setModalTanda(false)} onListo={invalidar} />}

      <Dialog open={modalNuevo} onOpenChange={setModalNuevo}>
        <DialogContent>
          <form onSubmit={(e) => { e.preventDefault(); crear.mutate(form); }}>
            <DialogHeader>
              <DialogTitle>Nuevo cliente o prospecto</DialogTitle>
              <DialogDescription>Alta manual en el sistema comercial.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><label className="text-sm font-medium">Nombre</label><Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} required /></div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo</label>
                <Select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                  <option value="Prospecto">Prospecto</option>
                  <option value="Cliente">Cliente</option>
                </Select>
              </div>
              <div className="space-y-2"><label className="text-sm font-medium">Empresa</label><Input value={form.empresa} onChange={(e) => setForm((f) => ({ ...f, empresa: e.target.value }))} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Correo</label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Teléfono</label><Input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Dirección</label><Input value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Notas</label><Textarea value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} rows={3} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalNuevo(false)}>Cancelar</Button>
              <Button type="submit" disabled={crear.isPending}>Crear</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BotonEtapa({ etiqueta, total, activo, color, onClick }: {
  etiqueta: string; total: number; activo: boolean; color?: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`rounded-lg border p-2 text-left transition-colors ${activo ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50'}`}>
      <div className={`text-[11px] font-medium truncate ${color ? '' : 'text-muted-foreground'}`}>
        {color ? <span className={`px-1.5 py-0.5 rounded-full ${color}`}>{etiqueta}</span> : etiqueta}
      </div>
      <div className="text-lg font-bold tabular-nums mt-1">{total.toLocaleString('es-MX')}</div>
    </button>
  );
}

/** Reparte en ronda la cartera sin dueño entre los asesores marcados. */
function ModalReparto({ asesores, onCerrar, onListo }: {
  asesores: Asesor[]; onCerrar: () => void; onListo: () => void;
}) {
  const [elegidos, setElegidos] = useState<number[]>([]);
  const [cantidad, setCantidad] = useState('300');
  const [prioridad, setPrioridad] = useState('Todas');

  const repartir = useMutation({
    mutationFn: () => apiFetch<{ asignados: number; detalle: { asesor: string; total: number }[] }>('/api/clientes/asignar', {
      method: 'POST',
      body: JSON.stringify({ reparto: elegidos, cantidad: Number(cantidad), filtros: { prioridad } }),
    }),
    onSuccess: (r) => {
      onListo();
      toast.success(r.asignados
        ? `${r.asignados} prospectos repartidos: ${r.detalle.map((d) => `${d.asesor} ${d.total}`).join(', ')}`
        : 'No quedaban prospectos sin asignar con ese filtro');
      onCerrar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onCerrar(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Repartir cartera</DialogTitle>
          <DialogDescription>
            Toma los prospectos sin asignar, empezando por los mejor calificados, y los reparte en ronda.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Asesores</label>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {asesores.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm rounded-md border border-border px-2.5 py-1.5 cursor-pointer hover:bg-muted/50">
                  <input type="checkbox" checked={elegidos.includes(a.id)}
                    onChange={(e) => setElegidos((s) => e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id))} />
                  {a.username}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Cuántos repartir</label>
              <Input type="number" min="1" max="2000" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Prioridad</label>
              <Select value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
                <option value="Todas">Todas</option>
                <option value="A">Solo A</option>
                <option value="B">Solo B</option>
                <option value="C">Solo C</option>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button disabled={!elegidos.length || repartir.isPending} onClick={() => repartir.mutate()}>
            {repartir.isPending ? 'Repartiendo...' : 'Repartir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Barra de progreso simple, en el color de acento del tema. */
function Barra({ porcentaje }: { porcentaje: number }) {
  const pct = Math.max(0, Math.min(100, porcentaje));
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Barrido: manda el primer contacto a una tanda de prospectos sin tocar.
 * Envía de verdad, así que la pantalla dice cuántos son y a quiénes antes de
 * arrancar, y el envío no se puede repetir mientras uno siga corriendo.
 */
function ModalBarrido({ lotes, onCerrar, onListo }: {
  lotes: string[]; onCerrar: () => void; onListo: () => void;
}) {
  const [canal, setCanal] = useState<'correo' | 'whatsapp'>('correo');
  const [plantilla, setPlantilla] = useState('presentacion');
  const [cantidad, setCantidad] = useState('100');
  const [lote, setLote] = useState('');
  const [prioridad, setPrioridad] = useState('');
  const [soloMios, setSoloMios] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const consulta = new URLSearchParams({
    canal, lote, prioridad, soloMios: soloMios ? '1' : '0',
  }).toString();

  const { data } = useQuery({
    queryKey: ['barrido-disponibles', consulta],
    queryFn: () => apiFetch<{ disponibles: number; maximo: number; recientes: Barrido[] }>(`/api/clientes/barrido?${consulta}`),
  });
  const disponibles = data?.disponibles ?? 0;
  const aEnviar = Math.min(Number(cantidad) || 0, disponibles, data?.maximo ?? 100);

  const iniciar = useMutation({
    mutationFn: () => apiFetch<Barrido>('/api/clientes/barrido', {
      method: 'POST',
      body: JSON.stringify({
        canal, plantilla, cantidad: Number(cantidad),
        lote: lote || null, prioridad: prioridad || null, soloMios,
      }),
    }),
    onSuccess: (b) => { onListo(); toast.success(`Barrido iniciado: ${b.objetivo} envíos en camino`); onCerrar(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const plantillas = canal === 'correo' ? PLANTILLAS_CORREO : PLANTILLAS_WHATSAPP;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onCerrar(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Barrido de primer contacto</DialogTitle>
          <DialogDescription>
            Toma prospectos que nadie ha contactado, empezando por los mejor calificados, y les manda el mensaje de presentación.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Canal</span>
              <Select value={canal} onChange={(e) => { setCanal(e.target.value as 'correo' | 'whatsapp'); setPlantilla('presentacion'); }}>
                <option value="correo">Correo</option>
                <option value="whatsapp">WhatsApp</option>
              </Select>
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Cuántos</span>
              <Input type="number" min="1" max={data?.maximo ?? 100} value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            </label>
          </div>

          <label className="space-y-1.5">
            <span className="text-sm font-medium">Mensaje</span>
            <Select value={plantilla} onChange={(e) => setPlantilla(e.target.value)}>
              {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Lote</span>
              <Select value={lote} onChange={(e) => setLote(e.target.value)}>
                <option value="">Todos</option>
                {lotes.map((l) => <option key={l} value={l}>{l}</option>)}
              </Select>
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium">Prioridad</span>
              <Select value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
                <option value="">Todas</option>
                <option value="A">Solo A</option>
                <option value="B">Solo B</option>
                <option value="C">Solo C</option>
              </Select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={soloMios} onChange={(e) => setSoloMios(e.target.checked)} />
            Solo prospectos asignados a mí
          </label>

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
              <span><strong className="tabular-nums">{disponibles.toLocaleString('es-MX')}</strong> prospectos sin contactar con estos filtros</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Se enviarán <strong>{aEnviar}</strong> mensajes reales, uno cada segundo y medio.
              Cada envío queda en la bitácora del prospecto y su etapa pasa a &quot;Contactado&quot;.
            </p>
          </div>

          {confirmando && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              Esto le escribe a {aEnviar} negocios reales. ¿Confirma?
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          {confirmando ? (
            <Button disabled={iniciar.isPending} onClick={() => iniciar.mutate()}>
              {iniciar.isPending ? 'Iniciando...' : `Sí, enviar ${aEnviar}`}
            </Button>
          ) : (
            <Button disabled={aEnviar < 1} onClick={() => setConfirmando(true)}>
              <Radar className="w-4 h-4 mr-2" /> Iniciar barrido
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Modal para que el asesor saque una tanda de trabajo (ej. 200 prospectos)
 * eligiendo el giro (Condominios, Hoteles, Fábricas, etc.), alcaldía y canal.
 */
function ModalNuevaTanda({ asesores, onCerrar, onListo }: {
  asesores: Asesor[]; onCerrar: () => void; onListo: () => void;
}) {
  const { user, isAdmin } = useAuth();
  const [categoria, setCategoria] = useState('condominios');
  const [alcaldia, setAlcaldia] = useState('Todas');
  const [canal, setCanal] = useState('todos');
  const [prioridad, setPrioridad] = useState('Todas');
  const [cantidad, setCantidad] = useState('200');
  const [asesorId, setAsesorId] = useState<string>(String(user?.id ?? ''));

  const sacarTanda = useMutation({
    mutationFn: () => apiFetch('/api/clientes/tanda', {
      method: 'POST',
      body: JSON.stringify({
        categoria,
        alcaldia,
        canal,
        prioridad,
        cantidad: Number(cantidad),
        asesorId: asesorId ? Number(asesorId) : undefined,
      }),
    }),
    onSuccess: (r: any) => {
      onListo();
      toast.success(r.mensaje || `${r.asignados} prospectos cargados a tu tanda.`);
      onCerrar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const CATEGORIAS_OPCIONES = [
    { id: 'condominios', label: 'Condominios y Bienes Raíces', icon: '🏢' },
    { id: 'hoteles', label: 'Hoteles y Hospedaje', icon: '🏨' },
    { id: 'fabricas', label: 'Fábricas, Naves y Bodegas', icon: '🏭' },
    { id: 'hospitales', label: 'Hospitales y Clínicas Privadas', icon: '🏥' },
    { id: 'escuelas', label: 'Escuelas, Colegios y Universidades', icon: '🎓' },
    { id: 'bancos', label: 'Bancos, Financieras y Joyerías', icon: '🏦' },
    { id: 'construccion', label: 'Constructoras y Obras', icon: '🏗️' },
    { id: 'restaurantes', label: 'Restaurantes, Plazas y Salones', icon: '🍽️' },
    { id: 'corporativos', label: 'Corporativos y Despachos', icon: '💼' },
    { id: 'todas', label: 'Cualquier giro (Padrón General CDMX)', icon: '🌐' },
  ];

  const ALCALDIAS_CDMX = [
    'Todas', 'Cuauhtémoc', 'Miguel Hidalgo', 'Benito Juárez', 'Álvaro Obregón',
    'Iztapalapa', 'Gustavo A. Madero', 'Coyoacán', 'Tlalpan', 'Azcapotzalco',
    'Cuajimalpa de Morelos', 'Venustiano Carranza', 'Iztacalco', 'Xochimilco',
    'Tláhuac', 'La Magdalena Contreras', 'Milpa Alta'
  ];

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onCerrar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Sacar Nueva Tanda de Prospectos
          </DialogTitle>
          <DialogDescription>
            Extrae un lote enfocado (por ejemplo 200 negocios) según el giro y zona que quieras atacar. Al completar tu tanda podrás sacar la siguiente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Giro o Nicho de Negocio</label>
            <Select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {CATEGORIAS_OPCIONES.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Alcaldía (CDMX)</label>
              <Select value={alcaldia} onChange={(e) => setAlcaldia(e.target.value)}>
                {ALCALDIAS_CDMX.map((a) => (
                  <option key={a} value={a}>{a === 'Todas' ? 'Todas las 16' : a}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Canal de Contacto</label>
              <Select value={canal} onChange={(e) => setCanal(e.target.value)}>
                <option value="todos">Cualquiera</option>
                <option value="ambos">Con WhatsApp y Correo</option>
                <option value="wa">Con WhatsApp</option>
                <option value="mail">Con Correo</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Tamaño de la tanda</label>
              <Select value={cantidad} onChange={(e) => setCantidad(e.target.value)}>
                <option value="50">50 prospectos (Micro tanda)</option>
                <option value="100">100 prospectos</option>
                <option value="200">200 prospectos (Recomendado)</option>
                <option value="300">300 prospectos</option>
                <option value="500">500 prospectos</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Prioridad mínima</label>
              <Select value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
                <option value="Todas">Todas las prioridades</option>
                <option value="A">Solo A (Corporativos / Top)</option>
                <option value="B">Solo B (Mediana empresa)</option>
              </Select>
            </div>
          </div>

          {isAdmin && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Asignar esta tanda a:</label>
              <Select value={asesorId} onChange={(e) => setAsesorId(e.target.value)}>
                {asesores.map((a) => (
                  <option key={a.id} value={a.id}>{a.username}{a.id === user?.id ? ' (Tú)' : ''}</option>
                ))}
              </Select>
            </div>
          )}

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            <span>Los {cantidad} prospectos se asignarán a la bandeja y se priorizarán los de mayor puntaje para asegurar la máxima calidad.</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>Cancelar</Button>
          <Button disabled={sacarTanda.isPending} onClick={() => sacarTanda.mutate()} className="bg-primary text-primary-foreground">
            {sacarTanda.isPending ? 'Cargando tanda...' : `Cargar ${cantidad} prospectos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
