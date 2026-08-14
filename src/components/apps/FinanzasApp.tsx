'use client';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, Cell } from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select } from '@/src/components/ui/select';
import { Badge } from '@/src/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import { Plus, Landmark, TrendingDown, TrendingUp, Wallet, CreditCard, Banknote, ChevronLeft, ChevronRight, Paperclip, Pencil, Trash2, Loader2, FileText, ExternalLink, ImageIcon, Lock, AlertTriangle, Check, Clock, Receipt, HandCoins, UploadCloud, X, Mail, Sheet } from 'lucide-react';
import { fmtDate } from '@/src/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';
import descuadresCuentaB from '@/src/data/descuadres-cuenta-b.json';
import PanelFinanzas from '@/src/components/finanzas/PanelFinanzas';
import { RangoFechas, type Preset } from '@/src/components/ui/rango-fechas';
import { SelectorFecha } from '@/src/components/ui/selector-fecha';
import { generarPdfConFallback } from '@/src/lib/generatePdfBlob';
import { buildReporteFinanzasHtml, SECCIONES, type SeccionId } from '@/src/lib/reporteFinanzasTemplate';
import DocumentViewerModal from '@/src/components/DocumentViewerModal';

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
interface Libro { id: string; nombre: string; usuario_id: number | null; responsable: string | null; puede_editar: boolean; movimientos: number }

const CAT_HE = 'H.E. Y DOBLETES';
const CAT_ANTICIPOS = 'ANTICIPOS';
const CAT_GASTOS = 'GASTOS DIVERSOS';
const CAT_INGRESOS = 'INGRESOS';
// Movimiento interno entre tarjeta y efectivo: no es ingreso ni gasto, solo
// cambia el dinero de medio de pago. No se captura a mano — lo genera la
// migración del histórico, donde el Excel nunca registró los retiros.
const CAT_TRASPASO = 'TRASPASO';
const CATEGORIAS_B = [CAT_HE, CAT_ANTICIPOS, CAT_GASTOS, CAT_INGRESOS] as const;

const CAT_STYLE: Record<string, string> = {
  [CAT_HE]: 'bg-amber-50 text-amber-700 border-amber-200',
  [CAT_ANTICIPOS]: 'bg-blue-50 text-blue-700 border-blue-200',
  [CAT_GASTOS]: 'bg-violet-50 text-violet-700 border-violet-200',
  [CAT_INGRESOS]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  [CAT_TRASPASO]: 'bg-slate-100 text-slate-600 border-slate-300',
};

const MEDIOS_PAGO = ['TARJETA', 'EFECTIVO'];
const TIPOS_HE = ['DOBLETE', 'HORAS EXTRAS'];
const TURNOS = ['12 HORAS', '24 HORAS', '12/24 HRS', '14 HRS', '16 HRS', '30 MIN', '1 HR', '1:30 HR', '2 HRS', '2:30 HRS', '3 HRS', '3:30 HRS', '4 HRS', '4:30 HRS', '5 HRS', '5:30 HRS', '6 HRS', '7 HRS'];

// ── Reglas deducidas del histórico de la cuenta (mayo–julio 2026) ──
// No son invenciones: salen de contar los 1,030 movimientos capturados.

/** Alimentos no es una decisión: en 536 registros, DOBLETE siempre los lleva y HORAS EXTRAS nunca. */
const ALIMENTOS_POR_TIPO: Record<string, string> = { DOBLETE: 'SI', 'HORAS EXTRAS': 'NO' };

/** Las horas extras se pagan a $50 la hora, sin una sola excepción en 155 registros. */
const TARIFA_HORA_EXTRA = 50;
const HORAS_DE_TURNO: Record<string, number> = {
  '30 MIN': 0.5, '1 HR': 1, '1:30 HR': 1.5, '2 HRS': 2, '2:30 HRS': 2.5, '3 HRS': 3,
  '3:30 HRS': 3.5, '4 HRS': 4, '4:30 HRS': 4.5, '5 HRS': 5, '5:30 HRS': 5.5, '6 HRS': 6, '7 HRS': 7,
};
const importeHoraExtra = (turno: string): number | null => {
  const horas = HORAS_DE_TURNO[turno];
  return horas ? horas * TARIFA_HORA_EXTRA : null;
};

/** El doblete no tiene tarifa fija; estos son los importes que más se repiten. */
const IMPORTES_DOBLETE: Record<string, number[]> = {
  '12 HORAS': [350, 400, 450],
  '24 HORAS': [600, 700],
};

/** Conceptos más usados en cada categoría, para elegirlos de un clic. */
const SUGERENCIAS: Record<string, string[]> = {
  [CAT_HE]: ['CUBRE VACANTE', 'ESPERA DE COBERTURA', 'CUBRE POR APOYO EN OPERACIÓN', 'CUBRE FALTA', 'TURNO LABORADO', 'CUBRE DESCANSO'],
  [CAT_ANTICIPOS]: ['ANTICIPO DE NOMINA'],
  [CAT_GASTOS]: ['LIMPIEZA DE OFICINAS', 'COMPLEMENTO DE NÓMINA', 'REEMBOLSO PAGO DE ESTACIONAMIENTO', 'BONO + TRANSPORTE', 'BONO MANDO', 'APOYO DE ALIMENTOS', 'TRANSPORTE'],
  [CAT_INGRESOS]: ['FONDOS PARA CUENTA "B" PROVENIENTES DE "U3"', 'REEMBOLSO EQUIPO DE TRABAJO', 'REEMBOLSO ANTICIPOS DE NOMINA'],
};

/** Casi todos los anticipos son de nómina: se propone escrito. */
const CONCEPTO_POR_DEFECTO: Record<string, string> = { [CAT_ANTICIPOS]: 'ANTICIPO DE NOMINA' };

/** Nombre corto de cada categoría, para el botón de captura. */
const TABS_ETIQUETA: Record<string, string> = {
  [CAT_HE]: 'H.E. y Dobletes',
  [CAT_ANTICIPOS]: 'Anticipos',
  [CAT_GASTOS]: 'Gastos Diversos',
  [CAT_INGRESOS]: 'Ingresos',
};

/** Identidad visual de cada categoría en el formulario de captura. */
const CAT_UI: Record<string, { icono: any; etiqueta: string; activo: string }> = {
  [CAT_HE]: { icono: Clock, etiqueta: 'H.E. y Dobletes', activo: 'border-amber-400 bg-amber-50 text-amber-800' },
  [CAT_ANTICIPOS]: { icono: HandCoins, etiqueta: 'Anticipos', activo: 'border-blue-400 bg-blue-50 text-blue-800' },
  [CAT_GASTOS]: { icono: Receipt, etiqueta: 'Gastos Diversos', activo: 'border-violet-400 bg-violet-50 text-violet-800' },
  [CAT_INGRESOS]: { icono: TrendingUp, etiqueta: 'Ingresos', activo: 'border-emerald-400 bg-emerald-50 text-emerald-800' },
};

/** Bloque del formulario: título discreto y separador de hairline. */
function Banda({ titulo, children, primera }: { titulo: string; children: React.ReactNode; primera?: boolean }) {
  return (
    <section className={`-mx-4 sm:-mx-6 px-4 sm:px-6 py-4 ${primera ? '' : 'border-t border-border'}`}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">{titulo}</p>
      {children}
    </section>
  );
}

/** Etiqueta + control, con el mismo ritmo vertical en todo el formulario. */
function Campo({ label, ayuda, children, className = '' }: { label: string; ayuda?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
        {label}
        {ayuda && <span className="text-[10px] font-normal text-muted-foreground">{ayuda}</span>}
      </label>
      {children}
    </div>
  );
}

/** Botón de opción: la misma anatomía que las filas del calendario. */
function Opcion({ activo, onClick, children, tonoActivo = 'border-primary bg-primary/10 text-primary' }: {
  activo: boolean; onClick: () => void; children: React.ReactNode; tonoActivo?: string;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center justify-center gap-1.5 h-10 rounded-xl border text-xs font-semibold transition-colors ${
        activo ? tonoActivo : 'border-border text-muted-foreground hover:bg-muted'}`}>
      {children}
    </button>
  );
}

/** Chip de sugerencia, para elegir con un clic lo que más se repite. */
function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
        activo ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border text-muted-foreground hover:bg-muted'}`}>
      {children}
    </button>
  );
}
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
  if (m.categoria === CAT_INGRESOS || m.categoria === CAT_TRASPASO) return [m.medio_pago, m.descripcion].filter(Boolean).join(' , ');
  return [m.nombre, m.descripcion].filter(Boolean).join(' , ');
}

type MigracionCuentaB = {
  libro: string;
  diagnostico: { constante: boolean; diferencia: number; desde: string; puntos: number } | null;
  descuadres: { fecha: string; declarado: number; calculado: number; diferencia: number; fuente: string }[];
  nomina: {
    total: number;
    faltantes: {
      fecha: string;
      fuente: string;
      total: number;
      completa: boolean;
      renglones: { nombre: string; concepto: string; monto: number }[];
    }[];
    diferencias: {
      fecha: string; fuente: string; nombre: string; concepto: string;
      monto_lista: number; monto_registrado: number; diferencia: number;
    }[];
  };
};

/**
 * Aviso de descuadre detectado al migrar el histórico desde los Excel: en varios
 * cortes el saldo que declara el reporte semanal no coincide con lo que suman
 * los movimientos capturados. No se corrige por cuenta propia — se muestra para
 * que el responsable del libro localice el error en su papeleo.
 */
function AvisoDescuadres({ libroId }: { libroId: string }) {
  const { libro, diagnostico, descuadres } = descuadresCuentaB as MigracionCuentaB;
  if (libroId !== libro || !descuadres.length) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-amber-900">
            Descuadre pendiente de aclarar: {fmtMoney(Math.abs(descuadres[0].diferencia))}
          </p>
          <p className="text-sm text-amber-800">
            {diagnostico?.constante ? (
              <>
                Los reportes semanales declaran {fmtMoney(Math.abs(diagnostico.diferencia))} {diagnostico.diferencia > 0 ? 'más' : 'menos'} de
                lo que suman los movimientos capturados. La diferencia es <strong>idéntica en los {diagnostico.puntos} cortes
                revisados</strong>, desde el del {fmtDate(diagnostico.desde)}, así que es un solo error en esa fecha que se
                arrastra hasta el final — no uno por semana. Conviene revisar qué pasó ese día: a partir de ahí todos los
                saldos del reporte vienen corridos por esa misma cantidad.
              </>
            ) : (
              <>El saldo declarado en el reporte no coincide con la suma de los movimientos en {descuadres.length} corte(s).</>
            )}
          </p>
          <details className="text-xs text-amber-800">
            <summary className="cursor-pointer font-medium hover:text-amber-900">Ver los cortes revisados</summary>
            <ul className="mt-2 space-y-1">
              {descuadres.map((d) => (
                <li key={d.fecha}>
                  <span className="font-medium">{fmtDate(d.fecha)}</span>: el reporte declara {fmtMoney(d.declarado)} y los
                  movimientos suman {fmtMoney(d.calculado)} ({fmtMoney(d.diferencia)} de diferencia)
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}

/**
 * Aviso de nómina pagada que ningún Excel registró.
 *
 * Junto al histórico llegaron las listas "DEPÓSITOS NÓMINA" de cada quincena.
 * No se importan como movimientos —son el desglose de pagos que ya están en
 * GASTOS DIVERSOS y duplicarían el egreso—, pero al cruzarlas contra lo
 * capturado aparecieron pagos que no tienen movimiento que los respalde.
 *
 * Tampoco se cargan por cuenta propia. El hueco no son solo estos pagos: en el
 * mismo periodo falta también el cobro quincenal de los clientes, señal de que
 * lo que se perdió es la captura completa de esa quincena. Cargar únicamente los
 * egresos dejaría el saldo tan irreal como está ahora, pero al revés. El aviso
 * existe para que el responsable recupere ese reporte y entre todo junto.
 */
function AvisoNominaFaltante({ libroId, existencia }: { libroId: string; existencia: number }) {
  const { libro, nomina } = descuadresCuentaB as MigracionCuentaB;
  if (libroId !== libro || !nomina) return null;
  const { total, faltantes, diferencias } = nomina;
  if (!faltantes.length && !diferencias.length) return null;

  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-4">
      <div className="flex gap-3">
        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 space-y-2">
          {faltantes.length > 0 && (
            <>
              <p className="text-sm font-semibold text-red-900">
                Nómina pagada sin registrar: {fmtMoney(total)}
              </p>
              <p className="text-sm text-red-800">
                Las listas de <strong>depósitos de nómina</strong> documentan pagos que no aparecen en ningún reporte
                semanal ni en el consolidado del mes, así que no están capturados como movimientos. En ese mismo
                periodo tampoco aparece el cobro quincenal de los clientes, así que lo que falta no son solo estos
                pagos: es <strong>la captura completa de esa quincena</strong>. Conviene recuperar el reporte de esas
                fechas antes de capturar nada, para que entren juntos el ingreso y el egreso; si solo se cargaran
                estos pagos, el saldo bajaría a {fmtMoney(existencia - total)} y quedaría igual de irreal.
              </p>
              <details className="text-xs text-red-800">
                <summary className="cursor-pointer font-medium hover:text-red-900">Ver los pagos sin registrar</summary>
                <div className="mt-2 space-y-3">
                  {faltantes.map((f) => (
                    <div key={f.fecha}>
                      <p className="font-medium">
                        {fmtDate(f.fecha)} — {f.completa ? 'la quincena completa' : `${f.renglones.length} pago(s)`}: {fmtMoney(f.total)}
                        <span className="font-normal text-red-700"> (según {f.fuente})</span>
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {f.renglones.map((r, i) => (
                          <li key={`${r.nombre}-${r.concepto}-${i}`} className="flex justify-between gap-3">
                            <span className="truncate">{r.nombre} — {r.concepto}</span>
                            <span className="font-medium tabular-nums flex-shrink-0">{fmtMoney(r.monto)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}
          {diferencias.length > 0 && (
            <details className="text-xs text-red-800">
              <summary className="cursor-pointer font-medium hover:text-red-900">
                {diferencias.length} pago(s) capturado(s) por un importe distinto al del depósito
              </summary>
              <ul className="mt-2 space-y-1">
                {diferencias.map((d, i) => (
                  <li key={`${d.fecha}-${d.nombre}-${i}`}>
                    <span className="font-medium">{fmtDate(d.fecha)}</span>: {d.nombre} está capturado
                    con {fmtMoney(d.monto_registrado)} y el depósito dice {fmtMoney(d.monto_lista)}
                    {' '}({fmtMoney(d.diferencia)} de diferencia)
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
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
  const { isEditor, user } = useAuth();
  const queryClient = useQueryClient();

  const [libroSel, setLibroSel] = useState<string | null>(null);
  // Se lee una sola vez: localStorage no existe durante el render del servidor.
  const [libroRecordado] = useState<string | null>(
    () => (typeof window === 'undefined' ? null : localStorage.getItem('finanzas_libro')),
  );
  const [tab, setTab] = useState<'panel' | 'consolidado' | typeof CATEGORIAS_B[number] | 'conciliacion' | 'cuentas'>('panel');
  const [desde, setDesde] = useState(shiftISO(hoyISO(), -7));
  const [hasta, setHasta] = useState(hoyISO());
  const [panelRango, setPanelRango] = useState<{ desde: string; hasta: string } | null>(null);
  const [pdfModoRango, setPdfModoRango] = useState<'rango' | 'historico'>('rango');
  const [pdfDesde, setPdfDesde] = useState(shiftISO(hoyISO(), -7));
  const [pdfHasta, setPdfHasta] = useState(hoyISO());

  const [cuentaModalOpen, setCuentaModalOpen] = useState(false);
  const [cuentaForm, setCuentaForm] = useState(CUENTA_INICIAL);
  const [movModalOpen, setMovModalOpen] = useState(false);
  const [editingMov, setEditingMov] = useState<Movimiento | null>(null);
  const [movForm, setMovForm] = useState(MOV_INICIAL);
  const [seguirCapturando, setSeguirCapturando] = useState(false);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [evidMov, setEvidMov] = useState<Movimiento | null>(null);
  const [deletingMov, setDeletingMov] = useState<Movimiento | null>(null);

  const { data: libros = [], isLoading: loadingLibros } = useQuery({ queryKey: ['libros-financieros'], queryFn: () => apiFetch<Libro[]>('/api/libros-financieros') });
  /**
   * Al entrar se abre el último libro usado; si no hay ninguno recordado, el
   * que tenga más movimientos. Sin esto el módulo caía siempre en el primero
   * por orden alfabético, que puede estar vacío, y un movimiento capturado ahí
   * acaba en la cuenta equivocada.
   */
  const libroConMasMovimientos = [...libros].sort((a, b) => b.movimientos - a.movimientos)[0];
  const libroActivo = libros.find((l) => l.id === libroSel)
    ?? libros.find((l) => l.id === libroRecordado)
    ?? libroConMasMovimientos
    ?? libros[0] ?? null;

  useEffect(() => {
    if (libroActivo) localStorage.setItem('finanzas_libro', libroActivo.id);
  }, [libroActivo?.id]);
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
      // Se capturan ~11 movimientos por día: encadenar sin reabrir el modal
      // ahorra la mitad de los clics. Se conserva el contexto de la tanda.
      if (seguirCapturando && !editingMov) {
        setMovForm((f) => ({
          ...MOV_INICIAL,
          fecha: f.fecha,
          categoria: f.categoria,
          medio_pago: f.medio_pago,
          tipo_detalle: f.tipo_detalle,
          turno: f.turno,
          alimentos: f.alimentos,
          servicio: f.servicio,
          descripcion: CONCEPTO_POR_DEFECTO[f.categoria] ?? '',
        }));
        setArchivos([]);
        setSeguirCapturando(false);
        return;
      }
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
    setMovForm({
      ...MOV_INICIAL,
      fecha: hoyISO(),
      categoria: categoriaInicial,
      descripcion: CONCEPTO_POR_DEFECTO[categoriaInicial] ?? '',
    });
    setArchivos([]);
    setMovModalOpen(true);
  };

  // ── Reglas de captura: lo que el histórico ya sabe, no se pregunta ──
  const cambiarCategoria = (cat: string) => setMovForm((f) => ({
    ...f,
    categoria: cat,
    // Solo se propone el concepto si el campo sigue intacto o venía propuesto.
    descripcion: !f.descripcion || Object.values(CONCEPTO_POR_DEFECTO).includes(f.descripcion)
      ? CONCEPTO_POR_DEFECTO[cat] ?? ''
      : f.descripcion,
  }));

  const cambiarTipoHE = (tipo: string) => setMovForm((f) => {
    const monto = tipo === 'HORAS EXTRAS' ? importeHoraExtra(f.turno) : null;
    return {
      ...f,
      tipo_detalle: tipo,
      alimentos: ALIMENTOS_POR_TIPO[tipo] ?? f.alimentos,
      monto: monto !== null ? String(monto) : f.monto,
    };
  });

  const cambiarTurno = (turno: string) => setMovForm((f) => {
    const monto = f.tipo_detalle === 'HORAS EXTRAS' ? importeHoraExtra(turno) : null;
    return { ...f, turno, monto: monto !== null ? String(monto) : f.monto };
  });

  // El importe de las horas extras es derivado; avisamos si se aparta de la tarifa.
  const importeSugerido = movForm.tipo_detalle === 'HORAS EXTRAS' && movForm.categoria === CAT_HE
    ? importeHoraExtra(movForm.turno)
    : null;
  const importeFueraDeTarifa = importeSugerido !== null && movForm.monto !== '' && Number(movForm.monto) !== importeSugerido;

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

    // Los traspasos mueven dinero entre tarjeta y efectivo: contarlos aquí
    // inflaría por igual ingresos y egresos del periodo sin que entrara ni
    // saliera nada de la cuenta. Sí cuentan para la existencia y los saldos.
    const realesPeriodo = enPeriodo.filter((m) => m.categoria !== CAT_TRASPASO);
    const ingresosPeriodo = realesPeriodo.filter((m) => m.tipo === 'Ingreso').reduce((a, m) => a + m.monto, 0);
    const egresosPeriodo = realesPeriodo.filter((m) => m.tipo === 'Gasto').reduce((a, m) => a + m.monto, 0);

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

  // Atajos relativos a hoy para las pestañas de captura, donde lo habitual es
  // consultar la semana o el mes en curso.
  const presetsSemana = useMemo<Preset[]>(() => {
    const hoy = hoyISO();
    const primeroDe = (desplazamiento: number) => {
      const d = new Date(hoy + 'T00:00:00');
      d.setDate(1);
      d.setMonth(d.getMonth() + desplazamiento);
      return d.toISOString().split('T')[0];
    };
    const finDe = (desplazamiento: number) => {
      const d = new Date(hoy + 'T00:00:00');
      d.setDate(1);
      d.setMonth(d.getMonth() + desplazamiento + 1);
      d.setDate(0);
      return d.toISOString().split('T')[0];
    };
    return [
      { id: '7', etiqueta: 'Últimos 7 días', desde: shiftISO(hoy, -7), hasta: hoy },
      { id: '30', etiqueta: 'Últimos 30 días', desde: shiftISO(hoy, -30), hasta: hoy },
      { id: '90', etiqueta: 'Últimos 90 días', desde: shiftISO(hoy, -90), hasta: hoy },
      { id: 'mes', etiqueta: 'Este mes', desde: primeroDe(0), hasta: hoy },
      { id: 'mes-1', etiqueta: 'Mes pasado', desde: primeroDe(-1), hasta: finDe(-1) },
    ];
  }, []);

  // ── Reporte en PDF ──
  const [pdfMenuAbierto, setPdfMenuAbierto] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [generandoExcel, setGenerandoExcel] = useState(false);
  const [seccionesSel, setSeccionesSel] = useState<SeccionId[]>(SECCIONES.map((s) => s.id));

  /**
   * Marca que el periodo se eligió a mano. Sin esto, `togglePdfMenu` volvía a
   * imponer el rango de la ventana cada vez que se reabría el menú y tiraba en
   * silencio las fechas que acababas de escoger en el calendario.
   */
  const [pdfRangoTocado, setPdfRangoTocado] = useState(false);

  const elegirRangoPdf = (d: string, h: string) => {
    setPdfDesde(d);
    setPdfHasta(h);
    setPdfRangoTocado(true);
  };

  const elegirModoPdf = (modo: 'rango' | 'historico') => {
    setPdfModoRango(modo);
    setPdfRangoTocado(true);
  };

  const togglePdfMenu = () => {
    // Al abrir se propone el periodo de la ventana, salvo que ya lo hayas fijado tú.
    if (!pdfMenuAbierto && !pdfRangoTocado) {
      setPdfModoRango('rango');
      const propuesto = tab === 'panel' && panelRango ? panelRango : { desde, hasta };
      setPdfDesde(propuesto.desde);
      setPdfHasta(propuesto.hasta);
    }
    setPdfMenuAbierto((v) => !v);
  };

  /**
   * El reporte sigue a la ventana abierta: desde Anticipos sale el de anticipos.
   * Solo el Consolidado, que es la vista que lo abarca todo, marca todas las
   * secciones. Se puede ajustar a mano después.
   */
  const seccionesDeTab = (t: typeof tab): SeccionId[] => {
    if (t === 'consolidado') return SECCIONES.map((s) => s.id);
    if (t === 'conciliacion') return ['conciliacion'];
    if ((CATEGORIAS_B as readonly string[]).includes(t)) return [t as SeccionId];
    return ['resumen']; // panel y cuentas bancarias
  };
  // Al cambiar de ventana o de cuenta el reporte vuelve a seguir al contexto:
  // las secciones de esa vista y su periodo, olvidando el ajuste manual previo.
  useEffect(() => { setSeccionesSel(seccionesDeTab(tab)); setPdfRangoTocado(false); }, [tab]);
  useEffect(() => { setPdfRangoTocado(false); }, [libroActivo?.id]);
  const [visor, setVisor] = useState<{ url: string; viaFallback: boolean } | null>(null);

  const rangoReporte = pdfModoRango === 'rango' ? { desde: pdfDesde, hasta: pdfHasta } : null;

  const generarReporte = async () => {
    if (!libroActivo || !seccionesSel.length) return;
    setPdfMenuAbierto(false);
    setGenerandoPdf(true);
    try {
      const token = localStorage.getItem('inv_token');
      const params = new URLSearchParams({ libro: libroActivo.id, secciones: seccionesSel.join(',') });
      if (rangoReporte) { params.set('desde', rangoReporte.desde); params.set('hasta', rangoReporte.hasta); }

      // Respaldo del navegador: solo tiene los movimientos ya cargados y no
      // conoce el saldo con el que abrió el periodo, así que va en null.
      const htmlRespaldo = buildReporteFinanzasHtml({
        libroNombre: libroActivo.nombre,
        responsable: libroActivo.responsable,
        desde: rangoReporte?.desde ?? pdfDesde,
        hasta: rangoReporte?.hasta ?? pdfHasta,
        saldoPrevio: null, saldoPrevioTarjeta: null, saldoPrevioEfectivo: null,
        movimientos: movimientos.map((m) => ({
          fecha: m.fecha, tipo: m.tipo, categoria: m.categoria, monto: m.monto,
          descripcion: m.descripcion, medio_pago: m.medio_pago, nombre: m.nombre,
          tipo_detalle: m.tipo_detalle, turno: m.turno, alimentos: m.alimentos, servicio: m.servicio,
        })),
        generadoPor: user?.username ?? '—',
        fecha: new Date().toISOString(),
        secciones: seccionesSel,
      }, '/LOGO_PDFS.png');

      const { blob, viaFallback } = await generarPdfConFallback(
        () => fetch(`/api/finanzas/reporte-pdf?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } }),
        htmlRespaldo,
      );
      setVisor({ url: URL.createObjectURL(blob), viaFallback });
      if (viaFallback) toast.warning('El servidor no respondió: el reporte se generó en tu navegador y no incluye el saldo de apertura');
    } catch {
      toast.error('No se pudo generar el reporte');
    } finally {
      setGenerandoPdf(false);
    }
  };

  const cerrarVisor = () => {
    if (visor) URL.revokeObjectURL(visor.url);
    setVisor(null);
  };

  /**
   * Descarga el mismo reporte en Excel. Va contra las secciones ya elegidas, así
   * que sale una hoja por sección: con todas marcadas es el libro completo
   * —igual que la plantilla semanal de la que vino el módulo— y con una sola es
   * la hoja de la ventana en la que estás.
   *
   * No tiene respaldo en el navegador como el PDF: el Excel se arma en el
   * servidor con los saldos de apertura, que el cliente no conoce.
   */
  const descargarExcel = async () => {
    if (!libroActivo || !seccionesSel.length) return;
    setPdfMenuAbierto(false);
    setGenerandoExcel(true);
    try {
      const token = localStorage.getItem('inv_token');
      const params = new URLSearchParams({ libro: libroActivo.id, secciones: seccionesSel.join(',') });
      if (rangoReporte) { params.set('desde', rangoReporte.desde); params.set('hasta', rangoReporte.hasta); }

      const res = await fetch(`/api/finanzas/reporte-excel?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('respuesta no ok');

      // El nombre lo decide el servidor; si no llega, uno razonable de respaldo.
      const cabecera = res.headers.get('Content-Disposition') || '';
      const nombre = /filename=([^;]+)/i.exec(cabecera)?.[1]?.trim()
        || `${libroActivo.nombre}_${rangoReporte?.desde ?? desde}_a_${rangoReporte?.hasta ?? hasta}.xlsx`;

      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${nombre} descargado`);
    } catch {
      toast.error('No se pudo generar el Excel');
    } finally {
      setGenerandoExcel(false);
    }
  };

  // ── Envío del reporte por correo ──
  const [correoAbierto, setCorreoAbierto] = useState(false);
  const [correoForm, setCorreoForm] = useState({ para: '', cc: '', asunto: '', mensaje: '' });

  const abrirCorreo = () => {
    setPdfMenuAbierto(false);
    const periodo = rangoReporte ? `${fmtDate(rangoReporte.desde)} al ${fmtDate(rangoReporte.hasta)}` : 'histórico completo';
    setCorreoForm({
      para: '', cc: '',
      asunto: `Reporte de ${libroActivo?.nombre ?? 'la cuenta'} · ${periodo}`,
      mensaje: '',
    });
    setCorreoAbierto(true);
  };

  const enviarCorreoMutation = useMutation({
    mutationFn: () => apiFetch('/api/finanzas/reporte-correo', {
      method: 'POST',
      body: JSON.stringify({
        libro: libroActivo!.id,
        desde: rangoReporte?.desde ?? null,
        hasta: rangoReporte?.hasta ?? null,
        secciones: seccionesSel,
        ...correoForm,
      }),
    }),
    onSuccess: () => {
      toast.success('Reporte enviado con el PDF adjunto');
      setCorreoAbierto(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const esHE = movForm.categoria === CAT_HE;
  const esIngreso = movForm.categoria === CAT_INGRESOS;

  // Misma composición que destinoDe(), pero sobre el formulario en curso.
  const vistaPreviaMov = (esHE
    ? [movForm.tipo_detalle, movForm.nombre, movForm.turno, movForm.alimentos ? `ALIMENTOS: ${movForm.alimentos}` : null, movForm.servicio, movForm.descripcion]
    : esIngreso
      ? [movForm.medio_pago, movForm.descripcion]
      : [movForm.nombre, movForm.descripcion]
  ).map((s) => (s ?? '').trim()).filter(Boolean).join(' , ');

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
    { id: 'panel', label: 'Panel' },
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
          {/* El panel trae su propio selector, acotado a las fechas que existen */}
          <div className={`flex items-center gap-1 ${tab === 'panel' ? 'hidden' : ''}`}>
            <button onClick={() => { setDesde(shiftISO(desde, -7)); setHasta(shiftISO(hasta, -7)); }} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors" title="Semana anterior"><ChevronLeft className="w-4 h-4" /></button>
            <RangoFechas
              desde={desde}
              hasta={hasta}
              presets={presetsSemana}
              onChange={(d, h) => { setDesde(d); setHasta(h); }}
            />
            <button onClick={() => { setDesde(shiftISO(desde, 7)); setHasta(shiftISO(hasta, 7)); }} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors" title="Semana siguiente"><ChevronRight className="w-4 h-4" /></button>
          </div>
          {/* Reporte de la cuenta activa: PDF, Excel o correo, mismas secciones */}
          <div className="relative">
            <Button variant="outline" size="sm" disabled={generandoPdf || generandoExcel || !libroActivo} onClick={togglePdfMenu}>
              {generandoPdf || generandoExcel ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileText className="w-4 h-4 mr-1.5" />}
              {generandoPdf ? 'Generando PDF...' : generandoExcel ? 'Generando Excel...' : 'Reporte'}
            </Button>
            {pdfMenuAbierto && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPdfMenuAbierto(false)} />
                {/* Sin overflow-hidden: el calendario del rango es un desplegable
                    absoluto que vive aquí dentro, y recortaba 22 de sus 31 días. */}
                <div className="absolute right-0 z-50 mt-2 w-[300px] rounded-2xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-2.5 border-b border-border space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-semibold">Período del reporte</p>
                      <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg text-[10px]">
                        <button
                          type="button"
                          onClick={() => elegirModoPdf('rango')}
                          className={`px-2 py-0.5 rounded font-medium transition-colors ${pdfModoRango === 'rango' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          Fechas
                        </button>
                        <button
                          type="button"
                          onClick={() => elegirModoPdf('historico')}
                          className={`px-2 py-0.5 rounded font-medium transition-colors ${pdfModoRango === 'historico' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          Histórico
                        </button>
                      </div>
                    </div>
                    {pdfModoRango === 'rango' ? (
                      <div>
                        <RangoFechas
                          desde={pdfDesde}
                          hasta={pdfHasta}
                          presets={presetsSemana}
                          onChange={elegirRangoPdf}
                          className="w-full"
                        />
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Incluye todos los movimientos acumulados en la cuenta.
                      </p>
                    )}
                  </div>
                  <div className="px-3 pt-2 pb-1 border-b border-border">
                    <p className="text-xs font-semibold">Secciones del reporte</p>
                  </div>
                  {/* Las ocho secciones ocupan 224px: con 200px se cortaba la última */}
                  <div className="p-1.5 max-h-[280px] overflow-y-auto">
                    {SECCIONES.map((s) => {
                      const activa = seccionesSel.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSeccionesSel((prev) => activa ? prev.filter((x) => x !== s.id) : [...prev, s.id])}
                          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs hover:bg-muted transition-colors text-left"
                        >
                          <span className={activa ? 'font-medium text-foreground' : 'text-muted-foreground'}>{s.etiqueta}</span>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${activa ? 'bg-primary border-primary' : 'border-border'}`}>
                            {activa && <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 border-t border-border px-2 py-1.5">
                    <button type="button" onClick={() => setSeccionesSel(SECCIONES.map((s) => s.id))} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">Todas</button>
                    <button type="button" onClick={() => setSeccionesSel(seccionesDeTab(tab))} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">Esta ventana</button>
                    <button type="button" onClick={() => setSeccionesSel([])} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">Ninguna</button>
                  </div>
                  {/* Las tres salidas comparten secciones y periodo: lo que elijas
                      arriba sale igual en PDF, en Excel o por correo. */}
                  <div className="flex items-center gap-2 border-t border-border p-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs flex-1" disabled={!seccionesSel.length} onClick={abrirCorreo} title="Enviar el reporte por correo">
                      <Mail className="w-3.5 h-3.5 mr-1.5" /> Enviar
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs flex-1" disabled={!seccionesSel.length || generandoExcel} onClick={descargarExcel} title="Descargar en Excel: una hoja por sección">
                      {generandoExcel
                        ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        : <Sheet className="w-3.5 h-3.5 mr-1.5" />}
                      Excel
                    </Button>
                    <Button size="sm" className="h-8 text-xs flex-1" disabled={!seccionesSel.length} onClick={generarReporte} title="Ver el reporte en PDF">PDF</Button>
                  </div>
                </div>
              </>
            )}
          </div>
          {/* El botón dice qué se va a capturar: desde una pestaña de categoría
              el modal ya abre en esa, y saberlo de antemano evita el desconcierto. */}
          {puedeEditar && (
            <Button size="sm" onClick={() => abrirNuevoMov()} title="Registrar un movimiento en esta cuenta">
              <Plus className="w-4 h-4 mr-1.5" />
              {(CATEGORIAS_B as readonly string[]).includes(tab)
                ? `Nuevo en ${TABS_ETIQUETA[tab] ?? 'la categoría'}`
                : 'Nuevo movimiento'}
            </Button>
          )}
          {isEditor && <Button variant="outline" size="sm" onClick={() => setCuentaModalOpen(true)}><Landmark className="w-4 h-4 mr-1.5" /> Cuenta</Button>}
        </div>
      </div>

      {/* El panel trae su propio resumen del histórico: repetir aquí las cifras
          del periodo solo confundiría sobre a qué rango pertenece cada número. */}
      <div className={`grid grid-cols-2 lg:grid-cols-5 gap-3 ${tab === 'panel' ? 'hidden' : ''}`}>
        <div className="bg-card border border-border rounded-xl p-4 flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Existencia (fondo disponible)</p><p className="text-xl font-bold mt-1">{fmtMoney(calc.existencia)}</p></div><div className="p-2 rounded-xl bg-blue-50"><Wallet className="w-4 h-4 text-blue-600" /></div></div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Saldo en tarjeta</p><p className="text-xl font-bold mt-1">{fmtMoney(calc.saldoTarjeta)}</p></div><div className="p-2 rounded-xl bg-indigo-50"><CreditCard className="w-4 h-4 text-indigo-600" /></div></div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Saldo en efectivo</p><p className="text-xl font-bold mt-1">{fmtMoney(calc.saldoEfectivo)}</p></div><div className="p-2 rounded-xl bg-teal-50"><Banknote className="w-4 h-4 text-teal-600" /></div></div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Ingresos del periodo</p><p className="text-xl font-bold text-emerald-700 mt-1">{fmtMoney(calc.ingresosPeriodo)}</p></div><div className="p-2 rounded-xl bg-emerald-50"><TrendingUp className="w-4 h-4 text-emerald-600" /></div></div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Egresos del periodo</p><p className="text-xl font-bold text-red-700 mt-1">{fmtMoney(calc.egresosPeriodo)}</p></div><div className="p-2 rounded-xl bg-red-50"><TrendingDown className="w-4 h-4 text-red-600" /></div></div>
      </div>

      {libroActivo && <AvisoDescuadres libroId={libroActivo.id} />}
      {libroActivo && <AvisoNominaFaltante libroId={libroActivo.id} existencia={calc.existencia} />}

      <div className="flex border-b border-border overflow-x-auto scroll-touch no-scrollbar [&>button]:flex-shrink-0 [&>button]:whitespace-nowrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.id ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t.label}</button>
        ))}
      </div>

      {/* ── Panel de la cuenta ── */}
      {tab === 'panel' && libroActivo && (
        <PanelFinanzas libroId={libroActivo.id} libroNombre={libroActivo.nombre} onRangoChange={setPanelRango} />
      )}

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
      <Dialog open={movModalOpen} onOpenChange={(open) => { if (!open) cerrarMovModal(); }} className="sm:max-w-2xl">
        <DialogContent className="gap-0">
          <form onSubmit={(e) => { e.preventDefault(); if (movForm.monto) guardarMovMutation.mutate(); }}>
            <DialogHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <DialogTitle>{editingMov ? 'Editar movimiento' : 'Registrar movimiento'}</DialogTitle>
                  <DialogDescription>Los campos cambian según la categoría, igual que las hojas del Excel.</DialogDescription>
                </div>
                {libroActivo && (
                  <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-border bg-muted text-muted-foreground flex-shrink-0">
                    <Landmark className="w-3 h-3" />{libroActivo.nombre}
                  </span>
                )}
              </div>
            </DialogHeader>

            {/* ── Categoría: decide qué campos aparecen debajo ── */}
            <Banda titulo="Categoría" primera>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CATEGORIAS_B.map((c) => {
                  const ui = CAT_UI[c];
                  const Icono = ui.icono;
                  const activo = movForm.categoria === c;
                  return (
                    <button key={c} type="button" onClick={() => cambiarCategoria(c)}
                      className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border text-[11px] font-semibold transition-colors ${
                        activo ? ui.activo : 'border-border text-muted-foreground hover:bg-muted'}`}>
                      <Icono className="w-4 h-4" />
                      <span className="text-center leading-tight px-1">{ui.etiqueta}</span>
                    </button>
                  );
                })}
              </div>
            </Banda>

            {/* ── Cuándo y con qué se pagó ── */}
            <Banda titulo="Cuándo y cómo">
              <div className="grid sm:grid-cols-2 gap-4">
                <Campo label="Fecha">
                  <SelectorFecha value={movForm.fecha} onChange={(f) => setMovForm((prev) => ({ ...prev, fecha: f }))} />
                </Campo>
                <Campo label="Medio de pago">
                  <div className="grid grid-cols-2 gap-2">
                    {MEDIOS_PAGO.map((m) => (
                      <Opcion key={m} activo={movForm.medio_pago === m} onClick={() => setMovForm((f) => ({ ...f, medio_pago: m }))}>
                        {m === 'TARJETA' ? <CreditCard className="w-3.5 h-3.5" /> : <Banknote className="w-3.5 h-3.5" />}{m}
                      </Opcion>
                    ))}
                  </div>
                </Campo>
              </div>
            </Banda>

            {/* ── Detalle del turno, solo para H.E. y dobletes ── */}
            {esHE && (
              <Banda titulo="Detalle del turno">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Campo label="Tipo">
                    <div className="grid grid-cols-2 gap-2">
                      {TIPOS_HE.map((t) => (
                        <Opcion key={t} activo={movForm.tipo_detalle === t} onClick={() => cambiarTipoHE(t)}
                          tonoActivo="border-amber-400 bg-amber-50 text-amber-800">
                          {t}
                        </Opcion>
                      ))}
                    </div>
                  </Campo>
                  <Campo label="Turno / Horas">
                    <Input list="dl-turnos" value={movForm.turno} onChange={(e) => cambiarTurno(e.target.value)} placeholder="12 HORAS, 1:30 HR..." />
                  </Campo>
                  <Campo label="Alimentos" ayuda="se deduce del tipo">
                    <div className="grid grid-cols-2 gap-2">
                      {['SI', 'NO'].map((v) => (
                        <Opcion key={v} activo={movForm.alimentos === v} onClick={() => setMovForm((f) => ({ ...f, alimentos: v }))}>{v}</Opcion>
                      ))}
                    </div>
                  </Campo>
                  <Campo label="Servicio">
                    <Input list="dl-servicios" value={movForm.servicio} onChange={(e) => setMovForm((f) => ({ ...f, servicio: e.target.value }))} placeholder="TRES LAGOS, TORRE OLIMPO..." />
                  </Campo>
                </div>
              </Banda>
            )}

            {/* ── A quién y por qué ── */}
            <Banda titulo={esIngreso ? 'Concepto del ingreso' : 'A quién y por qué'}>
              <div className="space-y-4">
                {!esIngreso && (
                  <Campo label="Nombre">
                    <Input list="dl-nombres" value={movForm.nombre} onChange={(e) => setMovForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Guardia, proveedor, CFE..." required />
                  </Campo>
                )}
                <Campo label={movForm.categoria === CAT_HE || movForm.categoria === CAT_GASTOS ? 'Motivo' : 'Concepto'}>
                  <Input value={movForm.descripcion} onChange={(e) => setMovForm((f) => ({ ...f, descripcion: e.target.value }))}
                    placeholder={movForm.categoria === CAT_ANTICIPOS ? 'ANTICIPO DE NOMINA' : movForm.categoria === CAT_INGRESOS ? 'FONDOS PROVENIENTES DE U3...' : 'CUBRE VACANTE, REEMBOLSO...'} required={!esHE} />
                  {/* Lo que más se repite en el histórico, a un clic */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(SUGERENCIAS[movForm.categoria] ?? []).map((s) => (
                      <Chip key={s} activo={movForm.descripcion === s} onClick={() => setMovForm((f) => ({ ...f, descripcion: s }))}>{s}</Chip>
                    ))}
                  </div>
                </Campo>
              </div>
            </Banda>

            {/* ── Importe: es el dato del movimiento, así que manda visualmente ── */}
            <Banda titulo="Importe">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold text-muted-foreground pointer-events-none">$</span>
                <input
                  type="number" min={0.01} step="0.01" required inputMode="decimal"
                  value={movForm.monto}
                  onChange={(e) => setMovForm((f) => ({ ...f, monto: e.target.value }))}
                  placeholder="0.00"
                  className="w-full h-16 rounded-xl border border-border bg-card pl-10 pr-4 text-3xl font-bold tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              {/* Horas extras: tarifa fija de $50/hora en todo el histórico */}
              {importeSugerido !== null && (
                <p className={`text-[11px] flex items-center gap-1 mt-2 ${importeFueraDeTarifa ? 'text-amber-700' : 'text-muted-foreground'}`}>
                  {importeFueraDeTarifa && <AlertTriangle className="w-3 h-3 flex-shrink-0" />}
                  {importeFueraDeTarifa
                    ? <>La tarifa de {movForm.turno} son {fmtMoney(importeSugerido)}. <button type="button" className="underline font-medium" onClick={() => setMovForm((f) => ({ ...f, monto: String(importeSugerido) }))}>Usar tarifa</button></>
                    : <>Calculado a {fmtMoney(TARIFA_HORA_EXTRA)} por hora</>}
                </p>
              )}
              {/* El doblete no tiene tarifa fija: solo importes habituales */}
              {esHE && movForm.tipo_detalle === 'DOBLETE' && IMPORTES_DOBLETE[movForm.turno] && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[11px] text-muted-foreground">Habituales:</span>
                  {IMPORTES_DOBLETE[movForm.turno].map((v) => (
                    <Chip key={v} activo={Number(movForm.monto) === v} onClick={() => setMovForm((f) => ({ ...f, monto: String(v) }))}>{fmtMoney(v)}</Chip>
                  ))}
                </div>
              )}
            </Banda>

            {/* ── Evidencia: zona de arrastre en vez del input crudo ── */}
            <Banda titulo="Evidencia">
              <label
                onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={(e) => {
                  e.preventDefault(); setArrastrando(false);
                  setArchivos((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
                }}
                className={`flex flex-col items-center justify-center gap-1 py-6 rounded-xl border border-dashed cursor-pointer transition-colors ${
                  arrastrando ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
              >
                <UploadCloud className="w-5 h-5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Arrastra el ticket o <span className="text-primary font-medium">búscalo</span></p>
                <p className="text-[10px] text-muted-foreground/70">Imágenes o PDF</p>
                <input type="file" multiple accept="image/*,application/pdf" className="hidden"
                  onChange={(e) => setArchivos((prev) => [...prev, ...Array.from(e.target.files || [])])} />
              </label>
              {archivos.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {archivos.map((a, i) => (
                    <li key={`${a.name}-${i}`} className="flex items-center gap-2 text-xs bg-muted/60 rounded-lg px-2.5 py-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="truncate flex-1">{a.name}</span>
                      <button type="button" onClick={() => setArchivos((prev) => prev.filter((_, j) => j !== i))}
                        className="text-muted-foreground hover:text-red-600 transition-colors" title="Quitar">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {editingMov && editingMov.evidencias > 0 && (
                <p className="text-[11px] text-muted-foreground mt-2">Ya tiene {editingMov.evidencias} evidencia(s); las nuevas se agregan sin borrar las anteriores.</p>
              )}
            </Banda>

            {/* ── Vista previa: cómo va a leerse la línea antes de guardarla ── */}
            <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 py-3 border-t border-border bg-muted/40">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Así quedará en el consolidado</p>
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs leading-snug">{vistaPreviaMov || <span className="text-muted-foreground italic">Completa los campos</span>}</p>
                <span className={`text-base font-bold whitespace-nowrap tabular-nums ${esIngreso ? 'text-emerald-700' : 'text-red-700'}`}>
                  {esIngreso ? '+' : '−'}{fmtMoney(Number(movForm.monto) || 0)}
                </span>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-4">
              <Button type="button" variant="outline" onClick={cerrarMovModal}>Cancelar</Button>
              {!editingMov && (
                <Button type="submit" variant="outline" disabled={guardarMovMutation.isPending}
                  onClick={() => setSeguirCapturando(true)} title="Guarda y deja el formulario listo para el siguiente, conservando fecha y categoría">
                  Guardar y seguir
                </Button>
              )}
              <Button type="submit" disabled={guardarMovMutation.isPending} onClick={() => setSeguirCapturando(false)}>
                {guardarMovMutation.isPending ? 'Guardando...' : editingMov ? 'Guardar cambios' : 'Registrar y cerrar'}
              </Button>
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

      {/* ── Enviar el reporte por correo ── */}
      <Dialog open={correoAbierto} onOpenChange={(open) => { if (!open) setCorreoAbierto(false); }}>
        <DialogContent className="gap-0">
          <form onSubmit={(e) => { e.preventDefault(); enviarCorreoMutation.mutate(); }}>
            <DialogHeader>
              <DialogTitle>Enviar el reporte por correo</DialogTitle>
              <DialogDescription>
                Se adjunta el PDF de {libroActivo?.nombre ?? 'la cuenta'} con {seccionesSel.length === SECCIONES.length ? 'todas las secciones' : `${seccionesSel.length} sección(es)`}
                {rangoReporte ? `, del ${fmtDate(rangoReporte.desde)} al ${fmtDate(rangoReporte.hasta)}` : ', del histórico completo'}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <Campo label="Para" ayuda="separa varios con comas">
                <Input type="text" value={correoForm.para} onChange={(e) => setCorreoForm((f) => ({ ...f, para: e.target.value }))}
                  placeholder="direccion@empresa.com, otra@empresa.com" required />
              </Campo>
              <Campo label="Copia (CC)">
                <Input type="text" value={correoForm.cc} onChange={(e) => setCorreoForm((f) => ({ ...f, cc: e.target.value }))} placeholder="Opcional" />
              </Campo>
              <Campo label="Asunto">
                <Input type="text" value={correoForm.asunto} onChange={(e) => setCorreoForm((f) => ({ ...f, asunto: e.target.value }))} required />
              </Campo>
              <Campo label="Mensaje" ayuda="opcional">
                <textarea
                  value={correoForm.mensaje}
                  onChange={(e) => setCorreoForm((f) => ({ ...f, mensaje: e.target.value }))}
                  rows={3}
                  placeholder="Se añade al cuerpo del correo, antes de la firma."
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors resize-y"
                />
              </Campo>
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-2">
                <FileText className="w-4 h-4 flex-shrink-0" />
                El PDF se genera en el momento del envío, así que siempre va con los datos más recientes.
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setCorreoAbierto(false)}>Cancelar</Button>
              <Button type="submit" disabled={enviarCorreoMutation.isPending}>
                {enviarCorreoMutation.isPending
                  ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Generando y enviando...</>
                  : <><Mail className="w-4 h-4 mr-1.5" /> Enviar</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {visor && (
        <DocumentViewerModal
          title={`Reporte de ${libroActivo?.nombre ?? 'la cuenta'}`}
          url={visor.url}
          downloadName={`reporte_${(libroActivo?.nombre ?? 'cuenta').toLowerCase().replace(/[^a-z0-9]+/g, '_')}.pdf`}
          viaFallback={visor.viaFallback}
          onClose={cerrarVisor}
        />
      )}
    </div>
  );
}
