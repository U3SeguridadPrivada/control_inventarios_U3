'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Textarea } from '@/src/components/ui/textarea';
import { Select } from '@/src/components/ui/select';
import { Badge } from '@/src/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import {
  Mail, MessageCircle, Phone, StickyNote, Building2, MapPin, Globe, Users2, Send,
  History, AlertTriangle, ExternalLink, ArrowLeft, FileSpreadsheet, Download, Plus,
  Edit2, Clock, Calendar, Sparkles, CheckCircle2, ShieldCheck, UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';
import {
  ETAPAS, COLOR_ETAPA, COLOR_PRIORIDAD, MOTIVOS_PERDIDA, TIPOS_ACTIVIDAD,
  PLANTILLAS_CORREO, PLANTILLAS_WHATSAPP, telefonoWhatsApp, type Etapa,
} from '@/src/lib/pipeline';
import { buildCotizacionHtml, type CotizacionItemDraft } from '@/src/lib/cotizacionTemplate';
import { generarPdfConFallback } from '@/src/lib/generatePdfBlob';
import DocumentViewerModal from '@/src/components/DocumentViewerModal';
import CotizacionEditor, { type CotizacionFormState } from '@/src/components/apps/CotizacionEditor';
import { fmtDate, cn } from '@/src/lib/utils';

interface Prospecto {
  id: number; nombre: string; tipo: string; empresa: string | null;
  email: string | null; telefono: string | null; direccion: string | null; notas: string | null;
  etapa: string; asignado_a: number | null; ultimo_contacto: string | null;
  proximo_seguimiento: string | null; motivo_perdida: string | null;
  origen: string | null; id_denue: string | null; giro: string | null; codigo_scian: string | null;
  tamano: string | null; prioridad: string | null; puntaje: number | null; sitio_web: string | null;
  colonia: string | null; cp: string | null; alcaldia: string | null;
  latitud: string | null; longitud: string | null; lote: string | null;
}

interface Actividad {
  id: number; tipo: string; asunto: string | null; mensaje: string | null;
  estado: string; detalle_error: string | null; created_at: string; usuario: string | null;
}

interface Cotizacion {
  id: number; folio: string; cliente_id: number; fecha: string;
  items: CotizacionItemDraft[]; subtotal: number; iva: number; total: number;
  estado: string; notas: string | null;
  solicitante: string | null; atencion: string | null; servicio_cotizado: string | null;
  ubicacion: string | null; periodicidad: string | null; vigencia_dias: number | null;
  asesor_nombre: string | null; asesor_puesto: string | null;
}

const ICONO_ACTIVIDAD: Record<string, typeof Mail> = {
  correo: Mail, whatsapp: MessageCircle, llamada: Phone,
  nota: StickyNote, etapa: History, asignacion: Users2,
};

const ITEM_VACIO: CotizacionItemDraft = { descripcion: '', unidad: 'Puesto', cantidad: 1, precio_unitario: 0 };
const fmtMoney = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ESTADO_BADGE: Record<string, 'default' | 'secondary' | 'success' | 'destructive'> = {
  Borrador: 'secondary', Enviada: 'default', Aceptada: 'success', Rechazada: 'destructive',
};

function fechaHora(iso: string | null): string {
  if (!iso) return 'Sin contacto';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ProspectoPerfil({ id }: { id: number }) {
  const router = useRouter();
  const { user, isEditor, isAdmin, puedeVer } = useAuth();
  const puedeVerClientes = puedeVer('clientes');
  const queryClient = useQueryClient();

  const [canal, setCanal] = useState<'correo' | 'whatsapp' | null>(null);
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [nota, setNota] = useState('');
  const [cotizando, setCotizando] = useState(false);
  const [form, setForm] = useState<CotizacionFormState | null>(null);
  const [items, setItems] = useState<CotizacionItemDraft[]>([{ ...ITEM_VACIO }]);
  const [generando, setGenerando] = useState(false);
  const [viewer, setViewer] = useState<{ url: string; downloadName: string; viaFallback: boolean } | null>(null);
  const [modalEditar, setModalEditar] = useState(false);

  // Formulario para editar datos del cliente
  const [editForm, setEditForm] = useState({
    nombre: '', empresa: '', telefono: '', email: '', sitio_web: '', direccion: '', notas: '',
  });

  const { data: p, isLoading } = useQuery({
    queryKey: ['prospecto', id],
    queryFn: () => apiFetch<Prospecto>(`/api/clientes/${id}`),
    enabled: puedeVerClientes,
  });

  const { data: actividades = [] } = useQuery({
    queryKey: ['prospecto-actividades', id],
    queryFn: () => apiFetch<Actividad[]>(`/api/clientes/${id}/actividades`),
    enabled: puedeVerClientes,
  });

  const { data: cotizaciones = [] } = useQuery({
    queryKey: ['prospecto-cotizaciones', id],
    queryFn: () => apiFetch<Cotizacion[]>(`/api/clientes/${id}/cotizaciones`),
    enabled: puedeVerClientes,
  });

  const { data: asesores = [] } = useQuery({
    queryKey: ['asesores'],
    queryFn: () => apiFetch<{ id: number; username: string }[]>('/api/clientes/asesores'),
    enabled: puedeVerClientes,
  });

  // Inicializar formulario de edición cuando cargue p
  useEffect(() => {
    if (p) {
      setEditForm({
        nombre: p.nombre || '',
        empresa: p.empresa || '',
        telefono: p.telefono || '',
        email: p.email || '',
        sitio_web: p.sitio_web || '',
        direccion: p.direccion || '',
        notas: p.notas || '',
      });
    }
  }, [p]);

  const datosPlantilla = useMemo(() => ({
    empresa: p?.empresa || p?.nombre || '',
    giro: p?.giro,
    alcaldia: p?.alcaldia,
    asesor: user?.username || '',
  }), [p, user]);

  useEffect(() => {
    if (canal === 'correo') {
      const t = PLANTILLAS_CORREO[0];
      setAsunto(t.asunto(datosPlantilla));
      setCuerpo(t.cuerpo(datosPlantilla));
    } else if (canal === 'whatsapp') {
      setCuerpo(PLANTILLAS_WHATSAPP[0].cuerpo(datosPlantilla));
    }
  }, [canal, datosPlantilla]);

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['prospecto', id] });
    queryClient.invalidateQueries({ queryKey: ['prospecto-actividades', id] });
    queryClient.invalidateQueries({ queryKey: ['clientes'] });
    queryClient.invalidateQueries({ queryKey: ['tanda-stats'] });
  };

  const actualizar = useMutation({
    mutationFn: (cambios: Partial<Prospecto>) => apiFetch(`/api/clientes/${id}`, { method: 'PUT', body: JSON.stringify(cambios) }),
    onSuccess: () => { refrescar(); toast.success('Perfil actualizado'); setModalEditar(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const enviar = useMutation({
    mutationFn: () => apiFetch(`/api/clientes/${id}/contacto`, {
      method: 'POST', body: JSON.stringify({ canal, asunto, mensaje: cuerpo }),
    }),
    onSuccess: () => {
      refrescar();
      toast.success(canal === 'correo' ? 'Correo enviado' : 'WhatsApp enviado');
      setCanal(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const registrar = useMutation({
    mutationFn: (tipo: 'llamada' | 'nota') => apiFetch(`/api/clientes/${id}/actividades`, {
      method: 'POST', body: JSON.stringify({ tipo, mensaje: nota }),
    }),
    onSuccess: () => { refrescar(); setNota(''); toast.success('Registrado en la bitácora'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const guardarCotizacion = useMutation({
    mutationFn: (payload: unknown) => apiFetch('/api/cotizaciones', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecto-cotizaciones', id] });
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      if (p && p.etapa !== 'Cotizado' && p.etapa !== 'Ganado') actualizar.mutate({ etapa: 'Cotizado' });
      toast.success('Cotización guardada en el perfil');
      setCotizando(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!puedeVerClientes) return <div className="p-4 text-muted-foreground">No tiene permiso para ver esta sección.</div>;
  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Cargando perfil...</div>;
  if (!p) return <div className="p-8 text-center text-muted-foreground">No se encontró el prospecto.</div>;

  const telefonoValido = Boolean(telefonoWhatsApp(p.telefono));
  const rawDigits = (p.telefono || '').replace(/\D/g, '');
  const waExternalUrl = rawDigits ? `https://wa.me/52${rawDigits.slice(-10)}?text=${encodeURIComponent(`Buen día, le escribo de U3 Seguridad Privada (Permiso SSC CDMX) para presentarle nuestra propuesta de vigilancia intramuros para ${p.empresa || p.nombre}...`)}` : null;

  const abrirCotizador = () => {
    setForm({
      clienteId: String(p.id),
      fecha: new Date().toISOString().split('T')[0],
      solicitante: p.empresa || p.nombre,
      atencion: 'A QUIEN CORRESPONDA',
      servicioCotizado: 'SERVICIO DE SEGURIDAD Y VIGILANCIA',
      ubicacion: [p.alcaldia, 'Ciudad de México'].filter(Boolean).join(', '),
      periodicidad: 'Quincenal',
      vigenciaDias: '30',
      asesorNombre: user?.username ? user.username.toUpperCase() : '',
      asesorPuesto: 'Asesor Comercial',
      notas: '',
    });
    setItems([{ ...ITEM_VACIO }]);
    setCotizando(true);
  };

  const draftPayload = () => ({
    cliente_id: p.id,
    fecha: form!.fecha,
    items: items.filter((it) => it.descripcion),
    notas: form!.notas || null,
    solicitante: form!.solicitante,
    atencion: form!.atencion,
    servicio_cotizado: form!.servicioCotizado,
    ubicacion: form!.ubicacion || null,
    periodicidad: form!.periodicidad,
    vigencia_dias: Number(form!.vigenciaDias) || 30,
    asesor_nombre: form!.asesorNombre,
    asesor_puesto: form!.asesorPuesto,
  });

  const verPdf = async (cot: Cotizacion) => {
    const token = localStorage.getItem('inv_token');
    const respaldo = buildCotizacionHtml({
      folio: cot.folio, fecha: cot.fecha, clienteNombre: p.nombre,
      solicitante: cot.solicitante ?? '', atencion: cot.atencion ?? '',
      servicio_cotizado: cot.servicio_cotizado ?? '', ubicacion: cot.ubicacion ?? '',
      periodicidad: cot.periodicidad ?? 'Quincenal', items: cot.items,
      vigencia_dias: cot.vigencia_dias ?? 30, asesor_nombre: cot.asesor_nombre ?? '',
      asesor_puesto: cot.asesor_puesto ?? 'Asesor Comercial', notas: cot.notas, estado: cot.estado,
    }, '/LOGO_PDFS.png');
    try {
      const { blob, viaFallback } = await generarPdfConFallback(
        () => fetch(`/api/cotizaciones/${cot.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } }),
        respaldo
      );
      setViewer({ url: URL.createObjectURL(blob), downloadName: `${cot.folio}.pdf`, viaFallback });
    } catch {
      toast.error('No se pudo generar el PDF');
    }
  };

  // --- Cotizador a pantalla completa dentro del perfil ---
  if (cotizando && form) {
    return (
      <>
        <CotizacionEditor
          clientes={[{ id: p.id, nombre: p.nombre, empresa: p.empresa }]}
          form={form}
          setForm={setForm as React.Dispatch<React.SetStateAction<CotizacionFormState>>}
          items={items}
          setItems={setItems}
          onVolver={() => setCotizando(false)}
          onGuardar={() => {
            if (!items.some((it) => it.descripcion)) { toast.error('Agrega al menos una partida'); return; }
            guardarCotizacion.mutate(draftPayload());
          }}
          onGenerarPdf={async () => {
            if (!items.some((it) => it.descripcion)) { toast.error('Agrega al menos una partida'); return; }
            setGenerando(true);
            try {
              const token = localStorage.getItem('inv_token');
              const respaldo = buildCotizacionHtml({
                folio: 'BORRADOR', fecha: form.fecha, clienteNombre: p.nombre,
                solicitante: form.solicitante, atencion: form.atencion,
                servicio_cotizado: form.servicioCotizado, ubicacion: form.ubicacion,
                periodicidad: form.periodicidad, items: items.filter((it) => it.descripcion),
                vigencia_dias: Number(form.vigenciaDias) || 30, asesor_nombre: form.asesorNombre,
                asesor_puesto: form.asesorPuesto, notas: form.notas, estado: 'Borrador',
              }, '/LOGO_PDFS.png');
              const { blob, viaFallback } = await generarPdfConFallback(
                () => fetch('/api/cotizaciones/pdf-vista-previa', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ ...draftPayload(), folio: 'BORRADOR', cliente_nombre: p.nombre }),
                }),
                respaldo
              );
              setViewer({ url: URL.createObjectURL(blob), downloadName: `cotizacion-borrador-${p.nombre}.pdf`, viaFallback });
            } catch {
              toast.error('No se pudo generar la vista previa');
            } finally {
              setGenerando(false);
            }
          }}
          guardando={guardarCotizacion.isPending}
          generando={generando}
        />
        {viewer && (
          <DocumentViewerModal title="Cotización" url={viewer.url} downloadName={viewer.downloadName}
            viaFallback={viewer.viaFallback} borrador
            onClose={() => { URL.revokeObjectURL(viewer.url); setViewer(null); }} />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500 max-w-7xl mx-auto">
      {/* --- Barra Superior de Navegación y Acciones Rápidas --- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border rounded-xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/clientes')} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Volver a mi lista
          </Button>
          <span className="text-muted-foreground/40">|</span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              ID #{p.id}
            </Badge>
            {p.lote && (
              <Badge variant="secondary" className="text-xs font-medium">
                Padrón CDMX · {p.lote}
              </Badge>
            )}
          </div>
        </div>

        {/* Acciones Comerciales Primarias */}
        <div className="flex flex-wrap items-center gap-2">
          {isEditor && (
            <>
              <Button size="sm" variant="outline" onClick={() => setModalEditar(true)}>
                <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Editar datos
              </Button>
              <Button
                size="sm"
                onClick={abrirCotizador}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> Cotizar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* --- GRID PRINCIPAL (2 COLUMNAS CRM) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* === COLUMNA IZQUIERDA: FICHA Y GESTIÓN DEL CLIENTE (4 columnas de 12) === */}
        <div className="lg:col-span-5 space-y-4">
          {/* Tarjeta de Identidad y Contacto */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {p.prioridad && (
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${COLOR_PRIORIDAD[p.prioridad] || ''}`}>
                    Prioridad {p.prioridad}
                  </span>
                )}
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${COLOR_ETAPA[p.etapa as Etapa] || ''}`}>
                  {p.etapa}
                </span>
                {p.puntaje != null && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground font-mono ml-auto">
                    Puntos: {p.puntaje}
                  </span>
                )}
              </div>

              <h1 className="text-xl font-bold tracking-tight text-foreground leading-snug">{p.nombre}</h1>
              {p.empresa && p.empresa !== p.nombre && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 font-medium">
                  <Building2 className="w-3.5 h-3.5 text-primary shrink-0" /> {p.empresa}
                </p>
              )}
            </div>

            {/* Giro y Tamaño */}
            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                <span>{p.giro || 'Giro comercial no especificado'}</span>
              </div>
              <div className="text-muted-foreground pl-5.5">
                {p.tamano ? `Personal estimado: ${p.tamano}` : 'Tamaño no registrado'}
                {p.alcaldia ? ` · ${p.alcaldia}` : ''}
              </div>
            </div>

            {/* Datos de Contacto con Acciones Inmediatas */}
            <div className="space-y-2.5 pt-1 text-sm border-t border-border">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-1">Canales Directos</div>
              
              {/* Teléfono / WhatsApp */}
              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2 min-w-0">
                  <Phone className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="font-medium text-xs break-all">
                    {p.telefono || <span className="text-muted-foreground italic">Sin teléfono registrado</span>}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.telefono && (
                    <a
                      href={`tel:${p.telefono}`}
                      title="Llamar"
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {waExternalUrl && (
                    <a
                      href={waExternalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir WhatsApp directo"
                      className="inline-flex items-center gap-1 bg-emerald-500 text-white text-[11px] font-semibold px-2 py-1 rounded-md hover:bg-emerald-600 transition-colors"
                    >
                      <MessageCircle className="w-3 h-3" /> WhatsApp
                    </a>
                  )}
                  {!p.telefono && isEditor && (
                    <Button variant="ghost" size="sm" onClick={() => setModalEditar(true)} className="text-xs h-7 text-primary">
                      + Agregar
                    </Button>
                  )}
                </div>
              </div>

              {/* Correo Electrónico */}
              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2 min-w-0">
                  <Mail className="w-4 h-4 text-sky-500 shrink-0" />
                  <span className="font-medium text-xs break-all">
                    {p.email || <span className="text-muted-foreground italic">Sin correo registrado</span>}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.email && isEditor && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCanal('correo')}
                      className="text-xs h-7 gap-1 border-sky-500/40 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10"
                    >
                      <Mail className="w-3 h-3" /> Redactar
                    </Button>
                  )}
                  {!p.email && isEditor && (
                    <Button variant="ghost" size="sm" onClick={() => setModalEditar(true)} className="text-xs h-7 text-primary">
                      + Agregar
                    </Button>
                  )}
                </div>
              </div>

              {/* Sitio Web */}
              {p.sitio_web && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 text-xs">
                  <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a
                    href={`https://${p.sitio_web.replace(/^https?:\/\//i, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline truncate"
                  >
                    {p.sitio_web}
                  </a>
                  <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 ml-auto opacity-50" />
                </div>
              )}

              {/* Domicilio / Ubicación en CDMX */}
              <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/20 text-xs">
                <MapPin className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-foreground leading-relaxed">{p.direccion || 'Domicilio no registrado'}</div>
                  {p.alcaldia && <div className="text-muted-foreground font-medium mt-0.5">Alcaldía: {p.alcaldia}</div>}
                  {p.latitud && (
                    <a
                      href={`https://www.google.com/maps?q=${p.latitud},${p.longitud}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline mt-1 font-medium"
                    >
                      Ver en Google Maps <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Notas internas del cliente */}
            {p.notas && !p.notas.includes('Importado') && !p.notas.toLowerCase().includes('denue') && (
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 text-xs space-y-1">
                <div className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <StickyNote className="w-3.5 h-3.5" /> Observaciones
                </div>
                <p className="text-foreground/80 whitespace-pre-wrap">{p.notas}</p>
              </div>
            )}
          </div>

          {/* Tarjeta de Control Comercial (Etapa, Asesor, Próximo Seguimiento) */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3.5">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-primary" /> Control y Seguimiento
            </h3>

            <div className="space-y-3">
              <label className="space-y-1 block">
                <span className="text-xs font-medium text-muted-foreground">Etapa en el Embudo</span>
                <Select value={p.etapa} disabled={!isEditor} onChange={(e) => actualizar.mutate({ etapa: e.target.value })}>
                  {ETAPAS.map((et) => <option key={et} value={et}>{et}</option>)}
                </Select>
              </label>

              <label className="space-y-1 block">
                <span className="text-xs font-medium text-muted-foreground">Asesor Comercial Asignado</span>
                <Select
                  value={p.asignado_a ?? ''}
                  disabled={!isEditor}
                  onChange={(e) => actualizar.mutate({ asignado_a: e.target.value ? Number(e.target.value) : null } as Partial<Prospecto>)}
                >
                  <option value="">Sin asignar (Banco común)</option>
                  {asesores.map((a) => <option key={a.id} value={a.id}>{a.username}</option>)}
                </Select>
              </label>

              <label className="space-y-1 block">
                <span className="text-xs font-medium text-muted-foreground">Fecha de Próximo Seguimiento</span>
                <Input
                  type="date"
                  defaultValue={p.proximo_seguimiento ?? ''}
                  disabled={!isEditor}
                  onBlur={(e) => {
                    if (e.target.value !== (p.proximo_seguimiento ?? '')) {
                      actualizar.mutate({ proximo_seguimiento: e.target.value || null });
                    }
                  }}
                />
              </label>

              {p.etapa === 'Perdido' && (
                <label className="space-y-1 block">
                  <span className="text-xs font-medium text-destructive">Motivo de Pérdida</span>
                  <Select
                    value={p.motivo_perdida ?? ''}
                    disabled={!isEditor}
                    onChange={(e) => actualizar.mutate({ motivo_perdida: e.target.value || null })}
                  >
                    <option value="">Sin especificar</option>
                    {MOTIVOS_PERDIDA.map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </label>
              )}
            </div>

            <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>Último contacto:</span>
              <span className="font-medium text-foreground">{fechaHora(p.ultimo_contacto)}</span>
            </div>
          </div>
        </div>

        {/* === COLUMNA DERECHA: ACCIONES, COTIZACIONES Y BITÁCORA (7 columnas de 12) === */}
        <div className="lg:col-span-7 space-y-4">
          {/* Panel de Botones de Envío / Comunicación */}
          {isEditor && !canal && (
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Acciones Inmediatas</h3>
                <p className="text-xs text-muted-foreground">Contacta al cliente o genera su propuesta formal en un clic.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!telefonoValido}
                  onClick={() => setCanal('whatsapp')}
                  className={cn(
                    'gap-1.5 font-medium',
                    telefonoValido ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10' : 'opacity-50'
                  )}
                >
                  <MessageCircle className="w-4 h-4 text-emerald-500" /> Enviar WhatsApp
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!p.email}
                  onClick={() => setCanal('correo')}
                  className={cn(
                    'gap-1.5 font-medium',
                    p.email ? 'border-sky-500/40 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10' : 'opacity-50'
                  )}
                >
                  <Mail className="w-4 h-4 text-sky-500" /> Enviar Correo
                </Button>
                <Button
                  size="sm"
                  onClick={abrirCotizador}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                >
                  <Plus className="w-4 h-4 mr-1" /> Nueva Cotización
                </Button>
              </div>
            </div>
          )}

          {/* Panel de Redacción y Envío (WhatsApp / Correo) */}
          {canal && (
            <div className="rounded-xl border border-primary/40 bg-card p-5 shadow-md space-y-3.5 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between gap-2 flex-wrap border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  {canal === 'correo' ? (
                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center">
                      <Mail className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                      <MessageCircle className="w-4 h-4" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-semibold">
                      {canal === 'correo' ? `Redactar correo a ${p.email}` : `Enviar WhatsApp a ${p.telefono}`}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {canal === 'correo' ? 'Sale con el membrete oficial y credenciales de la SSC CDMX' : 'Envío directo por la API oficial conectada'}
                    </p>
                  </div>
                </div>

                {/* Selector de Plantilla Oficial */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-medium">Plantilla:</span>
                  <Select
                    className="w-auto text-xs font-medium"
                    onChange={(e) => {
                      if (canal === 'correo') {
                        const t = PLANTILLAS_CORREO.find((x) => x.id === e.target.value);
                        if (t) { setAsunto(t.asunto(datosPlantilla)); setCuerpo(t.cuerpo(datosPlantilla)); }
                      } else {
                        const t = PLANTILLAS_WHATSAPP.find((x) => x.id === e.target.value);
                        if (t) setCuerpo(t.cuerpo(datosPlantilla));
                      }
                    }}
                  >
                    {(canal === 'correo' ? PLANTILLAS_CORREO : PLANTILLAS_WHATSAPP).map((t) => (
                      <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                  </Select>
                </div>
              </div>

              {canal === 'correo' && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Asunto del Correo</label>
                  <Input value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="Asunto..." />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Cuerpo del Mensaje</label>
                <Textarea
                  value={cuerpo}
                  onChange={(e) => setCuerpo(e.target.value)}
                  rows={canal === 'correo' ? 10 : 7}
                  className="font-mono text-xs leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-[11px] text-muted-foreground">
                  {canal === 'correo'
                    ? 'Al enviar, la etapa pasará automáticamente a "Contactado" y se registrará en la bitácora.'
                    : 'Las respuestas del cliente llegarán a la bandeja de WhatsApp del sistema.'}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCanal(null)}>Cancelar</Button>
                  <Button
                    size="sm"
                    onClick={() => enviar.mutate()}
                    disabled={enviar.isPending || !cuerpo.trim()}
                    className="bg-primary text-primary-foreground"
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" /> {enviar.isPending ? 'Enviando...' : 'Enviar Ahora'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Tarjeta de Cotizaciones Formales */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Cotizaciones Formales ({cotizaciones.length})</h3>
              </div>
              {isEditor && (
                <Button variant="outline" size="sm" onClick={abrirCotizador} className="h-8 text-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Nueva Cotización
                </Button>
              )}
            </div>

            {cotizaciones.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-xs space-y-1">
                <FileSpreadsheet className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="font-medium text-foreground">Aún no se ha emitido ninguna cotización</p>
                <p>Genera una propuesta formal con los puestos de vigilancia y precios requeridos.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Folio</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="w-16 text-right">PDF</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cotizaciones.map((cot) => (
                      <TableRow key={cot.id} className="hover:bg-muted/40">
                        <TableCell className="font-mono text-xs font-semibold">{cot.folio}</TableCell>
                        <TableCell className="text-xs">{fmtDate(cot.fecha)}</TableCell>
                        <TableCell className="text-right font-semibold text-xs tabular-nums text-foreground">{fmtMoney(cot.total)}</TableCell>
                        <TableCell>
                          <Badge variant={ESTADO_BADGE[cot.estado] ?? 'secondary'} className="text-[10px]">
                            {cot.estado}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Descargar o Ver PDF"
                            className="h-7 w-7 p-0"
                            onClick={() => verPdf(cot)}
                          >
                            <Download className="w-3.5 h-3.5 text-primary" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Tarjeta de Bitácora y Avances */}
          <div className="rounded-xl border border-border bg-card shadow-sm p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <History className="w-4 h-4 text-primary" /> Bitácora de Movimientos y Contactos
              </h3>
              <span className="text-xs text-muted-foreground">{actividades.length} registros</span>
            </div>

            {/* Registro Rápido de Llamada o Nota */}
            {isEditor && (
              <div className="flex flex-col sm:flex-row gap-2 bg-muted/30 p-2.5 rounded-lg border border-border/60">
                <Input
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Anotar resultado de llamada, reunión o nota interna..."
                  className="bg-background text-xs"
                />
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!nota.trim() || registrar.isPending}
                    onClick={() => registrar.mutate('llamada')}
                    className="text-xs h-9 gap-1"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-500" /> Llamada
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!nota.trim() || registrar.isPending}
                    onClick={() => registrar.mutate('nota')}
                    className="text-xs h-9 gap-1"
                  >
                    <StickyNote className="w-3.5 h-3.5 text-amber-500" /> Nota
                  </Button>
                </div>
              </div>
            )}

            {/* Timeline de Actividades */}
            <div className="space-y-3 pt-1">
              {actividades.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No hay movimientos registrados todavía.</p>
              ) : (
                actividades.map((a) => {
                  const Icono = ICONO_ACTIVIDAD[a.tipo] || StickyNote;
                  const esError = a.estado === 'error';
                  return (
                    <div key={a.id} className="flex gap-3 text-xs border-b border-border/50 pb-3 last:border-0 last:pb-0">
                      <div className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                        esError ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                      )}>
                        <Icono className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">
                            {TIPOS_ACTIVIDAD[a.tipo] || a.tipo}
                            {esError && <span className="text-destructive font-normal"> (Falló)</span>}
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {fechaHora(a.created_at)}
                            {a.usuario ? ` · ${a.usuario}` : ''}
                          </span>
                        </div>
                        {a.asunto && <div className="font-medium text-foreground/90">{a.asunto}</div>}
                        {a.mensaje && <div className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{a.mensaje}</div>}
                        {a.detalle_error && <div className="text-destructive font-mono text-[10px] mt-1">{a.detalle_error}</div>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* --- Modal para Editar Datos de Contacto --- */}
      <Dialog open={modalEditar} onOpenChange={setModalEditar}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-primary" /> Editar Datos del Prospecto
            </DialogTitle>
            <DialogDescription>
              Actualiza el teléfono, correo, razón social o notas para mantener el expediente al día.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2 text-sm">
            <div className="space-y-1">
              <label className="text-xs font-medium">Nombre del Establecimiento</label>
              <Input
                value={editForm.nombre}
                onChange={(e) => setEditForm((f) => ({ ...f, nombre: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Razón Social</label>
              <Input
                value={editForm.empresa}
                onChange={(e) => setEditForm((f) => ({ ...f, empresa: e.target.value }))}
                placeholder="Razón social o corporativo..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Teléfono / WhatsApp (10 dígitos)</label>
                <Input
                  value={editForm.telefono}
                  onChange={(e) => setEditForm((f) => ({ ...f, telefono: e.target.value }))}
                  placeholder="55..."
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Correo Electrónico</label>
                <Input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="contacto@empresa.com"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Sitio Web</label>
              <Input
                value={editForm.sitio_web}
                onChange={(e) => setEditForm((f) => ({ ...f, sitio_web: e.target.value }))}
                placeholder="www.empresa.com"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Dirección en CDMX</label>
              <Input
                value={editForm.direccion}
                onChange={(e) => setEditForm((f) => ({ ...f, direccion: e.target.value }))}
                placeholder="Calle, número, colonia, alcaldía..."
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Notas u Observaciones del Cliente</label>
              <Textarea
                value={editForm.notas}
                onChange={(e) => setEditForm((f) => ({ ...f, notas: e.target.value }))}
                placeholder="Horario de atención, persona clave, requerimientos..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalEditar(false)}>Cancelar</Button>
            <Button
              disabled={actualizar.isPending}
              onClick={() => actualizar.mutate(editForm)}
              className="bg-primary text-primary-foreground"
            >
              {actualizar.isPending ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewer && (
        <DocumentViewerModal
          title="Cotización"
          url={viewer.url}
          downloadName={viewer.downloadName}
          viaFallback={viewer.viaFallback}
          onClose={() => { URL.revokeObjectURL(viewer.url); setViewer(null); }}
        />
      )}
    </div>
  );
}
