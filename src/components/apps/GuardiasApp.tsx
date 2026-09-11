'use client';
import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
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
  Sparkles,
  ChevronRight,
  Maximize2
} from 'lucide-react';
import { fmtDate } from '@/src/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';
import MachoteFichaTecnica from '@/src/components/machotes/MachoteFichaTecnica';
import GuardiaPerfil from './GuardiaPerfil';

function imprimirExpediente(guardia: any, salidas: any[], entradas: any[]) {
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

export default function GuardiasApp({ initialGuardiaId }: { initialGuardiaId?: number } = {}) {
  const { isEditor } = useAuth();
  const queryClient = useQueryClient();
  const [selectedGuardiaId, setSelectedGuardiaId] = useState<number | null>(initialGuardiaId || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState<'Todos' | 'Activo' | 'Baja Pendiente' | 'En Baja'>('Todos');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBajaModalOpen, setIsBajaModalOpen] = useState(false);

  // Registration States
  const [numeroElemento, setNumeroElemento] = useState('');
  const [nombre, setNombre] = useState('');
  const [fechaAlta, setFechaAlta] = useState(new Date().toISOString().split('T')[0]);
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');

  // Selected Guardia & Baja States
  const [selectedGuardia, setSelectedGuardia] = useState<any>(null);
  const [fechaBaja, setFechaBaja] = useState(new Date().toISOString().split('T')[0]);

  // Editing States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editNumeroElemento, setEditNumeroElemento] = useState('');
  const [editNombre, setEditNombre] = useState('');
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
      setNombre('');
      setTelefono('');
      setDireccion('');
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
      apiFetch(`/api/guardias/${payload.id}/baja`, { method: 'POST', body: JSON.stringify({ fecha: payload.fecha }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guardias'] });
      queryClient.invalidateQueries({ queryKey: ['bajas'] });
      toast.success('Proceso de baja iniciado');
      setIsBajaModalOpen(false);
    },
    onError: () => toast.error('Error al procesar la baja'),
  });

  const startEdit = (guardia: any) => {
    setEditNombre(guardia.nombre);
    setEditNumeroElemento(guardia.numero_elemento);
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
        filterEstado === 'Todos' || g.estado === filterEstado;

      return matchSearch && matchEstado;
    });
  }, [guardias, searchTerm, filterEstado]);

  // Si hay un guardia seleccionado, desplegar la vista de perfil completo estilo CRM
  if (selectedGuardiaId) {
    return <GuardiaPerfil id={selectedGuardiaId} onVolver={() => setSelectedGuardiaId(null)} />;
  }

  // Auth token for inline PDF preview
  const authToken = typeof window !== 'undefined' ? localStorage.getItem('inv_token') : '';

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Top Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card/60 backdrop-blur-sm p-5 rounded-2xl border border-border shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                Personal de Guardias
              </h1>
              <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
                Directorio operativo, perfiles completos, expedientes con documentos y fichas técnicas editables en PDF.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Toggle View Mode */}
          <div className="inline-flex items-center rounded-xl bg-muted/60 p-1 border border-border">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'cards'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Vista en Tarjetas de Perfil"
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Tarjetas
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'table'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Vista en Tabla Compacta"
            >
              <List className="w-3.5 h-3.5" /> Tabla
            </button>
          </div>

          {isEditor && (
            <Button
              onClick={() => setIsModalOpen(true)}
              className="shadow-sm font-semibold rounded-xl"
            >
              <UserPlus className="w-4 h-4 mr-2" /> Nuevo Guardia
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 max-w-md w-full relative">
          <Search className="w-4 h-4 absolute left-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar por nombre, número de elemento o teléfono..."
            className="pl-10 h-10 rounded-xl bg-card"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 text-xs text-muted-foreground hover:text-foreground"
            >
              Limpiar
            </button>
          )}
        </div>

        {/* Status Pill Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scroll-touch">
          {(['Todos', 'Activo', 'Baja Pendiente', 'En Baja'] as const).map(est => {
            const count = est === 'Todos' ? guardias.length : guardias.filter((g: any) => g.estado === est).length;
            const isSelected = filterEstado === est;
            return (
              <button
                key={est}
                type="button"
                onClick={() => setFilterEstado(est)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap border ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-card text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                <span>{est}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${isSelected ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content: Cards or Table */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          <p className="text-sm font-medium text-muted-foreground">Cargando catálogo de guardias...</p>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-card border border-border border-dashed rounded-2xl text-center p-6">
          <User className="w-12 h-12 text-muted-foreground/40 mb-3" />
          <h3 className="text-base font-bold text-foreground">No se encontraron guardias</h3>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-sm">
            {searchTerm
              ? 'No hay resultados que coincidan con la búsqueda. Intenta con otro nombre o número.'
              : 'Aún no hay guardias registrados con este filtro.'}
          </p>
          {isEditor && (
            <Button onClick={() => setIsModalOpen(true)} size="sm" className="mt-4">
              <UserPlus className="w-4 h-4 mr-1.5" /> Registrar Primer Guardia
            </Button>
          )}
        </div>
      ) : viewMode === 'cards' ? (
        /* ================= CARDS VIEW (Tarjetas del perfil del guardia) ================= */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredData.map((item: any) => {
            let hasFicha = false;
            let fotoUrl: string | null = null;
            if (item.ficha_tecnica_json) {
              try {
                const parsed = JSON.parse(item.ficha_tecnica_json);
                hasFicha = true;
                fotoUrl = parsed.fotoUrl || null;
              } catch {}
            }

            const initials = item.nombre
              ? item.nombre
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w: string) => w[0])
                  .join('')
                  .toUpperCase()
              : 'G';

            const isActivo = item.estado === 'Activo';
            const isBajaPendiente = item.estado === 'Baja Pendiente';
            const isEnBaja = item.estado === 'En Baja';

            return (
              <div
                key={item.id}
                className="group relative bg-card hover:bg-card/90 border border-border/80 hover:border-primary/50 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  {/* Card Top: Photo/Initials + Badges */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      {/* Avatar / Photo */}
                      <div className="relative flex-shrink-0">
                        {fotoUrl ? (
                          <img
                            src={fotoUrl}
                            alt={item.nombre}
                            className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl object-cover border-2 border-primary/20 shadow-sm group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-muted border-2 border-primary/20 flex items-center justify-center text-primary font-black text-lg tracking-wider shadow-sm group-hover:scale-105 transition-transform">
                            {initials}
                          </div>
                        )}
                        <span
                          className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-card ${
                            isActivo ? 'bg-emerald-500 ring-2 ring-emerald-500/20' : isBajaPendiente ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          title={`Estado: ${item.estado}`}
                        />
                      </div>

                      {/* Header Info */}
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                            {item.numero_elemento}
                          </span>
                        </div>
                        <h2
                          onClick={() => openPerfil(item, 'datos')}
                          className="font-bold text-foreground text-base mt-1 line-clamp-1 group-hover:text-primary cursor-pointer transition-colors"
                          title={item.nombre}
                        >
                          {item.nombre}
                        </h2>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div>
                      <Badge
                        variant={isActivo ? 'success' : isBajaPendiente ? 'destructive' : 'secondary'}
                        className="text-[11px] font-semibold tracking-wide"
                      >
                        {item.estado}
                      </Badge>
                    </div>
                  </div>

                  {/* Contact & General Details */}
                  <div className="space-y-2 py-2 border-t border-border/60 text-xs text-muted-foreground">
                    {item.telefono ? (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-primary/80 flex-shrink-0" />
                        <a
                          href={`tel:${item.telefono}`}
                          className="hover:text-primary transition-colors truncate"
                          title="Llamar al guardia"
                        >
                          {item.telefono}
                        </a>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground/60 italic">
                        <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Sin teléfono registrado</span>
                      </div>
                    )}

                    {item.direccion ? (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-primary/80 flex-shrink-0 mt-0.5" />
                        <span className="line-clamp-1" title={item.direccion}>
                          {item.direccion}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground/60 italic">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Sin dirección registrada</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-primary/80 flex-shrink-0" />
                      <span>Alta: {fmtDate(item.fecha_alta)}</span>
                    </div>
                  </div>

                  {/* Ficha Técnica Status Pill */}
                  <div className="mt-2.5">
                    {hasFicha ? (
                      <div
                        onClick={() => openPerfil(item, 'ficha')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-medium cursor-pointer hover:bg-emerald-500/20 transition-colors w-full"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                        <span className="truncate">Ficha Técnica en PDF Guardada</span>
                      </div>
                    ) : (
                      <div
                        onClick={() => openPerfil(item, 'editFicha')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-[11px] font-medium cursor-pointer hover:bg-amber-500/20 transition-colors w-full"
                      >
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                        <span className="truncate">Ficha Técnica pendiente de llenar</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="pt-4 mt-3 border-t border-border/60 flex items-center justify-between gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 h-9 rounded-xl font-semibold text-xs shadow-sm"
                    onClick={() => openPerfil(item, 'datos')}
                  >
                    <User className="w-3.5 h-3.5 mr-1.5" /> Ver Perfil
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-2.5 rounded-xl text-xs"
                    onClick={() => openPerfil(item, 'ficha')}
                    title="Ver Ficha Técnica en PDF"
                  >
                    <IdCard className="w-4 h-4 text-primary" />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-2.5 rounded-xl text-xs"
                    onClick={() => descargarFichaPdf(item.id, item.numero_elemento)}
                    title="Descargar Ficha Técnica en PDF"
                  >
                    <Download className="w-4 h-4" />
                  </Button>

                  {isEditor && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 px-2.5 rounded-xl text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => startEdit(item)}
                      title="Editar Datos Generales"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ================= TABLE VIEW ================= */
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Nombre del Guardia</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Fecha Alta</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Ficha Técnica</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((item: any) => {
                const hasFicha = !!item.ficha_tecnica_json;
                return (
                  <TableRow key={item.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono font-bold text-primary">
                      {item.numero_elemento}
                    </TableCell>
                    <TableCell>
                      <div
                        onClick={() => openPerfil(item, 'datos')}
                        className="font-medium text-foreground hover:text-primary cursor-pointer transition-colors"
                      >
                        {item.nombre}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground flex flex-col gap-0.5">
                        {item.telefono && <span>📞 {item.telefono}</span>}
                        {item.direccion && <span className="truncate max-w-[200px]" title={item.direccion}>📍 {item.direccion}</span>}
                        {!item.telefono && !item.direccion && <span className="italic">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{fmtDate(item.fecha_alta)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={item.estado === 'Activo' ? 'success' : item.estado === 'En Baja' || item.estado === 'Baja Pendiente' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {item.estado}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {hasFicha ? (
                        <span className="inline-flex items-center text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> PDF Listo
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs text-amber-600 dark:text-amber-400">
                          <AlertCircle className="w-3.5 h-3.5 mr-1" /> Pendiente
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-8 rounded-lg text-xs"
                          onClick={() => openPerfil(item, 'datos')}
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" /> Perfil
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-lg text-xs text-primary font-medium"
                          onClick={() => openPerfil(item, 'ficha')}
                          title="Ficha Técnica en PDF"
                        >
                          <IdCard className="w-3.5 h-3.5 mr-1" /> Ficha
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-lg text-muted-foreground"
                          onClick={() => descargarFichaPdf(item.id, item.numero_elemento)}
                          title="Descargar PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                        {isEditor && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-lg text-muted-foreground"
                            onClick={() => startEdit(item)}
                            title="Editar Datos"
                          >
                            <Edit className="w-3.5 h-3.5" />
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



      {/* ================= MODAL REGISTRAR NUEVO GUARDIA ================= */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="rounded-2xl max-w-lg">
          <form
            onSubmit={e => {
              e.preventDefault();
              createMutation.mutate({
                numero_elemento: numeroElemento,
                nombre,
                fecha_alta: fechaAlta,
                telefono,
                direccion,
              });
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" /> Registrar Nuevo Guardia
              </DialogTitle>
              <DialogDescription>
                Añade los datos iniciales del elemento para habilitar su expediente, dotaciones y ficha técnica.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Número de Elemento</label>
                <Input
                  value={numeroElemento}
                  onChange={e => setNumeroElemento(e.target.value)}
                  placeholder="Ej. ELEM-001"
                  required
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Nombre Completo</label>
                <Input
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  placeholder="Nombre y apellidos del guardia"
                  required
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Fecha de Alta</label>
                <Input
                  type="date"
                  value={fechaAlta}
                  onChange={e => setFechaAlta(e.target.value)}
                  required
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Teléfono de Contacto</label>
                <Input
                  value={telefono}
                  onChange={e => setTelefono(e.target.value)}
                  placeholder="Ej. 5512345678"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Dirección de Domicilio</label>
                <Input
                  value={direccion}
                  onChange={e => setDireccion(e.target.value)}
                  placeholder="Calle, Número, Colonia, Alcaldía o Municipio"
                  className="rounded-xl"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="rounded-xl font-bold">
                {createMutation.isPending ? 'Guardando...' : 'Guardar Guardia'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================= MODAL EDITAR DATOS DEL GUARDIA ================= */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="rounded-2xl max-w-lg">
          <form
            onSubmit={e => {
              e.preventDefault();
              if (selectedGuardia) {
                editMutation.mutate({
                  id: selectedGuardia.id,
                  numero_elemento: editNumeroElemento,
                  nombre: editNombre,
                  fecha_alta: editFechaAlta,
                  telefono: editTelefono,
                  direccion: editDireccion,
                  estado: editEstado,
                });
              }
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-primary" /> Editar Datos del Guardia
              </DialogTitle>
              <DialogDescription>
                Modifica los datos operativos y de contacto directo de <b>{selectedGuardia?.nombre}</b>.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Número de Elemento</label>
                <Input
                  value={editNumeroElemento}
                  onChange={e => setEditNumeroElemento(e.target.value)}
                  required
                  className="rounded-xl font-mono font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Nombre Completo</label>
                <Input
                  value={editNombre}
                  onChange={e => setEditNombre(e.target.value)}
                  required
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Fecha de Alta</label>
                <Input
                  type="date"
                  value={editFechaAlta}
                  onChange={e => setEditFechaAlta(e.target.value)}
                  required
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Teléfono de Contacto</label>
                <Input
                  value={editTelefono}
                  onChange={e => setEditTelefono(e.target.value)}
                  placeholder="Ej. 5512345678"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Dirección de Domicilio</label>
                <Input
                  value={editDireccion}
                  onChange={e => setEditDireccion(e.target.value)}
                  placeholder="Calle, Número, Colonia, Alcaldía o Municipio"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Estado Operativo</label>
                <select
                  value={editEstado}
                  onChange={e => setEditEstado(e.target.value)}
                  className="flex h-10 w-full rounded-xl border border-input bg-card px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
                >
                  <option value="Activo">Activo</option>
                  <option value="Baja Pendiente">Baja Pendiente</option>
                  <option value="En Baja">En Baja</option>
                </select>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button type="submit" disabled={editMutation.isPending} className="rounded-xl font-bold">
                {editMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================= MODAL PROCESAR BAJA ================= */}
      <Dialog open={isBajaModalOpen} onOpenChange={setIsBajaModalOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <form
            onSubmit={e => {
              e.preventDefault();
              if (selectedGuardia) {
                bajaMutation.mutate({ id: selectedGuardia.id, fecha: fechaBaja });
              }
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <LogOut className="w-5 h-5" /> Iniciar Proceso de Baja
              </DialogTitle>
              <DialogDescription>
                Para el elemento <b>{selectedGuardia?.nombre}</b> (#{selectedGuardia?.numero_elemento}).
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl text-xs leading-relaxed">
                El guardia cambiará a estado <b>Baja Pendiente</b> para permitir la devolución del equipo y uniformes en posesión en el módulo de Bajas.
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Fecha Efectiva de Baja</label>
                <Input
                  type="date"
                  value={fechaBaja}
                  onChange={e => setFechaBaja(e.target.value)}
                  required
                  className="rounded-xl"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setIsBajaModalOpen(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={bajaMutation.isPending}
                className="rounded-xl font-bold"
              >
                {bajaMutation.isPending ? 'Procesando...' : 'Confirmar Baja'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
