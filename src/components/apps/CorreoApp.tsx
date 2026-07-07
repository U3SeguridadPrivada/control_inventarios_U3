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
import { Pencil, Inbox, Send, Trash2, Star, Reply, Globe, Settings, RefreshCw, Paperclip, X, FileText } from 'lucide-react';
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

type Folder = 'inbox' | 'sent' | 'trash' | 'externo';

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function FirmaPreview({ firma }: { firma: { nombre: string; puesto: string; telefono: string; correo: string } }) {
  return (
    <div className="border-l-[3px] pl-3.5 py-0.5" style={{ borderColor: '#1e3a5f' }}>
      <p className="text-[15px] font-bold text-slate-800 m-0">{firma.nombre || 'Tu nombre'}</p>
      {firma.puesto && <p className="text-xs text-slate-500 mt-0.5">{firma.puesto}</p>}
      <p className="text-xs font-bold mt-1.5" style={{ color: '#1e3a5f' }}>U3 SEGURIDAD PRIVADA, S.A. DE C.V.</p>
      {firma.telefono && <p className="text-xs text-slate-600 mt-1">Tel: {firma.telefono}</p>}
      {firma.correo && <p className="text-xs text-slate-600 mt-0.5">{firma.correo}</p>}
    </div>
  );
}

export default function CorreoApp() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState<Folder>('inbox');
  const [selected, setSelected] = useState<Mensaje | null>(null);
  const [selectedExterno, setSelectedExterno] = useState<number | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [composeForm, setComposeForm] = useState({ modo: 'interno' as 'interno' | 'externo', destinatario_id: '', para: '', cc: '', bcc: '', asunto: '', cuerpo: '' });
  const [mostrarCc, setMostrarCc] = useState(false);
  const [mostrarBcc, setMostrarBcc] = useState(false);
  const [adjuntos, setAdjuntos] = useState<File[]>([]);

  const COMPOSE_VACIO = { modo: 'interno' as const, destinatario_id: '', para: '', cc: '', bcc: '', asunto: '', cuerpo: '' };
  const abrirCompose = (form: typeof composeForm) => {
    setComposeForm(form);
    setAdjuntos([]);
    setMostrarCc(false);
    setMostrarBcc(false);
    setComposeOpen(true);
  };

  const { data: mensajes = [], isLoading } = useQuery({
    queryKey: ['mensajes', folder],
    queryFn: () => apiFetch<Mensaje[]>(`/api/mensajes?folder=${folder}`),
    enabled: folder !== 'externo',
  });
  const { data: contactos = [] } = useQuery({
    queryKey: ['mensajesContactos'],
    queryFn: () => apiFetch<Contacto[]>('/api/mensajes/contactos'),
  });
  const contactosMap = useMemo(() => Object.fromEntries(contactos.map((c) => [c.id, c])), [contactos]);

  const { data: perfil } = useQuery({ queryKey: ['perfil-correo'], queryFn: () => apiFetch<PerfilCorreo>('/api/auth/perfil-correo') });

  const { data: externos = [], isLoading: loadingExternos, error: errorExternos, refetch: refetchExternos, isFetching: fetchingExternos } = useQuery({
    queryKey: ['correo-externo'],
    queryFn: () => apiFetch<CorreoExterno[]>('/api/correo/externo'),
    enabled: folder === 'externo' && !!perfil?.buzon_configurado,
    retry: false,
    staleTime: 60_000,
  });

  const { data: externoDetalle, isLoading: loadingDetalle } = useQuery({
    queryKey: ['correo-externo-detalle', selectedExterno],
    queryFn: () => apiFetch<CorreoExternoDetalle>(`/api/correo/externo?uid=${selectedExterno}`),
    enabled: folder === 'externo' && !!selectedExterno,
    staleTime: Infinity,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['mensajes'] });
    queryClient.invalidateQueries({ queryKey: ['mensajesNoLeidos'] });
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
    `<br><br><div style="color:#64748b;font-size:12px;">${encabezado}</div><blockquote>${contenidoHtml}</blockquote>`;

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

  const FOLDER_TABS: { id: Folder; label: string; icon: typeof Inbox }[] = [
    { id: 'inbox', label: 'Bandeja de entrada', icon: Inbox },
    { id: 'externo', label: 'Buzón externo', icon: Globe },
    { id: 'sent', label: 'Enviados', icon: Send },
    { id: 'trash', label: 'Papelera', icon: Trash2 },
  ];

  return (
    <div className="flex h-full gap-4 -m-6 p-6">
      <div className="w-52 flex-shrink-0 space-y-1">
        <Button className="w-full mb-3" onClick={() => abrirCompose({ ...COMPOSE_VACIO, modo: folder === 'externo' ? 'externo' : 'interno' })}>
          <Pencil className="w-4 h-4 mr-2" /> Redactar
        </Button>
        {FOLDER_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = folder === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { setFolder(tab.id); setSelected(null); setSelectedExterno(null); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${active ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
        <div className="pt-3 mt-3 border-t border-border">
          <button
            onClick={() => setPerfilOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Settings className="w-4 h-4" /> Mi correo y firma
          </button>
        </div>
      </div>

      <div className="w-72 flex-shrink-0 border border-border rounded-xl overflow-y-auto bg-card">
        {folder === 'externo' ? (
          !perfil?.buzon_configurado ? (
            <div className="p-6 text-center text-sm text-muted-foreground space-y-3">
              <Globe className="w-8 h-8 mx-auto opacity-40" />
              <p>Configura tu buzón personal (IMAP) para ver tu correo real aquí.</p>
              <Button size="sm" variant="outline" onClick={() => setPerfilOpen(true)}>Configurar</Button>
            </div>
          ) : loadingExternos ? (
            <div className="p-6 text-center text-sm text-muted-foreground animate-pulse">Conectando al buzón...</div>
          ) : errorExternos ? (
            <div className="p-6 text-center text-sm text-destructive space-y-2">
              <p>{(errorExternos as Error).message}</p>
              <Button size="sm" variant="outline" onClick={() => refetchExternos()}>Reintentar</Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
                <span className="text-xs text-muted-foreground truncate">{perfil?.correo_usuario}</span>
                <button onClick={() => refetchExternos()} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" title="Actualizar">
                  <RefreshCw className={`w-3.5 h-3.5 ${fetchingExternos ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {externos.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Bandeja vacía</div>
              ) : externos.map((m) => (
                <button
                  key={m.uid}
                  onClick={() => setSelectedExterno(m.uid)}
                  className={`w-full text-left px-4 py-3 border-b border-border/60 hover:bg-muted/40 transition-colors ${selectedExterno === m.uid ? 'bg-primary/5' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${!m.leido ? 'font-bold text-foreground' : 'font-medium text-foreground/80'}`}>{m.de}</span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{m.fecha ? fmtFecha(m.fecha) : ''}</span>
                  </div>
                  <p className={`text-sm truncate mt-0.5 ${!m.leido ? 'font-semibold' : ''}`}>{m.asunto}</p>
                </button>
              ))}
            </>
          )
        ) : isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Cargando...</div>
        ) : mensajes.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Sin mensajes</div>
        ) : (
          mensajes.map((m) => {
            const otro = folder === 'sent' ? contactosMap[m.destinatario_id] : contactosMap[m.remitente_id];
            const noLeido = folder === 'inbox' && !m.leido;
            return (
              <button
                key={m.id}
                onClick={() => openMensaje(m)}
                className={`w-full text-left px-4 py-3 border-b border-border/60 hover:bg-muted/40 transition-colors ${selected?.id === m.id ? 'bg-primary/5' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm truncate ${noLeido ? 'font-bold text-foreground' : 'font-medium text-foreground/80'}`}>{otro?.username ?? '—'}</span>
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtFecha(m.fecha_envio)}</span>
                </div>
                <p className={`text-sm truncate mt-0.5 ${noLeido ? 'font-semibold' : ''}`}>
                  {m.destacado === 1 && <Star className="w-3 h-3 inline mr-1 text-amber-500 fill-amber-500" />}
                  {m.asunto}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{m.es_html ? stripHtml(m.cuerpo) : m.cuerpo}</p>
              </button>
            );
          })
        )}
      </div>

      <div className="flex-1 border border-border rounded-xl bg-card overflow-y-auto p-6">
        {folder === 'externo' ? (
          !selectedExterno ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Selecciona un correo para leerlo</div>
          ) : loadingDetalle ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground animate-pulse">Descargando correo...</div>
          ) : externoDetalle ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">{externoDetalle.asunto}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    De: <span className="font-medium text-foreground">{externoDetalle.de}</span>
                    {externoDetalle.fecha ? ` · ${fmtFecha(externoDetalle.fecha)}` : ''}
                  </p>
                  {externoDetalle.adjuntos.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Paperclip className="w-3 h-3" /> {externoDetalle.adjuntos.map((a) => a.nombre).join(', ')}</p>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => handleReplyExterno(externoDetalle)}><Reply className="w-3.5 h-3.5 mr-1.5" /> Responder</Button>
              </div>
              {externoDetalle.html ? (
                <div className="text-sm leading-relaxed border-t border-border pt-4" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(externoDetalle.html) }} />
              ) : (
                <div className="whitespace-pre-wrap text-sm leading-relaxed border-t border-border pt-4">{externoDetalle.texto}</div>
              )}
            </div>
          ) : null
        ) : !selected ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Selecciona un mensaje para leerlo</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">{selected.asunto}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  De: <span className="font-medium text-foreground">{contactosMap[selected.remitente_id]?.username ?? (selected.remitente_id === user?.id ? 'Tú' : '—')}</span>
                  {' · '}{fmtFecha(selected.fecha_envio)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Button size="sm" variant="outline" onClick={() => handleReply(selected)}><Reply className="w-3.5 h-3.5 mr-1.5" /> Responder</Button>
                <Button
                  size="sm" variant="outline"
                  onClick={() => accionMutation.mutate({ id: selected.id, accion: selected.destacado ? 'quitar-destacado' : 'destacado' })}
                >
                  <Star className={`w-3.5 h-3.5 ${selected.destacado ? 'text-amber-500 fill-amber-500' : ''}`} />
                </Button>
                {folder === 'trash' ? (
                  <Button size="sm" variant="outline" onClick={() => { accionMutation.mutate({ id: selected.id, accion: 'restaurar' }); setSelected(null); }}>Restaurar</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => { accionMutation.mutate({ id: selected.id, accion: 'papelera' }); setSelected(null); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                )}
              </div>
            </div>
            {selected.es_html ? (
              <div className="text-sm leading-relaxed border-t border-border pt-4" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.cuerpo) }} />
            ) : (
              <div className="whitespace-pre-wrap text-sm leading-relaxed border-t border-border pt-4">{selected.cuerpo}</div>
            )}
          </div>
        )}
      </div>

      {/* ── Redactar (interno o externo), estilo Gmail ── */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen} className="max-w-2xl">
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSend}>
            <DialogHeader>
              <DialogTitle>Redactar</DialogTitle>
              <DialogDescription>{composeForm.modo === 'interno' ? 'Mensaje interno a otro usuario del sistema' : 'Correo real — saldrá con la plantilla corporativa y tu firma'}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setComposeForm((f) => ({ ...f, modo: 'interno' }))} className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${composeForm.modo === 'interno' ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                  <Inbox className="w-3.5 h-3.5 inline mr-1.5" /> Interno
                </button>
                <button type="button" onClick={() => setComposeForm((f) => ({ ...f, modo: 'externo' }))} className={`text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${composeForm.modo === 'externo' ? 'bg-primary/10 text-primary border-primary/30' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                  <Globe className="w-3.5 h-3.5 inline mr-1.5" /> Correo externo
                </button>
              </div>

              {composeForm.modo === 'interno' ? (
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <span className="text-xs text-muted-foreground w-10">Para</span>
                  <Select className="border-0 shadow-none focus:ring-0 h-8" value={composeForm.destinatario_id} onChange={(e) => setComposeForm((f) => ({ ...f, destinatario_id: e.target.value }))}>
                    <option value="" disabled>Seleccionar usuario...</option>
                    {contactos.map((c) => <option key={c.id} value={c.id}>{c.username}</option>)}
                  </Select>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 border-b border-border pb-1.5">
                    <span className="text-xs text-muted-foreground w-10">Para</span>
                    <input type="text" value={composeForm.para} onChange={(e) => setComposeForm((f) => ({ ...f, para: e.target.value }))} placeholder="destinatario@dominio.com (separa varios con coma)" className="flex-1 text-sm bg-transparent outline-none h-8" />
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {!mostrarCc && <button type="button" className="hover:text-primary" onClick={() => setMostrarCc(true)}>Cc</button>}
                      {!mostrarBcc && <button type="button" className="hover:text-primary" onClick={() => setMostrarBcc(true)}>Cco</button>}
                    </div>
                  </div>
                  {mostrarCc && (
                    <div className="flex items-center gap-2 border-b border-border pb-1.5">
                      <span className="text-xs text-muted-foreground w-10">Cc</span>
                      <input type="text" value={composeForm.cc} onChange={(e) => setComposeForm((f) => ({ ...f, cc: e.target.value }))} className="flex-1 text-sm bg-transparent outline-none h-8" />
                    </div>
                  )}
                  {mostrarBcc && (
                    <div className="flex items-center gap-2 border-b border-border pb-1.5">
                      <span className="text-xs text-muted-foreground w-10">Cco</span>
                      <input type="text" value={composeForm.bcc} onChange={(e) => setComposeForm((f) => ({ ...f, bcc: e.target.value }))} className="flex-1 text-sm bg-transparent outline-none h-8" />
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center gap-2 border-b border-border pb-1.5">
                <span className="text-xs text-muted-foreground w-10">Asunto</span>
                <input value={composeForm.asunto} onChange={(e) => setComposeForm((f) => ({ ...f, asunto: e.target.value }))} required className="flex-1 text-sm font-medium bg-transparent outline-none h-8" />
              </div>

              <RichTextEditor
                initialHtml={composeForm.cuerpo}
                onChange={(html) => setComposeForm((f) => ({ ...f, cuerpo: html }))}
                placeholder="Escribe tu mensaje..."
              />

              {composeForm.modo === 'externo' && (
                <div className="space-y-2">
                  {adjuntos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {adjuntos.map((f, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 text-xs bg-muted border border-border rounded-full pl-2.5 pr-1 py-1">
                          <FileText className="w-3 h-3 text-muted-foreground" />
                          <span className="max-w-[160px] truncate">{f.name}</span>
                          <span className="text-muted-foreground">({fmtBytes(f.size)})</span>
                          <button type="button" onClick={() => setAdjuntos((a) => a.filter((_, j) => j !== i))} className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-border transition-colors"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  {perfil && (
                    <div className="border border-border rounded-lg p-3 bg-muted/20 space-y-2">
                      <p className="text-xs text-muted-foreground">Se agregará tu firma automáticamente:</p>
                      <FirmaPreview firma={perfil.firma} />
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter className="items-center">
              {composeForm.modo === 'externo' && (
                <label className="mr-auto cursor-pointer" title="Adjuntar archivos (máx. 15 MB)">
                  <span className="w-9 h-9 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><Paperclip className="w-4 h-4" /></span>
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
              <Button type="button" variant="outline" onClick={() => setComposeOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={sendMutation.isPending}><Send className="w-3.5 h-3.5 mr-1.5" /> {sendMutation.isPending ? 'Enviando...' : 'Enviar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PerfilCorreoDialog open={perfilOpen} onClose={() => setPerfilOpen(false)} perfil={perfil} />
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
      toast.success('Perfil de correo guardado');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mi correo y firma</DialogTitle>
          <DialogDescription>Tu firma sale en todos los correos que envías desde el sistema. El buzón personal conecta tu correo real (entrada IMAP y salida SMTP).</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Firma personal</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Nombre completo</label><Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Puesto</label><Input value={form.puesto} onChange={(e) => setForm((f) => ({ ...f, puesto: e.target.value }))} placeholder="Supervisor Operativo" /></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Teléfono</label><Input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Correo (visible en la firma)</label><Input type="email" value={form.correo} onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))} /></div>
            </div>
            <div className="border border-border rounded-lg p-3 bg-muted/20">
              <p className="text-xs text-muted-foreground mb-2">Vista previa:</p>
              <FirmaPreview firma={{ nombre: form.nombre, puesto: form.puesto, telefono: form.telefono, correo: form.correo }} />
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Buzón personal (correo real)</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Correo / usuario</label><Input value={form.correo_usuario} onChange={(e) => setForm((f) => ({ ...f, correo_usuario: e.target.value }))} placeholder="tu@dominio.com" /></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Contraseña</label><Input type="password" value={form.correo_password} onChange={(e) => setForm((f) => ({ ...f, correo_password: e.target.value }))} placeholder={perfil?.tiene_password ? 'Guardada — escribe para cambiarla' : 'Contraseña o app password'} autoComplete="new-password" /></div>
              <div className="grid grid-cols-[1fr_80px] gap-2 col-span-2 sm:col-span-1">
                <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Servidor IMAP (entrada)</label><Input value={form.correo_imap_host} onChange={(e) => setForm((f) => ({ ...f, correo_imap_host: e.target.value }))} placeholder="imap.dominio.com" /></div>
                <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Puerto</label><Input type="number" value={form.correo_imap_puerto} onChange={(e) => setForm((f) => ({ ...f, correo_imap_puerto: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-[1fr_80px] gap-2 col-span-2 sm:col-span-1">
                <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Servidor SMTP (salida)</label><Input value={form.correo_smtp_host} onChange={(e) => setForm((f) => ({ ...f, correo_smtp_host: e.target.value }))} placeholder="smtp.dominio.com" /></div>
                <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">Puerto</label><Input type="number" value={form.correo_smtp_puerto} onChange={(e) => setForm((f) => ({ ...f, correo_smtp_puerto: e.target.value }))} /></div>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={form.correo_ssl} onChange={(e) => setForm((f) => ({ ...f, correo_ssl: e.target.checked }))} className="rounded border-border" /> Usar SSL/TLS
            </label>
            <p className="text-xs text-muted-foreground">Si usas Gmail u Outlook necesitas una &quot;contraseña de aplicación&quot;, no tu contraseña normal. Si dejas el buzón vacío, tus correos externos saldrán por el servidor del sitio.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={guardarMutation.isPending} onClick={() => guardarMutation.mutate()}>{guardarMutation.isPending ? 'Guardando...' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
