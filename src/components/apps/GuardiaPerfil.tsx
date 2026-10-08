'use client';
import { fechaMexico } from '@/src/lib/fecha';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { Select } from '@/src/components/ui/select';
import { SegmentedTabs } from '@/src/components/ui/tabs';
import { ProgressRing } from '@/src/components/ui/progress-ring';
import { InfoGrid, InfoItem } from '@/src/components/ui/info-grid';
import { iniciales } from '@/src/components/ui/avatar';
import { Field, FieldGrid, FormSection, InputGroup, Callout } from '@/src/components/ui/field';
import { FormDialog, ConfirmDialog } from '@/src/components/ui/form-dialog';
import {
  TarjetaPerfil, TituloTarjeta, PildoraCifra, FilaIndicador, MiniCalendario, LineaTiempo,
  RosterGuardias, CasillaDocumento, TarjetaDocumento, useAnchoMinimo, type EventoLinea,
} from './guardia/PerfilWidgets';
import {
  ArrowLeft,
  Phone,
  MapPin,
  FileText,
  Upload,
  IdCard,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Shield,
  User,
  ExternalLink,
  RefreshCw,
  Briefcase,
  Printer,
  Download,
  Trash2,
  Eye,
  MessageCircle,
  Building2,
  ShieldCheck,
  UserCheck,
  StickyNote,
  History,
  Camera,
  Plus,
  Edit2,
  FileCheck,
  Check,
  Clock,
  Pencil,
  ChevronRight,
  Shirt,
  FolderOpen,
  Activity,
  CloudUpload
} from 'lucide-react';
import { fmtDate } from '@/src/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';
import DocumentViewerModal from '@/src/components/DocumentViewerModal';
import MachoteFichaTecnica from '@/src/components/machotes/MachoteFichaTecnica';
import { IdentidadPersonal } from '@/src/components/forms/IdentidadPersonal';
import { FICHA_EXTRA_VACIA, extraerFichaExtra, type FichaExtraValores } from './administrativos/FichaExtraEditor';
import { unirNombreCompleto } from '@/src/lib/rfcCurp';

interface Props {
  id: number;
  onVolver?: () => void;
  initialEditFicha?: boolean;
  initialTab?: string;
}

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
  <style>@page{size:letter portrait;margin:10mm 14mm}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:0;background:#fff}
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

/**
 * Añade la unidad a un valor de la ficha técnica sin duplicarla: como el
 * campo es texto libre, alguien puede haber capturado "1.82 m" o "84.5 kg"
 * directamente ahí, así que primero se quita cualquier unidad que ya traiga
 * el valor (en cualquier variante) antes de anexar la canónica.
 */
function conUnidad(valor: string | undefined | null, patronUnidad: RegExp, unidad: string): string {
  if (!valor) return '—';
  const limpio = valor.replace(patronUnidad, '').trim();
  return limpio ? `${limpio} ${unidad}` : '—';
}

export default function GuardiaPerfil({ id, onVolver, initialEditFicha, initialTab }: Props) {
  const router = useRouter();
  const { user, isEditor } = useAuth();
  const queryClient = useQueryClient();

  // Estados de Modales y Visualizadores
  const [modalEditar, setModalEditar] = useState(false);
  const [modalSubirPapel, setModalSubirPapel] = useState(false);
  // Confirmación de borrado con un diálogo propio en vez de window.confirm():
  // los navegadores (y sobre todo la app instalada como PWA) pueden bloquear
  // los cuadros nativos sin avisar tras usarlos varias veces en la misma
  // pestaña, y entonces el clic en "Eliminar" no hacía absolutamente nada.
  const [confirmarEliminar, setConfirmarEliminar] = useState<
    | { tipo: 'ficha' }
    | { tipo: 'documento'; doc: any }
    | null
  >(null);
  const [editingFicha, setEditingFicha] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<{ title: string; url: string; downloadName: string } | null>(null);
  const [pdfVersion, setPdfVersion] = useState(Date.now());
  const [tab, setTab] = useState<'expediente' | 'uniformes' | 'actividad'>('expediente');
  // La lista lateral de personal hace su propia consulta: solo se monta si hay ancho para mostrarla.
  const hayEspacioParaLista = useAnchoMinimo(1700);

  // Formulario Editar Datos Generales
  const [editFichaExtra, setEditFichaExtra] = useState<FichaExtraValores>(FICHA_EXTRA_VACIA);
  const [editNumeroElemento, setEditNumeroElemento] = useState('');
  const [editFechaAlta, setEditFechaAlta] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [editEstado, setEditEstado] = useState('Activo');

  // Formulario Subir Papeles
  const [tipoPapel, setTipoPapel] = useState('');
  const [archivoPapel, setArchivoPapel] = useState<File | null>(null);

  // Formulario Bitácora
  const [tipoBitacora, setTipoBitacora] = useState<'nota' | 'llamada' | 'incidencia'>('nota');
  const [mensajeBitacora, setMensajeBitacora] = useState('');

  // Queries
  const { data: guardia, isLoading: isLoadingGuardia } = useQuery({
    queryKey: ['guardia', id],
    queryFn: () => apiFetch<any>(`/api/guardias/${id}/ficha`).then(res => res.guardia || res),
  });

  const { data: expedienteRes, isLoading: isLoadingExpediente } = useQuery({
    queryKey: ['expediente', id],
    queryFn: () => apiFetch<{ salidas: any[], entradas: any[] }>(`/api/guardias/${id}/expediente`),
  });

  const { data: documentos = [], isLoading: isLoadingDocumentos } = useQuery({
    queryKey: ['guardia-documentos', id],
    queryFn: () => apiFetch<any[]>(`/api/guardias/${id}/documentos`),
  });

  const { data: bitacora = [] } = useQuery({
    queryKey: ['guardia-bitacora', id],
    queryFn: () => apiFetch<any[]>(`/api/guardias/${id}/bitacora`),
  });

  // Token para visor PDF
  const authToken = typeof window !== 'undefined' ? localStorage.getItem('inv_token') : '';

  // Parse Ficha Técnica JSON
  const fichaData = useMemo(() => {
    if (!guardia?.ficha_tecnica_json) return null;
    try {
      return JSON.parse(guardia.ficha_tecnica_json);
    } catch {
      return null;
    }
  }, [guardia?.ficha_tecnica_json]);

  // Saldo de Uniformes en Posesión
  const salidas = (expedienteRes?.salidas || []).filter((s: any) => !s.anulado);
  const entradas = (expedienteRes?.entradas || []).filter((e: any) => !e.anulado);

  const enPosesion = useMemo(() => {
    return salidas.filter((s: any) => s.estado_asignacion === 'Uniforme en Campo');
  }, [salidas]);

  const saldoMap = useMemo(() => {
    const map: Record<string, { cantidad: number; talla?: string; fecha: string; estado_fisico?: string }> = {};
    enPosesion.forEach((s: any) => {
      const key = `${s.articulo}${s.talla ? ` (Talla: ${s.talla})` : ''}`;
      if (!map[key]) {
        map[key] = { cantidad: s.cantidad, talla: s.talla, fecha: s.fecha, estado_fisico: s.estado_fisico };
      } else {
        map[key].cantidad += s.cantidad;
      }
    });
    return map;
  }, [enPosesion]);

  const totalEnPosesion = useMemo(() => {
    return Object.values(saldoMap).reduce((a, b) => a + b.cantidad, 0);
  }, [saldoMap]);

  const totalDotaciones = salidas.filter((s: any) => s.concepto === 'Uniforme en Campo' || s.concepto === 'Asignación').reduce((a: number, s: any) => a + s.cantidad, 0);
  const totalReposiciones = salidas.filter((s: any) => s.concepto === 'Reposición').reduce((a: number, s: any) => a + s.cantidad, 0);
  const totalPerdidas = salidas.filter((s: any) => s.estado_asignacion === 'Extraviado' || s.concepto === 'Extravío').reduce((a: number, s: any) => a + s.cantidad, 0);

  // Mutations
  const editMutation = useMutation({
    mutationFn: (payload: any) => apiFetch(`/api/guardias/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardia', id] });
      queryClient.invalidateQueries({ queryKey: ['guardias'] });
      toast.success('Datos actualizados');
      setModalEditar(false);
    },
    onError: (err: any) => toast.error(err.message || 'Error al actualizar'),
  });

  const uploadDocMutation = useMutation({
    mutationFn: (formData: FormData) =>
      apiFetch(`/api/guardias/${id}/documentos`, {
        method: 'POST',
        body: formData,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardia-documentos', id] });
      queryClient.invalidateQueries({ queryKey: ['guardia', id] });
      toast.success('Documento guardado en expediente');
      setModalSubirPapel(false);
      setTipoPapel('');
      setArchivoPapel(null);
    },
    onError: (err: any) => toast.error(err.message || 'Error al subir documento'),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: number) => apiFetch(`/api/guardias/${id}/documentos/${docId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardia-documentos', id] });
      toast.success('Documento eliminado');
      setConfirmarEliminar(null);
    },
    onError: (err: any) => toast.error(err.message || 'Error al eliminar documento'),
  });

  // Elimina por completo los datos de la ficha técnica (no solo el PDF
  // cacheado en la lista de papeles, que es lo único que borraba antes).
  const deleteFichaMutation = useMutation({
    mutationFn: () => apiFetch(`/api/guardias/${id}/ficha`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardia', id] });
      queryClient.invalidateQueries({ queryKey: ['guardia-documentos', id] });
      toast.success('Ficha técnica eliminada');
      setConfirmarEliminar(null);
    },
    onError: (err: any) => toast.error(err.message || 'Error al eliminar la ficha técnica'),
  });

  const addBitacoraMutation = useMutation({
    mutationFn: (payload: { tipo: string; mensaje: string }) =>
      apiFetch(`/api/guardias/${id}/bitacora`, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardia-bitacora', id] });
      toast.success('Entrada guardada en bitácora');
      setMensajeBitacora('');
    },
    onError: (err: any) => toast.error(err.message || 'Error al agregar nota'),
  });

  // Helpers
  const abrirEditar = () => {
    if (!guardia) return;
    setEditFichaExtra(extraerFichaExtra(guardia.ficha_tecnica_json, guardia.nombre || ''));
    setEditNumeroElemento(guardia.numero_elemento || '');
    setEditFechaAlta(guardia.fecha_alta ? guardia.fecha_alta.split('T')[0] : '');
    setEditTelefono(guardia.telefono || '');
    setEditDireccion(guardia.direccion || '');
    setEditEstado(guardia.estado || 'Activo');
    setModalEditar(true);
  };

  const handleVolver = () => {
    if (onVolver) {
      onVolver();
    } else {
      router.push('/guardias');
    }
  };

  // Sincronización de parámetros de URL al montar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('editFicha') === '1' || initialEditFicha) {
        router.push(`/guardias/${id}/ficha`);
      } else if (params.get('tab') === 'ficha' || initialTab === 'ficha') {
        abrirVisorFichaPdf();
      }
    }
  }, [initialEditFicha, initialTab, id, router]);

  // Soporte para botón "Atrás" del navegador / mouse cuando hay visor o editor abierto
  useEffect(() => {
    const handlePopState = () => {
      if (editingFicha) {
        setEditingFicha(false);
      }
      if (viewerDoc) {
        setViewerDoc(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [editingFicha, viewerDoc]);

  // Abrir Editor de Ficha Técnica con la nueva interfaz de expediente
  const abrirEditorFicha = () => {
    router.push(`/guardias/${guardia?.id || id}/ficha`);
  };

  const cerrarEditorFicha = () => {
    setEditingFicha(false);
  };

  // Abrir Ficha Técnica en el Visualizador PDF
  const abrirVisorFichaPdf = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'visor' }, '', `${window.location.pathname}#visor-pdf`);
    }
    const url = `/api/guardias/${id}/ficha-pdf?inline=true${authToken ? `&token=${authToken}` : ''}&v=${pdfVersion}`;
    setViewerDoc({
      title: `Ficha Técnica Oficial — ${guardia?.nombre} (${guardia?.numero_elemento})`,
      url,
      downloadName: `ficha_tecnica_${guardia?.numero_elemento}.pdf`,
    });
  };

  // Abrir el Contrato Laboral en el Visualizador PDF (mismo mecanismo que la
  // ficha técnica: el contrato vive como JSON en el expediente, así que el
  // PDF real se genera al vuelo en /api/guardias/[id]/contrato-pdf).
  const abrirVisorContrato = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'visor' }, '', `${window.location.pathname}#visor-contrato`);
    }
    const url = `/api/guardias/${id}/contrato-pdf?inline=true${authToken ? `&token=${authToken}` : ''}`;
    setViewerDoc({
      title: `Contrato de Trabajo — ${guardia?.nombre} (${guardia?.numero_elemento})`,
      url,
      downloadName: `contrato_${guardia?.numero_elemento || guardia?.nombre}.pdf`,
    });
  };

  // Abrir Documento en el Visualizador PDF
  const abrirVisorDocumento = (doc: any) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'visor' }, '', `${window.location.pathname}#visor-doc`);
    }
    const url = `/api/guardias/${id}/documentos/${doc.id}${authToken ? `?token=${authToken}` : ''}`;
    setViewerDoc({
      title: `${doc.nombre_documento} — ${guardia?.nombre}`,
      url,
      downloadName: doc.nombre_archivo,
    });
  };

  const cerrarVisorDoc = () => {
    if (typeof window !== 'undefined' && (window.location.hash === '#visor-pdf' || window.location.hash === '#visor-doc' || window.location.hash === '#visor-contrato')) {
      window.history.back();
    }
    setViewerDoc(null);
  };

  const descargarFichaDirecta = () => {
    const link = document.createElement('a');
    link.href = `/api/guardias/${id}/ficha-pdf?download=true${authToken ? `&token=${authToken}` : ''}`;
    link.download = `ficha_${guardia?.numero_elemento}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoadingGuardia) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm font-medium text-muted-foreground">Cargando perfil del guardia...</p>
      </div>
    );
  }

  if (!guardia) {
    return (
      <div className="p-8 text-center bg-card rounded-2xl border border-border space-y-4">
        <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
        <h2 className="text-lg font-bold">Guardia no encontrado</h2>
        <Button onClick={handleVolver} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver a la lista
        </Button>
      </div>
    );
  }

  const isActivo = guardia.estado === 'Activo';
  const isBajaPendiente = guardia.estado === 'Baja Pendiente';
  const fotoUrl = fichaData?.fotoUrl || null;
  const waUrl = guardia.telefono ? `https://wa.me/52${guardia.telefono.replace(/\D/g, '')}` : null;
  const mapsUrl = guardia.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(guardia.direccion)}` : null;
  const puesto = fichaData?.puesto || 'Guardia de seguridad privada';

  // Expediente: cuatro papeles clave mas la ficha tecnica.
  const DOCS_CLAVE = ['Contrato de Trabajo', 'Identificación Oficial (INE)', 'Comprobante de Domicilio', 'CURP'];
  const docSubido = (tipo: string) =>
    documentos.some((d: any) => d.nombre_documento.toLowerCase().includes(tipo.toLowerCase().slice(0, 8)));
  const docsListos = DOCS_CLAVE.filter(docSubido).length;
  const fichaLista = !!guardia.ficha_tecnica_json;
  const pctExpediente = Math.round(((docsListos + (fichaLista ? 1 : 0)) / (DOCS_CLAVE.length + 1)) * 100);

  // Historial unificado del expediente (alta, papeles, uniformes y bitacora).
  const eventos: EventoLinea[] = [
    { id: 'alta', fecha: guardia.fecha_alta, tipo: 'alta' as const, titulo: 'Alta en el sistema', detalle: `Elemento ${guardia.numero_elemento || 'sin número asignado'}` },
    ...documentos.map((d: any): EventoLinea => ({ id: `doc-${d.id}`, fecha: d.fecha_subida, tipo: 'documento', titulo: d.nombre_documento, detalle: 'Documento agregado al expediente' })),
    ...salidas.map((s: any, i: number): EventoLinea => {
      const extravio = s.estado_asignacion === 'Extraviado' || s.concepto === 'Extravío';
      const reposicion = s.concepto === 'Reposición';
      return {
        id: `sal-${s.id ?? i}`,
        fecha: s.fecha,
        tipo: extravio ? 'extravio' : reposicion ? 'reposicion' : 'entrega',
        titulo: `${s.cantidad}× ${s.articulo}${s.talla ? ` (${s.talla})` : ''}`,
        detalle: extravio ? 'Extravío de equipo' : reposicion ? 'Reposición de equipo' : 'Entrega de equipo',
      };
    }),
    ...entradas.map((e: any, i: number): EventoLinea => ({
      id: `ent-${e.id ?? i}`,
      fecha: e.fecha,
      tipo: 'devolucion',
      titulo: `${e.cantidad}× ${e.articulo}${e.talla ? ` (${e.talla})` : ''}`,
      detalle: e.motivo || 'Devolución de equipo',
    })),
    ...bitacora.map((b: any): EventoLinea => ({
      id: `bit-${b.id}`,
      fecha: b.created_at,
      tipo: b.tipo === 'llamada' ? 'llamada' : 'nota',
      titulo: b.mensaje,
      detalle: b.usuario ? `Por ${b.usuario}` : undefined,
    })),
  ].filter((ev) => !!ev.fecha);

  const actividadPorDia: Record<string, number> = {};
  eventos.filter((ev) => ev.tipo !== 'alta').forEach((ev) => {
    const dia = String(ev.fecha).slice(0, 10);
    actividadPorDia[dia] = (actividadPorDia[dia] || 0) + 1;
  });
  const diaAlta = guardia.fecha_alta ? String(guardia.fecha_alta).slice(0, 10) : null;

  const puntoEstado = isActivo ? 'bg-emerald-300' : isBajaPendiente ? 'bg-amber-300' : 'bg-slate-300';
  const botonLienzo = 'h-10 rounded-full border-transparent bg-card px-4 shadow-soft hover:bg-white';

  return (
    <>
    <div className="rounded-[28px] bg-canvas p-3 sm:p-5 lg:p-6">
      {/* ----- Barra superior del lienzo: volver, titulo y acciones ----- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <button
            type="button"
            onClick={handleVolver}
            aria-label="Volver a la lista de guardias"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-soft transition-colors hover:bg-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <nav aria-label="Ruta de navegación" className="flex items-center gap-1 text-xs text-slate-500">
              <Link href="/guardias" className="transition-colors hover:text-foreground">Guardias</Link>
              <ChevronRight aria-hidden className="h-3 w-3 text-slate-400" />
              <span className="truncate font-semibold text-foreground/80">{guardia.nombre}</span>
            </nav>
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-[28px]">Perfil del guardia</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isEditor && (
            <Button variant="outline" className={botonLienzo} onClick={abrirEditar}>
              <Edit2 className="h-3.5 w-3.5" /> Editar datos
            </Button>
          )}
          <Button variant="outline" className={botonLienzo} onClick={() => router.push(`/guardias/${guardia.id}/contrato`)} title="Abrir y editar el contrato laboral en hojas oficiales">
            <FileCheck className="h-3.5 w-3.5 text-amber-600" /> Contrato laboral
          </Button>
          <Button variant="dark" className="h-10 rounded-full px-4" onClick={() => router.push(`/guardias/${guardia.id}/ficha`)} title="Abrir y editar la ficha técnica oficial">
            <IdCard className="h-3.5 w-3.5" /> Ficha técnica
          </Button>
        </div>
      </div>

      <div className="mt-5 flex gap-5">
        {hayEspacioParaLista && (
          <RosterGuardias actualId={guardia.id} className="flex max-h-[calc(100svh-13rem)] w-[250px] shrink-0 self-start" />
        )}

        <div className="grid min-w-0 flex-1 grid-cols-1 items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          {/* ===================== COLUMNA IZQUIERDA ===================== */}
          <div className="grid content-start gap-5 md:grid-cols-2 xl:grid-cols-1">
            {/* Tarjeta de identidad */}
            <section className="relative overflow-hidden rounded-[28px] bg-primary p-5 text-white shadow-soft md:col-span-2 xl:col-span-1">
              <img src="/logo_b.png" alt="" aria-hidden className="pointer-events-none absolute -right-10 -top-8 h-56 w-56 object-contain opacity-[0.08] brightness-0 invert" />
              <div className="relative flex items-start gap-4">
                <div className="relative shrink-0">
                  {fotoUrl ? (
                    <img src={fotoUrl} alt={guardia.nombre} className="h-[132px] w-[104px] rounded-[20px] object-cover ring-2 ring-white/30" />
                  ) : (
                    <div className="flex h-[132px] w-[104px] items-center justify-center rounded-[20px] bg-white/15 text-3xl font-bold tracking-wide ring-2 ring-white/20">
                      {iniciales(guardia.nombre)}
                    </div>
                  )}
                  {isEditor && (
                    <button
                      type="button"
                      onClick={abrirEditorFicha}
                      className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-primary shadow-md transition-transform hover:scale-105"
                      title="Cambiar o subir fotografía en la ficha técnica"
                      aria-label="Cambiar fotografía"
                    >
                      <Camera className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Elemento operativo</p>
                  <h2 className="mt-1 break-words text-[21px] font-bold leading-tight tracking-tight">{guardia.nombre}</h2>
                  <p className="mt-1 text-sm text-white/80">{puesto}</p>
                </div>
              </div>
              <div className="relative mt-5 flex items-end justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex h-7 items-center rounded-full bg-white/15 px-2.5 text-[11px] font-semibold">
                    {guardia.numero_elemento ? `No. ${guardia.numero_elemento}` : 'Sin número'}
                  </span>
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/15 px-2.5 text-[11px] font-semibold">
                    <Calendar className="h-3.5 w-3.5" /> Alta {fmtDate(guardia.fecha_alta)}
                  </span>
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/15 px-2.5 text-[11px] font-semibold">
                    <span className={`h-2 w-2 rounded-full ${puntoEstado}`} /> {guardia.estado}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <ProgressRing value={pctExpediente} size={48} stroke={4} tone="light" trackClassName="stroke-white/25">
                    <span className="text-[11px] font-bold">{pctExpediente}%</span>
                  </ProgressRing>
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-white/70">Expediente</span>
                </div>
              </div>
            </section>

            {/* Indicadores */}
            <TarjetaPerfil className="space-y-2 p-3">
              <FilaIndicador label="Uniformes" hint="En posesión · dotadas">
                <PildoraCifra icon={Shirt}>{totalEnPosesion}</PildoraCifra>
                <PildoraCifra tone="light" icon={Check}>{totalDotaciones}</PildoraCifra>
              </FilaIndicador>
              <FilaIndicador label="Reposiciones" hint="Repuestas · pérdidas">
                <PildoraCifra tone="light">{totalReposiciones}</PildoraCifra>
                <PildoraCifra tone={totalPerdidas > 0 ? 'danger' : 'light'} icon={totalPerdidas > 0 ? AlertCircle : undefined}>{totalPerdidas}</PildoraCifra>
              </FilaIndicador>
              <FilaIndicador label="Expediente" hint="Papeles clave · ficha">
                <PildoraCifra>{docsListos}/{DOCS_CLAVE.length}</PildoraCifra>
                <PildoraCifra tone={fichaLista ? 'success' : 'warning'} icon={fichaLista ? Check : AlertCircle}>{fichaLista ? 'Ficha' : 'Pendiente'}</PildoraCifra>
              </FilaIndicador>
            </TarjetaPerfil>

            {/* Calendario de actividad */}
            <TarjetaPerfil className="p-5">
              <MiniCalendario actividad={actividadPorDia} alta={diaAlta} />
            </TarjetaPerfil>
          </div>

          {/* ===================== COLUMNA DERECHA ===================== */}
          <div className="min-w-0 space-y-5">
            {/* Datos del elemento */}
            <TarjetaPerfil className="p-5 sm:p-6">
              <TituloTarjeta
                icon={UserCheck}
                title="Datos del elemento"
                subtitle="Contacto y filiación oficial"
                action={
                  isEditor ? (
                    <Button variant="soft" size="sm" className="rounded-full" onClick={abrirEditorFicha}>
                      <Edit3 className="h-3.5 w-3.5" /> {fichaData ? 'Editar ficha' : 'Completar ficha'}
                    </Button>
                  ) : undefined
                }
              />

              <div className="mt-4 flex flex-wrap gap-2">
                {waUrl && (
                  <a href={waUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15 transition-colors hover:bg-emerald-100">
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                )}
                {guardia.telefono && (
                  <a href={`tel:${guardia.telefono}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-muted px-3.5 text-xs font-semibold text-foreground transition-colors hover:bg-slate-200">
                    <Phone className="h-3.5 w-3.5" /> Llamar
                  </a>
                )}
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-muted px-3.5 text-xs font-semibold text-foreground transition-colors hover:bg-slate-200">
                    <MapPin className="h-3.5 w-3.5" /> Ver domicilio <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </a>
                )}
                {!guardia.telefono && isEditor && (
                  <button type="button" onClick={abrirEditar} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold text-primary ring-1 ring-inset ring-primary/25 transition-colors hover:bg-primary/5">
                    <Plus className="h-3.5 w-3.5" /> Agregar teléfono
                  </button>
                )}
              </div>

              <InfoGrid cols={3} className="mt-5">
                <InfoItem label="Teléfono">{guardia.telefono}</InfoItem>
                <InfoItem label="Domicilio" span>{guardia.direccion}</InfoItem>
                {fichaData && (
                  <>
                    <InfoItem label="CURP" mono>{fichaData.curp}</InfoItem>
                    <InfoItem label="RFC" mono>{fichaData.rfc}</InfoItem>
                    <InfoItem label="NSS / IMSS" mono>{fichaData.imss}</InfoItem>
                    <InfoItem label="Edad">{fichaData.edad ? conUnidad(fichaData.edad, /\s*años?\.?\s*$/i, 'años') : undefined}</InfoItem>
                    <InfoItem label="Fecha de nacimiento">{fichaData.fechaNacimiento}</InfoItem>
                    <InfoItem label="Lugar de nacimiento">{fichaData.entidadNacimiento}</InfoItem>
                    <InfoItem label="Sexo">{fichaData.sexo}</InfoItem>
                    <InfoItem label="Escolaridad">{fichaData.estudios}</InfoItem>
                    <InfoItem label="Estatura">{fichaData.estatura ? conUnidad(fichaData.estatura, /\s*m(?:ts?|etros?)?\.?\s*$/i, 'm') : undefined}</InfoItem>
                    <InfoItem label="Peso">{fichaData.peso ? conUnidad(fichaData.peso, /\s*k(?:g|ilos?)\.?\s*$/i, 'kg') : undefined}</InfoItem>
                  </>
                )}
              </InfoGrid>

              {!fichaData && (
                <Callout tone="warning" className="mt-5" title="Falta la filiación oficial">
                  Aún no se capturan CURP, RFC, IMSS ni medidas. Captúralos en «Editar datos»: con la fecha de nacimiento, el sexo y el lugar de nacimiento la CURP y el RFC se calculan solos. También se pueden registrar en la ficha técnica.
                </Callout>
              )}
            </TarjetaPerfil>

            {/* Expediente, uniformes y actividad */}
            <TarjetaPerfil className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SegmentedTabs
                  ariaLabel="Secciones del perfil"
                  value={tab}
                  onChange={setTab}
                  items={[
                    { value: 'expediente', label: 'Expediente', icon: FolderOpen, count: documentos.length },
                    { value: 'uniformes', label: 'Uniformes y equipo', icon: Shirt, count: totalEnPosesion },
                    { value: 'actividad', label: 'Actividad', icon: Activity, count: Math.max(eventos.length - 1, 0) },
                  ]}
                />
                {tab === 'expediente' && isEditor && (
                  <Button variant="dark" size="sm" className="h-9 rounded-full px-4" onClick={() => setModalSubirPapel(true)}>
                    <Upload className="h-3.5 w-3.5" /> Subir papel
                  </Button>
                )}
                {tab === 'uniformes' && (
                  <Button variant="outline" size="sm" className="h-9 rounded-full px-4" onClick={() => imprimirExpediente(guardia, salidas, entradas)} disabled={isLoadingExpediente}>
                    <Printer className="h-3.5 w-3.5" /> Imprimir acta
                  </Button>
                )}
              </div>

              {tab === 'expediente' && (
                <div className="mt-5 space-y-6">
                  {/* Ficha tecnica oficial */}
                  <div className="flex flex-col gap-3 rounded-2xl bg-muted/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <button type="button" onClick={abrirVisorFichaPdf} title="Abrir el visor de la ficha técnica" className="flex min-w-0 items-center gap-3 text-left">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white"><IdCard className="h-5 w-5" /></span>
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-[13px] font-bold text-foreground">Ficha técnica oficial</span>
                        <span className="block truncate text-xs text-muted-foreground">Ficha_Tecnica_{guardia.numero_elemento || guardia.id}.pdf</span>
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={fichaLista ? 'success' : 'warning'} dot>{fichaLista ? 'Guardada' : 'Pendiente'}</Badge>
                      <Button size="sm" variant="dark" className="h-8 rounded-full px-3.5" onClick={abrirVisorFichaPdf}>
                        <Eye className="h-3.5 w-3.5" /> Abrir
                      </Button>
                      <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" onClick={descargarFichaDirecta} title="Descargar PDF" aria-label="Descargar ficha técnica">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      {isEditor && (
                        <Button size="icon" variant="outline" className="h-8 w-8 rounded-full" onClick={() => router.push(`/guardias/${guardia.id}/ficha`)} title="Editar la ficha y regenerar el PDF" aria-label="Editar ficha técnica">
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {isEditor && fichaLista && (
                        <Button size="icon" variant="outline" className="h-8 w-8 rounded-full text-destructive hover:bg-red-50 hover:text-destructive" onClick={() => setConfirmarEliminar({ tipo: 'ficha' })} title="Eliminar por completo la ficha técnica" aria-label="Eliminar ficha técnica">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Papeles clave */}
                  <div>
                    <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Papeles clave</h3>
                    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                      {DOCS_CLAVE.map((tipo) => (
                        <CasillaDocumento
                          key={tipo}
                          label={tipo}
                          listo={docSubido(tipo)}
                          onClick={tipo === 'Contrato de Trabajo' ? () => router.push(`/guardias/${guardia.id}/contrato`) : undefined}
                          title={tipo === 'Contrato de Trabajo' ? 'Ver o editar el contrato laboral oficial' : undefined}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Papeles digitalizados */}
                  <div>
                    <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Papeles digitalizados ({documentos.length})</h3>
                    {isLoadingDocumentos ? (
                      <p className="animate-pulse py-6 text-center text-xs text-muted-foreground">Cargando papeles escaneados...</p>
                    ) : documentos.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border py-9 text-center">
                        <FileText className="mx-auto h-7 w-7 text-muted-foreground/60" />
                        <p className="mt-2 text-sm font-semibold text-foreground">Aún no hay papeles digitalizados</p>
                        <p className="mx-auto mt-0.5 max-w-xs text-xs text-muted-foreground">Sube el contrato firmado, la credencial del INE o los comprobantes de este guardia.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                        {documentos.map((doc: any) => {
                          const isFicha = doc.nombre_documento?.toLowerCase().includes('ficha') || doc.nombre_archivo?.toLowerCase().includes('ficha');
                          const isContrato = doc.nombre_documento?.toLowerCase().includes('contrato') || doc.nombre_archivo?.toLowerCase().includes('contrato');
                          const abrir = () => (isContrato ? abrirVisorContrato() : abrirVisorDocumento(doc));
                          return (
                            <TarjetaDocumento
                              key={doc.id}
                              nombre={doc.nombre_documento}
                              fecha={doc.fecha_subida}
                              tono={isContrato ? 'warning' : 'primary'}
                              onAbrir={abrir}
                              acciones={
                                <>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-primary hover:bg-primary/10" onClick={abrir} title="Abrir en el visor" aria-label="Abrir en el visor">
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                  {isContrato && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-amber-700 hover:bg-amber-100" onClick={() => router.push(`/guardias/${guardia.id}/contrato`)} title="Editar el contrato laboral en hojas oficiales" aria-label="Editar contrato laboral">
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {isFicha && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-amber-700 hover:bg-amber-100" onClick={abrirEditorFicha} title="Editar ficha técnica" aria-label="Editar ficha técnica">
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {isEditor && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-destructive hover:bg-red-50 hover:text-destructive" onClick={() => setConfirmarEliminar({ tipo: 'documento', doc })} title="Eliminar papel" aria-label="Eliminar papel">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </>
                              }
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === 'uniformes' && (
                <div className="mt-5 space-y-6">
                  <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                    {[
                      { label: 'Dotadas', valor: totalDotaciones, punto: 'bg-primary' },
                      { label: 'Repuestas', valor: totalReposiciones, punto: 'bg-sky-500' },
                      { label: 'Pérdidas', valor: totalPerdidas, punto: 'bg-red-500' },
                      { label: 'En posesión', valor: totalEnPosesion, punto: 'bg-emerald-500' },
                    ].map((t) => (
                      <div key={t.label} className="rounded-2xl bg-muted/70 p-3.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <span className={`h-2 w-2 rounded-full ${t.punto}`} /> {t.label}
                        </div>
                        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">{t.valor}</p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Equipo en posesión</h3>
                    {Object.keys(saldoMap).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border py-9 text-center">
                        <Shirt className="mx-auto h-7 w-7 text-muted-foreground/60" />
                        <p className="mt-2 text-sm font-semibold text-foreground">Sin equipo en posesión</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">El guardia no tiene prendas ni accesorios asignados actualmente.</p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl bg-muted/70">
                        {Object.entries(saldoMap).map(([articulo, info]) => (
                          <li key={articulo} className="flex items-center justify-between gap-3 px-4 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-xs">
                                <Shirt className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 leading-tight">
                                <p className="truncate text-[13px] font-semibold text-foreground">{articulo}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  Estado: {info.estado_fisico || 'Operativo'}{info.fecha ? ` · Entregado ${fmtDate(String(info.fecha).slice(0, 10))}` : ''}
                                </p>
                              </div>
                            </div>
                            <PildoraCifra>{info.cantidad} pza{info.cantidad === 1 ? '' : 's'}</PildoraCifra>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {tab === 'actividad' && (
                <div className="mt-5 space-y-5">
                  {isEditor && (
                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        if (!mensajeBitacora.trim()) return;
                        addBitacoraMutation.mutate({ tipo: tipoBitacora, mensaje: mensajeBitacora });
                      }}
                      className="rounded-2xl bg-muted/70 p-3"
                    >
                      <label htmlFor="bitacora-mensaje" className="sr-only">Nueva anotación en la bitácora</label>
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                        <Input
                          id="bitacora-mensaje"
                          value={mensajeBitacora}
                          onChange={e => setMensajeBitacora(e.target.value)}
                          placeholder="Anotar resultado de llamada, pase de lista o nota interna..."
                          className="h-10 flex-1 rounded-xl"
                        />
                        <div className="flex items-center gap-2">
                          <SegmentedTabs
                            ariaLabel="Tipo de anotación"
                            value={tipoBitacora}
                            onChange={setTipoBitacora}
                            className="bg-card"
                            items={[
                              { value: 'llamada', label: 'Llamada', icon: Phone },
                              { value: 'nota', label: 'Nota', icon: StickyNote },
                            ]}
                          />
                          <Button type="submit" disabled={addBitacoraMutation.isPending || !mensajeBitacora.trim()} className="h-10 rounded-xl px-5">
                            Guardar
                          </Button>
                        </div>
                      </div>
                    </form>
                  )}
                  <LineaTiempo eventos={eventos} />
                </div>
              )}
            </TarjetaPerfil>
          </div>
        </div>
      </div>
    </div>

      {/* ================= VISOR PDF ================= */}
      {viewerDoc && (
        <DocumentViewerModal
          title={viewerDoc.title}
          url={viewerDoc.url}
          downloadName={viewerDoc.downloadName}
          onClose={cerrarVisorDoc}
        />
      )}

      {/* ================= EDITOR FICHA TÉCNICA EN PANTALLA COMPLETA ================= */}
      {editingFicha && (
        <MachoteFichaTecnica
          initialGuardiaId={guardia.id}
          fullScreen={true}
          embedded={true}
          onClose={cerrarEditorFicha}
          onVolver={cerrarEditorFicha}
          onGuardadoExitoso={() => {
            cerrarEditorFicha();
            setPdfVersion(Date.now());
            queryClient.invalidateQueries({ queryKey: ['guardia', id] });
            queryClient.invalidateQueries({ queryKey: ['guardias'] });
            queryClient.invalidateQueries({ queryKey: ['guardia-documentos', id] });
          }}
        />
      )}

      {/* ================= FORMULARIO: EDITAR DATOS GENERALES ================= */}
      <FormDialog
        open={modalEditar}
        onOpenChange={setModalEditar}
        size="lg"
        icon={Edit2}
        title="Editar datos del guardia"
        description={<>Identidad, datos principales y de contacto de <b className="font-semibold text-foreground">{guardia.nombre}</b>.</>}
        submitLabel="Guardar cambios"
        submitting={editMutation.isPending}
        footerNote={<span><span className="text-destructive">*</span> Campo obligatorio</span>}
        onSubmit={() =>
          editMutation.mutate({
            id: guardia.id,
            numero_elemento: editNumeroElemento,
            nombre: unirNombreCompleto(editFichaExtra),
            fecha_alta: editFechaAlta,
            telefono: editTelefono,
            direccion: editDireccion,
            estado: editEstado,
            fichaExtra: editFichaExtra,
          })
        }
      >
        <div className="space-y-6">
          <FormSection title="Identidad" description="Con el nombre por partes, el nacimiento, el sexo y el lugar de nacimiento se calculan la CURP y el RFC." icon={IdCard}>
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

      {/* ================= FORMULARIO: SUBIR PAPEL AL EXPEDIENTE ================= */}
      <FormDialog
        open={modalSubirPapel}
        onOpenChange={setModalSubirPapel}
        size="md"
        icon={Upload}
        title="Subir papel al expediente"
        description={<>Digitaliza contratos, identificaciones o comprobantes de <b className="font-semibold text-foreground">{guardia.nombre}</b>.</>}
        submitLabel="Guardar en expediente"
        submittingLabel="Subiendo..."
        submitting={uploadDocMutation.isPending}
        submitDisabled={!tipoPapel || !archivoPapel}
        footerNote={<span><span className="text-destructive">*</span> Campo obligatorio</span>}
        onSubmit={() => {
          if (!tipoPapel || !archivoPapel) return;
          const formData = new FormData();
          formData.append('nombre_documento', tipoPapel);
          formData.append('file', archivoPapel);
          uploadDocMutation.mutate(formData);
        }}
      >
        <div className="space-y-5">
          <Field label="Tipo de documento" required>
            <Select value={tipoPapel} onChange={e => setTipoPapel(e.target.value)} required>
              <option value="">Selecciona el tipo de documento</option>
              <option value="Contrato de Trabajo">Contrato de Trabajo</option>
              <option value="Identificación Oficial (INE/Pasaporte)">Identificación Oficial (INE/Pasaporte)</option>
              <option value="Comprobante de Domicilio">Comprobante de Domicilio</option>
              <option value="Clave Única de Registro de Población (CURP)">Clave Única de Registro de Población (CURP)</option>
              <option value="Constancia de Situación Fiscal (RFC)">Constancia de Situación Fiscal (RFC)</option>
              <option value="Número de Seguridad Social (IMSS)">Número de Seguridad Social (IMSS)</option>
              <option value="Acta de Nacimiento">Acta de Nacimiento</option>
              <option value="Certificado de Antecedentes No Penales">Certificado de Antecedentes No Penales</option>
              <option value="Examen Médico">Examen Médico</option>
              <option value="Cartilla Militar">Cartilla Militar</option>
              <option value="Certificado de Estudios">Certificado de Estudios</option>
              <option value="Otro Papel / Documento">Otro Papel / Documento</option>
            </Select>
          </Field>

          <Field label="Archivo escaneado" required group hint="PDF o imagen. Se guarda en el expediente digital del guardia.">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-input bg-muted/40 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/[0.03] focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
              <input
                type="file"
                accept=".pdf,image/*"
                className="sr-only"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) setArchivoPapel(file);
                }}
              />
              {archivoPapel ? (
                <>
                  <FileCheck className="h-7 w-7 text-emerald-600" />
                  <span className="max-w-full truncate text-sm font-semibold text-foreground">{archivoPapel.name}</span>
                  <span className="text-xs text-muted-foreground">{(archivoPapel.size / 1024).toFixed(0)} KB · clic para cambiar el archivo</span>
                </>
              ) : (
                <>
                  <CloudUpload className="h-7 w-7 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">Elegir un archivo</span>
                  <span className="text-xs text-muted-foreground">PDF, JPG o PNG</span>
                </>
              )}
            </label>
          </Field>
        </div>
      </FormDialog>

      {/* Confirmación de borrado (ficha técnica o documento del expediente). Diálogo propio
          en vez de window.confirm(): el navegador puede bloquear los cuadros nativos sin
          avisar, y entonces el botón Eliminar parecía no hacer nada. */}
      <ConfirmDialog
        open={!!confirmarEliminar}
        onOpenChange={(abierto) => !abierto && setConfirmarEliminar(null)}
        title="Confirmar eliminación"
        description={
          confirmarEliminar?.tipo === 'ficha'
            ? <>Ficha técnica de <b className="font-semibold text-foreground">{guardia.nombre}</b>.</>
            : confirmarEliminar?.tipo === 'documento'
              ? <>Documento <b className="font-semibold text-foreground">“{confirmarEliminar.doc.nombre_documento}”</b>.</>
              : undefined
        }
        confirmLabel="Eliminar"
        confirmingLabel="Eliminando..."
        confirming={deleteFichaMutation.isPending || deleteDocMutation.isPending}
        onConfirm={() => {
          if (confirmarEliminar?.tipo === 'ficha') deleteFichaMutation.mutate();
          if (confirmarEliminar?.tipo === 'documento') deleteDocMutation.mutate(confirmarEliminar.doc.id);
        }}
      >
        <Callout tone="danger" title="Esta acción no se puede deshacer">
          {confirmarEliminar?.tipo === 'ficha'
            ? 'Se borrarán por completo los datos capturados de la ficha técnica y el PDF generado.'
            : 'El archivo se eliminará del expediente digital del guardia.'}
        </Callout>
      </ConfirmDialog>
    </>
  );
}
