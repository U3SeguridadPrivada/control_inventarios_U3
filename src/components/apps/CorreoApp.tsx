'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { useAuth } from '@/src/context/AuthContext';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import RichTextEditor from '@/src/components/RichTextEditor';
import {
  Pencil, Inbox, Send, Trash2, Reply, Globe, Settings, RefreshCw, Paperclip, X, FileText,
  Search, Maximize2, Minimize2, ChevronDown, Menu, ArrowLeft, MailOpen, Mail,
  FolderClosed, AlertOctagon, Eye, EyeOff, CheckCircle2, Download, Bell, BellOff,
  File, FileSpreadsheet, FileImage, FileArchive, FileAudio, FileVideo, FileCode
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import DOMPurify from 'isomorphic-dompurify';
import { usePwaInstall } from '@/src/lib/pwa';
import { getNotificationPermission, requestNotificationPermission, sendDeviceNotification } from '@/src/lib/deviceNotifications';

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtBytes = (n: number) => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;

// Qué archivo llegó: se reconoce por el MIME y, como respaldo, por la extensión
// (hay remitentes que mandan todo como application/octet-stream).
interface ClaseArchivo { icono: LucideIcon; etiqueta: string; color: string }
const CLASES_ARCHIVO: { prueba: RegExp; clase: ClaseArchivo }[] = [
  { prueba: /pdf/, clase: { icono: FileText, etiqueta: 'PDF', color: 'text-red-600 bg-red-50 border-red-200' } },
  { prueba: /wordprocessingml|msword|\.docx?$|\.rtf$|\.odt$/, clase: { icono: FileText, etiqueta: 'Word', color: 'text-blue-700 bg-blue-50 border-blue-200' } },
  { prueba: /spreadsheetml|ms-excel|\.xlsx?$|\.xlsm$|\.csv$|\.ods$/, clase: { icono: FileSpreadsheet, etiqueta: 'Excel', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' } },
  { prueba: /presentationml|ms-powerpoint|\.pptx?$|\.odp$/, clase: { icono: FileImage, etiqueta: 'PowerPoint', color: 'text-orange-600 bg-orange-50 border-orange-200' } },
  { prueba: /^image\/|\.(png|jpe?g|gif|webp|bmp|heic|svg)$/, clase: { icono: FileImage, etiqueta: 'Imagen', color: 'text-violet-600 bg-violet-50 border-violet-200' } },
  { prueba: /zip|rar|7z|x-tar|gzip|compressed/, clase: { icono: FileArchive, etiqueta: 'Comprimido', color: 'text-amber-700 bg-amber-50 border-amber-200' } },
  { prueba: /^audio\//, clase: { icono: FileAudio, etiqueta: 'Audio', color: 'text-pink-600 bg-pink-50 border-pink-200' } },
  { prueba: /^video\//, clase: { icono: FileVideo, etiqueta: 'Video', color: 'text-indigo-600 bg-indigo-50 border-indigo-200' } },
  { prueba: /xml|json|javascript|\.(html?|css|ts|js)$/, clase: { icono: FileCode, etiqueta: 'Código', color: 'text-slate-700 bg-slate-100 border-slate-200' } },
  { prueba: /^text\//, clase: { icono: FileText, etiqueta: 'Texto', color: 'text-slate-700 bg-slate-100 border-slate-200' } },
];
const CLASE_GENERICA: ClaseArchivo = { icono: File, etiqueta: 'Archivo', color: 'text-slate-600 bg-slate-100 border-slate-200' };

function claseArchivo(a: { tipo: string; nombre: string }): ClaseArchivo {
  const pista = `${(a.tipo || '').toLowerCase()} ${(a.nombre || '').toLowerCase()}`;
  return CLASES_ARCHIVO.find((c) => c.prueba.test(pista))?.clase ?? CLASE_GENERICA;
}

// Lo que el navegador puede mostrar sin descargar; el resto se guarda al disco.
const seVisualiza = (a: { tipo: string; nombre: string }) =>
  /pdf$/.test(a.tipo) || /\.pdf$/i.test(a.nombre) || a.tipo.startsWith('image/') || a.tipo.startsWith('text/');

interface CorreoExterno { uid: number; asunto: string; de: string; deCorreo: string; fecha: string | null; leido: boolean }
interface PaginaCorreos { mensajes: CorreoExterno[]; total: number; offset: number; nextOffset: number; hasMore: boolean }
interface AdjuntoCorreo { parte: string; nombre: string; tipo: string; tamano: number }
interface CorreoExternoDetalle { uid: number; asunto: string; de: string; fecha: string | null; html: string | null; texto: string; adjuntos: AdjuntoCorreo[] }
interface PerfilCorreo {
  firma: { nombre: string; puesto: string; telefono: string; correo: string };
  correo_imap_host: string; correo_imap_puerto: number;
  correo_smtp_host: string; correo_smtp_puerto: number;
  correo_ssl: boolean; correo_usuario: string; tiene_password: boolean; buzon_configurado: boolean;
}
interface ImapFolder {
  path: string;
  name: string;
  delimiter: string | null;
  specialUse: string | null;
  flags: string[];
}

// Cuántos correos se piden por página al servidor IMAP.
const PAGINA = 50;

function fmtFecha(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) {
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function FirmaPreview({ firma }: { firma: { nombre: string; puesto: string; telefono: string; correo: string } }) {
  return (
    <div className="border-l-[3px] pl-4 py-0.5" style={{ borderColor: '#1e3a5f' }}>
      <p className="text-[15px] font-bold text-slate-900 m-0 leading-tight">{firma.nombre || 'Tu nombre'}</p>
      {firma.puesto && <p className="text-xs font-medium text-slate-500 mt-0.5 m-0">{firma.puesto}</p>}
      <p className="text-[11px] font-bold mt-1.5 mb-1 uppercase tracking-wider" style={{ color: '#1e3a5f' }}>U3 SEGURIDAD PRIVADA, S.A. DE C.V.</p>
      {firma.telefono && <p className="text-xs text-slate-600 m-0 leading-normal"><span className="text-slate-400 font-semibold mr-1">T.</span>{firma.telefono}</p>}
      {firma.correo && <p className="text-xs text-slate-600 m-0 leading-normal"><span className="text-slate-400 font-semibold mr-1">E.</span><span className="text-[#1e3a5f]">{firma.correo}</span></p>}
    </div>
  );
}

export default function CorreoApp() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { canInstall, installed, triggerInstall } = usePwaInstall();
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    setNotifPermission(getNotificationPermission());
  }, []);

  const handleToggleNotifications = async () => {
    const perm = await requestNotificationPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      toast.success('Notificaciones activadas en el dispositivo');
      sendDeviceNotification('Notificaciones U3 Activadas', { body: 'Recibirás avisos de nuevos correos.' });
    }
  };

  // Estados de vista
  const [imapFolder, setImapFolder] = useState<string>('INBOX');
  const [selectedExterno, setSelectedExterno] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  // En movil la columna de carpetas se muestra como cajon lateral.
  const [carpetasOpen, setCarpetasOpen] = useState(false);
  // Elegir carpeta cierra el cajon; en escritorio no hay cajon que cerrar.
  useEffect(() => setCarpetasOpen(false), [imapFolder]);

  // Control del Compose Flotante
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMinimized, setComposeMinimized] = useState(false);
  const [composeMaximized, setComposeMaximized] = useState(false);
  const [composeForm, setComposeForm] = useState({ para: '', cc: '', bcc: '', asunto: '', cuerpo: '' });
  const [mostrarCc, setMostrarCc] = useState(false);
  const [mostrarBcc, setMostrarBcc] = useState(false);
  const [adjuntos, setAdjuntos] = useState<File[]>([]);

  // Configuración del perfil de correo
  const [perfilOpen, setPerfilOpen] = useState(false);

  // Vista previa del correo completo (logo + cuerpo + firma + footer)
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const abrirVistaPrevia = async () => {
    if (!stripHtml(composeForm.cuerpo)) { toast.error('Escribe el mensaje para previsualizar'); return; }
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('inv_token') : null;
      const res = await fetch('/api/correo/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ cuerpo: composeForm.cuerpo, es_html: true, conFirma: true }),
      });
      if (!res.ok) throw new Error('No se pudo generar la vista previa');
      setPreviewHtml(await res.text());
    } catch (e) {
      toast.error((e as Error).message);
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const COMPOSE_VACIO = { para: '', cc: '', bcc: '', asunto: '', cuerpo: '' };

  const abrirCompose = (form: typeof composeForm) => {
    setComposeForm(form);
    setAdjuntos([]);
    setMostrarCc(false);
    setMostrarBcc(false);
    setComposeMinimized(false);
    setComposeMaximized(false);
    setComposeOpen(true);
  };

  // Queries
  const { data: perfil } = useQuery({
    queryKey: ['perfil-correo'],
    queryFn: () => apiFetch<PerfilCorreo>('/api/auth/perfil-correo')
  });

  const { data: imapFolders = [], refetch: refetchFolders, isFetching: fetchingFolders, error: errorFolders } = useQuery({
    queryKey: ['correo-externo-folders'],
    queryFn: () => apiFetch<ImapFolder[]>('/api/correo/externo?action=folders'),
    enabled: !!perfil?.buzon_configurado,
    retry: false,
    staleTime: 60_000,
  });

  // La carpeta se recorre por páginas de PAGINA correos, de los más recientes
  // hacia atrás, hasta agotarla. El servidor devuelve el offset de la siguiente
  // página para que no haya huecos ni repetidos si llega correo nuevo entretanto.
  const {
    data: paginasExternos,
    isLoading: loadingExternos,
    error: errorExternos,
    refetch: refetchExternos,
    isFetching: fetchingExternos,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['correo-externo', imapFolder],
    queryFn: ({ pageParam }) => apiFetch<PaginaCorreos>(`/api/correo/externo?folder=${encodeURIComponent(imapFolder)}&offset=${pageParam}&limit=${PAGINA}`),
    initialPageParam: 0,
    getNextPageParam: (ultima) => (ultima.hasMore ? ultima.nextOffset : undefined),
    enabled: !!perfil?.buzon_configurado,
    retry: false,
    staleTime: 30_000,
  });

  const externos = useMemo(() => paginasExternos?.pages.flatMap((p) => p.mensajes) ?? [], [paginasExternos]);
  const totalCarpeta = paginasExternos?.pages[0]?.total ?? 0;

  const { data: externoDetalle, isLoading: loadingDetalle } = useQuery({
    queryKey: ['correo-externo-detalle', selectedExterno, imapFolder],
    queryFn: () => apiFetch<CorreoExternoDetalle>(`/api/correo/externo?uid=${selectedExterno}&folder=${encodeURIComponent(imapFolder)}`),
    enabled: !!selectedExterno,
    staleTime: Infinity,
  });

  // ── Adjuntos del mensaje abierto ──
  // La API va con token en la cabecera, así que un <a href> directo no sirve:
  // se baja el archivo con fetch y se trabaja sobre un blob local.
  const [adjuntoCargando, setAdjuntoCargando] = useState<string | null>(null);
  const [adjuntoVisor, setAdjuntoVisor] = useState<{ url: string; nombre: string; tipo: string } | null>(null);

  // Al cerrar el visor (o cambiar de archivo) se suelta el blob en memoria.
  useEffect(() => () => { if (adjuntoVisor) URL.revokeObjectURL(adjuntoVisor.url); }, [adjuntoVisor]);

  const abrirAdjunto = async (a: AdjuntoCorreo, forzarDescarga = false) => {
    if (!selectedExterno || adjuntoCargando) return;
    const verEnApp = !forzarDescarga && seVisualiza(a);
    setAdjuntoCargando(a.parte);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('inv_token') : null;
      const url = `/api/correo/externo?uid=${selectedExterno}&folder=${encodeURIComponent(imapFolder)}&parte=${encodeURIComponent(a.parte)}${verEnApp ? '&ver=1' : ''}`;
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo descargar el archivo');
      }
      const blobUrl = URL.createObjectURL(await res.blob());
      if (verEnApp) {
        setAdjuntoVisor({ url: blobUrl, nombre: a.nombre, tipo: a.tipo });
      } else {
        const enlace = document.createElement('a');
        enlace.href = blobUrl;
        enlace.download = a.nombre;
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        toast.success(`Descargando ${a.nombre}`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAdjuntoCargando(null);
    }
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['correo-externo'] });
    queryClient.invalidateQueries({ queryKey: ['correoNoLeidos'] });
  };

  const sendMutation = useMutation({
    mutationFn: (payload: typeof composeForm) => {
      const fd = new FormData();
      fd.append('para', payload.para);
      fd.append('cc', payload.cc);
      fd.append('bcc', payload.bcc);
      fd.append('asunto', payload.asunto);
      fd.append('cuerpo', payload.cuerpo);
      fd.append('es_html', '1');
      for (const f of adjuntos) fd.append('file', f);
      return apiFetch('/api/correo/enviar', { method: 'POST', body: fd });
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Correo enviado con tu firma');
      setComposeOpen(false);
      setComposeForm(COMPOSE_VACIO);
      setAdjuntos([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const citaHtml = (encabezado: string, contenidoHtml: string) =>
    `<br><br><div style="color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;padding-top:8px;margin-top:8px;">${encabezado}</div><blockquote>${contenidoHtml}</blockquote>`;

  const handleReplyExterno = (d: CorreoExternoDetalle) => {
    const correoDe = d.de.match(/<([^>]+)>/)?.[1] || d.de;
    abrirCompose({
      ...COMPOSE_VACIO,
      para: correoDe,
      asunto: d.asunto.startsWith('Re: ') ? d.asunto : `Re: ${d.asunto}`,
      cuerpo: citaHtml(
        `El ${d.fecha ? fmtFecha(d.fecha) : ''}, ${escapeHtml(d.de)} escribió:`,
        d.html ? DOMPurify.sanitize(d.html) : escapeHtml(d.texto.slice(0, 5000)).replace(/\n/g, '<br>')
      ),
    });
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeForm.para) { toast.error('Escribe el correo destino'); return; }
    if (!stripHtml(composeForm.cuerpo)) { toast.error('Escribe el mensaje'); return; }
    sendMutation.mutate(composeForm);
  };

  // La búsqueda filtra lo que ya se descargó del servidor, no la carpeta entera.
  const externosFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return externos;
    const q = searchTerm.toLowerCase();
    return externos.filter((m) =>
      m.asunto.toLowerCase().includes(q) ||
      m.de.toLowerCase().includes(q) ||
      m.deCorreo.toLowerCase().includes(q)
    );
  }, [externos, searchTerm]);

  // Carga automática al llegar al final de la lista; el botón "Cargar más"
  // queda igualmente visible para quien prefiera pedirlo a mano.
  const listaRef = useRef<HTMLDivElement | null>(null);
  const onScrollLista = () => {
    const el = listaRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) fetchNextPage();
  };

  const getFolderIcon = (path: string) => {
    const p = path.toLowerCase();
    if (p === 'inbox') return Inbox;
    if (p.includes('sent')) return Send;
    if (p.includes('trash') || p.includes('bin')) return Trash2;
    if (p.includes('draft')) return FileText;
    if (p.includes('spam') || p.includes('junk')) return AlertOctagon;
    return FolderClosed;
  };

  return (
    <div className="flex flex-col h-full w-full bg-white font-sans overflow-hidden min-h-0">


      {/* ── BARRA SUPERIOR (HEADER ESTILO GMAIL / WEBMAIL COMPLETO) ── */}
      <div className="h-16 flex items-center justify-between bg-white border-b border-slate-200 px-3 sm:px-6 shrink-0 gap-2 sm:gap-4 z-10 select-none shadow-2xs">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* En movil este boton abre las carpetas, que estan ocultas por espacio. */}
          <button
            onClick={() => setCarpetasOpen(true)}
            aria-label="Abrir carpetas"
            className="p-2 hover:bg-slate-100 active:bg-slate-200 rounded-full transition-colors md:hidden flex-shrink-0"
          >
            <Menu className="w-5 h-5 text-slate-700" />
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#1e3a5f] text-white flex items-center justify-center font-bold text-lg shadow-sm border border-slate-300 flex-shrink-0">
              M
            </div>
            <span className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight truncate">U3 Mail</span>
          </div>
        </div>

        {/* Buscador Escritorio / Tablet */}
        <div className="flex-1 max-w-2xl mx-2 sm:mx-6 relative hidden sm:flex items-center">
          <div className="w-full flex items-center bg-slate-100/90 hover:bg-slate-100 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1e3a5f]/20 transition-all rounded-full px-4 py-2 border border-slate-200/80">
            <Search className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
            <input 
              type="text" 
              placeholder="Buscar en correos cargados..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent outline-none text-xs sm:text-sm text-slate-800 placeholder-slate-400"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="p-1 hover:bg-slate-200 rounded-full">
                <X className="w-3.5 h-3.5 text-slate-500" />
              </button>
            )}
          </div>
        </div>

        {/* Herramientas de Perfil */}
        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          {/* Botón Buscar Móvil */}
          <button
            onClick={() => setShowMobileSearch(!showMobileSearch)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600 sm:hidden"
            title="Buscar correos"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Botón Ajustes del buzón */}
          <button
            onClick={() => setPerfilOpen(true)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600" 
            title="Configuración de buzón y firma"
          >
            <Settings className="w-5 h-5" />
          </button>

          {/* Avatar del usuario */}
          <div className="w-8 h-8 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center font-bold text-xs shadow-xs border border-slate-200 select-none ml-1" title={user?.username}>
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
        </div>

      </div>

      {/* Buscador Desplegable en Móvil */}
      {showMobileSearch && (
        <div className="sm:hidden px-3 py-2 bg-slate-50 border-b border-slate-200 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center bg-white rounded-xl px-3 py-2 border border-slate-300 shadow-xs">
            <Search className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
            <input
              type="text"
              placeholder="Buscar en correos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent outline-none text-xs text-slate-800 placeholder-slate-400"
              autoFocus
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="p-1 hover:bg-slate-100 rounded-full">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── CUERPO PRINCIPAL (SIDEBAR DE CARPETAS + PANEL DE MENSAJES FULL-BLEED) ── */}
      <div className="flex flex-1 overflow-hidden min-h-0 bg-white">

        {/* Fondo del cajon de carpetas en movil */}
        {carpetasOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-sm" onClick={() => setCarpetasOpen(false)} />
        )}

        {/* BARRA LATERAL (SIDEBAR DE CARPETAS) */}
        <div
          className={`${carpetasOpen
            ? 'flex fixed inset-y-0 left-0 z-50 w-64 bg-white p-4 pt-[calc(1rem+var(--safe-top))] shadow-2xl border-r border-slate-200'
            : 'hidden'
            } md:static md:z-auto md:flex md:w-60 lg:w-64 md:bg-slate-50/70 md:p-3 md:shadow-none border-r border-slate-200 flex-shrink-0 flex-col justify-between overflow-y-auto scroll-touch`}
        >
          <div className="space-y-3">
            {/* Botón Redactar */}
            <button
              onClick={() => { setCarpetasOpen(false); abrirCompose({ ...COMPOSE_VACIO }); }}
              className="flex items-center justify-center gap-3 px-6 py-3.5 bg-sky-100 hover:bg-sky-200/90 text-sky-950 rounded-2xl font-bold shadow-xs hover:shadow transition-all duration-200 w-full"
            >
              <Pencil className="w-5 h-5 text-sky-900" />
              <span>Redactar</span>
            </button>

            {/* Carpetas del buzón IMAP */}
            <div className="pt-1">
              <div className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                <Globe className="w-3.5 h-3.5" />
                <span>Buzón Personal (IMAP)</span>
              </div>

              <div className="mt-1 space-y-0.5">
                {!perfil?.buzon_configurado ? (
                  <div className="p-3 bg-white border border-slate-200/80 rounded-xl text-xs text-slate-500 text-center shadow-2xs space-y-2">
                    <p className="m-0 leading-tight">Buzón no configurado.</p>
                    <Button size="sm" variant="outline" onClick={() => setPerfilOpen(true)} className="h-7 text-xs w-full">Configurar</Button>
                  </div>
                ) : errorFolders ? (
                  <div className="p-3 bg-red-50/60 border border-red-200/60 rounded-xl text-[11px] text-red-600 text-center space-y-2">
                    <p>No se pudieron cargar las carpetas.</p>
                    <div className="flex items-center justify-center gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => refetchFolders()} className="h-6 text-[10px]">Reintentar</Button>
                      <Button size="sm" variant="outline" onClick={() => setPerfilOpen(true)} className="h-6 text-[10px]">Configurar</Button>
                    </div>
                  </div>
                ) : fetchingFolders ? (
                  <div className="text-[11px] text-slate-400 p-3 text-center flex items-center justify-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cargando carpetas...
                  </div>
                ) : imapFolders.length === 0 ? (
                  <div className="text-[11px] text-slate-400 p-3 text-center">Sin carpetas en el buzón.</div>
                ) : (
                  imapFolders.map((f) => {
                    const FolderIcon = getFolderIcon(f.path);
                    const active = imapFolder === f.path;
                    return (
                      <button
                        key={f.path}
                        onClick={() => { setImapFolder(f.path); setSelectedExterno(null); }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all duration-150 ${active ? 'bg-sky-100 text-sky-950 font-bold shadow-2xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'}`}
                        title={f.path}
                      >
                        <FolderIcon className={`w-4 h-4 ${active ? 'text-[#1e3a5f]' : 'text-slate-400'}`} />
                        <span className="truncate">{f.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Botón Firma inferior */}
          <button
            onClick={() => { setCarpetasOpen(false); setPerfilOpen(true); }}
            className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all border border-slate-200/80 bg-white shadow-2xs mt-4"
          >
            <Settings className="w-4 h-4 text-slate-500" />
            <span>Firma y Ajustes</span>
          </button>
        </div>

        {/* CONTENEDOR PRINCIPAL DE CORREOS (EDGE-TO-EDGE SIN CAJA CONTENEDORA) */}
        <div className="flex-1 bg-white flex flex-col overflow-hidden min-w-0">

          
          {/* SI SELECCIONA UN CORREO: VISTA DETALLE */}
          {selectedExterno ? (
            <div className="flex-1 flex flex-col overflow-y-auto">

              {/* Barra de herramientas superior del Detalle */}
              <div className="flex items-center justify-between border-b border-slate-100 p-3 bg-slate-50/50">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setSelectedExterno(null)}
                    className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                    title="Regresar a la lista"
                  >
                    <ArrowLeft className="w-4 h-4 text-slate-700" />
                  </button>
                  <div className="w-px h-5 bg-slate-200 mx-1" />

                  {externoDetalle && (
                    <button
                      onClick={() => handleReplyExterno(externoDetalle)}
                      className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-700"
                      title="Responder correo"
                    >
                      <Reply className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-medium">Detalle de mensaje</span>
                </div>
              </div>

              {/* Contenido del correo */}
              {loadingDetalle ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin text-sky-500 mb-2" />
                  <p className="text-sm">Descargando correo del servidor...</p>
                </div>
              ) : externoDetalle ? (
                // Detalle Externo IMAP
                <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-slate-800 break-words">{externoDetalle.asunto}</h2>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-3 sm:mt-4 gap-2">
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 border flex-shrink-0">
                          {externoDetalle.de.charAt(0).toUpperCase() || 'E'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-semibold text-slate-800 truncate">{externoDetalle.de}</p>
                          <p className="text-[11px] sm:text-xs text-slate-500">Carpeta IMAP: {imapFolder}</p>
                        </div>
                      </div>
                      <span className="text-[11px] sm:text-xs text-slate-500">{externoDetalle.fecha ? fmtFecha(externoDetalle.fecha) : ''}</span>
                    </div>

                    {externoDetalle.adjuntos.length > 0 && (
                      <div className="mt-4">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                          <Paperclip className="w-3.5 h-3.5" />
                          <span>{externoDetalle.adjuntos.length} {externoDetalle.adjuntos.length === 1 ? 'archivo adjunto' : 'archivos adjuntos'}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {externoDetalle.adjuntos.map((a) => {
                            const clase = claseArchivo(a);
                            const Icono = clase.icono;
                            const cargando = adjuntoCargando === a.parte;
                            return (
                              <div
                                key={a.parte}
                                className="group inline-flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl pl-2 pr-1 py-1.5 max-w-full shadow-2xs hover:shadow-xs hover:border-slate-300 transition-all"
                              >
                                <button
                                  type="button"
                                  onClick={() => abrirAdjunto(a)}
                                  disabled={cargando}
                                  className="flex items-center gap-2.5 min-w-0 text-left disabled:opacity-60"
                                  title={seVisualiza(a) ? `Abrir ${a.nombre}` : `Descargar ${a.nombre}`}
                                >
                                  <span className={`w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0 ${clase.color}`}>
                                    {cargando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Icono className="w-4.5 h-4.5" />}
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block text-xs font-semibold text-slate-700 truncate max-w-[190px] group-hover:text-[#1e3a5f]">{a.nombre}</span>
                                    <span className="block text-[10px] text-slate-400">
                                      {clase.etiqueta}{a.tamano ? ` · ${fmtBytes(a.tamano)}` : ''}
                                    </span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => abrirAdjunto(a, true)}
                                  disabled={cargando}
                                  className="p-2 rounded-lg text-slate-400 hover:text-[#1e3a5f] hover:bg-slate-100 transition-colors flex-shrink-0 disabled:opacity-60"
                                  title={`Descargar ${a.nombre}`}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-4 sm:pt-6">
                    {externoDetalle.html ? (
                      <div
                        className="text-sm text-slate-700 leading-relaxed max-w-full overflow-x-auto shadow-inner p-3 sm:p-4 rounded-lg bg-slate-50/20 border [&_img]:max-w-full [&_img]:h-auto [&_table]:max-w-full [&_table]:table-auto [&_pre]:whitespace-pre-wrap break-words"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(externoDetalle.html) }}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed p-3 sm:p-4 rounded-lg bg-slate-50/20 border break-words">
                        {externoDetalle.texto}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-4 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleReplyExterno(externoDetalle)}>
                      <Reply className="w-3.5 h-3.5 mr-1.5" /> Responder
                    </Button>
                  </div>
                </div>

              ) : (
                <div className="p-6 text-center text-sm text-slate-400">Error al cargar el mensaje.</div>
              )}

            </div>
          ) : (
            
            // LISTA DE CORREOS DE LA CARPETA IMAP ACTIVA
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Barra de herramientas superior de la Lista */}
              <div className="flex items-center justify-between border-b border-slate-100 p-3 bg-slate-50/30">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => refetchExternos()}
                    className="p-2 hover:bg-slate-200/60 rounded-lg text-slate-500 transition-colors"
                    title="Actualizar listado"
                  >
                    <RefreshCw className={`w-4 h-4 ${fetchingExternos && !isFetchingNextPage ? 'animate-spin' : ''}`} />
                  </button>
                  <span className="text-xs text-slate-400 font-medium truncate">{imapFolder}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 select-none">
                    {searchTerm.trim()
                      ? `${externosFiltrados.length} de ${externos.length} cargados`
                      : `${externos.length} de ${totalCarpeta} correos`}
                  </span>
                </div>
              </div>

              {/* LISTA DE CORREOS */}
              <div ref={listaRef} onScroll={onScrollLista} className="flex-1 overflow-y-auto">
                {!perfil?.buzon_configurado ? (
                  <div className="p-8 text-center text-sm text-slate-400 space-y-4">
                    <Globe className="w-12 h-12 mx-auto opacity-30 text-sky-500" />
                    <p className="max-w-md mx-auto">Configura tu buzón personal (IMAP) en los ajustes para ver tu correo corporativo real aquí.</p>
                    <Button size="sm" variant="outline" onClick={() => setPerfilOpen(true)}>Configurar Buzón</Button>
                  </div>
                ) : loadingExternos ? (
                  <div className="p-8 text-center text-sm text-slate-400 flex flex-col items-center justify-center">
                    <RefreshCw className="w-8 h-8 animate-spin text-sky-500 mb-2" />
                    <p>Conectando al servidor IMAP y descargando correos...</p>
                  </div>
                ) : errorExternos ? (
                  <div className="p-8 text-center text-sm text-red-500 space-y-3">
                    <p>{(errorExternos as Error).message}</p>
                    <Button size="sm" variant="outline" onClick={() => refetchExternos()}>Reintentar conexión</Button>
                  </div>
                ) : externosFiltrados.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">
                    {searchTerm.trim() ? 'Ningún correo cargado coincide con la búsqueda.' : `Bandeja vacía en ${imapFolder}`}
                  </div>
                ) : (
                  <>
                    {externosFiltrados.map((m) => (
                      <div
                        key={m.uid}
                        onClick={() => setSelectedExterno(m.uid)}
                        className={`group flex flex-col sm:flex-row sm:items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-100 hover:shadow-[inset_4px_0_0_#1e3a5f] hover:bg-slate-50/50 cursor-pointer transition-all duration-150 gap-1 sm:gap-0 ${!m.leido ? 'bg-sky-50/20' : ''}`}
                      >
                        {/* Contenedor Fila / Remitente */}
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 sm:mr-4">
                          {m.leido
                            ? <MailOpen className="w-4 h-4 flex-shrink-0 text-slate-300" />
                            : <Mail className="w-4 h-4 flex-shrink-0 text-sky-600" />}
                          
                          {/* Remitente */}
                          <div className={`sm:w-44 lg:w-48 flex-shrink-0 truncate text-xs sm:text-sm ${!m.leido ? 'font-bold text-slate-900' : 'text-slate-700 font-medium'}`} title={m.deCorreo}>
                            {m.de}
                          </div>

                          {/* Asunto (Escritorio) */}
                          <div className="hidden sm:block min-w-0 flex-1 text-sm truncate">
                            <span className={!m.leido ? 'font-bold text-slate-900' : 'text-slate-700'}>{m.asunto}</span>
                          </div>

                          {/* Fecha (Móvil derecha) */}
                          <div className="sm:hidden text-[11px] text-slate-400 font-medium whitespace-nowrap ml-auto">
                            {m.fecha ? fmtFecha(m.fecha) : ''}
                          </div>
                        </div>

                        {/* Asunto (Móvil segunda línea) */}
                        <div className="sm:hidden pl-6 text-xs truncate">
                          <span className={!m.leido ? 'font-semibold text-slate-900' : 'text-slate-600'}>{m.asunto}</span>
                        </div>

                        {/* Fecha (Escritorio) */}
                        <div className="hidden sm:block text-xs text-slate-500 font-medium whitespace-nowrap pl-2">
                          {m.fecha ? fmtFecha(m.fecha) : ''}
                        </div>
                      </div>
                    ))}


                    {/* Pie de paginación: se recorre la carpeta hasta agotarla */}
                    <div className="p-4 flex flex-col items-center gap-2 text-xs text-slate-400">
                      {isFetchingNextPage ? (
                        <span className="flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cargando correos anteriores...
                        </span>
                      ) : hasNextPage ? (
                        <Button size="sm" variant="outline" onClick={() => fetchNextPage()}>
                          <ChevronDown className="w-3.5 h-3.5 mr-1.5" />
                          Cargar más ({totalCarpeta - externos.length} restantes)
                        </Button>
                      ) : (
                        <span>Fin de la carpeta — {externos.length} correos cargados</span>
                      )}
                    </div>
                  </>
                )}
              </div>

            </div>
          )}

        </div>

      </div>

      {/* ── VENTANA DE COMPOSE FLOTANTE (ESTILO GMAIL EN LA ESQUINA INFERIOR DERECHA) ── */}
      {composeOpen && (
        <div 
          /* En movil ocupa toda la pantalla; el modo esquina solo aplica desde sm. */
          className={`z-50 bg-white border border-slate-300 shadow-2xl flex flex-col overflow-hidden transition-all duration-200
            ${composeMinimized
              ? 'fixed bottom-0 inset-x-0 h-[40px] pb-[var(--safe-bottom)] sm:inset-x-auto sm:right-12 sm:w-[280px] sm:pb-0 rounded-t-xl'
              : composeMaximized
                ? 'fixed inset-0 sm:inset-10 md:inset-16 pt-[var(--safe-top)] pb-[var(--safe-bottom)] sm:pt-0 sm:pb-0 rounded-none sm:rounded-xl'
                : 'fixed inset-0 pt-[var(--safe-top)] pb-[var(--safe-bottom)] sm:inset-auto sm:bottom-0 sm:right-12 sm:w-[540px] sm:h-[580px] sm:pt-0 sm:pb-0 rounded-none sm:rounded-t-xl'
            }`}
        >
          {/* Header de la ventana */}
          <div 
            onClick={() => composeMinimized && setComposeMinimized(false)}
            className="bg-[#202124] text-white px-4 py-2.5 flex items-center justify-between cursor-pointer select-none"
          >
            <span className="text-xs font-bold font-sans">Correo nuevo (SMTP)</span>
            <div className="flex items-center gap-2">
              <button 
                type="button" 
                onClick={(e) => { e.stopPropagation(); setComposeMinimized(!composeMinimized); }}
                className="p-1 hover:bg-white/10 rounded transition-colors text-slate-300 hover:text-white"
                title="Minimizar"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button 
                type="button" 
                onClick={(e) => { e.stopPropagation(); setComposeMaximized(!composeMaximized); }}
                className="p-1 hover:bg-white/10 rounded transition-colors text-slate-300 hover:text-white"
                title={composeMaximized ? 'Restaurar' : 'Maximizar'}
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button 
                type="button" 
                onClick={(e) => { e.stopPropagation(); setComposeOpen(false); }}
                className="p-1 hover:bg-white/10 rounded transition-colors text-slate-300 hover:text-white"
                title="Cerrar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Formulario (solo visible si no está minimizado) */}
          {!composeMinimized && (
            <form onSubmit={handleSend} className="flex-1 flex flex-col overflow-hidden bg-white">
              
              {/* Campos Para / Asunto */}
              <div className="px-3 divide-y divide-slate-100 text-sm">

                <div className="flex items-center gap-2 py-1.5 relative">
                  <span className="text-xs text-slate-500 w-12">Para:</span>
                  <input
                    type="text"
                    value={composeForm.para}
                    onChange={(e) => setComposeForm((f) => ({ ...f, para: e.target.value }))}
                    placeholder="destinatario@correo.com"
                    className="flex-1 text-xs bg-transparent outline-none h-8 font-medium text-slate-800"
                    required
                  />
                  <div className="flex items-center gap-2 text-xs text-slate-400 absolute right-2">
                    {!mostrarCc && <button type="button" className="hover:text-slate-700" onClick={() => setMostrarCc(true)}>Cc</button>}
                    {!mostrarBcc && <button type="button" className="hover:text-slate-700" onClick={() => setMostrarBcc(true)}>Cco</button>}
                  </div>
                </div>
                {mostrarCc && (
                  <div className="flex items-center gap-2 py-1.5">
                    <span className="text-xs text-slate-500 w-12">Cc:</span>
                    <input
                      type="text"
                      value={composeForm.cc}
                      onChange={(e) => setComposeForm((f) => ({ ...f, cc: e.target.value }))}
                      className="flex-1 text-xs bg-transparent outline-none h-8 font-medium text-slate-800"
                    />
                  </div>
                )}
                {mostrarBcc && (
                  <div className="flex items-center gap-2 py-1.5">
                    <span className="text-xs text-slate-500 w-12">Cco:</span>
                    <input
                      type="text"
                      value={composeForm.bcc}
                      onChange={(e) => setComposeForm((f) => ({ ...f, bcc: e.target.value }))}
                      className="flex-1 text-xs bg-transparent outline-none h-8 font-medium text-slate-800"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 py-1.5">
                  <span className="text-xs text-slate-500 w-12">Asunto:</span>
                  <input 
                    value={composeForm.asunto} 
                    onChange={(e) => setComposeForm((f) => ({ ...f, asunto: e.target.value }))} 
                    required 
                    placeholder="Escribe el tema"
                    className="flex-1 text-xs font-semibold bg-transparent outline-none h-8 text-slate-800" 
                  />
                </div>
              </div>

              {/* Editor de cuerpo enriquecido */}
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
                <RichTextEditor
                  initialHtml={composeForm.cuerpo}
                  onChange={(html) => setComposeForm((f) => ({ ...f, cuerpo: html }))}
                  placeholder="Escribe tu mensaje..."
                  minHeight={180}
                />

                {/* Adjuntos y vista previa de la firma */}
                <div className="space-y-2">
                  {adjuntos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {adjuntos.map((f, i) => {
                        const Icono = claseArchivo({ tipo: f.type, nombre: f.name }).icono;
                        return (
                        <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-slate-100 border rounded-lg px-2 py-1">
                          <Icono className="w-3 h-3 text-slate-500" />
                          <span className="max-w-[130px] truncate">{f.name}</span>
                          <button
                            type="button"
                            onClick={() => setAdjuntos((a) => a.filter((_, j) => j !== i))}
                            className="text-slate-400 hover:text-red-500 font-bold ml-1"
                          >
                            ×
                          </button>
                        </span>
                        );
                      })}
                    </div>
                  )}

                  {perfil && (
                    <div className="border border-slate-200/80 rounded-lg p-2.5 bg-slate-50/50">
                      <p className="text-[10px] text-slate-400 mb-1.5 font-semibold uppercase tracking-wider">Tu firma corporativa automática:</p>
                      <FirmaPreview firma={perfil.firma} />
                    </div>
                  )}
                </div>
              </div>

              {/* Footer con acciones */}
              <div className="p-3 border-t bg-slate-50/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={sendMutation.isPending} size="sm" className="bg-[#1e3a5f] hover:bg-[#152a45]">
                    <Send className="w-3.5 h-3.5 mr-1.5" /> 
                    {sendMutation.isPending ? 'Enviando...' : 'Enviar'}
                  </Button>
                  
                  <label className="cursor-pointer p-2 hover:bg-slate-200 rounded-full transition-colors inline-block" title="Adjuntar archivos">
                    <Paperclip className="w-4 h-4 text-slate-500" />
                    <input
                      type="file" multiple className="hidden"
                      onChange={(e) => {
                        const nuevos = Array.from(e.target.files || []);
                        setAdjuntos((prev) => {
                          const total = [...prev, ...nuevos];
                          if (total.reduce((a, f) => a + f.size, 0) > 15 * 1024 * 1024) { toast.error('Los adjuntos superan el límite de 15 MB'); return prev; }
                          return total;
                        });
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={abrirVistaPrevia}
                    className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500 hover:text-[#1e3a5f]"
                    title="Vista previa del correo completo (logo, firma y footer)"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>

                <button 
                  type="button" 
                  onClick={() => setComposeOpen(false)} 
                  className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-red-500 transition-colors"
                  title="Descartar borrador"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

            </form>
          )}

        </div>
      )}

      {/* ── MODAL DE VISTA PREVIA DEL CORREO COMPLETO ── */}
      <Dialog open={previewOpen} onOpenChange={(o) => { if (!o) setPreviewOpen(false); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] p-0 overflow-hidden gap-0">
          <DialogHeader className="px-5 py-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Eye className="w-4 h-4 text-[#1e3a5f]" /> Vista previa del correo
            </DialogTitle>
            <DialogDescription className="text-xs">
              Así llegará tu correo: logo U3, tu mensaje, tu firma personalizada y el pie corporativo.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-slate-100 h-[70vh] overflow-hidden">
            {previewLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <RefreshCw className="w-7 h-7 animate-spin text-sky-500 mb-2" />
                <p className="text-sm">Generando vista previa...</p>
              </div>
            ) : (
              <iframe title="Vista previa del correo" srcDoc={previewHtml} className="w-full h-full border-0 bg-white" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── VISOR DE ADJUNTOS (PDF, imágenes y texto) ── */}
      <Dialog open={!!adjuntoVisor} onOpenChange={(o) => { if (!o) setAdjuntoVisor(null); }}>
        <DialogContent className="max-w-4xl max-h-[92vh] p-0 overflow-hidden gap-0">
          <DialogHeader className="px-5 py-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-base pr-8">
              {adjuntoVisor && (() => { const I = claseArchivo(adjuntoVisor).icono; return <I className="w-4 h-4 text-[#1e3a5f] flex-shrink-0" />; })()}
              <span className="truncate">{adjuntoVisor?.nombre}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {adjuntoVisor ? claseArchivo(adjuntoVisor).etiqueta : ''} · archivo recibido en este correo
            </DialogDescription>
          </DialogHeader>
          <div className="bg-slate-100 h-[72vh] overflow-auto flex items-center justify-center">
            {adjuntoVisor?.tipo.startsWith('image/') ? (
              <img src={adjuntoVisor.url} alt={adjuntoVisor.nombre} className="max-w-full max-h-full object-contain" />
            ) : adjuntoVisor ? (
              <iframe title={adjuntoVisor.nombre} src={adjuntoVisor.url} className="w-full h-full border-0 bg-white" />
            ) : null}
          </div>
          <DialogFooter className="px-5 py-3 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!adjuntoVisor) return;
                const enlace = document.createElement('a');
                enlace.href = adjuntoVisor.url;
                enlace.download = adjuntoVisor.nombre;
                document.body.appendChild(enlace);
                enlace.click();
                enlace.remove();
              }}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" /> Guardar archivo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MODAL DE CONFIGURACIÓN DE FIRMA Y CONFIGURACIÓN SMTP/IMAP ── */}
      <PerfilCorreoDialog open={perfilOpen} onClose={() => { setPerfilOpen(false); refetchFolders(); }} perfil={perfil} />

    </div>
  );
}

function PerfilCorreoDialog({ open, onClose, perfil }: { open: boolean; onClose: () => void; perfil?: PerfilCorreo }) {
  const queryClient = useQueryClient();
  const { installed, triggerInstall } = usePwaInstall();
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    setNotifPermission(getNotificationPermission());
  }, [open]);

  const handleToggleNotifications = async () => {
    if (notifPermission === 'granted') {
      sendDeviceNotification('Prueba Suite U3', { body: 'Las notificaciones funcionan correctamente en tu dispositivo.' });
      toast.success('Notificación de prueba enviada al dispositivo');
      return;
    }
    const perm = await requestNotificationPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      toast.success('Notificaciones activadas en el dispositivo');
      sendDeviceNotification('Notificaciones U3 Activadas', { body: 'Recibirás avisos de nuevos correos.' });
    } else {
      toast.error('Permiso de notificaciones no otorgado');
    }
  };

  const [form, setForm] = useState({

    nombre: '', puesto: '', telefono: '', correo: '',
    correo_imap_host: '', correo_imap_puerto: '993',
    correo_smtp_host: '', correo_smtp_puerto: '465',
    correo_ssl: true, correo_usuario: '', correo_password: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (perfil && open) {
      setForm({
        nombre: perfil.firma.nombre || '', puesto: perfil.firma.puesto || '', telefono: perfil.firma.telefono || '', correo: perfil.firma.correo || '',
        correo_imap_host: perfil.correo_imap_host || '', correo_imap_puerto: String(perfil.correo_imap_puerto || 993),
        correo_smtp_host: perfil.correo_smtp_host || '', correo_smtp_puerto: String(perfil.correo_smtp_puerto || 465),
        correo_ssl: perfil.correo_ssl ?? true, correo_usuario: perfil.correo_usuario || '', correo_password: '',
      });
    }
  }, [perfil, open]);

  const aplicarPreset = (provider: 'gmail' | 'outlook' | 'hostinger' | 'u3') => {
    if (provider === 'gmail') {
      setForm((f) => ({
        ...f,
        correo_imap_host: 'imap.gmail.com',
        correo_imap_puerto: '993',
        correo_smtp_host: 'smtp.gmail.com',
        correo_smtp_puerto: '465',
        correo_ssl: true,
      }));
      toast.info('Ajustes de Gmail cargados. Requiere Contraseña de Aplicación.');
    } else if (provider === 'outlook') {
      setForm((f) => ({
        ...f,
        correo_imap_host: 'outlook.office365.com',
        correo_imap_puerto: '993',
        correo_smtp_host: 'smtp.office365.com',
        correo_smtp_puerto: '587',
        correo_ssl: true,
      }));
      toast.info('Ajustes de Outlook / Office 365 cargados.');
    } else if (provider === 'hostinger') {
      setForm((f) => ({
        ...f,
        correo_imap_host: 'imap.hostinger.com',
        correo_imap_puerto: '993',
        correo_smtp_host: 'smtp.hostinger.com',
        correo_smtp_puerto: '465',
        correo_ssl: true,
      }));
      toast.info('Ajustes de Hostinger cargados.');
    } else if (provider === 'u3') {
      setForm((f) => ({
        ...f,
        correo_imap_host: 'mail.u3seguridadprivada.com',
        correo_imap_puerto: '993',
        correo_smtp_host: 'mail.u3seguridadprivada.com',
        correo_smtp_puerto: '465',
        correo_ssl: true,
      }));
      toast.info('Ajustes de Webmail U3 cargados.');
    }
  };

  const probarMutation = useMutation({
    mutationFn: () => apiFetch('/api/auth/perfil-correo-test', {
      method: 'POST',
      body: JSON.stringify(form),
    }),
    onSuccess: (data: any) => {
      toast.success(data.message || 'Conexión verificada con éxito');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const guardarMutation = useMutation({
    mutationFn: () => apiFetch('/api/auth/perfil-correo', {
      method: 'PUT',
      body: JSON.stringify({
        firma: { nombre: form.nombre, puesto: form.puesto, telefono: form.telefono, correo: form.correo },
        correo_imap_host: form.correo_imap_host, correo_imap_puerto: form.correo_imap_puerto,
        correo_smtp_host: form.correo_smtp_host, correo_smtp_puerto: form.correo_smtp_puerto,
        correo_ssl: form.correo_ssl, correo_usuario: form.correo_usuario,
        ...(form.correo_password ? { correo_password: form.correo_password } : {}),
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['perfil-correo'] });
      queryClient.invalidateQueries({ queryKey: ['correo-externo'] });
      queryClient.invalidateQueries({ queryKey: ['correo-externo-folders'] });
      toast.success('Perfil y firma corporativa guardados correctamente');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto space-y-4">
        <DialogHeader>
          <DialogTitle>Mi Firma, Notificaciones e Integración de Correo</DialogTitle>
          <DialogDescription>
            Configura tu firma corporativa, notificaciones del dispositivo y tus credenciales de entrada (IMAP) y salida (SMTP).
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-1">
          {/* Ajustes de PWA y Notificaciones */}
          <div className="space-y-3 bg-slate-50/80 p-3.5 border border-slate-200/80 rounded-xl">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#1e3a5f]" /> Dispositivo y Aplicación
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-2 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800 m-0">Aplicación (PWA)</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 m-0 leading-tight">
                    {installed ? 'App instalada en este dispositivo.' : 'Acceso directo a pantalla completa sin navegador.'}
                  </p>
                </div>
                {installed ? (
                  <div className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Instalada
                  </div>
                ) : (
                  <Button
                    size="sm"
                    type="button"
                    onClick={async () => {
                      const success = await triggerInstall();
                      if (!success) {
                        toast.info('Para instalar: Selecciona "Agregar a inicio" o "Instalar app" en tu navegador');
                      }
                    }}
                    className="h-8 text-xs font-bold bg-[#1e3a5f] hover:bg-[#152a45]"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" /> Instalar App
                  </Button>
                )}
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-2 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800 m-0">Notificaciones</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 m-0 leading-tight">
                    {notifPermission === 'granted' ? 'Notificaciones nativas activas.' : 'Recibe avisos de correos nuevos en pantalla.'}
                  </p>
                </div>
                <Button
                  size="sm"
                  type="button"
                  variant={notifPermission === 'granted' ? 'outline' : 'default'}
                  onClick={handleToggleNotifications}
                  className={`h-8 text-xs font-bold ${notifPermission === 'granted' ? 'border-emerald-300 text-emerald-700' : 'bg-[#1e3a5f] hover:bg-[#152a45]'}`}
                >
                  <Bell className="w-3.5 h-3.5 mr-1" />
                  {notifPermission === 'granted' ? 'Probar Aviso' : 'Activar Notif.'}
                </Button>
              </div>
            </div>
          </div>

          {/* Firma personal */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-800 border-b pb-1.5 flex items-center justify-between">
              <span>Firma Corporativa</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Nombre completo</label>
                <Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Sarai Castillo" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Puesto / Cargo</label>
                <Input value={form.puesto} onChange={(e) => setForm((f) => ({ ...f, puesto: e.target.value }))} placeholder="Ej. Directora General" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Teléfono directo</label>
                <Input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} placeholder="Ej. 55-1234-5678" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Correo corporativo</label>
                <Input type="email" value={form.correo} onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))} placeholder="correo@u3seguridadprivada.com" />
              </div>
            </div>
            
            {/* Vista Previa de la Firma */}
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
              <p className="text-[10px] text-slate-400 mb-2 font-semibold uppercase tracking-wider">Vista previa de tu firma:</p>
              <FirmaPreview firma={{ nombre: form.nombre, puesto: form.puesto, telefono: form.telefono, correo: form.correo }} />
            </div>
          </div>

          {/* Configuración de buzón personal */}
          <div className="space-y-4 border-t border-slate-200 pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
              <h3 className="text-sm font-semibold text-slate-800">Buzón Personal (IMAP / SMTP)</h3>
              
              {/* Presets rápidos */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-400 font-medium mr-1">Cargar servidor:</span>
                <button
                  type="button"
                  onClick={() => aplicarPreset('gmail')}
                  className="px-2.5 py-1 text-xs rounded-md border border-slate-200 bg-white hover:bg-slate-100 font-medium text-slate-700 transition shadow-sm"
                >
                  Gmail
                </button>
                <button
                  type="button"
                  onClick={() => aplicarPreset('outlook')}
                  className="px-2.5 py-1 text-xs rounded-md border border-slate-200 bg-white hover:bg-slate-100 font-medium text-slate-700 transition shadow-sm"
                >
                  Outlook
                </button>
                <button
                  type="button"
                  onClick={() => aplicarPreset('hostinger')}
                  className="px-2.5 py-1 text-xs rounded-md border border-slate-200 bg-white hover:bg-slate-100 font-medium text-slate-700 transition shadow-sm"
                >
                  Hostinger
                </button>
                <button
                  type="button"
                  onClick={() => aplicarPreset('u3')}
                  className="px-2.5 py-1 text-xs rounded-md border border-slate-200 bg-white hover:bg-slate-100 font-medium text-slate-700 transition shadow-sm"
                >
                  Webmail U3
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Correo / Usuario</label>
                  <Input 
                    value={form.correo_usuario} 
                    onChange={(e) => setForm((f) => ({ ...f, correo_usuario: e.target.value }))} 
                    placeholder="usuario@u3seguridadprivada.com" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Contraseña de aplicación</label>
                  <div className="relative">
                    <Input 
                      type={showPassword ? 'text' : 'password'} 
                      value={form.correo_password} 
                      onChange={(e) => setForm((f) => ({ ...f, correo_password: e.target.value }))} 
                      placeholder={perfil?.tiene_password ? 'Guardada — escribe para modificar' : 'Contraseña o App Password'} 
                      autoComplete="new-password"
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Servidores IMAP y SMTP */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Servidor IMAP (Entrada)</label>
                  <div className="flex gap-2">
                    <Input 
                      className="flex-1 min-w-0" 
                      value={form.correo_imap_host} 
                      onChange={(e) => setForm((f) => ({ ...f, correo_imap_host: e.target.value }))} 
                      placeholder="imap.correo.com" 
                    />
                    <Input 
                      type="number" 
                      className="w-20 flex-shrink-0" 
                      value={form.correo_imap_puerto} 
                      onChange={(e) => setForm((f) => ({ ...f, correo_imap_puerto: e.target.value }))} 
                      placeholder="993"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Servidor SMTP (Salida)</label>
                  <div className="flex gap-2">
                    <Input 
                      className="flex-1 min-w-0" 
                      value={form.correo_smtp_host} 
                      onChange={(e) => setForm((f) => ({ ...f, correo_smtp_host: e.target.value }))} 
                      placeholder="smtp.correo.com" 
                    />
                    <Input 
                      type="number" 
                      className="w-20 flex-shrink-0" 
                      value={form.correo_smtp_puerto} 
                      onChange={(e) => setForm((f) => ({ ...f, correo_smtp_puerto: e.target.value }))} 
                      placeholder="465"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={form.correo_ssl} 
                    onChange={(e) => setForm((f) => ({ ...f, correo_ssl: e.target.checked }))} 
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4" 
                  /> 
                  <span>Usar SSL/TLS para conexiones seguras</span>
                </label>
              </div>

              <p className="text-[11px] text-slate-500 bg-amber-50/80 border border-amber-200/80 p-2.5 rounded-lg leading-normal">
                <strong>Nota:</strong> Si utilizas proveedores como Gmail u Outlook, debes generar una <em>contraseña de aplicación</em> desde la seguridad de tu cuenta para permitir el inicio de sesión. Si dejas la configuración en blanco, el correo externo saldrá por el servidor SMTP por defecto del sistema.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2 border-t pt-3 mt-2">
          <Button
            type="button"
            variant="outline"
            disabled={probarMutation.isPending}
            onClick={() => probarMutation.mutate()}
            className="text-xs text-slate-700 hover:text-slate-900 border-slate-300 w-full sm:w-auto"
          >
            {probarMutation.isPending ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                Probando conexión...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                Probar conexión
              </>
            )}
          </Button>
          
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancelar</Button>
            <Button disabled={guardarMutation.isPending} onClick={() => guardarMutation.mutate()} className="bg-[#1e3a5f] hover:bg-[#152a45] w-full sm:w-auto">
              {guardarMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
