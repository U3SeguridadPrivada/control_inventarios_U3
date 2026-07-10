'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { useAuth } from '@/src/context/AuthContext';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select } from '@/src/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/src/components/ui/dialog';
import RichTextEditor from '@/src/components/RichTextEditor';
import {
  Pencil, Inbox, Send, Trash2, Star, Reply, Globe, Settings, RefreshCw, Paperclip, X, FileText,
  Search, HelpCircle, Maximize2, Minimize2, ChevronDown, ChevronRight, Menu, ArrowLeft, MoreVertical,
  Check, MailOpen, Mail, User, Shield, CheckSquare, Square, FolderClosed, ExternalLink, Calendar,
  Archive, AlertOctagon, Tag, Users, LayoutGrid, Info
} from 'lucide-react';
import { toast } from 'sonner';
import DOMPurify from 'isomorphic-dompurify';

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtBytes = (n: number) => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`;

interface Mensaje {
  id: number;
  remitente_id: number;
  destinatario_id: number;
  asunto: string;
  cuerpo: string;
  leido: number;
  destacado: number;
  es_html: number;
  fecha_envio: string;
  eliminado_remitente: number;
  eliminado_destinatario: number;
}
interface Contacto { id: number; username: string; email: string; }
interface CorreoExterno { uid: number; asunto: string; de: string; deCorreo: string; fecha: string | null; leido: boolean }
interface CorreoExternoDetalle { uid: number; asunto: string; de: string; fecha: string | null; html: string | null; texto: string; adjuntos: { nombre: string; tipo: string }[] }
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

type Folder = 'inbox' | 'starred' | 'sent' | 'trash' | 'externo';
type GmailCategory = 'primary' | 'social' | 'promotions' | 'updates';

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
    <div className="border-l-[3px] pl-3.5 py-1" style={{ borderColor: '#1e3a5f' }}>
      <p className="text-[14px] font-bold text-slate-800 m-0">{firma.nombre || 'Tu nombre'}</p>
      {firma.puesto && <p className="text-xs text-slate-500 mt-0.5">{firma.puesto}</p>}
      <p className="text-xs font-bold mt-1" style={{ color: '#1e3a5f' }}>U3 SEGURIDAD PRIVADA, S.A. DE C.V.</p>
      {firma.telefono && <p className="text-xs text-slate-600 mt-0.5">Tel: {firma.telefono}</p>}
      {firma.correo && <p className="text-xs text-slate-600 mt-0.5">{firma.correo}</p>}
    </div>
  );
}

export default function CorreoApp() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Estados de vista
  const [folder, setFolder] = useState<Folder>('inbox');
  const [imapFolder, setImapFolder] = useState<string>('INBOX');
  const [activeCategory, setActiveCategory] = useState<GmailCategory>('primary');
  const [selected, setSelected] = useState<Mensaje | null>(null);
  const [selectedExterno, setSelectedExterno] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Control del Compose Flotante
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMinimized, setComposeMinimized] = useState(false);
  const [composeMaximized, setComposeMaximized] = useState(false);
  const [composeForm, setComposeForm] = useState({ modo: 'interno' as 'interno' | 'externo', destinatario_id: '', para: '', cc: '', bcc: '', asunto: '', cuerpo: '' });
  const [mostrarCc, setMostrarCc] = useState(false);
  const [mostrarBcc, setMostrarBcc] = useState(false);
  const [adjuntos, setAdjuntos] = useState<File[]>([]);

  // Configuración del perfil de correo
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [imapFoldersCollapsed, setImapFoldersCollapsed] = useState(false);

  const COMPOSE_VACIO = { modo: 'interno' as const, destinatario_id: '', para: '', cc: '', bcc: '', asunto: '', cuerpo: '' };
  
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
  const { data: mensajes = [], isLoading } = useQuery({
    queryKey: ['mensajes', folder],
    queryFn: () => apiFetch<Mensaje[]>(`/api/mensajes?folder=${folder === 'starred' ? 'inbox' : folder}`),
    enabled: folder !== 'externo',
  });

  const { data: contactos = [] } = useQuery({
    queryKey: ['mensajesContactos'],
    queryFn: () => apiFetch<Contacto[]>('/api/mensajes/contactos'),
  });
  const contactosMap = useMemo(() => Object.fromEntries(contactos.map((c) => [c.id, c])), [contactos]);

  const { data: perfil } = useQuery({
    queryKey: ['perfil-correo'],
    queryFn: () => apiFetch<PerfilCorreo>('/api/auth/perfil-correo')
  });

  const { data: imapFolders = [], refetch: refetchFolders } = useQuery({
    queryKey: ['correo-externo-folders'],
    queryFn: () => apiFetch<ImapFolder[]>('/api/correo/externo?action=folders'),
    enabled: !!perfil?.buzon_configurado,
  });

  const { data: externos = [], isLoading: loadingExternos, error: errorExternos, refetch: refetchExternos, isFetching: fetchingExternos } = useQuery({
    queryKey: ['correo-externo', imapFolder],
    queryFn: () => apiFetch<CorreoExterno[]>(`/api/correo/externo?folder=${encodeURIComponent(imapFolder)}`),
    enabled: folder === 'externo' && !!perfil?.buzon_configurado,
    retry: false,
    staleTime: 30_000,
  });

  const { data: externoDetalle, isLoading: loadingDetalle } = useQuery({
    queryKey: ['correo-externo-detalle', selectedExterno, imapFolder],
    queryFn: () => apiFetch<CorreoExternoDetalle>(`/api/correo/externo?uid=${selectedExterno}&folder=${encodeURIComponent(imapFolder)}`),
    enabled: folder === 'externo' && !!selectedExterno,
    staleTime: Infinity,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['mensajes'] });
    queryClient.invalidateQueries({ queryKey: ['mensajesNoLeidos'] });
    queryClient.invalidateQueries({ queryKey: ['correo-externo'] });
  };

  const sendMutation = useMutation({
    mutationFn: (payload: typeof composeForm) => {
      if (payload.modo === 'externo') {
        const fd = new FormData();
        fd.append('para', payload.para);
        fd.append('cc', payload.cc);
        fd.append('bcc', payload.bcc);
        fd.append('asunto', payload.asunto);
        fd.append('cuerpo', payload.cuerpo);
        fd.append('es_html', '1');
        for (const f of adjuntos) fd.append('file', f);
        return apiFetch('/api/correo/enviar', { method: 'POST', body: fd });
      }
      return apiFetch('/api/mensajes', { method: 'POST', body: JSON.stringify({ destinatario_id: Number(payload.destinatario_id), asunto: payload.asunto, cuerpo: payload.cuerpo, es_html: 1 }) });
    },
    onSuccess: (_d, payload) => {
      invalidateAll();
      toast.success(payload.modo === 'externo' ? 'Correo enviado con tu firma' : 'Mensaje enviado');
      setComposeOpen(false);
      setComposeForm(COMPOSE_VACIO);
      setAdjuntos([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accionMutation = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: string }) => apiFetch(`/api/mensajes/${id}`, { method: 'PATCH', body: JSON.stringify({ accion }) }),
    onSuccess: () => invalidateAll(),
    onError: (e: Error) => toast.error(e.message),
  });

  const openMensaje = (m: Mensaje) => {
    setSelected(m);
    if (folder === 'inbox' && !m.leido) accionMutation.mutate({ id: m.id, accion: 'leido' });
  };

  const citaHtml = (encabezado: string, contenidoHtml: string) =>
    `<br><br><div style="color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;padding-top:8px;margin-top:8px;">${encabezado}</div><blockquote>${contenidoHtml}</blockquote>`;

  const handleReply = (m: Mensaje) => {
    const remitente = contactosMap[m.remitente_id]?.username ?? '—';
    abrirCompose({
      ...COMPOSE_VACIO,
      modo: 'interno',
      destinatario_id: String(m.remitente_id === user?.id ? m.destinatario_id : m.remitente_id),
      asunto: m.asunto.startsWith('Re: ') ? m.asunto : `Re: ${m.asunto}`,
      cuerpo: citaHtml(`El ${fmtFecha(m.fecha_envio)}, ${remitente} escribió:`, m.es_html ? DOMPurify.sanitize(m.cuerpo) : escapeHtml(m.cuerpo).replace(/\n/g, '<br>')),
    });
  };

  const handleReplyExterno = (d: CorreoExternoDetalle) => {
    const correoDe = d.de.match(/<([^>]+)>/)?.[1] || d.de;
    abrirCompose({
      ...COMPOSE_VACIO,
      modo: 'externo',
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
    if (composeForm.modo === 'interno' && !composeForm.destinatario_id) { toast.error('Selecciona un destinatario'); return; }
    if (composeForm.modo === 'externo' && !composeForm.para) { toast.error('Escribe el correo destino'); return; }
    if (!stripHtml(composeForm.cuerpo)) { toast.error('Escribe el mensaje'); return; }
    sendMutation.mutate(composeForm);
  };

  // Filtrado de mensajes locales por Búsqueda y por Categoría
  const mensajesFiltrados = useMemo(() => {
    let result = mensajes;
    if (folder === 'starred') {
      result = mensajes.filter(m => m.destacado === 1);
    }
    
    // Categorías Gmail ficticias pero interactivas basada en keywords
    if (folder === 'inbox') {
      result = result.filter(m => {
        const txt = (m.asunto + ' ' + m.cuerpo).toLowerCase();
        const esUpdate = txt.includes('railway') || txt.includes('deployment') || txt.includes('crash') || txt.includes('chatgpt') || txt.includes('wasender') || txt.includes('system') || txt.includes('notificación');
        const esSocial = txt.includes('social') || txt.includes('facebook') || txt.includes('twitter') || txt.includes('mensaje de') || txt.includes('comentario');
        const esPromo = txt.includes('promo') || txt.includes('oferta') || txt.includes('descuento') || txt.includes('compra');

        if (activeCategory === 'updates') return esUpdate;
        if (activeCategory === 'social') return esSocial;
        if (activeCategory === 'promotions') return esPromo;
        return !esUpdate && !esSocial && !esPromo; // principal
      });
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(m => 
        m.asunto.toLowerCase().includes(q) || 
        m.cuerpo.toLowerCase().includes(q) ||
        (contactosMap[m.remitente_id]?.username ?? '').toLowerCase().includes(q) ||
        (contactosMap[m.destinatario_id]?.username ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [mensajes, folder, activeCategory, searchTerm, contactosMap]);

  const externosFiltrados = useMemo(() => {
    let result = externos;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(m => 
        m.asunto.toLowerCase().includes(q) || 
        m.de.toLowerCase().includes(q)
      );
    }
    return result;
  }, [externos, searchTerm]);

  // Contadores
  const unreadCount = useMemo(() => {
    return mensajes.filter(m => m.destinatario_id === user?.id && !m.leido && m.eliminado_destinatario === 0).length;
  }, [mensajes, user]);

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
    <div className="flex flex-col h-[85vh] bg-[#f6f8fc] -m-6 p-4 overflow-hidden rounded-xl font-sans">
      
      {/* ── BARRA SUPERIOR (HEADER ESTILO GMAIL) ── */}
      <div className="flex items-center justify-between bg-transparent pb-3 px-2">
        <div className="flex items-center gap-3 w-64">
          <button className="p-2 hover:bg-slate-200/80 rounded-full transition-colors hidden md:block">
            <Menu className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#1e3a5f] text-white flex items-center justify-center font-bold text-lg shadow-sm border border-slate-300">
              M
            </div>
            <span className="text-xl font-semibold text-slate-800 tracking-tight">U3 Mail</span>
          </div>
        </div>

        {/* Buscador */}
        <div className="flex-1 max-w-2xl mx-4 relative hidden sm:flex items-center">
          <div className="w-full flex items-center bg-slate-200/50 hover:bg-slate-200/85 hover:shadow-sm focus-within:bg-white focus-within:shadow-md focus-within:ring-1 focus-within:ring-slate-200 transition-all rounded-full px-4 py-2 border border-transparent">
            <Search className="w-5 h-5 text-slate-500 mr-2 flex-shrink-0" />
            <input 
              type="text" 
              placeholder="Buscar en el correo" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent outline-none text-sm text-slate-800 placeholder-slate-500"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="p-1 hover:bg-slate-200 rounded-full">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            )}
          </div>
        </div>

        {/* Herramientas de Perfil */}
        <div className="flex items-center gap-1.5">
          <button className="p-2 hover:bg-slate-200/80 rounded-full transition-colors text-slate-600" title="Ayuda">
            <HelpCircle className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setPerfilOpen(true)}
            className="p-2 hover:bg-slate-200/80 rounded-full transition-colors text-slate-600" 
            title="Configuración de buzón y firma"
          >
            <Settings className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center font-semibold text-sm border shadow-sm select-none" title={user?.username}>
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
        </div>
      </div>

      {/* ── CUERPO PRINCIPAL (SIDEBAR + MAIN CONTENT CARD) ── */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        
        {/* BARRA LATERAL (SIDEBAR) */}
        <div className="w-60 flex-shrink-0 flex flex-col justify-between overflow-y-auto pr-1">
          <div className="space-y-1">
            {/* Botón Redactar */}
            <button 
              onClick={() => abrirCompose({ ...COMPOSE_VACIO, modo: folder === 'externo' ? 'externo' : 'interno' })}
              className="flex items-center gap-3 px-6 py-4 bg-sky-100 hover:bg-sky-200 text-sky-900 rounded-2xl font-semibold shadow-sm hover:shadow transition-all duration-200 mb-4 w-44"
            >
              <Pencil className="w-5 h-5 text-sky-900" />
              <span>Redactar</span>
            </button>

            {/* Carpetas Estándar (Internas) */}
            <div className="space-y-0.5">
              {[
                { id: 'inbox' as Folder, label: 'Recibidos', icon: Inbox, count: unreadCount },
                { id: 'starred' as Folder, label: 'Destacados', icon: Star, count: 0 },
                { id: 'sent' as Folder, label: 'Enviados', icon: Send, count: 0 },
                { id: 'trash' as Folder, label: 'Papelera', icon: Trash2, count: 0 },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = folder === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => { setFolder(tab.id); setSelected(null); setSelectedExterno(null); }}
                    className={`w-full flex items-center justify-between px-4 py-2 rounded-r-full text-sm transition-all duration-150 ${active ? 'bg-sky-200/70 text-sky-900 font-semibold' : 'text-slate-700 hover:bg-slate-200/50'}`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${active ? 'text-sky-900' : 'text-slate-500'}`} />
                      <span>{tab.label}</span>
                    </div>
                    {tab.count > 0 && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${active ? 'bg-sky-900 text-white' : 'bg-slate-200 text-slate-700'}`}>{tab.count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* SECCIÓN COLLAPSIBLE PARA BUZÓN PERSONAL IMAP */}
            <div className="pt-4 border-t border-slate-200/80 mt-4">
              <button 
                onClick={() => setImapFoldersCollapsed(!imapFoldersCollapsed)}
                className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 tracking-wider uppercase transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  <span>Buzón Personal (IMAP)</span>
                </div>
                {imapFoldersCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {!imapFoldersCollapsed && (
                <div className="mt-1 space-y-0.5 pl-2">
                  {!perfil?.buzon_configurado ? (
                    <div className="p-3 mx-2 bg-slate-100/50 border border-slate-200 rounded-lg text-xs text-slate-500 text-center">
                      <p className="mb-2">Buzón externo no configurado.</p>
                      <Button size="sm" variant="outline" onClick={() => setPerfilOpen(true)} className="h-6 text-[10px]">Configurar</Button>
                    </div>
                  ) : (
                    <>
                      {imapFolders.length === 0 ? (
                        <div className="text-[11px] text-slate-400 p-3 text-center flex items-center justify-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cargando carpetas...
                        </div>
                      ) : (
                        imapFolders.map((f) => {
                          const FolderIcon = getFolderIcon(f.path);
                          const active = folder === 'externo' && imapFolder === f.path;
                          return (
                            <button
                              key={f.path}
                              onClick={() => { setFolder('externo'); setImapFolder(f.path); setSelected(null); setSelectedExterno(null); }}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-r-full text-xs transition-all duration-150 ${active ? 'bg-sky-200/60 text-sky-900 font-semibold' : 'text-slate-600 hover:bg-slate-200/40'}`}
                              title={f.path}
                            >
                              <FolderIcon className={`w-3.5 h-3.5 ${active ? 'text-sky-950' : 'text-slate-400'}`} />
                              <span className="truncate">{f.name}</span>
                            </button>
                          );
                        })
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Botón Firma inferior */}
          <button 
            onClick={() => setPerfilOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 mx-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-xl transition-all border border-slate-200 bg-white shadow-sm"
          >
            <Settings className="w-4 h-4 text-slate-500" />
            <span>Firma y Ajustes</span>
          </button>
        </div>

        {/* CONTENEDOR PRINCIPAL DE CORREOS */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          
          {/* SI SELECCIONA UN MENSAJE INTERNO U EXTERNO: VISTA DETALLE */}
          {selected || (folder === 'externo' && selectedExterno) ? (
            <div className="flex-1 flex flex-col overflow-y-auto">
              
              {/* Barra de herramientas superior del Detalle */}
              <div className="flex items-center justify-between border-b border-slate-100 p-3 bg-slate-50/50">
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => { setSelected(null); setSelectedExterno(null); }}
                    className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                    title="Regresar a la lista"
                  >
                    <ArrowLeft className="w-4 h-4 text-slate-700" />
                  </button>
                  <div className="w-px h-5 bg-slate-200 mx-1" />
                  
                  {selected ? (
                    <>
                      <button 
                        onClick={() => accionMutation.mutate({ id: selected.id, accion: selected.destacado ? 'quitar-destacado' : 'destacado' })}
                        className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-700"
                        title={selected.destacado ? 'Quitar destacado' : 'Destacar'}
                      >
                        <Star className={`w-4 h-4 ${selected.destacado ? 'text-amber-500 fill-amber-500' : ''}`} />
                      </button>
                      <button 
                        onClick={() => {
                          const acc = folder === 'trash' ? 'restaurar' : 'papelera';
                          accionMutation.mutate({ id: selected.id, accion: acc });
                          setSelected(null);
                        }}
                        className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-700"
                        title={folder === 'trash' ? 'Restaurar correo' : 'Enviar a la papelera'}
                      >
                        {folder === 'trash' ? <RefreshCw className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </>
                  ) : externoDetalle ? (
                    <button 
                      onClick={() => handleReplyExterno(externoDetalle)}
                      className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-700"
                      title="Responder correo externo"
                    >
                      <Reply className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-medium">Detalle de mensaje</span>
                </div>
              </div>

              {/* Contenido del correo */}
              {selected ? (
                // Detalle Interno
                <div className="p-6 space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">{selected.asunto}</h2>
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 border">
                          {(contactosMap[selected.remitente_id]?.username ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {contactosMap[selected.remitente_id]?.username ?? (selected.remitente_id === user?.id ? 'Tú' : '—')}
                          </p>
                          <p className="text-xs text-slate-500">
                            Para: {contactosMap[selected.destinatario_id]?.username ?? '—'}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-slate-500">{fmtFecha(selected.fecha_envio)}</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-6">
                    {selected.es_html ? (
                      <div className="text-sm text-slate-700 leading-relaxed max-w-full overflow-x-auto" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.cuerpo) }} />
                    ) : (
                      <div className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">{selected.cuerpo}</div>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-4 flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleReply(selected)}>
                      <Reply className="w-3.5 h-3.5 mr-1.5" /> Responder
                    </Button>
                  </div>
                </div>
              ) : loadingDetalle ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400">
                  <RefreshCw className="w-8 h-8 animate-spin text-sky-500 mb-2" />
                  <p className="text-sm">Descargando correo del servidor...</p>
                </div>
              ) : externoDetalle ? (
                // Detalle Externo IMAP
                <div className="p-6 space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">{externoDetalle.asunto}</h2>
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700 border">
                          {externoDetalle.de.charAt(0).toUpperCase() || 'E'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{externoDetalle.de}</p>
                          <p className="text-xs text-slate-500">Carpeta IMAP: {imapFolder}</p>
                        </div>
                      </div>
                      <span className="text-xs text-slate-500">{externoDetalle.fecha ? fmtFecha(externoDetalle.fecha) : ''}</span>
                    </div>

                    {externoDetalle.adjuntos.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {externoDetalle.adjuntos.map((a, i) => (
                          <div key={i} className="inline-flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg p-2">
                            <Paperclip className="w-3 h-3 text-slate-400" />
                            <span className="font-medium text-slate-700">{a.nombre}</span>
                            <span className="text-slate-400 text-[10px]">({a.tipo || 'archivo'})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-6">
                    {externoDetalle.html ? (
                      <div className="text-sm text-slate-700 leading-relaxed max-w-full overflow-x-auto shadow-inner p-4 rounded-lg bg-slate-50/20 border" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(externoDetalle.html) }} />
                    ) : (
                      <div className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed p-4 rounded-lg bg-slate-50/20 border">{externoDetalle.texto}</div>
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
            
            // LISTA DE MENSAJES (VISTA INBOX / SENT / TRASH / EXTERNO)
            <div className="flex-1 flex flex-col overflow-hidden">
              
              {/* Barra de herramientas superior de la Lista */}
              <div className="flex items-center justify-between border-b border-slate-100 p-3 bg-slate-50/30">
                <div className="flex items-center gap-2">
                  <button className="p-2 hover:bg-slate-200/60 rounded-lg text-slate-500 transition-colors">
                    <Square className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => {
                      if (folder === 'externo') refetchExternos();
                      else invalidateAll();
                    }} 
                    className="p-2 hover:bg-slate-200/60 rounded-lg text-slate-500 transition-colors"
                    title="Actualizar listado"
                  >
                    <RefreshCw className={`w-4 h-4 ${(folder === 'externo' && fetchingExternos) ? 'animate-spin' : ''}`} />
                  </button>
                  <button className="p-2 hover:bg-slate-200/60 rounded-lg text-slate-500 transition-colors">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 select-none">
                    {folder === 'externo' ? externosFiltrados.length : mensajesFiltrados.length} correos
                  </span>
                </div>
              </div>

              {/* CATEGORÍAS GMAIL EN LA PARTE SUPERIOR */}
              {folder === 'inbox' && (
                <div className="grid grid-cols-4 border-b border-slate-100 text-slate-500 text-xs font-semibold select-none">
                  {[
                    { id: 'primary' as GmailCategory, label: 'Principal', icon: Inbox, colorClass: 'border-blue-600 text-blue-600 bg-blue-50/20' },
                    { id: 'social' as GmailCategory, label: 'Social', icon: Users, colorClass: 'border-purple-600 text-purple-600 bg-purple-50/20' },
                    { id: 'promotions' as GmailCategory, label: 'Promociones', icon: Tag, colorClass: 'border-green-600 text-green-600 bg-green-50/20' },
                    { id: 'updates' as GmailCategory, label: 'Actualizaciones', icon: Info, colorClass: 'border-amber-600 text-amber-600 bg-amber-50/20' },
                  ].map((cat) => {
                    const CatIcon = cat.icon;
                    const isSelected = activeCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => { setActiveCategory(cat.id); setSelected(null); }}
                        className={`flex items-center justify-center gap-2 py-3 border-b-2 transition-all duration-150 ${isSelected ? cat.colorClass : 'border-transparent hover:bg-slate-50 text-slate-500'}`}
                      >
                        <CatIcon className="w-4 h-4" />
                        <span>{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* LISTA DE CORREOS */}
              <div className="flex-1 overflow-y-auto">
                {folder === 'externo' ? (
                  // Lista IMAP
                  !perfil?.buzon_configurado ? (
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
                    <div className="p-8 text-center text-sm text-slate-400">Bandeja vacía en {imapFolder}</div>
                  ) : (
                    externosFiltrados.map((m) => (
                      <div
                        key={m.uid}
                        onClick={() => setSelectedExterno(m.uid)}
                        className={`group flex items-center justify-between px-4 py-2.5 border-b border-slate-100 hover:shadow-[inset_4px_0_0_#1e3a5f] hover:bg-slate-50/50 cursor-pointer transition-all duration-150 ${!m.leido ? 'bg-sky-50/20' : ''}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
                          <button onClick={(e) => e.stopPropagation()} className="text-slate-300 hover:text-slate-500">
                            <Square className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => e.stopPropagation()} className="text-slate-300 hover:text-amber-500">
                            <Star className="w-4 h-4" />
                          </button>
                          <div className={`w-40 flex-shrink-0 truncate text-sm ${!m.leido ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                            {m.de}
                          </div>
                          <div className="min-w-0 flex-1 text-sm truncate flex items-center gap-2">
                            <span className={!m.leido ? 'font-bold text-slate-900' : 'text-slate-800'}>{m.asunto}</span>
                            <span className="text-slate-400 font-normal">- (Mensaje de correo)</span>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 font-medium whitespace-nowrap pl-2">
                          {m.fecha ? fmtFecha(m.fecha) : ''}
                        </div>
                      </div>
                    ))
                  )
                ) : (
                  // Lista Interna
                  isLoading ? (
                    <div className="p-8 text-center text-sm text-slate-400">Cargando mensajes del sistema...</div>
                  ) : mensajesFiltrados.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-400">Sin mensajes en esta carpeta</div>
                  ) : (
                    mensajesFiltrados.map((m) => {
                      const otro = folder === 'sent' ? contactosMap[m.destinatario_id] : contactosMap[m.remitente_id];
                      const noLeido = folder === 'inbox' && !m.leido;
                      const snippet = stripHtml(m.cuerpo);
                      return (
                        <div
                          key={m.id}
                          onClick={() => openMensaje(m)}
                          className={`group flex items-center justify-between px-4 py-2.5 border-b border-slate-100 hover:shadow-[inset_4px_0_0_#1e3a5f] hover:bg-slate-50/50 cursor-pointer transition-all duration-150 ${noLeido ? 'bg-sky-50/30' : ''}`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1 mr-4">
                            <button onClick={(e) => e.stopPropagation()} className="text-slate-300 hover:text-slate-500">
                              <Square className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                accionMutation.mutate({ id: m.id, accion: m.destacado ? 'quitar-destacado' : 'destacado' });
                              }} 
                              className={`transition-colors ${m.destacado ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`}
                            >
                              <Star className={`w-4 h-4 ${m.destacado ? 'fill-amber-500' : ''}`} />
                            </button>
                            <div className={`w-40 flex-shrink-0 truncate text-sm ${noLeido ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                              {otro?.username ?? '—'}
                            </div>
                            <div className="min-w-0 flex-1 text-sm truncate flex items-center gap-2">
                              <span className={noLeido ? 'font-bold text-slate-900' : 'text-slate-800'}>{m.asunto}</span>
                              <span className="text-slate-400 font-normal">- {snippet}</span>
                            </div>
                          </div>
                          <div className="text-xs text-slate-500 font-medium whitespace-nowrap pl-2">
                            {fmtFecha(m.fecha_envio)}
                          </div>
                        </div>
                      );
                    })
                  )
                )}
              </div>

            </div>
          )}

        </div>

      </div>

      {/* ── VENTANA DE COMPOSE FLOTANTE (ESTILO GMAIL EN LA ESQUINA INFERIOR DERECHA) ── */}
      {composeOpen && (
        <div 
          className={`z-50 bg-white border border-slate-300 shadow-2xl flex flex-col overflow-hidden transition-all duration-200
            ${composeMinimized 
              ? 'fixed bottom-0 right-12 w-[280px] h-[40px] rounded-t-xl' 
              : composeMaximized 
                ? 'fixed inset-4 sm:inset-10 md:inset-16 rounded-xl' 
                : 'fixed bottom-0 right-12 w-[540px] h-[580px] rounded-t-xl'
            }`}
        >
          {/* Header de la ventana */}
          <div 
            onClick={() => composeMinimized && setComposeMinimized(false)}
            className="bg-[#202124] text-white px-4 py-2.5 flex items-center justify-between cursor-pointer select-none"
          >
            <span className="text-xs font-bold font-sans">
              {composeForm.modo === 'interno' ? 'Mensaje interno' : 'Correo nuevo (SMTP)'}
            </span>
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
              
              {/* Toggles Modo Interno / Externo */}
              <div className="p-2 bg-slate-50 border-b flex gap-2">
                <button 
                  type="button" 
                  onClick={() => setComposeForm((f) => ({ ...f, modo: 'interno' }))} 
                  className={`flex-1 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${composeForm.modo === 'interno' ? 'bg-primary/10 text-primary border-primary/30' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                >
                  <Inbox className="w-3.5 h-3.5 inline mr-1" /> Interno del sistema
                </button>
                <button 
                  type="button" 
                  onClick={() => setComposeForm((f) => ({ ...f, modo: 'externo' }))} 
                  className={`flex-1 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${composeForm.modo === 'externo' ? 'bg-primary/10 text-primary border-primary/30' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                >
                  <Globe className="w-3.5 h-3.5 inline mr-1" /> Correo Externo (Real)
                </button>
              </div>

              {/* Campos Para / Asunto */}
              <div className="px-3 divide-y divide-slate-100 text-sm">
                
                {composeForm.modo === 'interno' ? (
                  <div className="flex items-center gap-2 py-1.5">
                    <span className="text-xs text-slate-500 w-12">Para:</span>
                    <Select 
                      className="border-0 shadow-none focus:ring-0 h-8 text-xs font-semibold w-full" 
                      value={composeForm.destinatario_id} 
                      onChange={(e) => setComposeForm((f) => ({ ...f, destinatario_id: e.target.value }))}
                    >
                      <option value="" disabled>Seleccionar integrante...</option>
                      {contactos.map((c) => <option key={c.id} value={c.id}>{c.username} ({c.email})</option>)}
                    </Select>
                  </div>
                ) : (
                  <>
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
                  </>
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

                {/* Adjuntos y Vista Previa Firma (Solo Externos) */}
                {composeForm.modo === 'externo' && (
                  <div className="space-y-2">
                    {adjuntos.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {adjuntos.map((f, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-slate-100 border rounded-lg px-2 py-1">
                            <FileText className="w-3 h-3 text-slate-500" />
                            <span className="max-w-[130px] truncate">{f.name}</span>
                            <button 
                              type="button" 
                              onClick={() => setAdjuntos((a) => a.filter((_, j) => j !== i))} 
                              className="text-slate-400 hover:text-red-500 font-bold ml-1"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {perfil && (
                      <div className="border border-slate-200/80 rounded-lg p-2.5 bg-slate-50/50">
                        <p className="text-[10px] text-slate-400 mb-1.5 font-semibold uppercase tracking-wider">Tu firma corporativa automática:</p>
                        <FirmaPreview firma={perfil.firma} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer con acciones */}
              <div className="p-3 border-t bg-slate-50/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={sendMutation.isPending} size="sm" className="bg-[#1e3a5f] hover:bg-[#152a45]">
                    <Send className="w-3.5 h-3.5 mr-1.5" /> 
                    {sendMutation.isPending ? 'Enviando...' : 'Enviar'}
                  </Button>
                  
                  {composeForm.modo === 'externo' && (
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
                  )}
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

      {/* ── MODAL DE CONFIGURACIÓN DE FIRMA Y CONFIGURACIÓN SMTP/IMAP ── */}
      <PerfilCorreoDialog open={perfilOpen} onClose={() => { setPerfilOpen(false); refetchFolders(); }} perfil={perfil} />

    </div>
  );
}

function PerfilCorreoDialog({ open, onClose, perfil }: { open: boolean; onClose: () => void; perfil?: PerfilCorreo }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    nombre: '', puesto: '', telefono: '', correo: '',
    correo_imap_host: '', correo_imap_puerto: '993',
    correo_smtp_host: '', correo_smtp_puerto: '465',
    correo_ssl: true, correo_usuario: '', correo_password: '',
  });

  useEffect(() => {
    if (perfil && open) {
      setForm({
        nombre: perfil.firma.nombre || '', puesto: perfil.firma.puesto || '', telefono: perfil.firma.telefono || '', correo: perfil.firma.correo || '',
        correo_imap_host: perfil.correo_imap_host, correo_imap_puerto: String(perfil.correo_imap_puerto),
        correo_smtp_host: perfil.correo_smtp_host, correo_smtp_puerto: String(perfil.correo_smtp_puerto),
        correo_ssl: perfil.correo_ssl, correo_usuario: perfil.correo_usuario, correo_password: '',
      });
    }
  }, [perfil, open]);

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
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-xl">
        <DialogHeader>
          <DialogTitle>Mi Firma e Integración de Correo</DialogTitle>
          <DialogDescription>
            Configura tu información personal para la firma del correo y tus credenciales de entrada (IMAP) y salida (SMTP).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          
          {/* Firma personal */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-800 border-b pb-1">Firma Corporativa</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Nombre completo</label>
                <Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Puesto / Cargo</label>
                <Input value={form.puesto} onChange={(e) => setForm((f) => ({ ...f, puesto: e.target.value }))} placeholder="Ej. Supervisor de Operaciones" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Teléfono directo</label>
                <Input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Correo corporativo</label>
                <Input type="email" value={form.correo} onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))} />
              </div>
            </div>
            
            {/* Vista Previa de la Firma */}
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
              <p className="text-[10px] text-slate-400 mb-2 font-semibold uppercase tracking-wider">Vista previa de tu firma:</p>
              <FirmaPreview firma={{ nombre: form.nombre, puesto: form.puesto, telefono: form.telefono, correo: form.correo }} />
            </div>
          </div>

          {/* Configuración de buzón personal */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-800 border-b pb-1">Buzón Personal (IMAP / SMTP)</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Correo / Usuario</label>
                <Input value={form.correo_usuario} onChange={(e) => setForm((f) => ({ ...f, correo_usuario: e.target.value }))} placeholder="usuario@empresa.com" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-500">Contraseña de aplicación</label>
                <Input 
                  type="password" 
                  value={form.correo_password} 
                  onChange={(e) => setForm((f) => ({ ...f, correo_password: e.target.value }))} 
                  placeholder={perfil?.tiene_password ? 'Guardada — escribe para modificar' : 'Contraseña o App Password'} 
                  autoComplete="new-password" 
                />
              </div>
              
              <div className="grid grid-cols-[1fr_80px] gap-2 col-span-2 sm:col-span-1">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Servidor IMAP (Entrada)</label>
                  <Input value={form.correo_imap_host} onChange={(e) => setForm((f) => ({ ...f, correo_imap_host: e.target.value }))} placeholder="imap.correo.com" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Puerto</label>
                  <Input type="number" value={form.correo_imap_puerto} onChange={(e) => setForm((f) => ({ ...f, correo_imap_puerto: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-[1fr_80px] gap-2 col-span-2 sm:col-span-1">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Servidor SMTP (Salida)</label>
                  <Input value={form.correo_smtp_host} onChange={(e) => setForm((f) => ({ ...f, correo_smtp_host: e.target.value }))} placeholder="smtp.correo.com" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Puerto</label>
                  <Input type="number" value={form.correo_smtp_puerto} onChange={(e) => setForm((f) => ({ ...f, correo_smtp_puerto: e.target.value }))} />
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  checked={form.correo_ssl} 
                  onChange={(e) => setForm((f) => ({ ...f, correo_ssl: e.target.checked }))} 
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500" 
                /> 
                <span>Usar SSL/TLS para conexiones seguras</span>
              </label>
            </div>
            <p className="text-[11px] text-slate-400 bg-amber-50 border border-amber-200/50 p-2.5 rounded-lg leading-normal mt-2">
              <strong>Nota:</strong> Si utilizas proveedores como Gmail u Outlook, debes generar una <em>contraseña de aplicación</em> desde la seguridad de tu cuenta para permitir el inicio de sesión. Si dejas la configuración en blanco, el correo externo saldrá por el servidor SMTP por defecto del sistema.
            </p>
          </div>

        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={guardarMutation.isPending} onClick={() => guardarMutation.mutate()} className="bg-[#1e3a5f] hover:bg-[#152a45]">
            {guardarMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
