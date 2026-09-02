'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select } from '@/src/components/ui/select';
import {
  Timer, Clock, ArrowLeft, CheckCircle2, AlertTriangle, Play,
  RotateCcw, User, Building2, Search, Download, Trash2,
  FileText, ShieldCheck, Coffee, Cigarette, Utensils, Briefcase, Plus,
  ChevronRight, Sparkles, MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';
import { cn } from '@/src/lib/utils';

interface RegistroChecador {
  id: number;
  usuario_id: number | null;
  nombre_empleado: string;
  departamento: string;
  tipo_salida: string;
  limite_minutos: number;
  hora_salida: string;
  hora_entrada: string | null;
  duracion_segundos: number | null;
  estado: 'en_curso' | 'a_tiempo' | 'excedido';
  motivo: string | null;
  justificacion: string | null;
  registrado_por: string | null;
  created_at: string;
}

interface MetricasChecador {
  activas_ahora: number;
  total_hoy: number;
  completadas_hoy: number;
  a_tiempo_hoy: number;
  excedidas_hoy: number;
  porcentaje_cumplimiento: number;
  promedio_minutos: number;
}

const TIPOS_SALIDA = [
  {
    id: '10_min',
    titulo: 'Salida de 10 min (Reglamento)',
    limite: 10,
    icono: Timer,
    badge: 'Capítulo IV Art. 1',
    color: 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200',
    descripcion: 'Salida extendida permitida (1 vez al día): Trámite menor, cajero, compra.',
  },
  {
    id: '5_min_1',
    titulo: 'Salida Corta 1 (5 min)',
    limite: 5,
    icono: Coffee,
    badge: 'Máx 5 min',
    color: 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200',
    descripcion: 'Paso rápido a la tienda, café o bebidas.',
  },
  {
    id: '5_min_2',
    titulo: 'Salida Corta 2 (5 min)',
    limite: 5,
    icono: Cigarette,
    badge: 'Máx 5 min',
    color: 'border-slate-500 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-200',
    descripcion: 'Descanso breve o zona exterior designada.',
  },
  {
    id: 'comida',
    titulo: 'Comida (60 min)',
    limite: 60,
    icono: Utensils,
    badge: '1 Hora',
    color: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200',
    descripcion: 'Ventana de 14:00 a 18:00 hrs de forma escalonada.',
  },
  {
    id: 'comision',
    titulo: 'Comisión Oficial / Mandos',
    limite: 120,
    icono: Briefcase,
    badge: 'Oficial',
    color: 'border-purple-500 bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200',
    descripcion: 'Diligencia bancaria o encargo específico ordenado por directivos.',
  },
];

const MOTIVOS_RAPIDOS = [
  'Cajero automático',
  'Farmacia / Tienda',
  'Cafetería / Bebidas',
  'Trámite personal breve',
  'Descanso exterior',
  'Diligencia laboral',
];

/** Componente de cronómetro en tiempo real para salidas activas */
function TarjetaSalidaActiva({
  registro,
  onMarcarEntrada,
  isPending,
}: {
  registro: RegistroChecador;
  onMarcarEntrada: (id: number) => void;
  isPending: boolean;
}) {
  const [segundosTranscurridos, setSegundosTranscurridos] = useState(() => {
    const salida = new Date(registro.hora_salida).getTime();
    const ahora = Date.now();
    return Math.max(0, Math.floor((ahora - salida) / 1000));
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const salida = new Date(registro.hora_salida).getTime();
      const ahora = Date.now();
      setSegundosTranscurridos(Math.max(0, Math.floor((ahora - salida) / 1000)));
    }, 1000);

    return () => clearInterval(timer);
  }, [registro.hora_salida]);

  const limiteSegundos = (registro.limite_minutos || 10) * 60;
  const segundosRestantes = limiteSegundos - segundosTranscurridos;
  const estaExcedido = segundosRestantes < 0;
  const porExpirar = segundosRestantes >= 0 && segundosRestantes <= 120; // 2 minutos o menos

  const formatearTiempo = (totalSegs: number) => {
    const absSegs = Math.abs(totalSegs);
    const mins = Math.floor(absSegs / 60);
    const segs = absSegs % 60;
    return `${mins.toString().padStart(2, '0')}:${segs.toString().padStart(2, '0')}`;
  };

  const porcentajeProgreso = Math.min(100, Math.round((segundosTranscurridos / limiteSegundos) * 100));

  return (
    <div
      className={cn(
        'rounded-2xl p-4 sm:p-5 border transition-all duration-300 relative overflow-hidden flex flex-col justify-between shadow-md',
        estaExcedido
          ? 'bg-red-50/90 dark:bg-red-950/40 border-red-500 shadow-red-500/10'
          : porExpirar
          ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-500 shadow-amber-500/10'
          : 'bg-card border-border hover:border-primary/50'
      )}
    >
      {/* Barra de progreso de tiempo superior */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-slate-200 dark:bg-slate-800">
        <div
          className={cn(
            'h-full transition-all duration-1000',
            estaExcedido ? 'bg-red-600 animate-pulse' : porExpirar ? 'bg-amber-500' : 'bg-primary'
          )}
          style={{ width: `${porcentajeProgreso}%` }}
        />
      </div>

      <div>
        {/* Cabecera de la tarjeta */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block shrink-0" />
              <h3 className="font-bold text-foreground text-base sm:text-lg truncate">
                {registro.nombre_empleado}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Building2 className="w-3 h-3" /> {registro.departamento || 'Oficinas'}
              {registro.motivo && <span>· {registro.motivo}</span>}
            </p>
          </div>

          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 uppercase tracking-wider',
              estaExcedido
                ? 'bg-red-600 text-white animate-bounce'
                : porExpirar
                ? 'bg-amber-500 text-white animate-pulse'
                : 'bg-primary/10 text-primary'
            )}
          >
            {estaExcedido
              ? '¡TIEMPO EXCEDIDO!'
              : porExpirar
              ? 'Por vencer'
              : `${registro.limite_minutos} min límite`}
          </span>
        </div>

        {/* Panel del Cronómetro */}
        <div className="my-3 p-3 rounded-xl bg-background/80 border border-border flex items-center justify-between">
          <div>
            <div className="text-[10.5px] text-muted-foreground font-semibold uppercase tracking-wider">
              {estaExcedido ? 'Exceso acumulado' : 'Tiempo restante'}
            </div>
            <div
              className={cn(
                'text-2xl sm:text-3xl font-mono font-black tracking-tight',
                estaExcedido ? 'text-red-600 dark:text-red-400' : porExpirar ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
              )}
            >
              {estaExcedido ? `+${formatearTiempo(segundosRestantes)}` : formatearTiempo(segundosRestantes)}
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] text-muted-foreground font-medium">Hora de salida</div>
            <div className="text-sm font-semibold font-mono text-foreground">
              {new Date(registro.hora_salida).toLocaleTimeString('es-MX', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Transcurrido: {formatearTiempo(segundosTranscurridos)}
            </div>
          </div>
        </div>

        {/* Advertencia si está excedido */}
        {estaExcedido && (
          <div className="mb-3 p-2 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs flex items-center gap-1.5 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Superó la tolerancia estipulada en el reglamento ({registro.limite_minutos} min).</span>
          </div>
        )}
      </div>

      {/* Botón prominente de Entrada / Regreso */}
      <Button
        onClick={() => onMarcarEntrada(registro.id)}
        disabled={isPending}
        className={cn(
          'w-full py-2.5 font-bold text-sm shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2',
          estaExcedido
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
        )}
      >
        <CheckCircle2 className="w-4 h-4" />
        <span>REGISTRAR REGRESO (ENTRADA)</span>
      </Button>
    </div>
  );
}

export default function ChecadorApp() {
  const { user, isAdmin, isEditor } = useAuth();
  const queryClient = useQueryClient();

  // Reloj digital en vivo del encabezado
  const [relojHora, setRelojHora] = useState('');
  const [relojFecha, setRelojFecha] = useState('');

  // Formulario de salida
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState(user?.username || '');
  const [departamento, setDepartamento] = useState('Oficinas');
  const [tipoSalidaId, setTipoSalidaId] = useState('10_min');
  const [motivo, setMotivo] = useState('Cajero automático');
  const [motivoManual, setMotivoManual] = useState('');

  // Filtros de bitácora
  const [filtroFecha, setFiltroFecha] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [busquedaEmpleado, setBusquedaEmpleado] = useState('');

  // Modal para agregar justificación
  const [modalJustificar, setModalJustificar] = useState<{ id: number; nombre: string; texto: string } | null>(null);

  useEffect(() => {
    const actualizarReloj = () => {
      const d = new Date();
      setRelojHora(d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setRelojFecha(d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    };
    actualizarReloj();
    const interval = setInterval(actualizarReloj, 1000);
    return () => clearInterval(interval);
  }, []);

  // Si cambia el usuario logueado y el campo está vacío, adoptarlo
  useEffect(() => {
    if (user?.username && !empleadoSeleccionado) {
      setEmpleadoSeleccionado(user.username);
    }
  }, [user]);

  // Consulta de datos al endpoint /api/checador
  const { data, isLoading } = useQuery<{
    registros: RegistroChecador[];
    empleados_sugeridos: string[];
    metricas: MetricasChecador;
  }>({
    queryKey: ['checador-datos', filtroFecha, filtroEstado, busquedaEmpleado],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filtroFecha) params.set('fecha', filtroFecha);
      if (filtroEstado) params.set('estado', filtroEstado);
      if (busquedaEmpleado.trim()) params.set('empleado', busquedaEmpleado.trim());
      return apiFetch(`/api/checador?${params.toString()}`);
    },
    refetchInterval: 4000, // Actualización automática en vivo
  });

  const registros = data?.registros ?? [];
  const metricas = data?.metricas ?? {
    activas_ahora: 0,
    total_hoy: 0,
    completadas_hoy: 0,
    a_tiempo_hoy: 0,
    excedidas_hoy: 0,
    porcentaje_cumplimiento: 100,
    promedio_minutos: 0,
  };
  const empleadosSugeridos = data?.empleados_sugeridos ?? [];

  // Mutación: Registrar Salida
  const salidaMutation = useMutation({
    mutationFn: (payload: any) =>
      apiFetch('/api/checador', {
        method: 'POST',
        body: JSON.stringify({ action: 'salida', ...payload }),
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['checador-datos'] });
      toast.success(`Salida registrada para ${res.registro.nombre_empleado}. Cronómetro de ${res.registro.limite_minutos} min iniciado.`);
      setMotivoManual('');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Error al registrar salida');
    },
  });

  // Mutación: Registrar Entrada / Regreso
  const entradaMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch('/api/checador', {
        method: 'POST',
        body: JSON.stringify({ action: 'entrada', id }),
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['checador-datos'] });
      const reg = res.registro;
      const mins = Math.floor((reg.duracion_segundos || 0) / 60);
      const segs = (reg.duracion_segundos || 0) % 60;
      if (reg.estado === 'excedido') {
        toast.warning(
          `Regreso registrado para ${reg.nombre_empleado}. Duración: ${mins}m ${segs}s (Superó el límite de ${reg.limite_minutos} min).`,
          { duration: 6000 }
        );
        // Abrir modal de justificación de inmediato
        setModalJustificar({ id: reg.id, nombre: reg.nombre_empleado, texto: '' });
      } else {
        toast.success(`Regreso a tiempo registrado para ${reg.nombre_empleado} (${mins}m ${segs}s).`);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Error al registrar entrada');
    },
  });

  // Mutación: Guardar Justificación
  const justificarMutation = useMutation({
    mutationFn: ({ id, justificacion }: { id: number; justificacion: string }) =>
      apiFetch('/api/checador', {
        method: 'POST',
        body: JSON.stringify({ action: 'justificar', id, justificacion }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checador-datos'] });
      toast.success('Justificación guardada');
      setModalJustificar(null);
    },
    onError: (err: Error) => toast.error(err.message || 'Error al guardar justificación'),
  });

  // Mutación: Eliminar Registro (Admin/Editor)
  const eliminarMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/checador?id=${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checador-datos'] });
      toast.success('Registro eliminado');
    },
    onError: (err: Error) => toast.error(err.message || 'Error al eliminar'),
  });

  const tipoSalidaSeleccionado = TIPOS_SALIDA.find((t) => t.id === tipoSalidaId) ?? TIPOS_SALIDA[0];

  const handleRegistrarSalida = () => {
    const nombre = empleadoSeleccionado.trim();
    if (!nombre) {
      toast.error('Ingresa o selecciona el nombre del colaborador');
      return;
    }

    const motivoFinal = motivo === 'Otro' ? motivoManual.trim() || 'Salida intermedia' : motivo;

    salidaMutation.mutate({
      nombre_empleado: nombre,
      departamento,
      tipo_salida: tipoSalidaId,
      limite_minutos: tipoSalidaSeleccionado.limite,
      motivo: motivoFinal,
    });
  };

  // Salidas activas en curso
  const salidasActivas = useMemo(
    () => registros.filter((r) => r.estado === 'en_curso'),
    [registros]
  );

  // Salidas finalizadas para la bitácora
  const bitacoraRegistros = useMemo(
    () => registros.filter((r) => r.estado !== 'en_curso'),
    [registros]
  );

  // Exportar a CSV / Excel
  const exportarCSV = () => {
    if (registros.length === 0) {
      toast.info('No hay registros para exportar');
      return;
    }

    const encabezados = ['ID', 'Colaborador', 'Departamento', 'Tipo Salida', 'Límite (min)', 'Hora Salida', 'Hora Entrada', 'Duración (seg)', 'Estado', 'Motivo', 'Justificación', 'Registrado Por'];
    const filas = registros.map((r) => [
      r.id,
      `"${r.nombre_empleado}"`,
      `"${r.departamento || ''}"`,
      `"${r.tipo_salida}"`,
      r.limite_minutos,
      `"${r.hora_salida}"`,
      `"${r.hora_entrada || ''}"`,
      r.duracion_segundos || 0,
      `"${r.estado}"`,
      `"${(r.motivo || '').replace(/"/g, '""')}"`,
      `"${(r.justificacion || '').replace(/"/g, '""')}"`,
      `"${r.registrado_por || ''}"`,
    ]);

    const contenido = [encabezados.join(','), ...filas.map((f) => f.join(','))].join('\n');
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `checador_salidas_${filtroFecha || 'reporte'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Bitácora descargada en formato CSV');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16 font-sans">
      {/* Encabezado Principal y Reloj Digital */}
      <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/reglamento">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Reglamento
              </Button>
            </Link>
            <span className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold px-2 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Política Oficial de Trabajo
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
            <Timer className="w-6 h-6 text-amber-500 shrink-0" />
            Checador de Salidas de 10 Minutos
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 max-w-2xl">
            Control en tiempo real de salidas intermedias personales y comisiones laborales estipuladas en el Capítulo IV del Reglamento Interior.
          </p>
        </div>

        {/* Reloj Digital en Vivo */}
        <div className="bg-slate-950 text-white rounded-xl px-4 py-3 border border-slate-800 shadow-inner flex flex-col items-center sm:items-end self-stretch lg:self-auto shrink-0">
          <div className="text-2xl sm:text-3xl font-mono font-black tracking-wider text-emerald-400">
            {relojHora || '--:--:--'}
          </div>
          <div className="text-[11px] text-slate-400 capitalize mt-0.5">
            {relojFecha || 'Cargando fecha...'}
          </div>
        </div>
      </div>

      {/* Tarjetas KPI del Día */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 sm:p-4 shadow-xs">
          <div className="text-xs text-muted-foreground font-semibold flex items-center justify-between">
            <span>En Curso Ahora</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-2xl font-bold font-mono text-primary mt-1">{metricas.activas_ahora}</div>
          <div className="text-[10.5px] text-muted-foreground mt-0.5">Personal fuera del edificio</div>
        </div>

        <div className="bg-card border border-border rounded-xl p-3 sm:p-4 shadow-xs">
          <div className="text-xs text-muted-foreground font-semibold">Salidas Hoy</div>
          <div className="text-2xl font-bold font-mono text-foreground mt-1">{metricas.total_hoy}</div>
          <div className="text-[10.5px] text-muted-foreground mt-0.5">{metricas.completadas_hoy} concluidas</div>
        </div>

        <div className="bg-card border border-border rounded-xl p-3 sm:p-4 shadow-xs">
          <div className="text-xs text-muted-foreground font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> A Tiempo
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {metricas.a_tiempo_hoy}
          </div>
          <div className="text-[10.5px] text-muted-foreground mt-0.5">{metricas.porcentaje_cumplimiento}% de cumplimiento</div>
        </div>

        <div className="bg-card border border-border rounded-xl p-3 sm:p-4 shadow-xs">
          <div className="text-xs text-muted-foreground font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Excedidas
          </div>
          <div className="text-2xl font-bold font-mono text-red-600 dark:text-red-400 mt-1">
            {metricas.excedidas_hoy}
          </div>
          <div className="text-[10.5px] text-muted-foreground mt-0.5">Superaron tolerancia</div>
        </div>

        <div className="bg-card border border-border rounded-xl p-3 sm:p-4 shadow-xs col-span-2 lg:col-span-1">
          <div className="text-xs text-muted-foreground font-semibold">Duración Promedio</div>
          <div className="text-2xl font-bold font-mono text-foreground mt-1">
            {metricas.promedio_minutos} <span className="text-sm font-normal text-muted-foreground">min</span>
          </div>
          <div className="text-[10.5px] text-muted-foreground mt-0.5">Por salida hoy</div>
        </div>
      </div>

      {/* Sección Doble: Registrar Salida + Salidas Activas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Panel Izquierdo: Formulario de Nueva Salida (5 cols) */}
        <div className="lg:col-span-5 bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Play className="w-4 h-4 text-emerald-500 fill-emerald-500" /> Registrar Salida
              </h2>
              <span className="text-[11px] font-mono text-muted-foreground">Inicia cronómetro</span>
            </div>

            {/* Selector o entrada de Colaborador */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Colaborador / Personal que sale:
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                  <input
                    type="text"
                    list="lista-empleados"
                    value={empleadoSeleccionado}
                    onChange={(e) => setEmpleadoSeleccionado(e.target.value)}
                    placeholder="Escribe o selecciona nombre..."
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary font-medium"
                  />
                  <datalist id="lista-empleados">
                    {empleadosSugeridos.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>
                {user?.username && empleadoSeleccionado !== user.username && (
                  <button
                    type="button"
                    onClick={() => setEmpleadoSeleccionado(user.username)}
                    className="text-[11px] text-primary hover:underline mt-1 inline-block"
                  >
                    Usar mi usuario ({user.username})
                  </button>
                )}
              </div>

              {/* Departamento */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Área / Departamento:
                </label>
                <Select
                  value={departamento}
                  onChange={(e) => setDepartamento(e.target.value)}
                  className="h-9 text-xs rounded-xl bg-background"
                >
                  <option value="Oficinas">Personal de Oficina · Corporativo Insurgentes</option>
                  <option value="Administración">Administración y Finanzas</option>
                  <option value="Ventas">Ventas y Comercial</option>
                  <option value="Operativo">Personal Operativo / Guardias</option>
                  <option value="Reclutamiento">Reclutamiento y RRHH</option>
                </Select>
              </div>

              {/* Tipo de Salida (Botones interactivos) */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  Tipo de Salida Estipulada:
                </label>
                <div className="space-y-2">
                  {TIPOS_SALIDA.map((t) => {
                    const Icono = t.icono;
                    const activo = tipoSalidaId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTipoSalidaId(t.id)}
                        className={cn(
                          'w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2',
                          activo
                            ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary'
                            : 'border-border hover:bg-muted/50'
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={cn(
                              'p-1.5 rounded-lg shrink-0',
                              activo ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                            )}
                          >
                            <Icono className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-foreground truncate">{t.titulo}</div>
                            <div className="text-[10.5px] text-muted-foreground truncate">{t.descripcion}</div>
                          </div>
                        </div>
                        <span className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded bg-background border shrink-0">
                          {t.limite} min
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Motivo de la salida */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Motivo / Destino:
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {MOTIVOS_RAPIDOS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setMotivo(m);
                        setMotivoManual('');
                      }}
                      className={cn(
                        'px-2 py-1 rounded-lg text-[11px] font-medium transition-colors border',
                        motivo === m
                          ? 'bg-primary text-white border-primary'
                          : 'bg-muted/60 text-muted-foreground border-border hover:text-foreground'
                      )}
                    >
                      {m}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setMotivo('Otro')}
                    className={cn(
                      'px-2 py-1 rounded-lg text-[11px] font-medium transition-colors border',
                      motivo === 'Otro'
                        ? 'bg-primary text-white border-primary'
                        : 'bg-muted/60 text-muted-foreground border-border hover:text-foreground'
                    )}
                  >
                    Otro motivo...
                  </button>
                </div>

                {motivo === 'Otro' && (
                  <Input
                    type="text"
                    value={motivoManual}
                    onChange={(e) => setMotivoManual(e.target.value)}
                    placeholder="Especifica el motivo de la salida..."
                    className="h-8 text-xs mt-1"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Botón principal de salida */}
          <div className="mt-5 pt-4 border-t border-border">
            <Button
              onClick={handleRegistrarSalida}
              disabled={salidaMutation.isPending || !empleadoSeleccionado.trim()}
              className="w-full py-3 h-12 text-sm font-extrabold bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-md flex items-center justify-center gap-2 tracking-wide"
            >
              <Timer className="w-5 h-5 text-slate-950" />
              <span>REGISTRAR SALIDA ({tipoSalidaSeleccionado.limite} MIN)</span>
            </Button>
            <p className="text-[10.5px] text-muted-foreground text-center mt-2">
              Se iniciará el temporizador decreciente con tolerancia de {tipoSalidaSeleccionado.limite} minutos.
            </p>
          </div>
        </div>

        {/* Panel Derecho: Salidas en Curso Activas (7 cols) */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">Salidas Activas en Este Momento</h2>
              </div>
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                {salidasActivas.length} {salidasActivas.length === 1 ? 'persona fuera' : 'personas fuera'}
              </span>
            </div>

            {salidasActivas.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground space-y-3">
                <div className="w-16 h-16 rounded-full bg-muted/60 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm sm:text-base">No hay salidas en curso</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    Todo el personal se encuentra dentro de las instalaciones o ya ha registrado su regreso.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto max-h-[580px] pr-1">
                {salidasActivas.map((reg) => (
                  <TarjetaSalidaActiva
                    key={reg.id}
                    registro={reg}
                    onMarcarEntrada={(id) => entradaMutation.mutate(id)}
                    isPending={entradaMutation.isPending}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sección Bitácora / Historial de Checadas */}
      <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" /> Bitácora de Registro de Salidas y Entradas
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Historial de movimientos, tiempos de estancia exterior y cumplimiento normativo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={exportarCSV} variant="outline" size="sm" className="h-8 text-xs">
              <Download className="w-3.5 h-3.5 mr-1.5" /> Exportar CSV / Excel
            </Button>
            <Link href="/reglamento">
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-blue-600" /> Ver Reglamento Oficial
              </Button>
            </Link>
          </div>
        </div>

        {/* Filtros de la tabla */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar colaborador..."
              value={busquedaEmpleado}
              onChange={(e) => setBusquedaEmpleado(e.target.value)}
              className="w-full pl-8 pr-3 h-8 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <input
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              className="w-full px-3 h-8 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <Select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="h-8 text-xs rounded-lg bg-background"
            >
              <option value="todos">Todos los estatus</option>
              <option value="en_curso">En curso (actualmente fuera)</option>
              <option value="a_tiempo">A tiempo (≤ tolerancia)</option>
              <option value="excedido">Excedidas (retardo)</option>
            </Select>
          </div>
        </div>

        {/* Tabla de Registros */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/60 text-muted-foreground font-semibold border-b border-border">
                  <th className="p-3">Colaborador</th>
                  <th className="p-3">Tipo Salida</th>
                  <th className="p-3">Hora Salida</th>
                  <th className="p-3">Hora Regreso</th>
                  <th className="p-3">Duración</th>
                  <th className="p-3">Estatus</th>
                  <th className="p-3">Motivo / Justificación</th>
                  {(isAdmin || isEditor) && <th className="p-3 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {registros.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      No se encontraron registros de salidas con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  registros.map((r) => {
                    const duracionMins = r.duracion_segundos ? Math.floor(r.duracion_segundos / 60) : 0;
                    const duracionSegs = r.duracion_segundos ? r.duracion_segundos % 60 : 0;
                    const duracionTexto = r.duracion_segundos !== null ? `${duracionMins}m ${duracionSegs}s` : 'En curso';

                    return (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-foreground">{r.nombre_empleado}</div>
                          <div className="text-[10.5px] text-muted-foreground">{r.departamento || 'Oficinas'}</div>
                        </td>
                        <td className="p-3 font-medium">
                          <span className="px-2 py-0.5 rounded bg-muted text-[11px] font-mono">
                            {r.limite_minutos} min
                          </span>
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">
                          {new Date(r.hora_salida).toLocaleTimeString('es-MX', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">
                          {r.hora_entrada
                            ? new Date(r.hora_entrada).toLocaleTimeString('es-MX', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })
                            : <span className="text-amber-600 font-semibold animate-pulse">Fuera</span>}
                        </td>
                        <td className="p-3 font-mono font-bold">
                          {duracionTexto}
                        </td>
                        <td className="p-3">
                          {r.estado === 'en_curso' ? (
                            <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10.5px] font-bold inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> En curso
                            </span>
                          ) : r.estado === 'a_tiempo' ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10.5px] font-bold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> A tiempo
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-[10.5px] font-bold inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Excedido
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="text-foreground">{r.motivo || '—'}</div>
                          {r.justificacion ? (
                            <div className="text-[11px] text-amber-700 dark:text-amber-400 italic mt-0.5 flex items-center gap-1">
                              <MessageSquare className="w-3 h-3 shrink-0" /> {r.justificacion}
                            </div>
                          ) : r.estado === 'excedido' ? (
                            <button
                              type="button"
                              onClick={() => setModalJustificar({ id: r.id, nombre: r.nombre_empleado, texto: '' })}
                              className="text-[10.5px] text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5 font-medium"
                            >
                              <Plus className="w-2.5 h-2.5" /> Agregar justificación
                            </button>
                          ) : null}
                        </td>
                        {(isAdmin || isEditor) && (
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`¿Eliminar registro de ${r.nombre_empleado}?`)) {
                                  eliminarMutation.mutate(r.id);
                                }
                              }}
                              title="Eliminar registro"
                              className="text-muted-foreground hover:text-red-500 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal para ingresar Justificación de Retardo */}
      {modalJustificar && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-base">Justificación de Salida Excedida</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              El colaborador <strong className="text-foreground">{modalJustificar.nombre}</strong> excedió el tiempo establecido por el reglamento. Ingresa una justificación u observación para el expediente:
            </p>

            <textarea
              rows={3}
              value={modalJustificar.texto}
              onChange={(e) => setModalJustificar({ ...modalJustificar, texto: e.target.value })}
              placeholder="Ej. Fila extraordinaria en sucursal bancaria, tráfico vehicular, encargo urgente..."
              className="w-full p-2.5 text-xs rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalJustificar(null)}
                className="h-8 text-xs"
              >
                Omitir
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  justificarMutation.mutate({
                    id: modalJustificar.id,
                    justificacion: modalJustificar.texto,
                  })
                }
                disabled={justificarMutation.isPending || !modalJustificar.texto.trim()}
                className="h-8 text-xs"
              >
                Guardar Justificación
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
