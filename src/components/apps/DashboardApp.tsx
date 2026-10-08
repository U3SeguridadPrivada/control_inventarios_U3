'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { useAuth } from '@/src/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { PageHeader } from '@/src/components/ui/page-header';
import { KpiCard } from '@/src/components/ui/kpi-card';
import { Field } from '@/src/components/ui/field';
import { FormDialog } from '@/src/components/ui/form-dialog';
import {
  Mail, Calendar, ClipboardList, AlertTriangle, CheckCircle2, Clock,
  Plus, ArrowRight, ShieldCheck, Users, Search, ExternalLink,
  Package, FileSpreadsheet, MessageCircle, MapPin, Landmark, Settings,
  LayoutGrid, Bell, ArrowUpRight, Flame, ShieldAlert,
} from 'lucide-react';
import { fmtDate, cn } from '@/src/lib/utils';
import { toast } from 'sonner';

interface UserDashboardData {
  user: {
    id: number;
    username: string;
    email: string;
    role: string;
    hasImapConfigured: boolean;
  };
  metrics: {
    unreadEmailsCount: number;
    todayTasksCount: number;
    activeProtocolsCount: number;
    openIncidenciasCount: number;
    guardiasActivosCount: number;
  };
  todayEvents: Array<{
    id: number;
    titulo: string;
    descripcion: string | null;
    fecha_inicio: string;
    fecha_fin: string | null;
    todo_el_dia: number;
  }>;
  upcomingEvents: Array<{
    id: number;
    titulo: string;
    descripcion: string | null;
    fecha_inicio: string;
    fecha_fin: string | null;
    todo_el_dia: number;
  }>;
  protocols: Array<{
    id: number;
    titulo: string;
    categoria: string;
    descripcion: string | null;
    tipo: 'lista' | 'documento';
    pasos: string[];
    prioridad: string;
    activo: number;
    actualizado_en: string | null;
  }>;
  recentIncidencias: Array<{
    id: number;
    guardia_id: number;
    tipo: string;
    gravedad: string;
    fecha: string;
    descripcion: string;
    estado: string;
  }>;
  recentEmails: Array<{
    uid: number;
    subject: string;
    from: string;
    date: string;
    seen: boolean;
  }>;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return '¡Buenos días';
  if (hour < 19) return '¡Buenas tardes';
  return '¡Buenas noches';
}

function getRoleName(role: string): string {
  switch (role) {
    case 'admin':
      return 'Administrador';
    case 'editor':
      return 'Editor';
    case 'viewer':
      return 'Visualizador';
    default:
      return role;
  }
}

export default function DashboardApp() {
  const { user, isAdmin, isEditor, puedeVer } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [protocolSearch, setProtocolSearch] = useState('');
  const [selectedProtocol, setSelectedProtocol] = useState<any | null>(null);
  const [protocolStepsChecked, setProtocolStepsChecked] = useState<Record<number, boolean>>({});

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({
    titulo: '',
    descripcion: '',
    fecha_inicio: new Date().toISOString().slice(0, 16),
  });

  const { data, isLoading, isError, refetch } = useQuery<UserDashboardData>({
    queryKey: ['userDashboard'],
    queryFn: () => apiFetch<UserDashboardData>('/api/dashboard/user'),
    refetchInterval: 60_000,
  });

  // Mutación para crear tarea rápida
  const createTaskMutation = useMutation({
    mutationFn: (body: typeof newTaskForm) =>
      apiFetch('/api/eventos', {
        method: 'POST',
        body: JSON.stringify({
          titulo: body.titulo.trim(),
          descripcion: body.descripcion?.trim() || null,
          fecha_inicio: body.fecha_inicio,
        }),
      }),
    onSuccess: () => {
      toast.success('Tarea agregada a tu agenda');
      setTaskModalOpen(false);
      setNewTaskForm({
        titulo: '',
        descripcion: '',
        fecha_inicio: new Date().toISOString().slice(0, 16),
      });
      queryClient.invalidateQueries({ queryKey: ['userDashboard'] });
      queryClient.invalidateQueries({ queryKey: ['eventos'] });
    },
    onError: () => {
      toast.error('Error al guardar la tarea');
    },
  });

  const filteredProtocols = useMemo(() => {
    if (!data?.protocols) return [];
    if (!protocolSearch.trim()) return data.protocols.slice(0, 6);
    return data.protocols.filter(
      (p) =>
        p.titulo.toLowerCase().includes(protocolSearch.toLowerCase()) ||
        p.categoria.toLowerCase().includes(protocolSearch.toLowerCase())
    );
  }, [data?.protocols, protocolSearch]);

  const emergencyProtocols = useMemo(() => {
    if (!data?.protocols) return [];
    return data.protocols.filter((p) => p.categoria === 'Emergencia' || p.prioridad === 'Alta');
  }, [data?.protocols]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[350px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Preparando tu panel de control...</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center min-h-[350px] flex-col gap-4">
        <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">Error al cargar tu dashboard</h2>
        <p className="text-muted-foreground text-center max-w-md text-sm">
          No se pudo sincronizar la información del usuario.
        </p>
        <Button onClick={() => refetch()} variant="outline">
          Reintentar
        </Button>
      </div>
    );
  }

  const { metrics, todayEvents, upcomingEvents, recentIncidencias, recentEmails, user: userData } = data;
  const username = user?.username || userData?.username || 'Usuario';
  const roleDisplay = getRoleName(user?.role || userData?.role || 'viewer');
  const greeting = getGreeting();

  const handleOpenProtocol = (protocol: any) => {
    setSelectedProtocol(protocol);
    setProtocolStepsChecked({});
  };

  const toggleProtocolStep = (index: number) => {
    setProtocolStepsChecked((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Módulos rápidos según permisos
  const quickModules = [
    { id: 'inventario', title: 'Inventario', href: '/inventario', icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { id: 'guardias', title: 'Guardias', href: '/guardias', icon: Users, color: 'text-blue-600', bg: 'bg-blue-500/10 border-blue-500/20' },
    { id: 'correo', title: 'Bandeja Correo', href: '/correo', icon: Mail, color: 'text-indigo-600', bg: 'bg-indigo-500/10 border-indigo-500/20' },
    { id: 'calendario', title: 'Agenda y Tareas', href: '/calendario', icon: Calendar, color: 'text-amber-600', bg: 'bg-amber-500/10 border-amber-500/20' },
    { id: 'protocolos', title: 'Protocolos', href: '/protocolos', icon: ClipboardList, color: 'text-rose-600', bg: 'bg-rose-500/10 border-rose-500/20' },
    { id: 'cotizaciones', title: 'Cotizador', href: '/cotizaciones', icon: FileSpreadsheet, color: 'text-teal-600', bg: 'bg-teal-500/10 border-teal-500/20' },
    { id: 'finanzas', title: 'Finanzas', href: '/finanzas', icon: Landmark, color: 'text-purple-600', bg: 'bg-purple-500/10 border-purple-500/20' },
    { id: 'whatsapp', title: 'WhatsApp Bot', href: '/whatsapp', icon: MessageCircle, color: 'text-green-600', bg: 'bg-green-500/10 border-green-500/20' },
    { id: 'mapa-operaciones', title: 'Mapa Operaciones', href: '/mapa-operaciones', icon: MapPin, color: 'text-cyan-600', bg: 'bg-cyan-500/10 border-cyan-500/20' },
  ].filter((m) => puedeVer(m.id));

  return (
    <div className="space-y-6 pb-10">
      {/* 1. Encabezado */}
      <PageHeader
        title={<>{greeting}, <span className="text-primary">{username}</span></>}
        description={`${roleDisplay} · Resumen de tus correos, tareas del día, protocolos operativos y estado general del sistema.`}
        actions={
          <>
            <Button variant="outline" onClick={() => router.push('/protocolos')}>
              <ClipboardList className="h-4 w-4" /> Protocolos
            </Button>
            <Button variant="outline" onClick={() => router.push('/correo')}>
              <Mail className="h-4 w-4" /> Ver buzón
            </Button>
            <Button onClick={() => setTaskModalOpen(true)}>
              <Plus className="h-4 w-4" /> Nueva tarea
            </Button>
          </>
        }
      />

      {/* 2. Indicadores de estado personal y operativo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Correos sin leer"
          icon={Mail}
          value={metrics.unreadEmailsCount}
          badge={metrics.unreadEmailsCount > 0 ? <Badge variant="info">Nuevos</Badge> : undefined}
          hint={userData.hasImapConfigured ? 'Buzón IMAP conectado' : 'Configura tu buzón en Ajustes'}
          onClick={() => router.push('/correo')}
        />
        <KpiCard
          label="Tareas de hoy"
          icon={Calendar}
          value={metrics.todayTasksCount}
          badge={<Badge variant="secondary">Agenda</Badge>}
          hint={`${upcomingEvents.length} eventos programados`}
          onClick={() => router.push('/calendario')}
        />
        <KpiCard
          label="Protocolos activos"
          icon={ClipboardList}
          value={metrics.activeProtocolsCount}
          badge={emergencyProtocols.length > 0 ? <Badge variant="destructive"><Flame className="h-3 w-3" /> {emergencyProtocols.length} clave</Badge> : undefined}
          hint="Procedimientos y emergencias"
          onClick={() => router.push('/protocolos')}
        />
        <KpiCard
          label="Incidencias recientes"
          icon={AlertTriangle}
          tone={metrics.openIncidenciasCount > 0 ? 'warning' : 'primary'}
          value={metrics.openIncidenciasCount}
          badge={<Badge variant="secondary">{metrics.guardiasActivosCount} guardias</Badge>}
          hint="Reportes de campo y servicio"
          onClick={() => router.push('/calendario')}
        />
      </div>

      {/* 3. Grid Principal de Contenido */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda: Tareas, Correos y Protocolos (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* SECCIÓN A: TAREAS Y AGENDA DE HOY */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  Agenda y Tareas de Hoy
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Compromisos y actividades programadas para hoy
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setTaskModalOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Agregar Tarea
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => router.push('/calendario')}>
                  Ver Agenda <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {todayEvents.length > 0 ? (
                <div className="space-y-2.5">
                  {todayEvents.map((evt) => (
                    <div
                      key={evt.id}
                      className="p-3 rounded-xl border border-border bg-card/60 hover:bg-muted/40 transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-600 mt-0.5">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm leading-tight text-foreground">{evt.titulo}</p>
                          {evt.descripcion && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{evt.descripcion}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-950/60 px-2 py-0.5 rounded-md">
                              {evt.todo_el_dia ? 'Todo el día' : fmtDate(evt.fecha_inicio)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[11px] shrink-0">
                        Hoy
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 px-4 rounded-xl border border-dashed border-border bg-muted/20">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2 opacity-80" />
                  <p className="text-sm font-medium text-foreground">No tienes tareas pendientes registradas para hoy</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Añade recordatorios o eventos para organizar tu jornada.
                  </p>
                  <Button size="sm" variant="outline" className="mt-3 text-xs" onClick={() => setTaskModalOpen(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Programar Tarea
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SECCIÓN B: PROTOCOLOS OPERATIVOS Y DE EMERGENCIA */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 gap-3">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-muted-foreground" />
                  Protocolos Operativos y Emergencias
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Guías de acción inmediata, manuales y procedimientos de seguridad
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative w-44 sm:w-56">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar protocolo..."
                    value={protocolSearch}
                    onChange={(e) => setProtocolSearch(e.target.value)}
                    className="h-8 text-xs pl-8"
                  />
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => router.push('/protocolos')}>
                  Ver Todos
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Acceso Rápido de Emergencias */}
              {emergencyProtocols.length > 0 && !protocolSearch && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    <span className="text-xs font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wider">
                      Protocolos de Emergencia y Acción Rápida
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {emergencyProtocols.slice(0, 4).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleOpenProtocol(p)}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100/50 dark:hover:bg-rose-900/40 text-left transition-colors group"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-semibold text-foreground truncate group-hover:text-rose-600 transition-colors">
                            {p.titulo}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">{p.pasos?.length || 0} pasos · {p.categoria}</p>
                        </div>
                        <Badge variant="destructive" className="text-[10px] shrink-0 h-5">
                          Emergencia
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Lista de Protocolos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filteredProtocols.map((protocol) => (
                  <div
                    key={protocol.id}
                    onClick={() => handleOpenProtocol(protocol)}
                    className="p-3 rounded-xl border border-border bg-card/60 hover:bg-muted/40 hover:border-primary/40 cursor-pointer transition-all flex flex-col justify-between group"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <Badge
                          variant={protocol.categoria === 'Emergencia' ? 'destructive' : 'secondary'}
                          className="text-[10px] h-4.5"
                        >
                          {protocol.categoria}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {protocol.pasos?.length ?? 0} pasos
                        </span>
                      </div>
                      <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors line-clamp-1">
                        {protocol.titulo}
                      </p>
                      {protocol.descripcion && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{protocol.descripcion}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-end mt-2 pt-2 border-t border-border/50 text-xs text-primary font-medium">
                      <span>Ver procedimiento</span>
                      <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* SECCIÓN C: BANDEJA DE CORREO RÁPIDO */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  Bandeja de Entrada Reciente
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Tus últimos correos institucionales recibidos
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => router.push('/correo')}>
                Abrir Correo <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {recentEmails && recentEmails.length > 0 ? (
                <div className="space-y-2">
                  {recentEmails.map((mail) => (
                    <div
                      key={mail.uid}
                      onClick={() => router.push('/correo')}
                      className={cn(
                        'p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3',
                        !mail.seen
                          ? 'border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 font-medium'
                          : 'border-border bg-card/60 hover:bg-muted/40'
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            !mail.seen ? 'bg-indigo-600' : 'bg-transparent'
                          )}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{mail.from}</p>
                          <p className="text-sm text-foreground/90 truncate">{mail.subject}</p>
                        </div>
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
                        {fmtDate(mail.date)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 px-4 rounded-xl border border-border bg-muted/10">
                  <Mail className="w-8 h-8 mx-auto text-muted-foreground mb-2 opacity-60" />
                  <p className="text-sm font-medium text-foreground">
                    {userData.hasImapConfigured
                      ? 'Sin correos nuevos pendientes de leer'
                      : 'Buzón personal IMAP no configurado'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {userData.hasImapConfigured
                      ? 'Tu bandeja de entrada está al día.'
                      : 'Configura tus credenciales de correo en tu perfil para recibir notificaciones en vivo.'}
                  </p>
                  {!userData.hasImapConfigured && (
                    <Button size="sm" variant="outline" className="mt-3 text-xs" onClick={() => router.push('/ajustes')}>
                      <Settings className="w-3.5 h-3.5 mr-1" /> Configurar Correo
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Columna Derecha: Accesos Rápidos, Incidencias y Estado (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Widget 1: Accesos Rápidos a Módulos */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-muted-foreground" />
                Mis Módulos Rápidos
              </CardTitle>
              <CardDescription className="text-xs">
                Accesos directos a tus herramientas de trabajo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2.5">
                {quickModules.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => router.push(m.href)}
                      className="group flex flex-col items-start rounded-xl border border-border bg-card p-3 text-left transition-[border-color,background-color] hover:border-primary/30 hover:bg-primary/[0.03]"
                    >
                      <div className="flex items-center justify-between w-full mb-2">
                        <Icon className="h-5 w-5 text-primary" />
                        <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                      <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                        {m.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Widget 2: Incidencias y Alertas Operativas */}
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                  Incidencias Recientes
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Reportes abiertos de guardias
                </CardDescription>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => router.push('/calendario')}>
                Ver todas
              </Button>
            </CardHeader>
            <CardContent>
              {recentIncidencias && recentIncidencias.length > 0 ? (
                <div className="space-y-2.5">
                  {recentIncidencias.map((inc) => (
                    <div
                      key={inc.id}
                      className="p-2.5 rounded-xl border border-border bg-card/60 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <Badge
                          variant={inc.gravedad === 'Grave' ? 'destructive' : inc.gravedad === 'Moderada' ? 'default' : 'secondary'}
                          className="text-[10px] h-4.5"
                        >
                          {inc.tipo} ({inc.gravedad})
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{fmtDate(inc.fecha)}</span>
                      </div>
                      <p className="text-xs text-foreground/90 line-clamp-2">{inc.descripcion}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  No hay incidencias abiertas recientes
                </div>
              )}
            </CardContent>
          </Card>

          {/* Widget 3: Resumen de Guardia y Operaciones */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Operaciones en Turno</h4>
                  <p className="text-xs text-muted-foreground">
                    {metrics.guardiasActivosCount} guardias activos en servicio
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => router.push('/guardias')}>
                  <Users className="w-3.5 h-3.5 mr-1" /> Guardias
                </Button>
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => router.push('/mapa-operaciones')}>
                  <MapPin className="w-3.5 h-3.5 mr-1" /> Mapa
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* FORMULARIO: NUEVA TAREA O COMPROMISO */}
      <FormDialog
        open={taskModalOpen}
        onOpenChange={setTaskModalOpen}
        size="sm"
        icon={Calendar}
        title="Nueva tarea o compromiso"
        description="Agrega una tarea o recordatorio directo a tu calendario."
        submitLabel="Guardar tarea"
        submitting={createTaskMutation.isPending}
        footerNote={<span><span className="text-destructive">*</span> Campo obligatorio</span>}
        onSubmit={() => {
          if (!newTaskForm.titulo.trim()) {
            toast.error('Ingresa el título de la tarea');
            return;
          }
          createTaskMutation.mutate(newTaskForm);
        }}
      >
        <div className="space-y-4">
          <Field label="Título o asunto" required>
            <Input
              placeholder="Ej. Revisión de puesto, llamada con cliente..."
              value={newTaskForm.titulo}
              onChange={(e) => setNewTaskForm({ ...newTaskForm, titulo: e.target.value })}
              required
            />
          </Field>
          <Field label="Fecha y hora" required>
            <Input
              type="datetime-local"
              value={newTaskForm.fecha_inicio}
              onChange={(e) => setNewTaskForm({ ...newTaskForm, fecha_inicio: e.target.value })}
              required
            />
          </Field>
          <Field label="Notas o detalles">
            <Textarea
              placeholder="Detalles adicionales sobre la tarea..."
              value={newTaskForm.descripcion}
              onChange={(e) => setNewTaskForm({ ...newTaskForm, descripcion: e.target.value })}
              rows={3}
            />
          </Field>
        </div>
      </FormDialog>

      {/* VISOR DE PROTOCOLO PASO A PASO */}
      <FormDialog
        open={Boolean(selectedProtocol)}
        onOpenChange={(open) => !open && setSelectedProtocol(null)}
        size="lg"
        icon={ClipboardList}
        tone={selectedProtocol?.categoria === 'Emergencia' ? 'danger' : 'default'}
        title={selectedProtocol?.titulo ?? ''}
        description={selectedProtocol?.descripcion || undefined}
        footerNote={
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setProtocolStepsChecked({})}>
            Reiniciar checklist
          </Button>
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedProtocol(null);
                router.push('/protocolos');
              }}
            >
              Abrir en Protocolos
            </Button>
            <Button type="button" onClick={() => setSelectedProtocol(null)}>
              Entendido
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={selectedProtocol?.categoria === 'Emergencia' ? 'destructive' : 'secondary'}>{selectedProtocol?.categoria}</Badge>
            <Badge variant="outline">Prioridad: {selectedProtocol?.prioridad}</Badge>
          </div>
          <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Pasos del procedimiento
          </h4>
          {selectedProtocol?.pasos && selectedProtocol.pasos.length > 0 ? (
            <div className="space-y-2">
              {selectedProtocol.pasos.map((paso: string, idx: number) => {
                const isChecked = Boolean(protocolStepsChecked[idx]);
                return (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => toggleProtocolStep(idx)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                      isChecked ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-border bg-card hover:bg-muted/40'
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs font-bold transition-colors',
                        isChecked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-muted-foreground/40 text-muted-foreground'
                      )}
                    >
                      {isChecked ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                    </span>
                    <span className={cn('select-none text-sm leading-relaxed', isChecked ? 'text-muted-foreground line-through' : 'text-foreground')}>
                      {paso}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs italic text-muted-foreground">Este protocolo no contiene pasos detallados.</p>
          )}
        </div>
      </FormDialog>
    </div>
  );
}
