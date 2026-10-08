'use client';
import { fechaMexico } from '@/src/lib/fecha';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { PageHeader } from '@/src/components/ui/page-header';
import { SegmentedTabs } from '@/src/components/ui/tabs';
import { Avatar } from '@/src/components/ui/avatar';
import { Field, FieldGrid, FormSection, InputGroup, Callout } from '@/src/components/ui/field';
import { FormDialog, ConfirmDialog } from '@/src/components/ui/form-dialog';
import { ProgressRing } from '@/src/components/ui/progress-ring';
import { TarjetaPersona, datosFicha, variantEstado, puntoEstado } from '@/src/components/personal/TarjetaPersona';
import { Select } from '@/src/components/ui/select';
import {
  Search,
  UserPlus,
  LogOut,
  Printer,
  Edit,
  Trash2,
  Download,
  Eye,
  Phone,
  MapPin,
  FileText,
  Upload,
  IdCard,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Calendar,
  LayoutGrid,
  List,
  Shield,
  User,
  ExternalLink,
  RefreshCw,
  Briefcase,
  FileCheck,
  Building2,
  Clock,
  ChevronRight,
  Maximize2,
  X
} from 'lucide-react';
import { fmtDate, cn } from '@/src/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';
import MachoteFichaTecnica from '@/src/components/machotes/MachoteFichaTecnica';
import GuardiaPerfil from './GuardiaPerfil';
import { IdentidadPersonal } from '@/src/components/forms/IdentidadPersonal';
import { FICHA_EXTRA_VACIA, extraerFichaExtra, type FichaExtraValores } from './administrativos/FichaExtraEditor';
import { unirNombreCompleto, validarNSS } from '@/src/lib/rfcCurp';

function imprimirExpediente(guardia: any, salidas: any[], entradas: any[]) {
  salidas = salidas.filter(s => !s.anulado); entradas = entradas.filter(e => !e.anulado);
  const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const enPosesion = salidas.filter(s => !s.anulado).filter(s => s.estado_asignacion === 'Uniforme en Campo');
  const saldoMap: Record<string, number> = {};
  enPosesion.forEach(s => { const key = `${s.articulo}${s.talla ? ` (Talla: ${s.talla})` : ''}`; saldoMap[key] = (saldoMap[key] || 0) + s.cantidad; });
  const dotacion = salidas.filter(s => s.concepto === 'Uniforme en Campo' || s.concepto === 'Asignación');
  const reposicion = salidas.filter(s => s.concepto === 'Reposición');
  const extravios = salidas.filter(s => s.estado_asignacion === 'Extraviado' || s.concepto === 'Extravío');
  const recuperados = entradas.filter(e => !e.anulado).filter(e => e.motivo === 'Recuperado');
  const reposicionEntradas = entradas.filter(e => e.motivo === 'Reposición (Entrada Múltiple)');
  const totalDotaciones = dotacion.reduce((a: number, s: any) => a + s.cantidad, 0);
  const totalReposiciones = reposicion.reduce((a: number, s: any) => a + s.cantidad, 0);
  const totalPerdidas = extravios.reduce((a: number, s: any) => a + s.cantidad, 0);
  const totalEnPosesion = Object.values(saldoMap).reduce((a, v) => a + v, 0);
  const saldoItemsHtml = Object.entries(saldoMap).length === 0 ? '<p style="color:#6b7280;font-style:italic;font-size:11px;margin-top:8px">Sin artículos en posesión.</p>' : `<ul style="list-style:none;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px;">${Object.entries(saldoMap).map(([art, qty]) => `<li style="font-size:11px;"><strong>${qty}x</strong> ${art}</li>`).join('')}</ul>`;
  const thBase = `<th style="width:30px">No.</th><th>Fecha</th><th>Artículo</th><th style="text-align:center">Talla</th><th style="text-align:center">Cant.</th>`;
  const mkHeader = (lastCol: string) => `<thead><tr>${thBase}<th>${lastCol}</th></tr></thead>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"/><title>Expediente — ${guardia.nombre}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:28px 36px}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1d4ed8;padding-bottom:10px;margin-bottom:14px}
  .header-left h1{font-size:18px;font-weight:900;color:#1d4ed8;letter-spacing:1px;text-transform:uppercase}.header-left p{font-size:10px;color:#6b7280;margin-top:2px}
  .header-right{text-align:right;font-size:10px;color:#374151}.header-right strong{font-size:12px;display:block;color:#1d4ed8}
  .doc-title{text-align:center;font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;background:#1d4ed8;color:#fff;padding:5px 0;margin-bottom:14px}
  .ficha{border:1.5px solid #1d4ed8;border-radius:4px;padding:10px 14px;margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr;gap:6px 20px}
  .ficha-field span{color:#6b7280;font-size:10px;display:block}.ficha-field strong{font-size:12px;color:#111}
  .section-title{font-size:12px;font-weight:700;color:#1d4ed8;margin:16px 0 6px 0;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
  table{width:100%;border-collapse:collapse;margin-bottom:10px}thead tr{background:#1d4ed8;color:#fff}
  th{padding:6px 8px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;text-align:left}
  td{padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px}tr:nth-child(even) td{background:#f0f4ff}
  .saldo-box{margin:20px 0;padding:12px;border:2px dashed #1d4ed8;border-radius:6px;background-color:#eff6ff}
  .saldo-title{font-size:13px;font-weight:800;color:#1e3a8a;margin-bottom:8px;text-transform:uppercase}
  .firmas{display:flex;justify-content:space-around;margin-top:40px}.firma{text-align:center;width:200px}
  .firma-line{border-bottom:1.5px solid #111;margin-bottom:6px;height:36px}.firma p{font-size:10px;font-weight:700;text-transform:uppercase}.firma small{font-size:9px;color:#6b7280}
  .pie{margin-top:20px;padding-top:8px;border-top:1px solid #d1d5db;font-size:9px;color:#9ca3af;text-align:center}</style>
  </head><body>
  <div class="header"><div class="header-left"><h1>U3 Seguridad Privada</h1><p>Control de Uniformes y Dotaciones · Uso Interno</p></div>
  <div class="header-right"><strong>EXPEDIENTE DE ELEMENTO</strong>Ciudad de México, México.<br/>Fecha:<br/>${fecha}</div></div>
  <div class="doc-title">ENTREGA DE UNIFORME Y/O EQUIPO DE TRABAJO</div>
  <div class="ficha">
    <div class="ficha-field"><span>Nombre Completo</span><strong>${guardia.nombre}</strong></div>
    <div class="ficha-field"><span>Número de Elemento</span><strong>${guardia.numero_elemento}</strong></div>
    <div class="ficha-field"><span>Fecha de Alta</span><strong>${fmtDate(guardia.fecha_alta)}</strong></div>
    <div class="ficha-field"><span>Estatus</span><strong>${guardia.estado}</strong></div>
  </div>
  <div class="section-title">I. Dotación inicial</div>
  ${dotacion.length === 0 ? '<p style="color:#6b7280;font-size:11px">Sin registros.</p>' : `<table>${mkHeader('Estado')}<tbody>${dotacion.map((item: any, idx: number) => `<tr><td style="text-align:center">${idx+1}</td><td>${fmtDate(item.fecha)}</td><td><strong>${item.articulo}</strong></td><td style="text-align:center">${item.talla||'—'}</td><td style="text-align:center">${item.cantidad}</td><td>${item.estado_fisico||'Nuevo'}</td></tr>`).join('')}</tbody></table>`}
  <div class="section-title">II. Equipo repuesto</div>
  ${reposicion.length === 0 ? '<p style="color:#6b7280;font-size:11px">Sin registros.</p>' : `<table>${mkHeader('Estado devuelto → Entregado')}<tbody>${reposicion.map((item: any, idx: number) => { const matched = item.operacion_id && item.salida_origen_id ? reposicionEntradas.find((e: any) => e.operacion_id === item.operacion_id && e.salida_origen_id === item.salida_origen_id) : undefined; const devuelto = matched?.estado || '—'; return `<tr><td style="text-align:center">${idx+1}</td><td>${fmtDate(item.fecha)}</td><td><strong>${item.articulo}</strong></td><td style="text-align:center">${item.talla||'—'}</td><td style="text-align:center">${item.cantidad}</td><td>Devolvió: <strong>${devuelto}</strong> → Recibió: <strong>${item.estado_fisico||'Nuevo'}</strong></td></tr>`; }).join('')}</tbody></table>`}
  <div class="section-title">III. Pérdidas y extravíos</div>
  ${extravios.length === 0 ? '<p style="color:#6b7280;font-size:11px">Sin registros.</p>' : `<table>${mkHeader('Tipo')}<tbody>${extravios.map((item: any, idx: number) => `<tr><td style="text-align:center">${idx+1}</td><td>${fmtDate(item.fecha)}</td><td><strong>${item.articulo}</strong></td><td style="text-align:center">${item.talla||'—'}</td><td style="text-align:center">${item.cantidad}</td><td>${item.estado_asignacion === 'Extraviado' ? 'Extravío' : (item.concepto||'Extravío')}</td></tr>`).join('')}</tbody></table>`}
  ${recuperados.length === 0 ? '' : `<div class="section-title">IV. Equipo recuperado</div><table>${mkHeader('Estado al recuperar')}<tbody>${recuperados.map((item: any, idx: number) => `<tr><td style="text-align:center">${idx+1}</td><td>${fmtDate(item.fecha)}</td><td><strong>${item.articulo}</strong></td><td style="text-align:center">${item.talla||'—'}</td><td style="text-align:center">${item.cantidad}</td><td>${item.estado||'—'}</td></tr>`).join('')}</tbody></table>`}
  <div class="saldo-box">
    <div class="saldo-title">Saldo Actual en Posesión</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
      <div style="text-align:center;background:#dbeafe;border-radius:6px;padding:8px;"><div style="font-size:20px;font-weight:900;color:#1d4ed8;">${totalDotaciones}</div><div style="font-size:9px;color:#1e40af;text-transform:uppercase;font-weight:700;">Piezas dotadas</div></div>
      <div style="text-align:center;background:#ede9fe;border-radius:6px;padding:8px;"><div style="font-size:20px;font-weight:900;color:#7c3aed;">${totalReposiciones}</div><div style="font-size:9px;color:#6d28d9;text-transform:uppercase;font-weight:700;">Piezas repuestas</div></div>
      <div style="text-align:center;background:#fee2e2;border-radius:6px;padding:8px;"><div style="font-size:20px;font-weight:900;color:#dc2626;">${totalPerdidas}</div><div style="font-size:9px;color:#b91c1c;text-transform:uppercase;font-weight:700;">Pérdidas</div></div>
      <div style="text-align:center;background:#d1fae5;border-radius:6px;padding:8px;"><div style="font-size:20px;font-weight:900;color:#059669;">${totalEnPosesion}</div><div style="font-size:9px;color:#047857;text-transform:uppercase;font-weight:700;">En posesión</div></div>
    </div>${saldoItemsHtml}
  </div>
  <div class="firmas"><div class="firma"><div class="firma-line"></div><p>Firma del Elemento</p><small>${guardia.nombre}</small><br/><small>${guardia.numero_elemento}</small></div>
  <div class="firma"><div class="firma-line"></div><p>Responsable de Almacén</p><small>U3 Seguridad Privada</small></div></div>
  <div class="pie">Documento generado automáticamente · U3 Seguridad Privada · Uso administrativo interno.</div>
  </body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'width=900,height=720');
  if (!win) { alert('Permite ventanas emergentes para imprimir'); return; }
  win.addEventListener('load', () => { win.focus(); win.print(); setTimeout(() => URL.revokeObjectURL(url), 2000); });
}

async function descargarFichaPdf(guardiaId: number, numeroElemento: string) {
  const toastId = toast.loading('Generando ficha técnica oficial...');
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('inv_token') : null;
    const res = await fetch(`/api/guardias/${guardiaId}/ficha-pdf?download=true`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new Error('Error al generar la ficha');
    const blob = new Blob([await res.arrayBuffer()], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ficha_tecnica_${numeroElemento}.pdf`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 1000);
    toast.success('Ficha técnica PDF descargada con éxito', { id: toastId });
  } catch {
    toast.error('No se pudo generar la ficha técnica en PDF', { id: toastId });
  }
}

function abrirPdfEnNuevaVentana(guardiaId: number) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('inv_token') : '';
  const url = `/api/guardias/${guardiaId}/ficha-pdf?inline=true${token ? `&token=${token}` : ''}`;
  window.open(url, '_blank');
}

interface MenuContextualGuardia {
  x: number;
  y: number;
  guardia: any;
}

function MenuContextualGuardia({
  ctx,
  isAdmin,
  onCerrar,
  onVerPerfil,
  onEditar,
  onDarBaja,
  onEliminar,
}: {
  ctx: MenuContextualGuardia;
  isAdmin: boolean;
  onCerrar: () => void;
  onVerPerfil: (g: any) => void;
  onEditar: (g: any) => void;
  onDarBaja: (g: any) => void;
  onEliminar: (g: any) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cerrarFuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCerrar();
    };
    const cerrarEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('mousedown', cerrarFuera);
    window.addEventListener('keydown', cerrarEsc);
    window.addEventListener('scroll', onCerrar, true);
    return () => {
      window.removeEventListener('mousedown', cerrarFuera);
      window.removeEventListener('keydown', cerrarEsc);
      window.removeEventListener('scroll', onCerrar, true);
    };
  }, [onCerrar]);

  // Evita que el menú se salga de la pantalla en los bordes
  const left = Math.min(ctx.x, window.innerWidth - 220);
  const top = Math.min(ctx.y, window.innerHeight - 220);

  const item = (icon: React.ReactNode, label: string, onClick: () => void, danger?: boolean) => (
    <button
      type="button"
      onClick={() => { onClick(); onCerrar(); }}
      className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg text-left transition-colors ${
        danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40' : 'text-foreground hover:bg-muted'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div
      ref={ref}
      className="fixed z-[100] bg-card border border-border rounded-xl shadow-2xl p-1.5 min-w-[210px] animate-in fade-in zoom-in-95 duration-100"
      style={{ left, top }}
    >
      <div className="px-2.5 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground truncate border-b border-border/60 mb-1">
        {ctx.guardia.nombre}
      </div>
      {item(<User className="w-3.5 h-3.5" />, 'Ver Perfil', () => onVerPerfil(ctx.guardia))}
      {item(<Edit className="w-3.5 h-3.5" />, 'Editar Datos', () => onEditar(ctx.guardia))}
      {ctx.guardia.estado === 'Activo' && item(<LogOut className="w-3.5 h-3.5" />, 'Dar de Baja', () => onDarBaja(ctx.guardia))}
      {isAdmin && (
        <>
          <div className="my-1 h-px bg-border/60" />
          {item(<Trash2 className="w-3.5 h-3.5" />, 'Eliminar Permanentemente', () => onEliminar(ctx.guardia), true)}
        </>
      )}
    </div>
  );
}

// El orden importa: la identidad (nombre por partes, nacimiento, sexo, lugar de nacimiento) va primero
// porque de ella salen la CURP y el RFC.
const SECCIONES_ALTA = [
  { id: 'alta-identidad', label: 'Identidad' },
  { id: 'alta-empresa', label: 'Alta en la empresa' },
  { id: 'alta-contacto', label: 'Contacto' },
  { id: 'alta-personales', label: 'Datos personales' },
  { id: 'alta-domicilio', label: 'Domicilio' },
] as const;

const OPCIONES_ESTADO_CIVIL = ['Soltero(a)', 'Casado(a)', 'Unión libre', 'Divorciado(a)', 'Viudo(a)'];
const OPCIONES_ESTUDIOS = ['Primaria', 'Secundaria', 'Preparatoria', 'Técnico', 'Licenciatura', 'Posgrado'];

export default function GuardiasApp({ initialGuardiaId }: { initialGuardiaId?: number } = {}) {
  const { isEditor, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [selectedGuardiaId, setSelectedGuardiaId] = useState<number | null>(initialGuardiaId || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState<'Todos' | 'Activo' | 'Baja Pendiente' | 'En Baja'>('Todos');
  // El proceso de baja deja al guardia en "Baja Definitiva"; el filtro "En Baja" debe incluirlo
  // (antes solo veía el estado manual "En Baja" y los guardias con baja completada desaparecían
  // de todos los filtros salvo "Todos").
  const coincideEstado = (g: any, est: string) =>
    est === 'Todos' || g.estado === est || (est === 'En Baja' && g.estado === 'Baja Definitiva');
  // La vista elegida (tarjetas o tabla) se recuerda entre visitas.
  const [viewMode, setViewModeState] = useState<'cards' | 'table'>('cards');
  useEffect(() => {
    try {
      const guardada = localStorage.getItem('u3_guardias_vista');
      if (guardada === 'cards' || guardada === 'table') setViewModeState(guardada);
    } catch { /* sin almacenamiento: queda en tarjetas */ }
  }, []);
  const setViewMode = (vista: 'cards' | 'table') => {
    setViewModeState(vista);
    try { localStorage.setItem('u3_guardias_vista', vista); } catch { /* solo no se recuerda */ }
  };

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBajaModalOpen, setIsBajaModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Menú contextual (clic derecho)
  const [ctxMenu, setCtxMenu] = useState<MenuContextualGuardia | null>(null);
  const abrirMenuContextual = (e: React.MouseEvent, guardia: any) => {
    if (!isEditor) return;
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, guardia });
  };

  // Registration States
  const [numeroElemento, setNumeroElemento] = useState('');
  const [fechaAlta, setFechaAlta] = useState(fechaMexico());
  const [telefono, setTelefono] = useState('');

  // Identidad, datos personales y domicilio del alta rápida: mismas llaves que la Ficha
  // Técnica oficial, para que al abrirla después ya vengan precargados. El nombre se
  // captura por partes (nombre(s) y apellidos); `nombre` en la tabla es la unión de ellas.
  const [fichaExtra, setFichaExtra] = useState<FichaExtraValores>(FICHA_EXTRA_VACIA);
  const actualizarFichaExtra = (campo: keyof FichaExtraValores, valor: string) =>
    setFichaExtra((f) => ({ ...f, [campo]: valor }));
  const nombreAlta = unirNombreCompleto(fichaExtra);

  // Selected Guardia & Baja States
  const [selectedGuardia, setSelectedGuardia] = useState<any>(null);
  const [fechaBaja, setFechaBaja] = useState(fechaMexico());

  // Editing States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editNumeroElemento, setEditNumeroElemento] = useState('');
  const [editFichaExtra, setEditFichaExtra] = useState<FichaExtraValores>(FICHA_EXTRA_VACIA);
  const [editFechaAlta, setEditFechaAlta] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [editEstado, setEditEstado] = useState('Activo');

  // Queries
  const { data: guardias = [], isLoading } = useQuery({
    queryKey: ['guardias'],
    queryFn: () => apiFetch<any[]>('/api/guardias'),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload: any) => apiFetch('/api/guardias', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardias'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
      toast.success('Guardia registrado con éxito');
      setIsModalOpen(false);
      setNumeroElemento('');
      setTelefono('');
      setFichaExtra(FICHA_EXTRA_VACIA);
    },
    onError: () => toast.error('Error al registrar (¿Número duplicado?)'),
  });

  const editMutation = useMutation({
    mutationFn: (payload: any) => apiFetch(`/api/guardias/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardias'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
      toast.success('Datos del guardia actualizados');
      setIsEditModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message || 'Error al actualizar guardia'),
  });

  const bajaMutation = useMutation({
    mutationFn: (payload: { id: number, fecha: string }) =>
      apiFetch<any>(`/api/guardias/${payload.id}/baja`, { method: 'POST', body: JSON.stringify({ fecha: payload.fecha }) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['guardias'] });
      ['bajas', 'salidas', 'inventario', 'uniformesCampo', 'dashboardMetrics'].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(data?.estado_general === 'Completada' ? 'Baja registrada: el guardia no tenía equipo pendiente' : 'Proceso de baja iniciado');
      setIsBajaModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message || 'Error al procesar la baja'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/guardias/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardias'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] });
      toast.success('Guardia eliminado permanentemente');
      setIsDeleteModalOpen(false);
      setSelectedGuardia(null);
    },
    onError: (err: any) => toast.error(err.message || 'Error al eliminar guardia'),
  });

  const startEdit = (guardia: any) => {
    setEditFichaExtra(extraerFichaExtra(guardia.ficha_tecnica_json, guardia.nombre));
    setEditNumeroElemento(guardia.numero_elemento || '');
    setEditFechaAlta(guardia.fecha_alta ? guardia.fecha_alta.split('T')[0] : '');
    setEditTelefono(guardia.telefono || '');
    setEditDireccion(guardia.direccion || '');
    setEditEstado(guardia.estado || 'Activo');
    setSelectedGuardia(guardia);
    setIsEditModalOpen(true);
  };

  const router = useRouter();

  const openPerfil = (guardia: any, action?: 'datos' | 'ficha' | 'editFicha') => {
    if (action === 'editFicha') {
      router.push(`/guardias/${guardia.id}?editFicha=1`);
    } else if (action === 'ficha') {
      router.push(`/guardias/${guardia.id}?tab=ficha`);
    } else {
      router.push(`/guardias/${guardia.id}`);
    }
  };

  const filteredData = useMemo(() => {
    return guardias.filter((g: any) => {
      const term = searchTerm.toLowerCase();
      const matchSearch =
        (g.nombre || '').toLowerCase().includes(term) ||
        (g.numero_elemento || '').toLowerCase().includes(term) ||
        (g.telefono || '').toLowerCase().includes(term);

      const matchEstado =
        coincideEstado(g, filterEstado);

      return matchSearch && matchEstado;
    });
  }, [guardias, searchTerm, filterEstado]);

  // Si hay un guardia seleccionado, desplegar la vista de perfil completo estilo CRM
  if (selectedGuardiaId) {
    return <GuardiaPerfil id={selectedGuardiaId} onVolver={() => setSelectedGuardiaId(null)} />;
  }

  const filtros = (['Todos', 'Activo', 'Baja Pendiente', 'En Baja'] as const).map((est) => ({
    value: est,
    label: est === 'Todos' ? 'Todos' : est === 'Activo' ? 'Activos' : est === 'Baja Pendiente' ? 'Baja pendiente' : 'En baja',
    count: guardias.filter((g: any) => coincideEstado(g, est)).length,
  }));

  // Resumen vivo del alta: cuanto de la ficha se ha capturado hasta ahora.
  const camposAlta = [numeroElemento, telefono, ...Object.values(fichaExtra)];
  const totalCamposAlta = camposAlta.length;
  const capturadosAlta = camposAlta.filter((v) => String(v ?? '').trim() !== '').length;
  const avanceAlta = Math.round((capturadosAlta / totalCamposAlta) * 100);

  // El NSS mide 11 dígitos; mientras se escribe no se avisa, solo cuando ya se pasó.
  const nss = fichaExtra.imss.replace(/\D/g, '').length > 11 ? validarNSS(fichaExtra.imss) : null;
  const errorNss = nss && !nss.ok ? nss.motivo : undefined;

  const irASeccion = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title="Guardias"
        description="Directorio operativo, expedientes con documentos y fichas técnicas del personal de seguridad."
        actions={
          <>
            <SegmentedTabs
              ariaLabel="Tipo de vista"
              value={viewMode}
              onChange={setViewMode}
              items={[
                { value: 'cards', label: 'Tarjetas', icon: LayoutGrid },
                { value: 'table', label: 'Tabla', icon: List },
              ]}
            />
            {isEditor && (
              <Button onClick={() => setIsModalOpen(true)} className="h-10">
                <UserPlus className="h-4 w-4" /> Nuevo guardia
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedTabs ariaLabel="Filtrar por estado" value={filterEstado} onChange={setFilterEstado} items={filtros} />
        <div className="relative w-full sm:max-w-xs">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar guardias"
            placeholder="Buscar por nombre, elemento o teléfono"
            className="h-10 pl-9 pr-9"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <RefreshCw className="h-7 w-7 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Cargando guardias...</p>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <User className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-base font-bold text-foreground">No se encontraron guardias</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {searchTerm
              ? 'Ningún guardia coincide con la búsqueda. Prueba con otro nombre o número.'
              : 'Todavía no hay guardias registrados con este filtro.'}
          </p>
          {isEditor && (
            <Button onClick={() => setIsModalOpen(true)} className="mt-5">
              <UserPlus className="h-4 w-4" /> Registrar guardia
            </Button>
          )}
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredData.map((item: any) => (
            <TarjetaPersona
              key={item.id}
              nombre={item.nombre}
              codigo={item.numero_elemento}
              codigoEtiqueta="Elemento"
              estado={item.estado}
              telefono={item.telefono}
              direccion={item.direccion}
              fechaAlta={item.fecha_alta}
              fichaTecnicaJson={item.ficha_tecnica_json}
              isEditor={isEditor}
              onPerfil={() => openPerfil(item, 'datos')}
              onFicha={() => openPerfil(item, 'ficha')}
              onEditarFicha={() => openPerfil(item, 'editFicha')}
              onDescargar={() => descargarFichaPdf(item.id, item.numero_elemento)}
              onEditar={() => startEdit(item)}
              onContextMenu={(e) => abrirMenuContextual(e, item)}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guardia</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Alta</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Ficha técnica</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((item: any) => {
                const { hasFicha, fotoUrl } = datosFicha(item);
                return (
                  <TableRow key={item.id} onContextMenu={(e) => abrirMenuContextual(e, item)}>
                    <TableCell>
                      <button type="button" onClick={() => openPerfil(item, 'datos')} className="flex items-center gap-3 text-left">
                        <Avatar name={item.nombre} src={fotoUrl} size="sm" shape="rounded" status={puntoEstado(item.estado)} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-foreground transition-colors hover:text-primary">{item.nombre}</span>
                          <span className="block text-xs text-muted-foreground">
                            {item.numero_elemento ? `Elemento ${item.numero_elemento}` : 'Sin número de elemento'}
                          </span>
                        </span>
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                        {item.telefono && <span className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {item.telefono}</span>}
                        {item.direccion && (
                          <span className="flex max-w-[220px] items-center gap-1.5" title={item.direccion}>
                            <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{item.direccion}</span>
                          </span>
                        )}
                        {!item.telefono && !item.direccion && <span className="italic text-muted-foreground/70">Sin datos de contacto</span>}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{fmtDate(item.fecha_alta)}</TableCell>
                    <TableCell><Badge variant={variantEstado(item.estado)} dot>{item.estado}</Badge></TableCell>
                    <TableCell>
                      {hasFicha ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Lista</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700"><AlertCircle className="h-3.5 w-3.5" /> Pendiente</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="soft" size="sm" onClick={() => openPerfil(item, 'datos')}>
                          <Eye className="h-3.5 w-3.5" /> Perfil
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPerfil(item, 'ficha')} title="Ficha técnica en PDF" aria-label="Ficha técnica en PDF">
                          <IdCard className="h-4 w-4 text-primary" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => descargarFichaPdf(item.id, item.numero_elemento)} title="Descargar PDF" aria-label="Descargar PDF">
                          <Download className="h-4 w-4" />
                        </Button>
                        {isEditor && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => startEdit(item)} title="Editar datos" aria-label="Editar datos">
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ================= MENÚ CONTEXTUAL (CLIC DERECHO) ================= */}
      {ctxMenu && (
        <MenuContextualGuardia
          ctx={ctxMenu}
          isAdmin={isAdmin}
          onCerrar={() => setCtxMenu(null)}
          onVerPerfil={(g) => openPerfil(g, 'datos')}
          onEditar={(g) => startEdit(g)}
          onDarBaja={(g) => { setSelectedGuardia(g); setFechaBaja(fechaMexico()); setIsBajaModalOpen(true); }}
          onEliminar={(g) => { setSelectedGuardia(g); setIsDeleteModalOpen(true); }}
        />
      )}

      {/* ================= FORMULARIO: REGISTRAR NUEVO GUARDIA ================= */}
      <FormDialog
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        size="xl"
        icon={UserPlus}
        title="Registrar nuevo guardia"
        description="Datos iniciales del elemento para habilitar su expediente, dotaciones y ficha técnica."
        submitLabel="Guardar guardia"
        submitting={createMutation.isPending}
        footerNote={<span><span className="text-destructive">*</span> Campo obligatorio</span>}
        onSubmit={() =>
          createMutation.mutate({
            numero_elemento: numeroElemento,
            nombre: nombreAlta,
            fecha_alta: fechaAlta,
            telefono,
            ...fichaExtra,
          })
        }
        aside={
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-card p-4 text-center shadow-xs">
              {nombreAlta ? (
                <Avatar name={nombreAlta} size="xl" shape="rounded" className="mx-auto" />
              ) : (
                <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <UserPlus className="h-8 w-8" />
                </span>
              )}
              <p className="mt-3 truncate text-sm font-bold text-foreground">{nombreAlta || 'Nuevo guardia'}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{numeroElemento ? `Elemento ${numeroElemento}` : 'Número por asignar'}</p>
              <p className="text-xs text-muted-foreground">Alta: {fmtDate(fechaAlta)}</p>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-xs">
              <ProgressRing value={avanceAlta} size={46} stroke={5} tone={avanceAlta === 100 ? 'success' : 'primary'}>
                <span className="text-[11px] font-bold text-foreground">{avanceAlta}%</span>
              </ProgressRing>
              <div className="min-w-0 leading-tight">
                <p className="text-[13px] font-semibold text-foreground">Datos capturados</p>
                <p className="text-xs text-muted-foreground">{capturadosAlta} de {totalCamposAlta} campos</p>
              </div>
            </div>

            <nav aria-label="Secciones del formulario" className="space-y-0.5">
              <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Secciones</p>
              {SECCIONES_ALTA.map((s, i) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => irASeccion(s.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] font-medium text-slate-600 transition-colors hover:bg-card hover:text-foreground"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-card text-[11px] font-bold text-muted-foreground ring-1 ring-border">{i + 1}</span>
                  {s.label}
                </button>
              ))}
            </nav>
          </div>
        }
      >
        <div className="space-y-6">
          <FormSection id="alta-identidad" title="Identidad" description="Nombre por partes, nacimiento, sexo y lugar de nacimiento: con ellos se calculan la CURP y el RFC." icon={User}>
            <IdentidadPersonal
              autoFocus
              value={fichaExtra}
              onChange={(cambios) => setFichaExtra((f) => ({ ...f, ...cambios }))}
            />
          </FormSection>

          <FormSection id="alta-empresa" title="Alta en la empresa" description="Lo que identifica al elemento dentro de U3." icon={Briefcase}>
            <FieldGrid cols={3}>
              <Field label="Número de elemento" hint="Se puede asignar después.">
                <Input value={numeroElemento} onChange={e => setNumeroElemento(e.target.value)} placeholder="Ej. 1024" />
              </Field>
              <Field label="Fecha de alta" required>
                <Input type="date" value={fechaAlta} onChange={e => setFechaAlta(e.target.value)} required />
              </Field>
            </FieldGrid>
          </FormSection>

          <FormSection id="alta-contacto" title="Contacto" description="Cómo localizar al elemento y a su contacto de emergencia." icon={Phone}>
            <FieldGrid cols={3}>
              <Field label="Teléfono de contacto">
                <InputGroup icon={Phone}>
                  <Input type="tel" inputMode="tel" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="5512345678" />
                </InputGroup>
              </Field>
              <Field label="Celular">
                <InputGroup icon={Phone}>
                  <Input type="tel" inputMode="tel" value={fichaExtra.celular} onChange={e => actualizarFichaExtra('celular', e.target.value)} placeholder="10 dígitos" />
                </InputGroup>
              </Field>
              <Field label="Teléfono de emergencia">
                <InputGroup icon={Phone}>
                  <Input type="tel" inputMode="tel" value={fichaExtra.telefonoEmergencia} onChange={e => actualizarFichaExtra('telefonoEmergencia', e.target.value)} placeholder="Contacto familiar" />
                </InputGroup>
              </Field>
            </FieldGrid>
          </FormSection>

          <FormSection id="alta-personales" title="Datos personales" description="Se precargan en la ficha técnica oficial." icon={IdCard}>
            <FieldGrid cols={3}>
              <Field label="Estado civil">
                <Select value={fichaExtra.estadoCivil} onChange={e => actualizarFichaExtra('estadoCivil', e.target.value)}>
                  <option value="">Seleccionar</option>
                  {OPCIONES_ESTADO_CIVIL.map(o => <option key={o} value={o}>{o}</option>)}
                </Select>
              </Field>
              <Field label="Escolaridad">
                <Select value={fichaExtra.estudios} onChange={e => actualizarFichaExtra('estudios', e.target.value)}>
                  <option value="">Seleccionar</option>
                  {OPCIONES_ESTUDIOS.map(o => <option key={o} value={o}>{o}</option>)}
                </Select>
              </Field>
              <Field label="Afiliación IMSS (NSS)" hint="11 dígitos" error={errorNss}>
                <Input inputMode="numeric" value={fichaExtra.imss} onChange={e => actualizarFichaExtra('imss', e.target.value.replace(/[^\d\s-]/g, ''))} placeholder="00000000000" className="font-mono tracking-wide" />
              </Field>
              <Field label="Estatura">
                <InputGroup suffix="m"><Input inputMode="decimal" value={fichaExtra.estatura} onChange={e => actualizarFichaExtra('estatura', e.target.value)} placeholder="1.75" /></InputGroup>
              </Field>
              <Field label="Peso aproximado">
                <InputGroup suffix="kg"><Input inputMode="decimal" value={fichaExtra.peso} onChange={e => actualizarFichaExtra('peso', e.target.value)} placeholder="78" /></InputGroup>
              </Field>
            </FieldGrid>
          </FormSection>

          <FormSection id="alta-domicilio" title="Domicilio" description="Donde vive actualmente el elemento." icon={MapPin}>
            <FieldGrid cols={3}>
              <Field label="Calle y número" span={2}>
                <Input value={fichaExtra.calleNumero} onChange={e => actualizarFichaExtra('calleNumero', e.target.value)} placeholder="Calle, no. exterior e interior" />
              </Field>
              <Field label="Código postal">
                <Input inputMode="numeric" value={fichaExtra.cp} onChange={e => actualizarFichaExtra('cp', e.target.value)} placeholder="00000" />
              </Field>
              <Field label="Colonia">
                <Input value={fichaExtra.colonia} onChange={e => actualizarFichaExtra('colonia', e.target.value)} placeholder="Colonia o fraccionamiento" />
              </Field>
              <Field label="Entre las calles" span={2}>
                <Input value={fichaExtra.entreCalles} onChange={e => actualizarFichaExtra('entreCalles', e.target.value)} placeholder="Calles aledañas" />
              </Field>
              <Field label="Alcaldía o municipio">
                <Input value={fichaExtra.delegacionMunicipio} onChange={e => actualizarFichaExtra('delegacionMunicipio', e.target.value)} placeholder="Ej. Iztapalapa" />
              </Field>
              <Field label="Estado">
                <Input value={fichaExtra.estado} onChange={e => actualizarFichaExtra('estado', e.target.value)} placeholder="Ej. Ciudad de México" />
              </Field>
              <Field label="Tiempo de residencia">
                <Input value={fichaExtra.tiempoResidencia} onChange={e => actualizarFichaExtra('tiempoResidencia', e.target.value)} placeholder="Ej. 5 años" />
              </Field>
              <Field label="Tiempo de radicar en el estado">
                <Input value={fichaExtra.tiempoRadicarEstado} onChange={e => actualizarFichaExtra('tiempoRadicarEstado', e.target.value)} placeholder="Ej. 10 años" />
              </Field>
            </FieldGrid>
          </FormSection>
        </div>
      </FormDialog>

      {/* ================= FORMULARIO: EDITAR DATOS DEL GUARDIA ================= */}
      <FormDialog
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        size="lg"
        icon={Edit}
        title="Editar datos del guardia"
        description={<>Identidad, datos operativos y de contacto de <b className="font-semibold text-foreground">{selectedGuardia?.nombre}</b>.</>}
        submitLabel="Guardar cambios"
        submitting={editMutation.isPending}
        footerNote={<span><span className="text-destructive">*</span> Campo obligatorio</span>}
        onSubmit={() => {
          if (selectedGuardia) {
            editMutation.mutate({
              id: selectedGuardia.id,
              numero_elemento: editNumeroElemento,
              nombre: unirNombreCompleto(editFichaExtra),
              fecha_alta: editFechaAlta,
              telefono: editTelefono,
              direccion: editDireccion,
              estado: editEstado,
              fichaExtra: editFichaExtra,
            });
          }
        }}
      >
        <div className="space-y-6">
          <FormSection title="Identidad" description="Con el nombre por partes, el nacimiento, el sexo y el lugar de nacimiento se calculan la CURP y el RFC." icon={User}>
            <IdentidadPersonal
              value={editFichaExtra}
              onChange={(cambios) => setEditFichaExtra((f) => ({ ...f, ...cambios }))}
            />
          </FormSection>

          <FormSection title="Identificación" icon={IdCard}>
            <FieldGrid cols={2}>
              <Field label="Número de elemento" required>
                <Input value={editNumeroElemento} onChange={e => setEditNumeroElemento(e.target.value)} required className="font-mono font-semibold" />
              </Field>
              <Field label="Fecha de alta" required>
                <Input type="date" value={editFechaAlta} onChange={e => setEditFechaAlta(e.target.value)} required />
              </Field>
            </FieldGrid>
          </FormSection>

          <FormSection title="Contacto" icon={Phone}>
            <FieldGrid cols={1}>
              <Field label="Teléfono de contacto">
                <InputGroup icon={Phone}>
                  <Input type="tel" inputMode="tel" value={editTelefono} onChange={e => setEditTelefono(e.target.value)} placeholder="5512345678" />
                </InputGroup>
              </Field>
              <Field label="Dirección de domicilio">
                <InputGroup icon={MapPin}>
                  <Input value={editDireccion} onChange={e => setEditDireccion(e.target.value)} placeholder="Calle, número, colonia, alcaldía o municipio" />
                </InputGroup>
              </Field>
            </FieldGrid>
          </FormSection>

          <FormSection title="Situación" icon={Shield}>
            <Field label="Estado operativo">
              <Select value={editEstado} onChange={e => setEditEstado(e.target.value)}>
                <option value="Activo">Activo</option>
                <option value="Baja Pendiente">Baja pendiente</option>
                <option value="En Baja">En baja</option>
              </Select>
            </Field>
          </FormSection>
        </div>
      </FormDialog>

      {/* ================= FORMULARIO: PROCESAR BAJA ================= */}
      <FormDialog
        open={isBajaModalOpen}
        onOpenChange={setIsBajaModalOpen}
        size="sm"
        tone="danger"
        icon={LogOut}
        title="Iniciar proceso de baja"
        description={<>Elemento <b className="font-semibold text-foreground">{selectedGuardia?.nombre}</b>{selectedGuardia?.numero_elemento ? ` (#${selectedGuardia.numero_elemento})` : ''}.</>}
        submitLabel="Confirmar baja"
        submittingLabel="Procesando..."
        submitting={bajaMutation.isPending}
        onSubmit={() => {
          if (selectedGuardia) bajaMutation.mutate({ id: selectedGuardia.id, fecha: fechaBaja });
        }}
      >
        <div className="space-y-4">
          <Callout tone="warning" title="Qué va a pasar">
            El guardia cambiará a estado <b>Baja Pendiente</b> para permitir la devolución del equipo y uniformes en posesión en el módulo de Bajas. Si no tiene equipo asignado, la baja se completa de inmediato.
          </Callout>
          <Field label="Fecha efectiva de baja" required>
            <Input type="date" value={fechaBaja} onChange={e => setFechaBaja(e.target.value)} required />
          </Field>
        </div>
      </FormDialog>

      {/* ================= CONFIRMAR: ELIMINAR GUARDIA PERMANENTEMENTE ================= */}
      <ConfirmDialog
        open={isDeleteModalOpen}
        onOpenChange={setIsDeleteModalOpen}
        title="Eliminar guardia permanentemente"
        description={<>Elemento <b className="font-semibold text-foreground">{selectedGuardia?.nombre}</b>{selectedGuardia?.numero_elemento ? ` (#${selectedGuardia.numero_elemento})` : ''}.</>}
        confirmLabel="Eliminar permanentemente"
        confirmingLabel="Eliminando..."
        confirming={deleteMutation.isPending}
        onConfirm={() => selectedGuardia && deleteMutation.mutate(selectedGuardia.id)}
      >
        <Callout tone="danger" title="Esta acción no se puede deshacer">
          <p>Se borrará el perfil, expediente, documentos, bitácora y fichas técnicas del guardia.</p>
          <p>El historial de uniformes, movimientos financieros, incidencias en el calendario y reclutamiento asociado se conserva, pero quedará sin vincular a este guardia.</p>
          <p>Si solo necesitas desactivarlo conservando su historial, usa <b>Dar de baja</b> en lugar de esto.</p>
        </Callout>
      </ConfirmDialog>
    </div>
  );
}
