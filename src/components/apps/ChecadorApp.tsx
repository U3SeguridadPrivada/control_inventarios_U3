'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select } from '@/src/components/ui/select';
import {
  Timer, Clock, ArrowLeft, CheckCircle2, AlertCircle, Play,
  User, Building2, Search, Download, Trash2,
  FileText, ShieldCheck, Coffee, Utensils, Briefcase, Plus,
  Camera, Upload, X, Eye, RefreshCw, Check, AlertTriangle
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
  numero_descanso: number;
  foto_evidencia: string | null;
  foto_regreso: string | null;
  hora_salida: string;
  hora_entrada: string | null;
  duracion_segundos: number | null;
  estado: 'en_curso' | 'a_tiempo' | 'excedido';
  motivo: string | null;
  justificacion: string | null;
  registrado_por: string | null;
  created_at: string;
}

interface ResumenOficinista {
  total_10min: number;
  restantes_10min: number;
  cupo_agotado: boolean;
  detalles: Array<{
    id: number;
    numero_descanso: number;
    hora_salida: string;
    hora_entrada: string | null;
    duracion_segundos: number | null;
    estado: string;
    foto_evidencia: string | null;
  }>;
}

interface ConfiguracionReglamento {
  protocolo_id: number;
  titulo_seccion: string;
  actualizado_en: string | null;
  total_descansos: number;
  limite_minutos_defecto: number;
  descansos: Array<{
    id: string;
    numero: number;
    titulo: string;
    limite_minutos: number;
    descripcion: string;
    condicion: string;
  }>;
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

interface ChecadorResponse {
  registros: RegistroChecador[];
  configuracion_reglamento?: ConfiguracionReglamento;
  empleados_sugeridos: string[];
  resumen_oficinistas_hoy: Record<string, ResumenOficinista>;
  metricas: MetricasChecador;
}

const DESCANSOS_REGLAMENTO_DEFECTO = [
  {
    id: '10_min_1',
    tipo: '10_min',
    numero: 1,
    titulo: 'Descanso 1 (10 min)',
    limite_minutos: 10,
    subtitulo: 'Primer descanso oficial del día',
    descripcion: 'Cafetería, paso a la tienda o descanso matutino.',
  },
  {
    id: '10_min_2',
    tipo: '10_min',
    numero: 2,
    titulo: 'Descanso 2 (10 min)',
    limite_minutos: 10,
    subtitulo: 'Segundo descanso oficial del día',
    descripcion: 'Refrigerio, cajero automático o trámite breve.',
  },
  {
    id: '10_min_3',
    tipo: '10_min',
    numero: 3,
    titulo: 'Descanso 3 (10 min)',
    limite_minutos: 10,
    subtitulo: 'Tercer descanso oficial del día',
    descripcion: 'Zona exterior, fumar o descanso vespertino.',
  },
];

const OTRAS_SALIDAS = [
  {
    id: 'comida',
    tipo: 'comida',
    numero: 1,
    titulo: 'Comida (60 min)',
    limite: 60,
    subtitulo: 'Horario oficial de alimentos',
    descripcion: 'Turno escalonado entre 14:00 y 18:00 hrs.',
  },
  {
    id: 'comision',
    tipo: 'comision',
    numero: 1,
    titulo: 'Comisión Oficial',
    limite: 120,
    subtitulo: 'Encomienda de mandos o directivos',
    descripcion: 'Diligencia bancaria o trámite laboral asignado.',
  },
];

const MOTIVOS_SUGERIDOS = [
  'Cafetería / Bebidas',
  'Paso a la tienda / Alimentos',
  'Cajero automático',
  'Farmacia / Medicina',
  'Zona exterior / Descanso',
  'Diligencia laboral de oficina',
];

function formatearSegundos(segundosTotales: number) {
  const abs = Math.abs(segundosTotales);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function ChecadorApp() {
  const { user, isEditor, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  // Reloj digital en vivo
  const [ahora, setAhora] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Formulario de salida
  const [nombreEmpleado, setNombreEmpleado] = useState('');
  const [departamento, setDepartamento] = useState('Oficinas');
  const [tipoSeleccionado, setTipoSeleccionado] = useState<string>('10_min_1');
  const [motivo, setMotivo] = useState('');
  const [fotoEvidencia, setFotoEvidencia] = useState<string | null>(null);

  // Cámara web
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtros de historial
  const [filtroFecha, setFiltroFecha] = useState(new Date().toISOString().slice(0, 10));
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [tabActual, setTabActual] = useState<'activo' | 'resumen' | 'historial'>('activo');

  // Modal para ver foto ampliada
  const [fotoModalUrl, setFotoModalUrl] = useState<string | null>(null);

  // Modal para justificación al regresar
  const [justificarModal, setJustificarModal] = useState<{
    id: number;
    nombre: string;
    excesoMinutos: number;
  } | null>(null);
  const [textoJustificacion, setTextoJustificacion] = useState('');

  // Consulta de datos
  const { data, isLoading } = useQuery<ChecadorResponse>({
    queryKey: ['checador', filtroFecha, filtroEstado, busqueda],
    queryFn: () => {
      const p = new URLSearchParams();
      if (filtroFecha) p.set('fecha', filtroFecha);
      if (filtroEstado) p.set('estado', filtroEstado);
      if (busqueda) p.set('empleado', busqueda);
      return apiFetch<ChecadorResponse>(`/api/checador?${p.toString()}`);
    },
    refetchInterval: 5000,
  });

  const registros = data?.registros ?? [];
  const empleadosSugeridos = data?.empleados_sugeridos ?? [];
  const resumenOficinistas = data?.resumen_oficinistas_hoy ?? {};
  const metricas = data?.metricas ?? {
    activas_ahora: 0,
    total_hoy: 0,
    completadas_hoy: 0,
    a_tiempo_hoy: 0,
    excedidas_hoy: 0,
    porcentaje_cumplimiento: 100,
    promedio_minutos: 0,
  };

  // Configuración viva desde el Capítulo IV del Reglamento Interior
  const configReglamento = data?.configuracion_reglamento ?? {
    protocolo_id: 23,
    titulo_seccion: 'Política de Salidas Intermedias (Breaks y Permisos Cortos)',
    actualizado_en: null,
    total_descansos: 3,
    limite_minutos_defecto: 10,
    descansos: DESCANSOS_REGLAMENTO_DEFECTO,
  };

  const descansosReglamento = configReglamento.descansos?.length
    ? configReglamento.descansos
    : DESCANSOS_REGLAMENTO_DEFECTO;

  // Prellenar nombre con usuario en sesión si está vacío
  useEffect(() => {
    if (!nombreEmpleado && user?.username) {
      setNombreEmpleado(user.username);
    }
  }, [user?.username, nombreEmpleado]);

  // Resumen del colaborador actualmente seleccionado
  const resumenSeleccionado = useMemo(() => {
    const key = nombreEmpleado.trim();
    if (!key) return null;
    return resumenOficinistas[key] ?? {
      total_10min: 0,
      restantes_10min: configReglamento.total_descansos,
      cupo_agotado: false,
      detalles: [],
    };
  }, [nombreEmpleado, resumenOficinistas, configReglamento.total_descansos]);

  // Ajustar automáticamente el tipo de salida según descansos ya tomados
  useEffect(() => {
    if (!resumenSeleccionado) return;
    const tomados = resumenSeleccionado.total_10min;
    if (descansosReglamento[tomados]) {
      setTipoSeleccionado(descansosReglamento[tomados].id);
    }
  }, [resumenSeleccionado?.total_10min, descansosReglamento]);

  // Manejo de la cámara web
  const abrirCamara = async () => {
    try {
      setCamaraAbierta(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      toast.error('No se pudo abrir la cámara. Puede seleccionar un archivo de foto.');
      setCamaraAbierta(false);
    }
  };

  const cerrarCamara = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCamaraAbierta(false);
  };

  const tomarFoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    cerrarCamara();
    setFotoEvidencia(dataUrl);
    toast.success('Foto de evidencia capturada');
  };

  const subirArchivoFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFotoEvidencia(reader.result);
        toast.success('Foto de evidencia adjuntada');
      }
    };
    reader.readAsDataURL(file);
  };

  // Mutaciones
  const salidaMutation = useMutation({
    mutationFn: (payload: any) =>
      apiFetch('/api/checador', {
        method: 'POST',
        body: JSON.stringify({ action: 'salida', ...payload }),
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['checador'] });
      toast.success(
        res.numero_descanso
          ? `Salida registrada · Descanso ${res.numero_descanso} de 3`
          : 'Salida registrada correctamente'
      );
      setMotivo('');
      setFotoEvidencia(null);
      cerrarCamara();
    },
    onError: (err: any) => toast.error(err.message || 'Error al registrar salida'),
  });

  const entradaMutation = useMutation({
    mutationFn: (payload: { id: number; justificacion?: string }) =>
      apiFetch('/api/checador', {
        method: 'POST',
        body: JSON.stringify({ action: 'entrada', ...payload }),
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['checador'] });
      const reg = res.registro;
      if (reg?.estado === 'a_tiempo') {
        toast.success(`Regreso registrado a tiempo (${Math.round((reg.duracion_segundos || 0) / 60)} min)`);
      } else {
        const exceso = Math.max(0, Math.round(((reg.duracion_segundos || 0) - reg.limite_minutos * 60) / 60));
        toast.warning(`Regreso registrado con exceso de ${exceso} min`);
        setJustificarModal({
          id: reg.id,
          nombre: reg.nombre_empleado,
          excesoMinutos: exceso,
        });
        setTextoJustificacion('');
      }
    },
    onError: (err: any) => toast.error(err.message || 'Error al registrar entrada'),
  });

  const justificarMutation = useMutation({
    mutationFn: (payload: { id: number; justificacion: string }) =>
      apiFetch('/api/checador', {
        method: 'POST',
        body: JSON.stringify({ action: 'justificar', ...payload }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checador'] });
      toast.success('Justificación guardada');
      setJustificarModal(null);
    },
    onError: (err: any) => toast.error(err.message || 'Error al guardar justificación'),
  });

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/checador?id=${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checador'] });
      toast.success('Registro eliminado');
    },
    onError: (err: any) => toast.error(err.message || 'Error al eliminar'),
  });

  // Manejar envío de salida
  const handleRegistrarSalida = (e: React.FormEvent) => {
    e.preventDefault();
    const nombre = nombreEmpleado.trim();
    if (!nombre) {
      toast.error('Por favor indique el nombre del colaborador');
      return;
    }

    const opcionReglamento = descansosReglamento.find((d) => d.id === tipoSeleccionado);
    const opcionOtra = OTRAS_SALIDAS.find((o) => o.id === tipoSeleccionado);

    const tipo_salida = opcionReglamento ? '10_min' : opcionOtra ? opcionOtra.tipo : '10_min';
    const limite_minutos = opcionReglamento ? opcionReglamento.limite_minutos : opcionOtra ? opcionOtra.limite : 10;

    salidaMutation.mutate({
      nombre_empleado: nombre,
      departamento,
      tipo_salida,
      limite_minutos,
      motivo,
      foto_evidencia: fotoEvidencia,
    });
  };

  // Salidas activas en curso
  const salidasActivas = useMemo(() => {
    return registros.filter((r) => r.estado === 'en_curso');
  }, [registros]);

  // Exportar a CSV
  const exportarCSV = () => {
    if (!registros.length) {
      toast.error('No hay registros para exportar');
      return;
    }
    const headers = [
      'ID', 'Colaborador', 'Departamento', 'Descanso', 'Límite (min)',
      'Hora Salida', 'Hora Entrada', 'Duración (seg)', 'Estado', 'Motivo', 'Justificación', 'Registrado Por'
    ];
    const rows = registros.map((r) => [
      r.id,
      `"${r.nombre_empleado}"`,
      `"${r.departamento}"`,
      r.tipo_salida === '10_min' ? `Descanso ${r.numero_descanso || 1} de 3` : r.tipo_salida,
      r.limite_minutos,
      r.hora_salida,
      r.hora_entrada || '',
      r.duracion_segundos || '',
      r.estado,
      `"${(r.motivo || '').replace(/"/g, '""')}"`,
      `"${(r.justificacion || '').replace(/"/g, '""')}"`,
      `"${r.registrado_por || ''}"`
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `checador_salidas_${filtroFecha || 'general'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Archivo CSV descargado');
  };

  return (
    <div className="space-y-6 font-sans text-slate-900 dark:text-slate-100 max-w-7xl mx-auto pb-12">
      {/* Cabecera institucional sobria */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-start gap-3">
          <Link
            href="/reglamento"
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors mt-0.5"
            title="Volver al Reglamento"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Control de Descansos y Salidas
              </h1>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                Reglamento Art. IV
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Registro obligatorio de los {configReglamento.total_descansos} descansos de {configReglamento.limite_minutos_defecto} minutos con evidencia fotográfica.
            </p>
          </div>
        </div>

        {/* Reloj digital sobrio de precisión */}
        <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5">
          <Clock className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          <div>
            <div className="text-lg font-mono font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-none">
              {ahora.toLocaleTimeString('es-MX', { hour12: false })}
            </div>
            <div className="text-[10.5px] text-slate-500 uppercase font-medium mt-0.5">
              {ahora.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          </div>
        </div>
      </div>

      {/* Banner de vinculación en vivo con el Reglamento Interior */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
        <div className="flex items-start gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 mt-1" />
          <div>
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span>Normativa vinculada en tiempo real con el Reglamento Interior de Trabajo</span>
              <span className="text-[10px] font-semibold px-2 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Enlace Activo
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Capítulo IV: {configReglamento.titulo_seccion} · {configReglamento.total_descansos} descansos autorizados ({configReglamento.limite_minutos_defecto} min c/u)
              {configReglamento.actualizado_en &&
                ` · Última actualización: ${new Date(configReglamento.actualizado_en).toLocaleDateString('es-MX', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}`}
            </div>
          </div>
        </div>
        <Link
          href="/protocolos/23"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold text-slate-800 dark:text-slate-200 shrink-0 text-xs transition-colors shadow-xs"
        >
          <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>Editar en Reglamento</span>
        </Link>
      </div>

      {/* Indicadores clave del día (KPIs sobrios) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Personal Fuera Ahora</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {metricas.activas_ahora}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">En conteo decreciente</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Salidas Hoy</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {metricas.total_hoy}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">{metricas.completadas_hoy} concluidas</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Cumplimiento a Tiempo</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {metricas.porcentaje_cumplimiento}%
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">{metricas.a_tiempo_hoy} dentro de los 10 min</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tiempo Excedido</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {metricas.excedidas_hoy}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Requieren justificación</div>
        </div>
      </div>

      {/* Selector de pestañas */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-sm font-medium">
        <button
          onClick={() => setTabActual('activo')}
          className={cn(
            'pb-2.5 transition-colors border-b-2 -mb-px flex items-center gap-2',
            tabActual === 'activo'
              ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
          )}
        >
          <Timer className="w-4 h-4" /> Registro y Salidas Activas ({salidasActivas.length})
        </button>

        <button
          onClick={() => setTabActual('resumen')}
          className={cn(
            'pb-2.5 transition-colors border-b-2 -mb-px flex items-center gap-2',
            tabActual === 'resumen'
              ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
          )}
        >
          <User className="w-4 h-4" /> Monitor de Oficinistas (3 Descansos de 10 min)
        </button>

        <button
          onClick={() => setTabActual('historial')}
          className={cn(
            'pb-2.5 transition-colors border-b-2 -mb-px flex items-center gap-2',
            tabActual === 'historial'
              ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
          )}
        >
          <FileText className="w-4 h-4" /> Bitácora General y Evidencias
        </button>
      </div>

      {/* TAB 1: REGISTRO Y SALIDAS ACTIVAS */}
      {tabActual === 'activo' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Formulario de registro de salida (Lado izquierdo) */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-white">
                  Registrar Salida de Oficina
                </h2>
              </div>
              <span className="text-[10.5px] text-slate-500 font-mono">10 min oficiales</span>
            </div>

            <form onSubmit={handleRegistrarSalida} className="space-y-4">
              {/* Colaborador */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nombre del Colaborador
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <Input
                    list="empleados-sugeridos"
                    value={nombreEmpleado}
                    onChange={(e) => setNombreEmpleado(e.target.value)}
                    placeholder="Ej. Ana García, Carlos López..."
                    className="pl-8 text-xs font-medium"
                    required
                  />
                  <datalist id="empleados-sugeridos">
                    {empleadosSugeridos.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Contador de descansos del día para el colaborador */}
              {resumenSeleccionado && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      Descansos utilizados hoy:
                    </span>
                    <span
                      className={cn(
                        'font-bold px-2 py-0.5 rounded text-[11px]',
                        resumenSeleccionado.cupo_agotado
                          ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                          : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                      )}
                    >
                      {resumenSeleccionado.total_10min} de {configReglamento.total_descansos} usados
                    </span>
                  </div>

                  {/* Pasos dinámicos de descansos */}
                  <div
                    className="grid gap-2 text-center text-[10.5px]"
                    style={{ gridTemplateColumns: `repeat(${Math.max(1, configReglamento.total_descansos)}, minmax(0, 1fr))` }}
                  >
                    {Array.from({ length: configReglamento.total_descansos }, (_, i) => i + 1).map((num) => {
                      const usado = resumenSeleccionado.total_10min >= num;
                      return (
                        <div
                          key={num}
                          className={cn(
                            'py-1.5 px-1 rounded border font-medium flex items-center justify-center gap-1',
                            usado
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500'
                          )}
                        >
                          {usado ? <Check className="w-3 h-3" /> : null}
                          Descanso {num}
                        </div>
                      );
                    })}
                  </div>

                  {resumenSeleccionado.cupo_agotado && (
                    <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Atención: El colaborador ya cubrió sus {configReglamento.total_descansos} descansos de {configReglamento.limite_minutos_defecto} min permitidos por el reglamento.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Selección del tipo de descanso (Reglamento vs Otro) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Permiso de Descanso ({configReglamento.limite_minutos_defecto} Minutos Oficiales)
                </label>
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, descansosReglamento.length))}, minmax(0, 1fr))` }}
                >
                  {descansosReglamento.map((d) => {
                    const seleccionado = tipoSeleccionado === d.id;
                    const yaTomado = (resumenSeleccionado?.total_10min ?? 0) >= d.numero;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setTipoSeleccionado(d.id)}
                        className={cn(
                          'p-2.5 rounded-lg border text-left transition-all',
                          seleccionado
                            ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-200 dark:bg-slate-100 dark:text-slate-900 font-bold'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                        )}
                      >
                        <div className="text-xs font-bold leading-tight flex items-center justify-between">
                          <span>{d.titulo}</span>
                          {yaTomado && (
                            <span className={cn('text-[9px] px-1 py-0.2 rounded', seleccionado ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>
                              Tomado
                            </span>
                          )}
                        </div>
                        <div className={cn('text-[10px] mt-0.5 line-clamp-2', seleccionado ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400')}>
                          {d.descripcion || `${d.limite_minutos} min autorizados`}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Salidas no personales (Comida / Comisión) */}
                <div className="flex gap-2 mt-2">
                  {OTRAS_SALIDAS.map((o) => {
                    const seleccionado = tipoSeleccionado === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setTipoSeleccionado(o.id)}
                        className={cn(
                          'flex-1 py-1.5 px-2 rounded-md border text-[11px] transition-colors',
                          seleccionado
                            ? 'border-slate-900 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                        )}
                      >
                        {o.titulo}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Motivo o destino breve */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Motivo / Destino breve
                </label>
                <Input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej. Tienda OXXO, café, cajero..."
                  className="text-xs"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {MOTIVOS_SUGERIDOS.slice(0, 4).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMotivo(m)}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* SECCIÓN DE FOTO DE EVIDENCIA */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-slate-600" /> Foto de Evidencia
                  </label>
                  {fotoEvidencia && (
                    <button
                      type="button"
                      onClick={() => setFotoEvidencia(null)}
                      className="text-[10.5px] text-red-600 hover:underline flex items-center gap-0.5"
                    >
                      <X className="w-3 h-3" /> Quitar foto
                    </button>
                  )}
                </div>

                {/* Cámara en vivo activa */}
                {camaraAbierta ? (
                  <div className="space-y-2">
                    <div className="relative rounded-lg overflow-hidden border-2 border-slate-800 bg-black aspect-video max-h-48 flex items-center justify-center">
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={tomarFoto}
                        className="flex-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
                      >
                        <Camera className="w-3.5 h-3.5 mr-1.5" /> Capturar Foto Ahora
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={cerrarCamara}
                        className="text-xs"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : fotoEvidencia ? (
                  /* Preview de foto capturada */
                  <div className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <img
                      src={fotoEvidencia}
                      alt="Evidencia"
                      className="w-16 h-16 rounded object-cover border border-slate-300 dark:border-slate-600 shadow-xs cursor-pointer"
                      onClick={() => setFotoModalUrl(fotoEvidencia)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Evidencia lista
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Foto capturada para validar el descanso.
                      </div>
                      <button
                        type="button"
                        onClick={() => setFotoModalUrl(fotoEvidencia)}
                        className="text-[10px] text-blue-600 hover:underline mt-1 inline-flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> Ver tamaño completo
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Botones para tomar o subir foto */
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={abrirCamara}
                      className="text-xs flex items-center justify-center gap-1.5 py-2.5 border-slate-300 dark:border-slate-700"
                    >
                      <Camera className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" /> Tomar Foto
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs flex items-center justify-center gap-1.5 py-2.5 border-slate-300 dark:border-slate-700"
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" /> Subir Archivo
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="user"
                      className="hidden"
                      onChange={subirArchivoFoto}
                    />
                  </div>
                )}
              </div>

              {/* Botón principal de salida */}
              <Button
                type="submit"
                disabled={salidaMutation.isPending}
                className="w-full bg-[#0f172a] hover:bg-slate-800 text-white font-bold text-xs py-2.5 rounded-lg transition-all"
              >
                <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                Registrar Salida de 10 Minutos
              </Button>
            </form>
          </div>

          {/* Salidas Activas en Vivo (Lado derecho) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-white flex items-center gap-2">
                <Timer className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                Personal Fuera de Oficina ({salidasActivas.length})
              </h2>
              <span className="text-xs text-slate-500">Temporizador oficial en vivo</span>
            </div>

            {salidasActivas.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-slate-500">
                <CheckCircle2 className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Todo el personal se encuentra en oficinas
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  No hay salidas ni descansos activos en este momento.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {salidasActivas.map((reg) => {
                  const salidaMs = new Date(reg.hora_salida).getTime();
                  const transcurridoSeg = Math.max(0, Math.floor((ahora.getTime() - salidaMs) / 1000));
                  const limiteSeg = reg.limite_minutos * 60;
                  const restanteSeg = limiteSeg - transcurridoSeg;
                  const esExcedido = restanteSeg < 0;

                  return (
                    <div
                      key={reg.id}
                      className={cn(
                        'rounded-xl border p-4 transition-all bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between',
                        esExcedido
                          ? 'border-red-400 dark:border-red-800'
                          : 'border-slate-200 dark:border-slate-700'
                      )}
                    >
                      <div>
                        {/* Cabecera del colaborador y número de descanso */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                              {reg.nombre_empleado}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {reg.departamento} · {reg.motivo || 'Sin motivo especificado'}
                            </div>
                          </div>
                          {/* Miniatura de foto si existe */}
                          {reg.foto_evidencia ? (
                            <img
                              src={reg.foto_evidencia}
                              alt="Evidencia"
                              onClick={() => setFotoModalUrl(reg.foto_evidencia)}
                              className="w-10 h-10 rounded-md object-cover border border-slate-300 dark:border-slate-600 shadow-xs cursor-pointer shrink-0"
                              title="Ver foto de evidencia"
                            />
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Sin foto</span>
                          )}
                        </div>

                        {/* Distintivo de descanso */}
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {reg.tipo_salida === '10_min'
                              ? `Descanso ${reg.numero_descanso || 1} de 3 · 10 min`
                              : `${reg.tipo_salida} · ${reg.limite_minutos} min`}
                          </span>
                        </div>

                        {/* Cronómetro sobrio de tiempo restante o excedido */}
                        <div className="my-3 text-center py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                          <div
                            className={cn(
                              'text-2xl font-mono font-bold tracking-tight',
                              esExcedido
                                ? 'text-red-700 dark:text-red-400'
                                : restanteSeg <= 120
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-slate-900 dark:text-slate-100'
                            )}
                          >
                            {esExcedido
                              ? `+${formatearSegundos(Math.abs(restanteSeg))}`
                              : formatearSegundos(restanteSeg)}
                          </div>
                          <div className="text-[10px] uppercase font-semibold text-slate-500 mt-0.5">
                            {esExcedido ? 'Tiempo Excedido del Reglamento' : 'Tiempo Restante Permitido'}
                          </div>
                        </div>

                        <div className="text-[10.5px] text-slate-500 flex items-center justify-between">
                          <span>Salió: {new Date(reg.hora_salida).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span>Límite: {reg.limite_minutos} min</span>
                        </div>
                      </div>

                      {/* Botón de Entrada (Regreso) */}
                      <Button
                        size="sm"
                        onClick={() => entradaMutation.mutate({ id: reg.id })}
                        disabled={entradaMutation.isPending}
                        className="w-full mt-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2 rounded-lg"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                        Registrar Entrada (Regreso)
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MONITOR DE OFICINISTAS (3 DESCANSOS DE 10 MINUTOS) */}
      {tabActual === 'resumen' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-white">
                Monitoreo de Descansos por Colaborador de Oficina
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Reglamento: {configReglamento.total_descansos} descansos de {configReglamento.limite_minutos_defecto} minutos cada uno al día.
              </p>
            </div>
            <div className="text-xs font-semibold text-slate-500">
              Fecha: {new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })}
            </div>
          </div>

          {Object.keys(resumenOficinistas).length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              Aún no hay colaboradores con descansos registrados el día de hoy.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {Object.entries(resumenOficinistas).map(([nombre, resumen]) => {
                return (
                  <div key={nombre} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300">
                        {nombre.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">{nombre}</div>
                        <div className="text-xs text-slate-500">
                          {resumen.total_10min} de {configReglamento.total_descansos} descansos tomados · Le quedan {resumen.restantes_10min}
                        </div>
                      </div>
                    </div>

                    {/* Barra visual dinámica de los descansos */}
                    <div className="flex items-center gap-2">
                      {Array.from({ length: configReglamento.total_descansos }, (_, i) => i + 1).map((num) => {
                        const detalle = resumen.detalles.find((d) => d.numero_descanso === num);
                        const tomado = Boolean(detalle);
                        const aTiempo = detalle?.estado === 'a_tiempo';
                        const excedido = detalle?.estado === 'excedido';

                        return (
                          <div
                            key={num}
                            className={cn(
                              'px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5',
                              tomado
                                ? excedido
                                  ? 'bg-red-50 dark:bg-red-950/30 border-red-300 text-red-800 dark:text-red-300'
                                  : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                            )}
                          >
                            <span>Descanso {num}</span>
                            {tomado ? (
                              excedido ? (
                                <span className="text-[10px] font-bold text-red-600">Excedido</span>
                              ) : (
                                <Check className="w-3 h-3 text-emerald-700" />
                              )
                            ) : (
                              <span className="text-[10px] text-slate-400">Disponible</span>
                            )}
                            {detalle?.foto_evidencia && (
                              <button
                                type="button"
                                onClick={() => setFotoModalUrl(detalle.foto_evidencia)}
                                className="text-blue-600 hover:text-blue-800"
                                title="Ver foto de evidencia"
                              >
                                <Camera className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        );
                      })}

                      {resumen.cupo_agotado && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                          Cupo Agotado
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: BITÁCORA GENERAL Y EVIDENCIAS */}
      {tabActual === 'historial' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-white">
                Bitácora de Salidas y Evidencias Fotográficas
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Historial con foto para auditoría interna.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportarCSV}
                className="text-xs font-semibold border-slate-300 dark:border-slate-700"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" /> Exportar CSV
              </Button>
            </div>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <Input
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              className="text-xs"
            />
            <Select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="text-xs"
            >
              <option value="todos">Todos los estados</option>
              <option value="en_curso">En curso (fuera ahora)</option>
              <option value="a_tiempo">A tiempo (≤ 10 min)</option>
              <option value="excedido">Excedido (&gt; 10 min)</option>
            </Select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <Input
                placeholder="Buscar por colaborador..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="pl-8 text-xs"
              />
            </div>
          </div>

          {/* Tabla sobria de registros */}
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                  <th className="p-3">Foto</th>
                  <th className="p-3">Colaborador</th>
                  <th className="p-3">Tipo / Descanso</th>
                  <th className="p-3">Salida</th>
                  <th className="p-3">Regreso</th>
                  <th className="p-3">Duración</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Motivo / Justificación</th>
                  {(isAdmin || isEditor) && <th className="p-3 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {registros.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-slate-400">
                      No se encontraron registros para los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  registros.map((r) => {
                    const duracionMin = r.duracion_segundos ? Math.round(r.duracion_segundos / 60) : null;
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="p-3">
                          {r.foto_evidencia ? (
                            <img
                              src={r.foto_evidencia}
                              alt="Evidencia"
                              onClick={() => setFotoModalUrl(r.foto_evidencia)}
                              className="w-10 h-10 rounded object-cover border border-slate-300 dark:border-slate-600 shadow-xs cursor-pointer"
                              title="Ver foto completa"
                            />
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Sin foto</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900 dark:text-white">{r.nombre_empleado}</div>
                          <div className="text-[10.5px] text-slate-500">{r.departamento}</div>
                        </td>
                        <td className="p-3">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {r.tipo_salida === '10_min'
                              ? `Descanso ${r.numero_descanso || 1} de 3`
                              : r.tipo_salida}
                          </span>
                          <span className="text-[10.5px] text-slate-500 block">Máx {r.limite_minutos} min</span>
                        </td>
                        <td className="p-3 font-mono text-[11.5px]">
                          {new Date(r.hora_salida).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-3 font-mono text-[11.5px]">
                          {r.hora_entrada
                            ? new Date(r.hora_entrada).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                            : <span className="text-amber-600 font-semibold">En curso</span>}
                        </td>
                        <td className="p-3 font-mono text-[11.5px]">
                          {duracionMin !== null ? `${duracionMin} min` : '—'}
                        </td>
                        <td className="p-3">
                          {r.estado === 'en_curso' && (
                            <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                              Fuera ahora
                            </span>
                          )}
                          {r.estado === 'a_tiempo' && (
                            <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                              A tiempo
                            </span>
                          )}
                          {r.estado === 'excedido' && (
                            <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-red-50 text-red-800 border border-red-300">
                              Excedido
                            </span>
                          )}
                        </td>
                        <td className="p-3 max-w-xs">
                          <div className="truncate text-slate-700 dark:text-slate-300">{r.motivo || '—'}</div>
                          {r.justificacion && (
                            <div className="text-[10.5px] text-amber-800 dark:text-amber-300 italic truncate mt-0.5">
                              Justificación: {r.justificacion}
                            </div>
                          )}
                        </td>
                        {(isAdmin || isEditor) && (
                          <td className="p-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`¿Eliminar registro de ${r.nombre_empleado}?`)) {
                                  eliminarMutation.mutate(r.id);
                                }
                              }}
                              className="text-slate-400 hover:text-red-600 p-1"
                              title="Eliminar registro"
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
      )}

      {/* MODAL PARA VER FOTO AMPLIADA */}
      {fotoModalUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setFotoModalUrl(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden max-w-lg w-full border border-slate-300 dark:border-slate-700 shadow-2xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Evidencia Fotográfica de Salida
              </span>
              <button
                type="button"
                onClick={() => setFotoModalUrl(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img src={fotoModalUrl} alt="Evidencia ampliada" className="w-full h-auto rounded-lg object-contain max-h-[70vh]" />
          </div>
        </div>
      )}

      {/* MODAL PARA JUSTIFICAR TIEMPO EXCEDIDO */}
      {justificarModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full border border-slate-300 dark:border-slate-700 shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 border-b border-slate-200 dark:border-slate-800 pb-3">
              <AlertCircle className="w-5 h-5" />
              <h3 className="text-sm font-bold uppercase tracking-wide">
                Tiempo de Descanso Excedido ({justificarModal.excesoMinutos} min)
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              El descanso de <strong>{justificarModal.nombre}</strong> superó los 10 minutos autorizados por el reglamento. Indique el motivo o justificación para el expediente:
            </p>
            <textarea
              value={textoJustificacion}
              onChange={(e) => setTextoJustificacion(e.target.value)}
              placeholder="Ej. Fila en el banco, atención de urgencia médica..."
              className="w-full text-xs p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              rows={3}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setJustificarModal(null)}
                className="text-xs"
              >
                Omitir por ahora
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  justificarMutation.mutate({
                    id: justificarModal.id,
                    justificacion: textoJustificacion,
                  });
                }}
                disabled={justificarMutation.isPending}
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
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
