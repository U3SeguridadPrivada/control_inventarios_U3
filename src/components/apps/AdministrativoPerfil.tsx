'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
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
  Sparkles,
  Check,
  Clock,
  Pencil
} from 'lucide-react';
import { fmtDate } from '@/src/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';
import DocumentViewerModal from '@/src/components/DocumentViewerModal';
import MachoteFichaAdministrativo from '@/src/components/machotes/MachoteFichaAdministrativo';
import { FichaExtraEditor, FICHA_EXTRA_VACIA, extraerFichaExtra, type FichaExtraValores } from './administrativos/FichaExtraEditor';

interface Props {
  id: number;
  onVolver?: () => void;
  initialEditFicha?: boolean;
  initialTab?: string;
}

function imprimirExpediente(administrativo: any, salidas: any[], entradas: any[]) {
  const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const enPosesion = salidas.filter(s => s.estado_asignacion === 'Uniforme en Campo');
  const saldoMap: Record<string, number> = {};
  enPosesion.forEach(s => { const key = `${s.articulo}${s.talla ? ` (Talla: ${s.talla})` : ''}`; saldoMap[key] = (saldoMap[key] || 0) + s.cantidad; });
  const dotacion = salidas.filter(s => s.concepto === 'Uniforme en Campo' || s.concepto === 'Asignación');
  const reposicion = salidas.filter(s => s.concepto === 'Reposición');
  const extravios = salidas.filter(s => s.concepto === 'Extravío' || s.concepto === 'Inutilizable');
  const recuperados = entradas.filter(e => e.motivo === 'Recuperado');
  const reposicionEntradas = entradas.filter(e => e.motivo === 'Reposición (Entrada Múltiple)');
  const totalDotaciones = dotacion.reduce((a: number, s: any) => a + s.cantidad, 0);
  const totalReposiciones = reposicion.reduce((a: number, s: any) => a + s.cantidad, 0);
  const totalPerdidas = extravios.reduce((a: number, s: any) => a + s.cantidad, 0);
  const totalEnPosesion = Object.values(saldoMap).reduce((a, v) => a + v, 0);
  const saldoItemsHtml = Object.entries(saldoMap).length === 0 ? '<p style="color:#6b7280;font-style:italic;font-size:11px;margin-top:8px">Sin artículos en posesión.</p>' : `<ul style="list-style:none;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:8px;">${Object.entries(saldoMap).map(([art, qty]) => `<li style="font-size:11px;"><strong>${qty}x</strong> ${art}</li>`).join('')}</ul>`;
  const thBase = `<th style="width:30px">No.</th><th>Fecha</th><th>Artículo</th><th style="text-align:center">Talla</th><th style="text-align:center">Cant.</th>`;
  const mkHeader = (lastCol: string) => `<thead><tr>${thBase}<th>${lastCol}</th></tr></thead>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"/><title>Expediente — ${administrativo.nombre}</title>
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
    <div class="ficha-field"><span>Nombre Completo</span><strong>${administrativo.nombre}</strong></div>
    <div class="ficha-field"><span>Número de Elemento</span><strong>${administrativo.numero_empleado}</strong></div>
    <div class="ficha-field"><span>Fecha de Alta</span><strong>${fmtDate(administrativo.fecha_alta)}</strong></div>
    <div class="ficha-field"><span>Estatus</span><strong>${administrativo.estado}</strong></div>
  </div>
  <div class="section-title">I. Dotación inicial</div>
  ${dotacion.length === 0 ? '<p style="color:#6b7280;font-size:11px">Sin registros.</p>' : `<table>${mkHeader('Estado')}<tbody>${dotacion.map((item: any, idx: number) => `<tr><td style="text-align:center">${idx+1}</td><td>${fmtDate(item.fecha)}</td><td><strong>${item.articulo}</strong></td><td style="text-align:center">${item.talla||'—'}</td><td style="text-align:center">${item.cantidad}</td><td>${item.estado_fisico||'Nuevo'}</td></tr>`).join('')}</tbody></table>`}
  <div class="section-title">II. Equipo repuesto</div>
  ${reposicion.length === 0 ? '<p style="color:#6b7280;font-size:11px">Sin registros.</p>' : `<table>${mkHeader('Estado devuelto → Entregado')}<tbody>${reposicion.map((item: any, idx: number) => { const matched = reposicionEntradas.find((e: any) => e.articulo === item.articulo && e.fecha === item.fecha); const devuelto = matched?.estado || '—'; return `<tr><td style="text-align:center">${idx+1}</td><td>${fmtDate(item.fecha)}</td><td><strong>${item.articulo}</strong></td><td style="text-align:center">${item.talla||'—'}</td><td style="text-align:center">${item.cantidad}</td><td>Devolvió: <strong>${devuelto}</strong> → Recibió: <strong>${item.estado_fisico||'Nuevo'}</strong></td></tr>`; }).join('')}</tbody></table>`}
  <div class="section-title">III. Pérdidas y extravíos</div>
  ${extravios.length === 0 ? '<p style="color:#6b7280;font-size:11px">Sin registros.</p>' : `<table>${mkHeader('Tipo')}<tbody>${extravios.map((item: any, idx: number) => `<tr><td style="text-align:center">${idx+1}</td><td>${fmtDate(item.fecha)}</td><td><strong>${item.articulo}</strong></td><td style="text-align:center">${item.talla||'—'}</td><td style="text-align:center">${item.cantidad}</td><td>${item.concepto||'Extravío'}</td></tr>`).join('')}</tbody></table>`}
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
  <div class="firmas"><div class="firma"><div class="firma-line"></div><p>Firma del Elemento</p><small>${administrativo.nombre}</small><br/><small>${administrativo.numero_empleado}</small></div>
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

export default function AdministrativoPerfil({ id, onVolver, initialEditFicha, initialTab }: Props) {
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

  // Formulario Editar Datos Generales
  const [editNombre, setEditNombre] = useState('');
  const [editNumeroElemento, setEditNumeroElemento] = useState('');
  const [editPuesto, setEditPuesto] = useState('');
  const [editDepartamento, setEditDepartamento] = useState('Administración');
  const [editFechaAlta, setEditFechaAlta] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDireccion, setEditDireccion] = useState('');
  const [editSueldoMensual, setEditSueldoMensual] = useState('');
  const [editEstado, setEditEstado] = useState('Activo');
  const [editFichaExtra, setEditFichaExtra] = useState<FichaExtraValores>(FICHA_EXTRA_VACIA);

  // Formulario Subir Papeles
  const [tipoPapel, setTipoPapel] = useState('');
  const [archivoPapel, setArchivoPapel] = useState<File | null>(null);

  // Formulario Bitácora
  const [tipoBitacora, setTipoBitacora] = useState<'nota' | 'llamada' | 'incidencia'>('nota');
  const [mensajeBitacora, setMensajeBitacora] = useState('');

  // Queries
  const { data: administrativo, isLoading: isLoadingAdministrativo } = useQuery({
    queryKey: ['administrativo', id],
    queryFn: () => apiFetch<any>(`/api/administrativos/${id}/ficha`).then(res => res.administrativo || res),
  });

  const { data: expedienteRes, isLoading: isLoadingExpediente } = useQuery({
    queryKey: ['expediente', id],
    queryFn: () => apiFetch<{ salidas: any[], entradas: any[] }>(`/api/administrativos/${id}/expediente`),
  });

  const { data: documentos = [], isLoading: isLoadingDocumentos } = useQuery({
    queryKey: ['administrativo-documentos', id],
    queryFn: () => apiFetch<any[]>(`/api/administrativos/${id}/documentos`),
  });

  const { data: bitacora = [] } = useQuery({
    queryKey: ['administrativo-bitacora', id],
    queryFn: () => apiFetch<any[]>(`/api/administrativos/${id}/bitacora`),
  });

  // Token para visor PDF
  const authToken = typeof window !== 'undefined' ? localStorage.getItem('inv_token') : '';

  // Parse Ficha Técnica JSON
  const fichaData = useMemo(() => {
    if (!administrativo?.ficha_tecnica_json) return null;
    try {
      return JSON.parse(administrativo.ficha_tecnica_json);
    } catch {
      return null;
    }
  }, [administrativo?.ficha_tecnica_json]);

  // Saldo de Uniformes en Posesión
  const salidas = expedienteRes?.salidas || [];
  const entradas = expedienteRes?.entradas || [];

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
  const totalPerdidas = salidas.filter((s: any) => s.concepto === 'Extravío' || s.concepto === 'Inutilizable').reduce((a: number, s: any) => a + s.cantidad, 0);

  // Mutations
  const editMutation = useMutation({
    mutationFn: (payload: any) => apiFetch(`/api/administrativos/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['administrativo', id] });
      queryClient.invalidateQueries({ queryKey: ['administrativos'] });
      toast.success('Datos actualizados');
      setModalEditar(false);
    },
    onError: (err: any) => toast.error(err.message || 'Error al actualizar'),
  });

  const uploadDocMutation = useMutation({
    mutationFn: (formData: FormData) =>
      apiFetch(`/api/administrativos/${id}/documentos`, {
        method: 'POST',
        body: formData,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['administrativo-documentos', id] });
      queryClient.invalidateQueries({ queryKey: ['administrativo', id] });
      toast.success('Documento guardado en expediente');
      setModalSubirPapel(false);
      setTipoPapel('');
      setArchivoPapel(null);
    },
    onError: (err: any) => toast.error(err.message || 'Error al subir documento'),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: number) => apiFetch(`/api/administrativos/${id}/documentos/${docId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['administrativo-documentos', id] });
      toast.success('Documento eliminado');
      setConfirmarEliminar(null);
    },
    onError: (err: any) => toast.error(err.message || 'Error al eliminar documento'),
  });

  // Elimina por completo los datos de la ficha técnica (no solo el PDF
  // cacheado en la lista de papeles, que es lo único que borraba antes).
  const deleteFichaMutation = useMutation({
    mutationFn: () => apiFetch(`/api/administrativos/${id}/ficha`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['administrativo', id] });
      queryClient.invalidateQueries({ queryKey: ['administrativo-documentos', id] });
      toast.success('Ficha técnica eliminada');
      setConfirmarEliminar(null);
    },
    onError: (err: any) => toast.error(err.message || 'Error al eliminar la ficha técnica'),
  });

  const addBitacoraMutation = useMutation({
    mutationFn: (payload: { tipo: string; mensaje: string }) =>
      apiFetch(`/api/administrativos/${id}/bitacora`, { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['administrativo-bitacora', id] });
      toast.success('Entrada guardada en bitácora');
      setMensajeBitacora('');
    },
    onError: (err: any) => toast.error(err.message || 'Error al agregar nota'),
  });

  // Helpers
  const abrirEditar = () => {
    if (!administrativo) return;
    setEditNombre(administrativo.nombre || '');
    setEditNumeroElemento(administrativo.numero_empleado || '');
    setEditPuesto(administrativo.puesto || '');
    setEditDepartamento(administrativo.departamento || 'Administración');
    setEditFechaAlta(administrativo.fecha_alta ? administrativo.fecha_alta.split('T')[0] : '');
    setEditTelefono(administrativo.telefono || '');
    setEditEmail(administrativo.email || '');
    setEditDireccion(administrativo.direccion || '');
    setEditSueldoMensual(administrativo.sueldo_mensual ? String(administrativo.sueldo_mensual) : '');
    setEditEstado(administrativo.estado || 'Activo');
    setEditFichaExtra(extraerFichaExtra(administrativo.ficha_tecnica_json));
    setModalEditar(true);
  };

  const handleVolver = () => {
    if (onVolver) {
      onVolver();
    } else {
      router.push('/administrativos');
    }
  };

  // Sincronización de parámetros de URL al montar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('editFicha') === '1' || initialEditFicha) {
        router.push(`/administrativos/${id}/ficha`);
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
    router.push(`/administrativos/${administrativo?.id || id}/ficha`);
  };

  const cerrarEditorFicha = () => {
    setEditingFicha(false);
  };

  // Abrir Ficha Técnica en el Visualizador PDF
  const abrirVisorFichaPdf = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'visor' }, '', `${window.location.pathname}#visor-pdf`);
    }
    const url = `/api/administrativos/${id}/ficha-pdf?inline=true${authToken ? `&token=${authToken}` : ''}&v=${pdfVersion}`;
    setViewerDoc({
      title: `Ficha Técnica Oficial — ${administrativo?.nombre} (${administrativo?.numero_empleado})`,
      url,
      downloadName: `ficha_tecnica_${administrativo?.numero_empleado}.pdf`,
    });
  };

  // Abrir el Contrato Laboral en el Visualizador PDF (mismo mecanismo que la
  // ficha técnica: el contrato vive como JSON en el expediente, así que el
  // PDF real se genera al vuelo en /api/administrativos/[id]/contrato-pdf).
  const abrirVisorContrato = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'visor' }, '', `${window.location.pathname}#visor-contrato`);
    }
    const url = `/api/administrativos/${id}/contrato-pdf?inline=true${authToken ? `&token=${authToken}` : ''}`;
    setViewerDoc({
      title: `Contrato de Trabajo — ${administrativo?.nombre} (${administrativo?.numero_empleado})`,
      url,
      downloadName: `contrato_${administrativo?.numero_empleado || administrativo?.nombre}.pdf`,
    });
  };

  // Abrir Documento en el Visualizador PDF
  const abrirVisorDocumento = (doc: any) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: 'visor' }, '', `${window.location.pathname}#visor-doc`);
    }
    const url = `/api/administrativos/${id}/documentos/${doc.id}${authToken ? `?token=${authToken}` : ''}`;
    setViewerDoc({
      title: `${doc.nombre_documento} — ${administrativo?.nombre}`,
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
    link.href = `/api/administrativos/${id}/ficha-pdf?download=true${authToken ? `&token=${authToken}` : ''}`;
    link.download = `ficha_${administrativo?.numero_empleado}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoadingAdministrativo) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm font-medium text-muted-foreground">Cargando perfil del administrativo...</p>
      </div>
    );
  }

  if (!administrativo) {
    return (
      <div className="p-8 text-center bg-card rounded-2xl border border-border space-y-4">
        <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
        <h2 className="text-lg font-bold">Administrativo no encontrado</h2>
        <Button onClick={handleVolver} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver a la lista
        </Button>
      </div>
    );
  }

  const isActivo = administrativo.estado === 'Activo';
  const isBajaPendiente = administrativo.estado === 'Baja Pendiente';
  const fotoUrl = fichaData?.fotoUrl || null;
  const waUrl = administrativo.telefono ? `https://wa.me/52${administrativo.telefono.replace(/\D/g, '')}` : null;
  const mapsUrl = administrativo.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(administrativo.direccion)}` : null;

  return (
    <div className="space-y-4 pb-12 animate-in fade-in duration-300">
      {/* --- BARRA SUPERIOR DE NAVEGACIÓN Y ACCIONES (Estilo CRM) --- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleVolver}
            className="text-muted-foreground hover:text-foreground -ml-1 text-xs font-semibold gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" /> Volver a mi lista
          </Button>
          <span className="text-muted-foreground/50">|</span>
          <span className="font-mono text-xs text-muted-foreground font-semibold">ID #{administrativo.id}</span>
          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            {administrativo.numero_empleado}
          </span>
          <Badge
            variant={isActivo ? 'success' : isBajaPendiente ? 'destructive' : 'secondary'}
            className="text-xs font-semibold"
          >
            {administrativo.estado}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isEditor && (
            <Button size="sm" variant="outline" onClick={abrirEditar} className="text-xs">
              <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Editar datos
            </Button>
          )}
          <Link href={`/administrativos/${administrativo.id}/contrato`}>
            <Button
              size="sm"
              variant="outline"
              className="text-xs font-semibold border-amber-300 bg-amber-50/70 text-amber-900 hover:bg-amber-100 hover:text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950 shadow-xs"
              title="Abrir y editar contrato laboral en hojas oficiales"
            >
              <FileCheck className="w-3.5 h-3.5 mr-1.5 text-amber-600" /> Contrato Laboral
            </Button>
          </Link>
          <Link href={`/administrativos/${administrativo.id}/ficha`}>
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-xs"
              title="Abrir y editar ficha técnica oficial con la interfaz de expediente"
            >
              <IdCard className="w-3.5 h-3.5 mr-1.5" /> Ficha Técnica
            </Button>
          </Link>
        </div>
      </div>

      {/* --- GRID PRINCIPAL (2 COLUMNAS CRM) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ================= COLUMNA IZQUIERDA: FICHA Y DATOS DEL GUARDIA (5 cols) ================= */}
        <div className="lg:col-span-5 space-y-4">
          {/* Tarjeta de Identidad y Foto Oficial */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div>
              {/* Badges superiores */}
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Operativo {administrativo.estado}
                </span>
                <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground font-medium ml-auto flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-primary" /> Alta: {fmtDate(administrativo.fecha_alta)}
                </span>
              </div>

              {/* Foto Oficial y Nombre */}
              <div className="flex items-center gap-4 mb-3">
                <div className="relative flex-shrink-0 group">
                  {fotoUrl ? (
                    <img
                      src={fotoUrl}
                      alt={administrativo.nombre}
                      className="w-20 h-20 sm:w-22 sm:h-22 rounded-2xl object-cover border-2 border-primary/20 shadow-md"
                    />
                  ) : (
                    <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-muted border-2 border-primary/20 flex items-center justify-center text-primary font-black text-2xl tracking-wider shadow-sm">
                      {administrativo.nombre
                        ? administrativo.nombre
                            .split(' ')
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((w: string) => w[0])
                            .join('')
                            .toUpperCase()
                        : 'G'}
                    </div>
                  )}
                  {isEditor && (
                    <button
                      onClick={abrirEditorFicha}
                      className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-primary text-primary-foreground shadow hover:scale-105 transition-transform"
                      title="Cambiar o subir fotografía en Ficha Técnica"
                    >
                      <Camera className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-bold tracking-tight text-foreground leading-snug">
                    {administrativo.nombre}
                  </h1>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 font-semibold">
                    <Briefcase className="w-4 h-4 text-primary shrink-0" />
                    {administrativo.puesto || fichaData?.puesto || 'Personal Administrativo'}
                  </p>
                  <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                    U3 Seguridad Privada · Departamento de {administrativo.departamento || 'Oficinas'}
                  </p>
                </div>
              </div>
            </div>

            {/* Padrón y Resumen de Estado */}
            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-primary shrink-0" />
                <span>Estatus en Corporativo: {administrativo.estado === 'Activo' ? 'Personal Activo en Oficinas' : administrativo.estado}</span>
              </div>
              <div className="text-muted-foreground pl-5.5">
                Número de Empleado: <span className="font-mono font-bold text-foreground">{administrativo.numero_empleado || '—'}</span>
              </div>
              {administrativo.sueldo_mensual && (
                <div className="text-muted-foreground pl-5.5">
                  Sueldo Mensual: <span className="font-semibold text-emerald-600 dark:text-emerald-400">${Number(administrativo.sueldo_mensual).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                </div>
              )}
            </div>

            {/* Canales Directos (Teléfono / WhatsApp / Domicilio) */}
            <div className="space-y-2.5 pt-1 text-sm border-t border-border">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-1">
                Canales Directos
              </div>

              {/* Teléfono y WhatsApp */}
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2 min-w-0">
                  <Phone className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="font-medium text-xs break-all">
                    {administrativo.telefono || <span className="text-muted-foreground italic">Sin teléfono registrado</span>}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {administrativo.telefono && (
                    <a
                      href={`tel:${administrativo.telefono}`}
                      title="Llamar directamente"
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {waUrl && (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir WhatsApp directo"
                      className="inline-flex items-center gap-1 bg-emerald-500 text-white text-[11px] font-semibold px-2.5 py-1 rounded-md hover:bg-emerald-600 transition-colors shadow-sm"
                    >
                      <MessageCircle className="w-3 h-3" /> WhatsApp
                    </a>
                  )}
                  {!administrativo.telefono && isEditor && (
                    <Button variant="ghost" size="sm" onClick={abrirEditar} className="text-xs h-7 text-primary">
                      + Agregar
                    </Button>
                  )}
                </div>
              </div>

              {/* Correo Electrónico */}
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-primary font-bold text-xs">✉</span>
                  <span className="font-medium text-xs break-all">
                    {administrativo.email || <span className="text-muted-foreground italic">Sin correo registrado</span>}
                  </span>
                </div>
                {administrativo.email && (
                  <a
                    href={`mailto:${administrativo.email}`}
                    title="Enviar correo institucional"
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              {/* Domicilio con Google Maps */}
              <div className="p-2.5 rounded-lg bg-muted/30 border border-border/50 space-y-1">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium text-foreground block">
                      {administrativo.direccion || <span className="text-muted-foreground italic">Sin dirección de domicilio registrada</span>}
                    </span>
                    {mapsUrl && (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-semibold mt-1"
                      >
                        Ver en Google Maps <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tarjeta de Control y Filiación Oficial (Datos Personales) */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-primary" /> Control y Filiación Oficial
              </h2>
              {isEditor && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={abrirEditorFicha}
                  className="text-xs h-7 text-primary font-semibold"
                >
                  <Edit3 className="w-3 h-3 mr-1" /> {fichaData ? 'Editar' : 'Completar'}
                </Button>
              )}
            </div>

            {fichaData ? (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2 rounded bg-muted/20 border border-border/40">
                  <span className="text-muted-foreground block text-[11px]">CURP:</span>
                  <span className="font-mono font-bold text-foreground">{fichaData.curp || '—'}</span>
                </div>
                <div className="p-2 rounded bg-muted/20 border border-border/40">
                  <span className="text-muted-foreground block text-[11px]">RFC:</span>
                  <span className="font-mono font-bold text-foreground">{fichaData.rfc || '—'}</span>
                </div>
                <div className="p-2 rounded bg-muted/20 border border-border/40">
                  <span className="text-muted-foreground block text-[11px]">NSS / IMSS:</span>
                  <span className="font-mono font-bold text-foreground">{fichaData.imss || '—'}</span>
                </div>
                <div className="p-2 rounded bg-muted/20 border border-border/40">
                  <span className="text-muted-foreground block text-[11px]">Edad:</span>
                  <span className="font-semibold text-foreground">{conUnidad(fichaData.edad, /\s*años?\.?\s*$/i, 'años')}</span>
                </div>
                <div className="p-2 rounded bg-muted/20 border border-border/40">
                  <span className="text-muted-foreground block text-[11px]">F. Nacimiento:</span>
                  <span className="font-semibold text-foreground">{fichaData.fechaNacimiento || '—'}</span>
                </div>
                <div className="p-2 rounded bg-muted/20 border border-border/40">
                  <span className="text-muted-foreground block text-[11px]">Escolaridad:</span>
                  <span className="font-semibold text-foreground">{fichaData.estudios || '—'}</span>
                </div>
                <div className="p-2 rounded bg-muted/20 border border-border/40">
                  <span className="text-muted-foreground block text-[11px]">Estatura:</span>
                  <span className="font-semibold text-foreground">{conUnidad(fichaData.estatura, /\s*m(?:ts?|etros?)?\.?\s*$/i, 'm')}</span>
                </div>
                <div className="p-2 rounded bg-muted/20 border border-border/40">
                  <span className="text-muted-foreground block text-[11px]">Peso:</span>
                  <span className="font-semibold text-foreground">{conUnidad(fichaData.peso, /\s*k(?:g|ilos?)\.?\s*$/i, 'kg')}</span>
                </div>
              </div>
            ) : (
              <div className="p-4 border border-border border-dashed rounded-xl text-center space-y-2">
                <AlertCircle className="w-6 h-6 text-amber-500 mx-auto" />
                <p className="text-xs text-muted-foreground">
                  Aún no se han capturado los datos de filiación oficial (CURP, RFC, IMSS, medidas).
                </p>
                {isEditor && (
                  <Link href={`/administrativos/${administrativo.id}/ficha`}>
                    <Button size="sm" className="text-xs font-semibold rounded-lg">
                      <Sparkles className="w-3.5 h-3.5 mr-1" /> Llenar Ficha Técnica Ahora
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ================= COLUMNA DERECHA (7 cols) ================= */}
        <div className="lg:col-span-7 space-y-4">
          {/* 1. Tarjeta: Acciones Inmediatas (Estilo CRM) */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">Acciones Inmediatas</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Contacta al administrativo o gestiona su expediente formal en un clic.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold transition-colors"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-600" /> Enviar WhatsApp
                </a>
              )}

              {administrativo.telefono && (
                <a
                  href={`tel:${administrativo.telefono}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-500/30 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 text-xs font-semibold transition-colors"
                >
                  <Phone className="w-4 h-4 text-sky-600" /> Llamar Administrativo
                </a>
              )}

              {isEditor && (
                <Link href={`/administrativos/${administrativo.id}/ficha`}>
                  <Button
                    size="sm"
                    className="bg-primary text-primary-foreground text-xs font-bold shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Editar Ficha Técnica
                  </Button>
                </Link>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => imprimirExpediente(administrativo, salidas, entradas)}
                disabled={isLoadingExpediente}
                className="text-xs"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" /> Imprimir Hoja Uniformes
              </Button>
            </div>
          </div>

          {/* 2. Tarjeta: Ficha Técnica Oficial (PDF) con Visualizador PDF al hacer clic */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">Ficha Técnica Oficial (PDF)</h2>
              </div>
              {administrativo.ficha_tecnica_json ? (
                <span className="inline-flex items-center text-[11px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2.5 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Archivo Guardado en Expediente
                </span>
              ) : (
                <span className="inline-flex items-center text-[11px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 px-2.5 py-0.5 rounded-full">
                  <AlertCircle className="w-3 h-3 mr-1" /> Pendiente de capturar
                </span>
              )}
            </div>

            {/* Caja de documento con acción para abrir el visor PDF */}
            <div className="p-4 rounded-xl border border-primary/20 bg-primary/[0.02] hover:bg-primary/[0.05] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div
                onClick={abrirVisorFichaPdf}
                className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
                title="Haga clic para abrir el visualizador PDF de la ficha técnica"
              >
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary flex-shrink-0">
                  <IdCard className="w-6 h-6" />
                </div>
                <div className="truncate">
                  <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5 truncate">
                    Ficha_Tecnica_{administrativo.numero_empleado}.pdf
                    <span className="text-[10px] font-semibold text-primary uppercase px-1.5 py-0.2 rounded bg-primary/10">PDF Oficial</span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Haga clic aquí para abrir el visualizador de la ficha técnica completa
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="default"
                  onClick={abrirVisorFichaPdf}
                  className="h-8 text-xs font-bold"
                  title="Abrir ventana del visualizador PDF"
                >
                  <Eye className="w-3.5 h-3.5 mr-1" /> Abrir Visor PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={descargarFichaDirecta}
                  className="h-8 text-xs font-semibold"
                  title="Descargar archivo PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                </Button>
                {isEditor && (
                  <Link href={`/administrativos/${administrativo.id}/ficha`}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs font-semibold"
                      title="Editar datos de la ficha y regenerar PDF"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                )}
                {isEditor && administrativo.ficha_tecnica_json && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmarEliminar({ tipo: 'ficha' })}
                    className="h-8 text-xs font-semibold text-destructive hover:bg-destructive/10"
                    title="Eliminar por completo la ficha técnica de este administrativo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* 3. Tarjeta: Papeles Digitalizados & Contrato (Expediente Digital) */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">
                  Papeles Digitalizados y Contrato ({documentos.length})
                </h2>
              </div>
              {isEditor && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setModalSubirPapel(true)}
                  className="text-xs h-8 font-semibold"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Subir Papel
                </Button>
              )}
            </div>

            {/* Checklist de Documentos Clave */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {[
                'Contrato de Trabajo',
                'Identificación Oficial (INE)',
                'Comprobante de Domicilio',
                'CURP',
              ].map(docTipo => {
                const subido = documentos.some((d: any) =>
                  d.nombre_documento.toLowerCase().includes(docTipo.toLowerCase().slice(0, 8))
                );
                const esContrato = docTipo === 'Contrato de Trabajo';
                return (
                  <div
                    key={docTipo}
                    onClick={() => {
                      if (esContrato) {
                        router.push(`/administrativos/${administrativo.id}/contrato`);
                      }
                    }}
                    className={`p-2 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 ${
                      esContrato ? 'cursor-pointer hover:border-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-all ' : ''
                    } ${
                      subido
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'bg-muted/20 border-border text-muted-foreground'
                    }`}
                    title={esContrato ? 'Haga clic para ver o editar el Contrato Laboral oficial' : undefined}
                  >
                    {subido ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Clock className="w-3.5 h-3.5 text-muted-foreground/60" />}
                    <span className="truncate">{docTipo}</span>
                    {esContrato && <ExternalLink className="w-3 h-3 ml-auto opacity-70" />}
                  </div>
                );
              })}
            </div>

            {/* Lista de Papeles Escaneados */}
            {isLoadingDocumentos ? (
              <p className="text-xs text-muted-foreground text-center py-4 animate-pulse">Cargando papeles escaneados...</p>
            ) : documentos.length === 0 ? (
              <div className="text-center border border-border border-dashed rounded-xl py-8 text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-xs font-semibold text-foreground">Aún no hay papeles digitalizados</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Sube el contrato firmado, credencial del INE o comprobantes de este administrativo.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {documentos.map((doc: any) => {
                  const isPdf = doc.tipo_mimetype === 'application/pdf';
                  const isFicha =
                    doc.nombre_documento?.toLowerCase().includes('ficha') ||
                    doc.nombre_archivo?.toLowerCase().includes('ficha');
                  const isContrato =
                    doc.nombre_documento?.toLowerCase().includes('contrato') ||
                    doc.nombre_archivo?.toLowerCase().includes('contrato');
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3 border border-border rounded-xl bg-muted/15 hover:bg-muted/30 transition-colors shadow-sm"
                    >
                      <div
                        onClick={() => {
                          if (isContrato) {
                            abrirVisorContrato();
                          } else {
                            abrirVisorDocumento(doc);
                          }
                        }}
                        className="flex items-center gap-2.5 overflow-hidden cursor-pointer flex-1"
                        title="Haga clic para ver este papel en el visualizador"
                      >
                        <div className={`p-2 rounded-lg ${isContrato ? 'bg-amber-500/10 text-amber-600' : isPdf ? 'bg-red-500/10 text-red-600' : 'bg-blue-500/10 text-blue-600'}`}>
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-bold text-foreground truncate" title={doc.nombre_documento}>
                            {doc.nombre_documento}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{fmtDate(doc.fecha_subida)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {isContrato ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-primary hover:bg-primary/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              abrirVisorContrato();
                            }}
                            title="Ver el contrato en el visualizador"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-primary hover:bg-primary/10"
                            onClick={() => abrirVisorDocumento(doc)}
                            title="Abrir en visualizador"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {isContrato && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/administrativos/${administrativo.id}/contrato`);
                            }}
                            title="Editar contrato laboral en hojas oficiales"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {isFicha && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              abrirEditorFicha();
                            }}
                            title="Editar ficha técnica"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {isEditor && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                            onClick={() => setConfirmarEliminar({ tipo: 'documento', doc })}
                            title="Eliminar papel"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4. Tarjeta: Cosas que tiene en Posesión (Uniformes y Equipo en Campo) */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">
                  Cosas en Posesión ({totalEnPosesion} prendas activas)
                </h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => imprimirExpediente(administrativo, salidas, entradas)}
                disabled={isLoadingExpediente}
                className="text-xs h-8"
              >
                <Printer className="w-3.5 h-3.5 mr-1.5" /> Imprimir Acta
              </Button>
            </div>

            {/* Resumen numérico */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                <div className="text-base font-black text-blue-700 dark:text-blue-300">{totalDotaciones}</div>
                <div className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400">Dotadas</div>
              </div>
              <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900">
                <div className="text-base font-black text-purple-700 dark:text-purple-300">{totalReposiciones}</div>
                <div className="text-[10px] font-bold uppercase text-purple-600 dark:text-purple-400">Repuestas</div>
              </div>
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                <div className="text-base font-black text-red-700 dark:text-red-300">{totalPerdidas}</div>
                <div className="text-[10px] font-bold uppercase text-red-600 dark:text-red-400">Pérdidas</div>
              </div>
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                <div className="text-base font-black text-emerald-700 dark:text-emerald-300">{totalEnPosesion}</div>
                <div className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">En Posesión</div>
              </div>
            </div>

            {/* Lista detallada de artículos en posesión */}
            {Object.keys(saldoMap).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4 italic">
                El administrativo no tiene prendas o accesorios en posesión actualmente.
              </p>
            ) : (
              <div className="space-y-1.5 pt-1">
                {Object.entries(saldoMap).map(([articulo, info]) => (
                  <div
                    key={articulo}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border/50 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="font-semibold text-foreground">{articulo}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-muted-foreground">Estado: {info.estado_fisico || 'Operativo'}</span>
                      <span className="font-bold text-foreground bg-primary/10 text-primary px-2 py-0.5 rounded font-mono">
                        {info.cantidad} pza(s)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. Tarjeta: Bitácora de Movimientos y Contactos */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">
                  Bitácora de Movimientos y Contactos ({bitacora.length} registros)
                </h2>
              </div>
            </div>

            {/* Caja de registro de nota / llamada */}
            {isEditor && (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (!mensajeBitacora.trim()) return;
                  addBitacoraMutation.mutate({ tipo: tipoBitacora, mensaje: mensajeBitacora });
                }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={mensajeBitacora}
                    onChange={e => setMensajeBitacora(e.target.value)}
                    placeholder="Anotar resultado de llamada, pase de lista o nota interna..."
                    className="h-9 text-xs rounded-lg"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant={tipoBitacora === 'llamada' ? 'default' : 'outline'}
                      onClick={() => setTipoBitacora('llamada')}
                      className="h-9 px-2.5 text-xs"
                    >
                      <Phone className="w-3.5 h-3.5 mr-1" /> Llamada
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={tipoBitacora === 'nota' ? 'default' : 'outline'}
                      onClick={() => setTipoBitacora('nota')}
                      className="h-9 px-2.5 text-xs"
                    >
                      <StickyNote className="w-3.5 h-3.5 mr-1" /> Nota
                    </Button>
                    <Button
                      type="submit"
                      disabled={addBitacoraMutation.isPending || !mensajeBitacora.trim()}
                      className="h-9 text-xs font-bold"
                    >
                      Guardar
                    </Button>
                  </div>
                </div>
              </form>
            )}

            {/* Timeline de entradas de bitácora y eventos */}
            <div className="space-y-2.5 pt-1">
              {bitacora.length === 0 ? (
                <div className="p-3 rounded-lg bg-muted/20 border border-border/40 text-xs flex items-center justify-between text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-primary" /> Alta de elemento registrada en sistema
                  </span>
                  <span className="text-[11px]">{fmtDate(administrativo.fecha_alta)}</span>
                </div>
              ) : (
                bitacora.map((item: any) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg bg-muted/20 border border-border/40 text-xs flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      {item.tipo === 'llamada' ? (
                        <Phone className="w-3.5 h-3.5 text-sky-500 mt-0.5 shrink-0" />
                      ) : (
                        <StickyNote className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                      )}
                      <div>
                        <p className="font-semibold text-foreground leading-relaxed">{item.mensaje}</p>
                        {item.usuario && (
                          <span className="text-[10px] text-muted-foreground">Por: {item.usuario}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                      {item.created_at ? fmtDate(item.created_at) : '—'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ================= MODAL VISUALIZADOR PDF ================= */}
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
        <MachoteFichaAdministrativo
          initialAdministrativoId={administrativo.id}
          fullScreen={true}
          embedded={true}
          onClose={cerrarEditorFicha}
          onVolver={cerrarEditorFicha}
          onGuardadoExitoso={() => {
            cerrarEditorFicha();
            setPdfVersion(Date.now());
            queryClient.invalidateQueries({ queryKey: ['administrativo', id] });
            queryClient.invalidateQueries({ queryKey: ['administrativos'] });
            queryClient.invalidateQueries({ queryKey: ['administrativo-documentos', id] });
          }}
        />
      )}

      {/* ================= MODAL EDITAR DATOS GENERALES ================= */}
      <Dialog open={modalEditar} onOpenChange={setModalEditar} className="max-w-6xl">
        <DialogContent className="rounded-2xl">
          <form
            onSubmit={e => {
              e.preventDefault();
              editMutation.mutate({
                id: administrativo.id,
                numero_empleado: editNumeroElemento,
                nombre: editNombre,
                puesto: editPuesto,
                departamento: editDepartamento,
                fecha_alta: editFechaAlta,
                telefono: editTelefono,
                email: editEmail,
                direccion: editDireccion,
                sueldo_mensual: editSueldoMensual ? Number(editSueldoMensual) : null,
                estado: editEstado,
                fichaExtra: editFichaExtra,
              });
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-primary" /> Editar Datos del Administrativo
              </DialogTitle>
              <DialogDescription>
                Modifica los datos principales y de contacto de <b>{administrativo.nombre}</b>.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3.5 py-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Nombre Completo</label>
                <Input
                  value={editNombre}
                  onChange={e => setEditNombre(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Puesto</label>
                  <Input
                    value={editPuesto}
                    onChange={e => setEditPuesto(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Departamento</label>
                  <select
                    value={editDepartamento}
                    onChange={e => setEditDepartamento(e.target.value)}
                    className="flex h-10 w-full rounded-xl border border-input bg-card px-3 py-1 text-xs shadow-sm font-medium"
                  >
                    <option value="Administración">Administración</option>
                    <option value="Recursos Humanos">Recursos Humanos</option>
                    <option value="Contabilidad y Finanzas">Contabilidad y Finanzas</option>
                    <option value="Operaciones y Logística">Operaciones y Logística</option>
                    <option value="Dirección General">Dirección General</option>
                    <option value="Sistemas / TI">Sistemas / TI</option>
                    <option value="Ventas">Ventas</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Fecha de Alta</label>
                  <Input
                    type="date"
                    value={editFechaAlta}
                    onChange={e => setEditFechaAlta(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Teléfono de Contacto</label>
                  <Input
                    value={editTelefono}
                    onChange={e => setEditTelefono(e.target.value)}
                    placeholder="Ej. 5512345678"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Correo Electrónico</label>
                  <Input
                    type="email"
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                    placeholder="ejemplo@u3.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Estado</label>
                  <select
                    value={editEstado}
                    onChange={e => setEditEstado(e.target.value)}
                    className="flex h-10 w-full rounded-xl border border-input bg-card px-3 py-1 text-sm shadow-sm font-medium"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Baja Pendiente">Baja Pendiente</option>
                    <option value="En Baja">En Baja</option>
                  </select>
                </div>
              </div>
            </div>

            <FichaExtraEditor nombreCompleto={editNombre} value={editFichaExtra} onChange={setEditFichaExtra} />

            <DialogFooter className="gap-2 mt-3">
              <Button type="button" variant="outline" onClick={() => setModalEditar(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={editMutation.isPending} className="font-bold">
                {editMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================= MODAL SUBIR PAPEL O CONTRATO ================= */}
      <Dialog open={modalSubirPapel} onOpenChange={setModalSubirPapel}>
        <DialogContent className="rounded-2xl max-w-lg">
          <form
            onSubmit={e => {
              e.preventDefault();
              if (!tipoPapel || !archivoPapel) return;
              const formData = new FormData();
              formData.append('nombre_documento', tipoPapel);
              formData.append('file', archivoPapel);
              uploadDocMutation.mutate(formData);
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" /> Subir Papel al Expediente Digital
              </DialogTitle>
              <DialogDescription>
                Digitaliza contratos, identificaciones o comprobantes para <b>{administrativo.nombre}</b>.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Tipo de Documento o Papel</label>
                <select
                  value={tipoPapel}
                  onChange={e => setTipoPapel(e.target.value)}
                  className="flex h-10 w-full rounded-xl border border-input bg-card px-3 py-1 text-xs shadow-sm font-medium"
                  required
                >
                  <option value="">Selecciona tipo de documento...</option>
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
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Archivo Escaneado (PDF o Imagen)</label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) setArchivoPapel(file);
                  }}
                  className="flex h-10 w-full rounded-xl border border-input bg-card px-3 py-1 text-xs shadow-sm file:border-0 file:bg-transparent file:text-xs file:font-semibold cursor-pointer"
                  required
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setModalSubirPapel(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={uploadDocMutation.isPending || !tipoPapel || !archivoPapel}
                className="font-bold"
              >
                {uploadDocMutation.isPending ? 'Subiendo...' : 'Guardar en Expediente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado (ficha técnica o documento del expediente).
          Diálogo propio en vez de window.confirm(): el navegador puede
          bloquear los cuadros nativos sin avisar, y entonces el botón
          "Eliminar" parecía no hacer nada. */}
      <Dialog open={!!confirmarEliminar} onOpenChange={(open) => !open && setConfirmarEliminar(null)}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" /> Confirmar eliminación
            </DialogTitle>
            <DialogDescription>
              {confirmarEliminar?.tipo === 'ficha' && (
                <>
                  ¿Eliminar por completo la ficha técnica de <b>{administrativo.nombre}</b>? Se
                  borrarán los datos capturados y el PDF generado. Esta acción no se puede
                  deshacer.
                </>
              )}
              {confirmarEliminar?.tipo === 'documento' && (
                <>
                  ¿Eliminar el documento <b>&quot;{confirmarEliminar.doc.nombre_documento}&quot;</b>?
                  Esta acción no se puede deshacer.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmarEliminar(null)}
              disabled={deleteFichaMutation.isPending || deleteDocMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteFichaMutation.isPending || deleteDocMutation.isPending}
              onClick={() => {
                if (confirmarEliminar?.tipo === 'ficha') deleteFichaMutation.mutate();
                if (confirmarEliminar?.tipo === 'documento') deleteDocMutation.mutate(confirmarEliminar.doc.id);
              }}
              className="font-bold"
            >
              {(deleteFichaMutation.isPending || deleteDocMutation.isPending) ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
