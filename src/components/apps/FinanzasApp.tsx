'use client';
import { useMemo, useState } from 'react';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, Cell } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select } from '@/src/components/ui/select';
import { Badge } from '@/src/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import { Plus, Landmark, TrendingDown, TrendingUp, Wallet, CreditCard, Banknote, ChevronLeft, ChevronRight, Paperclip, Pencil, Trash2, Loader2, FileText, ExternalLink, ImageIcon, Lock } from 'lucide-react';
import { fmtDate } from '@/src/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';

interface CuentaBancaria { id: number; banco: string; alias: string; numero_cuenta: string | null; tipo: string; moneda: string; saldo_actual: number; activa: number }
interface Movimiento {
  id: number; fecha: string; tipo: string; categoria: string; monto: number;
  cuenta_bancaria_id: number | null; descripcion: string | null;
  libro: string; medio_pago: string | null; nombre: string | null; tipo_detalle: string | null;
  turno: string | null; alimentos: string | null; servicio: string | null; guardia_id: number | null;
  evidencias: number;
}
interface Evidencia { id: number; movimiento_id: number; nombre_documento: string; nombre_archivo: string; tipo_mimetype: string; fecha_subida: string }
interface Guardia { id: number; nombre: string; estado: string }
interface Servicio { id: number; nombre: string }
interface Libro { id: string; nombre: string; usuario_id: number | null; responsable: string | null; puede_editar: boolean }

const CAT_HE = 'H.E. Y DOBLETES';
const CAT_ANTICIPOS = 'ANTICIPOS';
const CAT_GASTOS = 'GASTOS DIVERSOS';
const CAT_INGRESOS = 'INGRESOS';
const CATEGORIAS_B = [CAT_HE, CAT_ANTICIPOS, CAT_GASTOS, CAT_INGRESOS] as const;

const CAT_STYLE: Record<string, string> = {
  [CAT_HE]: 'bg-amber-50 text-amber-700 border-amber-200',
  [CAT_ANTICIPOS]: 'bg-blue-50 text-blue-700 border-blue-200',
  [CAT_GASTOS]: 'bg-violet-50 text-violet-700 border-violet-200',
  [CAT_INGRESOS]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const MEDIOS_PAGO = ['TARJETA', 'EFECTIVO'];
const TIPOS_HE = ['DOBLETE', 'HORAS EXTRAS'];
const TURNOS = ['12 HORAS', '24 HORAS', '12/24 HRS', '14 HRS', '16 HRS', '30 MIN', '1 HR', '1:30 HR', '2 HRS', '2:30 HRS', '3 HRS', '3:30 HRS', '4 HRS', '4:30 HRS', '5 HRS', '5:30 HRS', '6 HRS', '7 HRS'];
const COLORES = ['#f59e0b', '#3b82f6', '#a855f7', '#10b981', '#ef4444', '#06b6d4'];

const fmtMoney = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hoyISO = () => new Date().toISOString().split('T')[0];
const shiftISO = (iso: string, dias: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
};
const authHeaders = (): Record<string, string> => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('inv_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const CUENTA_INICIAL = { banco: '', alias: '', numero_cuenta: '', tipo: 'Cheques', moneda: 'MXN', saldo_actual: '0' };
const MOV_INICIAL = {
  categoria: CAT_HE as string, medio_pago: 'TARJETA', fecha: hoyISO(), monto: '',
  nombre: '', tipo_detalle: 'DOBLETE', turno: '12 HORAS', alimentos: 'SI', servicio: '', descripcion: '',
};

// Descripción compuesta como la genera la macro del Excel en la hoja Consolidado
function destinoDe(m: Movimiento): string {
  if (m.categoria === CAT_HE) return [m.tipo_detalle, m.nombre, m.turno, m.alimentos ? `ALIMENTOS: ${m.alimentos}` : null, m.servicio, m.descripcion].filter(Boolean).join(' , ');
  if (m.categoria === CAT_INGRESOS) return [m.medio_pago, m.descripcion].filter(Boolean).join(' , ');
  return [m.nombre, m.descripcion].filter(Boolean).join(' , ');
}

function EvidenciaItem({ movId, ev, canDelete, onDelete }: { movId: number; ev: Evidencia; canDelete: boolean; onDelete: () => void }) {
  const esImagen = ev.tipo_mimetype.startsWith('image/');
  const { data: url } = useQuery({
    queryKey: ['evidencia-blob', ev.id],
    queryFn: async () => {
      const res = await fetch(`/api/movimientos-financieros/${movId}/evidencias/${ev.id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('No se pudo cargar la evidencia');
      return URL.createObjectURL(await res.blob());
    },
    staleTime: Infinity,
  });

  return (
    <div className="flex items-center gap-3 border border-border rounded-xl p-2.5 bg-card">
      <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
        {esImagen && url ? <img src={url} alt={ev.nombre_documento} className="w-full h-full object-cover" />
          : esImagen ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          : <FileText className="w-6 h-6 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{ev.nombre_documento}</p>
        <p className="text-xs text-muted-foreground">{fmtDate(ev.fecha_subida)}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => url && window.open(url, '_blank')}
          disabled={!url}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-primary hover:bg-primary/10 disabled:opacity-40 transition-colors"
          title="Ver evidencia"
        ><ExternalLink className="w-4 h-4" /></button>
        {canDelete && (
          <button onClick={onDelete} className="w-8 h-8 flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 transition-colors" title="Eliminar evidencia">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function FinanzasApp() {
  const { isEditor } = useAuth();
  const queryClient = useQueryClient();

  const [libroSel, setLibroSel] = useState<string | null>(null);
  const [tab, setTab] = useState<'consolidado' | typeof CATEGORIAS_B[number] | 'conciliacion' | 'cuentas'>('consolidado');
  const [desde, setDesde] = useState(shiftISO(hoyISO(), -7));
  const [hasta, setHasta] = useState(hoyISO());

  const [cuentaModalOpen, setCuentaModalOpen] = useState(false);
  const [cuentaForm, setCuentaForm] = useState(CUENTA_INICIAL);
  const [movModalOpen, setMovModalOpen] = useState(false);
  const [editingMov, setEditingMov] = useState<Movimiento | null>(null);
  const [movForm, setMovForm] = useState(MOV_INICIAL);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [evidMov, setEvidMov] = useState<Movimiento | null>(null);
  const [deletingMov, setDeletingMov] = useState<Movimiento | null>(null);

  const { data: libros = [], isLoading: loadingLibros } = useQuery({ queryKey: ['libros-financieros'], queryFn: () => apiFetch<Libro[]>('/api/libros-financieros') });
  const libroActivo = libros.find((l) => l.id === libroSel) ?? libros[0] ?? null;
  const libro = libroActivo?.id ?? '';
  const puedeEditar = libroActivo?.puede_editar ?? false;

  const { data: cuentas = [], isLoading: loadingCuentas } = useQuery({ queryKey: ['cuentas-bancarias'], queryFn: () => apiFetch<CuentaBancaria[]>('/api/cuentas-bancarias') });
  const { data: movimientos = [], isLoading: loadingMovs } = useQuery({ queryKey: ['movimientos-financieros', libro], queryFn: () => apiFetch<Movimiento[]>(`/api/movimientos-financieros?libro=${libro}`), enabled: !!libro });
  const { data: guardias = [] } = useQuery({ queryKey: ['guardias'], queryFn: () => apiFetch<Guardia[]>('/api/guardias') });
  const { data: servicios = [] } = useQuery({ queryKey: ['servicios'], queryFn: () => apiFetch<Servicio[]>('/api/servicios') });
  const { data: evidencias = [], isLoading: loadingEvid } = useQuery({
    queryKey: ['movimiento-evidencias', evidMov?.id],
    queryFn: () => apiFetch<Evidencia[]>(`/api/movimientos-financieros/${evidMov!.id}/evidencias`),
    enabled: !!evidMov,
  });

  const invalidateMovs = () => {
    queryClient.invalidateQueries({ queryKey: ['movimientos-financieros'] });
    queryClient.invalidateQueries({ queryKey: ['cuentas-bancarias'] });
  };

  const subirEvidencias = async (movId: number, files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append('file', f);
    await apiFetch(`/api/movimientos-financieros/${movId}/evidencias`, { method: 'POST', body: fd });
  };

  const guardarMovMutation = useMutation({
    mutationFn: async () => {
      const nombreLimpio = movForm.nombre.trim().toUpperCase();
      const guardiaMatch = guardias.find((g) => g.nombre.trim().toUpperCase() === nombreLimpio);
      const esHE = movForm.categoria === CAT_HE;
      const esIngreso = movForm.categoria === CAT_INGRESOS;
      const payload = {
        fecha: movForm.fecha,
        tipo: esIngreso ? 'Ingreso' : 'Gasto',
        categoria: movForm.categoria,
        monto: Number(movForm.monto),
        libro,
        medio_pago: movForm.medio_pago,
        descripcion: movForm.descripcion.trim() || null,
        nombre: esIngreso ? null : nombreLimpio || null,
        tipo_detalle: esHE ? movForm.tipo_detalle : null,
        turno: esHE ? movForm.turno : null,
        alimentos: esHE ? movForm.alimentos : null,
        servicio: esHE ? movForm.servicio.trim() || null : null,
        guardia_id: !esIngreso && guardiaMatch ? guardiaMatch.id : null,
      };
      const guardado = editingMov
        ? await apiFetch<Movimiento>(`/api/movimientos-financieros/${editingMov.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await apiFetch<Movimiento>('/api/movimientos-financieros', { method: 'POST', body: JSON.stringify(payload) });
      if (archivos.length) await subirEvidencias(guardado.id, archivos);
    },
    onSuccess: () => {
      invalidateMovs();
      queryClient.invalidateQueries({ queryKey: ['movimiento-evidencias'] });
      toast.success(editingMov ? 'Movimiento actualizado' : 'Movimiento registrado');
      cerrarMovModal();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eliminarMovMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/movimientos-financieros/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidateMovs(); toast.success('Movimiento eliminado'); setDeletingMov(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const subirEvidenciasMutation = useMutation({
    mutationFn: (files: File[]) => subirEvidencias(evidMov!.id, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimiento-evidencias', evidMov?.id] });
      invalidateMovs();
      toast.success('Evidencia agregada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eliminarEvidenciaMutation = useMutation({
    mutationFn: (evId: number) => apiFetch(`/api/movimientos-financieros/${evidMov!.id}/evidencias/${evId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimiento-evidencias', evidMov?.id] });
      invalidateMovs();
      toast.success('Evidencia eliminada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createCuentaMutation = useMutation({
    mutationFn: (payload: any) => apiFetch('/api/cuentas-bancarias', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cuentas-bancarias'] }); toast.success('Cuenta registrada'); setCuentaModalOpen(false); setCuentaForm(CUENTA_INICIAL); },
    onError: (e: Error) => toast.error(e.message),
  });

  const cerrarMovModal = () => { setMovModalOpen(false); setEditingMov(null); setMovForm(MOV_INICIAL); setArchivos([]); };

  const abrirNuevoMov = () => {
    setEditingMov(null);
    const categoriaInicial = (CATEGORIAS_B as readonly string[]).includes(tab) ? tab : CAT_HE;
    setMovForm({ ...MOV_INICIAL, fecha: hoyISO(), categoria: categoriaInicial });
    setArchivos([]);
    setMovModalOpen(true);
  };

  const abrirEditarMov = (m: Movimiento) => {
    setEditingMov(m);
    setMovForm({
      categoria: m.categoria, medio_pago: m.medio_pago || 'TARJETA', fecha: m.fecha, monto: String(m.monto),
      nombre: m.nombre || '', tipo_detalle: m.tipo_detalle || 'DOBLETE', turno: m.turno || '12 HORAS',
      alimentos: m.alimentos || 'SI', servicio: m.servicio || '', descripcion: m.descripcion || '',
    });
    setArchivos([]);
    setMovModalOpen(true);
  };

  // ── Cálculos (lo que en Excel hacían las macros y tablas dinámicas) ──
  const calc = useMemo(() => {
    const enPeriodo = movimientos.filter((m) => m.fecha >= desde && m.fecha <= hasta);
    const previos = movimientos.filter((m) => m.fecha < desde);
    const signo = (m: Movimiento) => (m.tipo === 'Ingreso' ? m.monto : -m.monto);

    const saldoAnterior = previos.reduce((a, m) => a + signo(m), 0);
    const existencia = movimientos.reduce((a, m) => a + signo(m), 0);
    const porMedio = (medio: string) => movimientos.filter((m) => m.medio_pago === medio).reduce((a, m) => a + signo(m), 0);

    const ingresosPeriodo = enPeriodo.filter((m) => m.tipo === 'Ingreso').reduce((a, m) => a + m.monto, 0);
    const egresosPeriodo = enPeriodo.filter((m) => m.tipo === 'Gasto').reduce((a, m) => a + m.monto, 0);

    // Consolidado ascendente con saldo corrido
    const consolidado = [...enPeriodo].sort((a, b) => (a.fecha === b.fecha ? a.id - b.id : a.fecha.localeCompare(b.fecha)));
    let corrido = saldoAnterior;
    const consolidadoConSaldo = consolidado.map((m) => ({ mov: m, saldo: (corrido += signo(m)) }));

    // Conciliación: egresos por categoría → fecha → medio de pago
    const conciliacion = [CAT_HE, CAT_ANTICIPOS, CAT_GASTOS].map((cat) => {
      const rows = enPeriodo.filter((m) => m.categoria === cat);
      const porFecha = new Map<string, { TARJETA: number; EFECTIVO: number }>();
      for (const m of rows) {
        const e = porFecha.get(m.fecha) || { TARJETA: 0, EFECTIVO: 0 };
        if (m.medio_pago === 'EFECTIVO') e.EFECTIVO += m.monto; else e.TARJETA += m.monto;
        porFecha.set(m.fecha, e);
      }
      const fechas = [...porFecha.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const totalTarjeta = fechas.reduce((a, [, v]) => a + v.TARJETA, 0);
      const totalEfectivo = fechas.reduce((a, [, v]) => a + v.EFECTIVO, 0);
      return { cat, fechas, totalTarjeta, totalEfectivo };
    });

    const chartData = conciliacion.map((c) => ({ categoria: c.cat, total: Math.round((c.totalTarjeta + c.totalEfectivo) * 100) / 100 }));

    return { enPeriodo, saldoAnterior, existencia, saldoTarjeta: porMedio('TARJETA'), saldoEfectivo: porMedio('EFECTIVO'), ingresosPeriodo, egresosPeriodo, consolidadoConSaldo, conciliacion, chartData };
  }, [movimientos, desde, hasta]);

  const movsDe = (cat: string) => calc.enPeriodo.filter((m) => m.categoria === cat).sort((a, b) => (a.fecha === b.fecha ? a.id - b.id : a.fecha.localeCompare(b.fecha)));

  const nombresSugeridos = useMemo(() => {
    const set = new Set<string>();
    for (const g of guardias) set.add(g.nombre.trim().toUpperCase());
    for (const m of movimientos) if (m.nombre) set.add(m.nombre.trim().toUpperCase());
    return [...set].sort();
  }, [guardias, movimientos]);

  const serviciosSugeridos = useMemo(() => {
    const set = new Set<string>();
    for (const s of servicios) set.add(s.nombre.trim().toUpperCase());
    for (const m of movimientos) if (m.servicio) set.add(m.servicio.trim().toUpperCase());
    return [...set].sort();
  }, [servicios, movimientos]);

  const esHE = movForm.categoria === CAT_HE;
  const esIngreso = movForm.categoria === CAT_INGRESOS;

  const accionesRow = (m: Movimiento) => (
    <div className="flex items-center justify-end gap-0.5">
      <button onClick={() => setEvidMov(m)} className={`relative w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${m.evidencias > 0 ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground/50 hover:bg-muted'}`} title={m.evidencias > 0 ? `${m.evidencias} evidencia(s)` : 'Sin evidencia — agregar'}>
        <Paperclip className="w-4 h-4" />
        {m.evidencias > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">{m.evidencias}</span>}
      </button>
      {puedeEditar && <button onClick={() => abrirEditarMov(m)} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors" title="Editar"><Pencil className="w-3.5 h-3.5" /></button>}
      {puedeEditar && <button onClick={() => setDeletingMov(m)} className="w-8 h-8 flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 transition-colors" title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>}
    </div>
  );

  const tablaVacia = (cols: number, msg: string) => (
    <TableRow><TableCell colSpan={cols} className="text-center py-8 text-muted-foreground">{loadingMovs ? 'Cargando...' : msg}</TableCell></TableRow>
  );

  const footerTotales = (rows: Movimiento[], cols: number) => {
    const tarjeta = rows.filter((m) => m.medio_pago === 'TARJETA').reduce((a, m) => a + m.monto, 0);
    const efectivo = rows.filter((m) => m.medio_pago === 'EFECTIVO').reduce((a, m) => a + m.monto, 0);
    if (!rows.length) return null;
    return (
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={cols - 2} className="text-right text-xs text-muted-foreground">
          Tarjeta: <span className="font-semibold text-foreground">{fmtMoney(tarjeta)}</span> · Efectivo: <span className="font-semibold text-foreground">{fmtMoney(efectivo)}</span> · Total
        </TableCell>
        <TableCell className="text-right font-bold">{fmtMoney(tarjeta + efectivo)}</TableCell>
        <TableCell />
      </TableRow>
    );
  };

  if (!loadingLibros && libros.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in duration-500">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4"><Lock className="w-6 h-6 text-muted-foreground" /></div>
        <h2 className="text-lg font-bold">Sin acceso a cuentas de finanzas</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">El administrador aún no te ha asignado ninguna cuenta. Pídele que te asigne como responsable para poder capturar movimientos.</p>
      </div>
    );
  }

  const TABS: { id: typeof tab; label: string }[] = [
    { id: 'consolidado', label: 'Consolidado' },
    { id: CAT_HE, label: 'H.E. y Dobletes' },
    { id: CAT_ANTICIPOS, label: 'Anticipos' },
    { id: CAT_GASTOS, label: 'Gastos Diversos' },
    { id: CAT_INGRESOS, label: 'Ingresos' },
    { id: 'conciliacion', label: 'Conciliación' },
    { id: 'cuentas', label: 'Cuentas bancarias' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Finanzas</h1>
            {libros.length > 0 && (
              <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
                {libros.map((l) => (
                  <button key={l.id} onClick={() => setLibroSel(l.id)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${libroActivo?.id === l.id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    {l.nombre}{!l.puede_editar && <span className="ml-1.5 text-[9px] font-medium text-muted-foreground/70 uppercase">solo lectura</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {libroActivo?.responsable ? `Responsable: ${libroActivo.responsable} · ` : ''}Ingresos y egresos por categoría, consolidado automático y evidencias
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-card border border-border rounded-xl px-2 py-1.5">
            <button onClick={() => { setDesde(shiftISO(desde, -7)); setHasta(shiftISO(hasta, -7)); }} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" title="Semana anterior"><ChevronLeft className="w-4 h-4" /></button>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="text-xs bg-transparent outline-none w-[105px]" />
            <span className="text-xs text-muted-foreground">al</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="text-xs bg-transparent outline-none w-[105px]" />
            <button onClick={() => { setDesde(shiftISO(desde, 7)); setHasta(shiftISO(hasta, 7)); }} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted transition-colors" title="Semana siguiente"><ChevronRight className="w-4 h-4" /></button>
          </div>
          {puedeEditar && <Button size="sm" onClick={() => abrirNuevoMov()}><Plus className="w-4 h-4 mr-1.5" /> Movimiento</Button>}
          {isEditor && <Button variant="outline" size="sm" onClick={() => setCuentaModalOpen(true)}><Landmark className="w-4 h-4 mr-1.5" /> Cuenta</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Existencia (fondo disponible)</p><p className="text-xl font-bold mt-1">{fmtMoney(calc.existencia)}</p></div><div className="p-2 rounded-xl bg-blue-50"><Wallet className="w-4 h-4 text-blue-600" /></div></div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Saldo en tarjeta</p><p className="text-xl font-bold mt-1">{fmtMoney(calc.saldoTarjeta)}</p></div><div className="p-2 rounded-xl bg-indigo-50"><CreditCard className="w-4 h-4 text-indigo-600" /></div></div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Saldo en efectivo</p><p className="text-xl font-bold mt-1">{fmtMoney(calc.saldoEfectivo)}</p></div><div className="p-2 rounded-xl bg-teal-50"><Banknote className="w-4 h-4 text-teal-600" /></div></div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Ingresos del periodo</p><p className="text-xl font-bold text-emerald-700 mt-1">{fmtMoney(calc.ingresosPeriodo)}</p></div><div className="p-2 rounded-xl bg-emerald-50"><TrendingUp className="w-4 h-4 text-emerald-600" /></div></div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Egresos del periodo</p><p className="text-xl font-bold text-red-700 mt-1">{fmtMoney(calc.egresosPeriodo)}</p></div><div className="p-2 rounded-xl bg-red-50"><TrendingDown className="w-4 h-4 text-red-600" /></div></div>
      </div>

      <div className="flex border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.id ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t.label}</button>
        ))}
      </div>

      {/* ── Consolidado ── */}
      {tab === 'consolidado' && (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Fecha</TableHead>
                <TableHead>Destino / Concepto</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead className="text-right">Ingreso</TableHead>
                <TableHead className="text-right">Egreso</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell className="text-xs text-muted-foreground">{fmtDate(desde)}</TableCell>
                <TableCell className="text-xs font-medium text-muted-foreground italic" colSpan={4}>Saldo anterior al periodo (arrastre automático)</TableCell>
                <TableCell className="text-right font-semibold">{fmtMoney(calc.saldoAnterior)}</TableCell>
                <TableCell />
              </TableRow>
              {calc.consolidadoConSaldo.length === 0 ? tablaVacia(7, 'Sin movimientos en el periodo seleccionado.')
                : calc.consolidadoConSaldo.map(({ mov: m, saldo }) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(m.fecha)}</TableCell>
                    <TableCell className="text-sm max-w-[420px]"><span className="line-clamp-2">{destinoDe(m)}</span></TableCell>
                    <TableCell><span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CAT_STYLE[m.categoria] || 'bg-muted text-muted-foreground border-border'}`}>{m.categoria}</span></TableCell>
                    <TableCell className="text-right text-emerald-700 font-medium">{m.tipo === 'Ingreso' ? fmtMoney(m.monto) : ''}</TableCell>
                    <TableCell className="text-right text-red-700 font-medium">{m.tipo === 'Gasto' ? fmtMoney(m.monto) : ''}</TableCell>
                    <TableCell className="text-right font-semibold">{fmtMoney(saldo)}</TableCell>
                    <TableCell>{accionesRow(m)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── H.E. y Dobletes ── */}
      {tab === CAT_HE && (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medio de pago</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Turno</TableHead>
                <TableHead>Alimentos</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-right">Importe</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {movsDe(CAT_HE).length === 0 ? tablaVacia(10, 'Sin registros de H.E. y dobletes en el periodo.')
                : movsDe(CAT_HE).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs">{m.medio_pago}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(m.fecha)}</TableCell>
                    <TableCell><Badge variant={m.tipo_detalle === 'DOBLETE' ? 'secondary' : 'outline'}>{m.tipo_detalle}</Badge></TableCell>
                    <TableCell className="text-sm font-medium">{m.nombre}</TableCell>
                    <TableCell className="text-xs">{m.turno}</TableCell>
                    <TableCell className="text-xs">{m.alimentos}</TableCell>
                    <TableCell className="text-xs">{m.servicio}</TableCell>
                    <TableCell className="text-xs max-w-[260px]"><span className="line-clamp-2">{m.descripcion}</span></TableCell>
                    <TableCell className="text-right font-semibold">{fmtMoney(m.monto)}</TableCell>
                    <TableCell>{accionesRow(m)}</TableCell>
                  </TableRow>
                ))}
              {footerTotales(movsDe(CAT_HE), 10)}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Anticipos / Gastos Diversos / Ingresos ── */}
      {(tab === CAT_ANTICIPOS || tab === CAT_GASTOS || tab === CAT_INGRESOS) && (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medio de pago</TableHead>
                <TableHead>Fecha</TableHead>
                {tab !== CAT_INGRESOS && <TableHead>Nombre</TableHead>}
                <TableHead>{tab === CAT_GASTOS ? 'Motivo' : 'Concepto'}</TableHead>
                <TableHead className="text-right">Importe</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {movsDe(tab).length === 0 ? tablaVacia(6, 'Sin registros en el periodo.')
                : movsDe(tab).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs">{m.medio_pago}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(m.fecha)}</TableCell>
                    {tab !== CAT_INGRESOS && <TableCell className="text-sm font-medium">{m.nombre}</TableCell>}
                    <TableCell className="text-sm max-w-[420px]"><span className="line-clamp-2">{m.descripcion}</span></TableCell>
                    <TableCell className="text-right font-semibold">{fmtMoney(m.monto)}</TableCell>
                    <TableCell>{accionesRow(m)}</TableCell>
                  </TableRow>
                ))}
              {footerTotales(movsDe(tab), tab === CAT_INGRESOS ? 5 : 6)}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Conciliación ── */}
      {tab === 'conciliacion' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-800 text-white rounded-xl p-4"><p className="text-xs text-slate-300">Fondo total disponible</p><p className="text-xl font-bold mt-1">{fmtMoney(calc.existencia)}</p></div>
            <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground">Egresos tarjeta (periodo)</p><p className="text-xl font-bold mt-1">{fmtMoney(calc.enPeriodo.filter((m) => m.tipo === 'Gasto' && m.medio_pago === 'TARJETA').reduce((a, m) => a + m.monto, 0))}</p></div>
            <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground">Egresos efectivo (periodo)</p><p className="text-xl font-bold mt-1">{fmtMoney(calc.enPeriodo.filter((m) => m.tipo === 'Gasto' && m.medio_pago === 'EFECTIVO').reduce((a, m) => a + m.monto, 0))}</p></div>
            <div className="bg-card border border-border rounded-xl p-4"><p className="text-xs text-muted-foreground">Total egresos (periodo)</p><p className="text-xl font-bold text-red-700 mt-1">{fmtMoney(calc.egresosPeriodo)}</p></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {calc.conciliacion.map((c) => (
              <div key={c.cat} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className={`px-4 py-2.5 text-xs font-bold border-b ${CAT_STYLE[c.cat]}`}>{c.cat}</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Fecha</TableHead>
                      <TableHead className="text-right text-xs">Tarjeta</TableHead>
                      <TableHead className="text-right text-xs">Efectivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {c.fechas.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center py-4 text-xs text-muted-foreground">Sin egresos</TableCell></TableRow>
                      : c.fechas.map(([fecha, v]) => (
                        <TableRow key={fecha}>
                          <TableCell className="text-xs">{fmtDate(fecha)}</TableCell>
                          <TableCell className="text-right text-xs">{v.TARJETA ? fmtMoney(v.TARJETA) : '—'}</TableCell>
                          <TableCell className="text-right text-xs">{v.EFECTIVO ? fmtMoney(v.EFECTIVO) : '—'}</TableCell>
                        </TableRow>
                      ))}
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell className="text-xs font-bold">Total</TableCell>
                      <TableCell className="text-right text-xs font-bold">{fmtMoney(c.totalTarjeta)}</TableCell>
                      <TableCell className="text-right text-xs font-bold">{fmtMoney(c.totalEfectivo)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Análisis: egresos del periodo por categoría</h3>
            <div className="h-[240px]">
              {calc.chartData.every((d) => d.total === 0) ? (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">Registra egresos para ver el análisis aquí</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={calc.chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" />
                    <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="categoria" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={130} />
                    <ChartTooltip contentStyle={{ background: '#fff', borderColor: 'var(--color-border)', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: '12px' }} />
                    <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                      {calc.chartData.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Cuentas bancarias ── */}
      {tab === 'cuentas' && (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Banco / Alias</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingCuentas ? <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Cargando...</TableCell></TableRow>
                : cuentas.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Sin cuentas registradas.</TableCell></TableRow>
                : cuentas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell><div className="font-medium">{c.alias}</div><div className="text-xs text-muted-foreground">{c.banco}{c.numero_cuenta ? ` · ${c.numero_cuenta}` : ''}</div></TableCell>
                    <TableCell className="text-muted-foreground">{c.tipo}</TableCell>
                    <TableCell className="text-muted-foreground">{c.moneda}</TableCell>
                    <TableCell className="text-right font-bold">{fmtMoney(c.saldo_actual)}</TableCell>
                    <TableCell><Badge variant={c.activa ? 'success' : 'secondary'}>{c.activa ? 'Activa' : 'Inactiva'}</Badge></TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      )}

      <datalist id="dl-nombres">{nombresSugeridos.map((n) => <option key={n} value={n} />)}</datalist>
      <datalist id="dl-servicios">{serviciosSugeridos.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="dl-turnos">{TURNOS.map((t) => <option key={t} value={t} />)}</datalist>

      {/* ── Modal movimiento ── */}
      <Dialog open={movModalOpen} onOpenChange={(open) => { if (!open) cerrarMovModal(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form onSubmit={(e) => { e.preventDefault(); if (movForm.monto) guardarMovMutation.mutate(); }}>
            <DialogHeader>
              <DialogTitle>{editingMov ? 'Editar movimiento' : `Registrar movimiento · ${libroActivo?.nombre ?? ''}`}</DialogTitle>
              <DialogDescription>Los campos cambian según la categoría, igual que las hojas del Excel.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Categoría</label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIAS_B.map((c) => (
                    <button key={c} type="button" onClick={() => setMovForm((f) => ({ ...f, categoria: c }))} className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${movForm.categoria === c ? CAT_STYLE[c] + ' ring-1 ring-current' : 'border-border text-muted-foreground hover:bg-muted'}`}>{c}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Medio de pago</label>
                  <Select value={movForm.medio_pago} onChange={(e) => setMovForm((f) => ({ ...f, medio_pago: e.target.value }))}>
                    {MEDIOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </div>
                <div className="space-y-2"><label className="text-sm font-medium">Fecha</label><Input type="date" value={movForm.fecha} onChange={(e) => setMovForm((f) => ({ ...f, fecha: e.target.value }))} required /></div>
              </div>

              {esHE && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tipo</label>
                      <Select value={movForm.tipo_detalle} onChange={(e) => setMovForm((f) => ({ ...f, tipo_detalle: e.target.value }))}>
                        {TIPOS_HE.map((t) => <option key={t} value={t}>{t}</option>)}
                      </Select>
                    </div>
                    <div className="space-y-2"><label className="text-sm font-medium">Turno / Horas</label><Input list="dl-turnos" value={movForm.turno} onChange={(e) => setMovForm((f) => ({ ...f, turno: e.target.value }))} placeholder="12 HORAS, 1:30 HR..." /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Alimentos</label>
                      <Select value={movForm.alimentos} onChange={(e) => setMovForm((f) => ({ ...f, alimentos: e.target.value }))}>
                        <option value="SI">SI</option>
                        <option value="NO">NO</option>
                      </Select>
                    </div>
                    <div className="space-y-2"><label className="text-sm font-medium">Servicio</label><Input list="dl-servicios" value={movForm.servicio} onChange={(e) => setMovForm((f) => ({ ...f, servicio: e.target.value }))} placeholder="TRES LAGOS, TORRE OLIMPO..." /></div>
                  </div>
                </>
              )}

              {!esIngreso && (
                <div className="space-y-2"><label className="text-sm font-medium">Nombre</label><Input list="dl-nombres" value={movForm.nombre} onChange={(e) => setMovForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Guardia, proveedor, CFE..." required /></div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">{movForm.categoria === CAT_HE || movForm.categoria === CAT_GASTOS ? 'Motivo' : 'Concepto'}</label>
                <Input value={movForm.descripcion} onChange={(e) => setMovForm((f) => ({ ...f, descripcion: e.target.value }))} placeholder={movForm.categoria === CAT_ANTICIPOS ? 'ANTICIPO DE NÓMINA' : movForm.categoria === CAT_INGRESOS ? 'FONDOS PROVENIENTES DE U3, SALDO INICIAL...' : 'CUBRE VACANTE, REEMBOLSO...'} required={!esHE} />
              </div>

              <div className="space-y-2"><label className="text-sm font-medium">Importe</label><Input type="number" min={0.01} step="0.01" value={movForm.monto} onChange={(e) => setMovForm((f) => ({ ...f, monto: e.target.value }))} required /></div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5" /> Evidencia (ticket, comprobante, foto)</label>
                <Input type="file" multiple accept="image/*,application/pdf" onChange={(e) => setArchivos(Array.from(e.target.files || []))} />
                {archivos.length > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><ImageIcon className="w-3 h-3" /> {archivos.length} archivo(s) se adjuntarán al guardar</p>
                )}
                {editingMov && editingMov.evidencias > 0 && (
                  <p className="text-xs text-muted-foreground">Este movimiento ya tiene {editingMov.evidencias} evidencia(s); las nuevas se agregan sin borrar las anteriores.</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={cerrarMovModal}>Cancelar</Button>
              <Button type="submit" disabled={guardarMovMutation.isPending}>{guardarMovMutation.isPending ? 'Guardando...' : editingMov ? 'Guardar cambios' : 'Registrar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Modal evidencias ── */}
      <Dialog open={!!evidMov} onOpenChange={(open) => { if (!open) setEvidMov(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Evidencias del movimiento</DialogTitle>
            <DialogDescription>{evidMov ? `${fmtDate(evidMov.fecha)} · ${destinoDe(evidMov)} · ${fmtMoney(evidMov.monto)}` : ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5 py-2">
            {loadingEvid ? <p className="text-center text-sm text-muted-foreground py-6 animate-pulse">Cargando evidencias...</p>
              : evidencias.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Paperclip className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Este movimiento no tiene evidencia adjunta.</p>
                </div>
              ) : evidencias.map((ev) => (
                <EvidenciaItem key={ev.id} movId={evidMov!.id} ev={ev} canDelete={puedeEditar} onDelete={() => eliminarEvidenciaMutation.mutate(ev.id)} />
              ))}
          </div>
          {puedeEditar && evidMov && (
            <div className="border-t border-border pt-3">
              <label className="text-sm font-medium mb-2 block">Agregar evidencia</label>
              <Input type="file" multiple accept="image/*,application/pdf" disabled={subirEvidenciasMutation.isPending} onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) { subirEvidenciasMutation.mutate(files); e.target.value = ''; }
              }} />
              {subirEvidenciasMutation.isPending && <p className="text-xs text-muted-foreground mt-1.5 animate-pulse">Subiendo...</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirmar eliminación ── */}
      <Dialog open={!!deletingMov} onOpenChange={(open) => { if (!open) setDeletingMov(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar movimiento</DialogTitle>
            <DialogDescription>
              {deletingMov ? `${fmtDate(deletingMov.fecha)} · ${destinoDe(deletingMov)} · ${fmtMoney(deletingMov.monto)}` : ''}
              <br />Se eliminarán también sus evidencias adjuntas. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingMov(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={eliminarMovMutation.isPending} onClick={() => deletingMov && eliminarMovMutation.mutate(deletingMov.id)}>{eliminarMovMutation.isPending ? 'Eliminando...' : 'Eliminar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal cuenta bancaria ── */}
      <Dialog open={cuentaModalOpen} onOpenChange={setCuentaModalOpen}>
        <DialogContent>
          <form onSubmit={(e) => { e.preventDefault(); createCuentaMutation.mutate({ ...cuentaForm, saldo_actual: Number(cuentaForm.saldo_actual) }); }}>
            <DialogHeader><DialogTitle>Nueva cuenta bancaria</DialogTitle><DialogDescription>Datos generales de la cuenta.</DialogDescription></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><label className="text-sm font-medium">Banco</label><Input value={cuentaForm.banco} onChange={(e) => setCuentaForm((f) => ({ ...f, banco: e.target.value }))} required /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Alias</label><Input value={cuentaForm.alias} onChange={(e) => setCuentaForm((f) => ({ ...f, alias: e.target.value }))} placeholder="Ej. Cuenta operativa" required /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Número de cuenta</label><Input value={cuentaForm.numero_cuenta} onChange={(e) => setCuentaForm((f) => ({ ...f, numero_cuenta: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tipo</label>
                  <Select value={cuentaForm.tipo} onChange={(e) => setCuentaForm((f) => ({ ...f, tipo: e.target.value }))}>
                    <option value="Cheques">Cheques</option>
                    <option value="Ahorro">Ahorro</option>
                    <option value="Crédito">Crédito</option>
                  </Select>
                </div>
                <div className="space-y-2"><label className="text-sm font-medium">Saldo inicial</label><Input type="number" step="0.01" value={cuentaForm.saldo_actual} onChange={(e) => setCuentaForm((f) => ({ ...f, saldo_actual: e.target.value }))} /></div>
              </div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setCuentaModalOpen(false)}>Cancelar</Button><Button type="submit" disabled={createCuentaMutation.isPending}>Crear cuenta</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
