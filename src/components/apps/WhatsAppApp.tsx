'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Badge } from '@/src/components/ui/badge';
import { MessageCircle, Search, Send, Bot, User, Pause, Play, ShieldCheck, Contact2, UserSearch } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';

interface ChatResumen {
  telefono: string;
  bot_activo: number;
  no_leidos: number;
  ultima_actividad: string | null;
  ultimo_mensaje: string;
  ultimo_autor: string | null;
  contacto_nombre: string | null;
  contacto_tipo: string;
}

interface Mensaje { id: number; rol: string; autor: string | null; mensaje: string; created_at: string | null }

function formatHora(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso.includes('T') || iso.includes(' ') ? iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z') : iso);
  if (isNaN(d.getTime())) return '';
  const hoy = new Date();
  const esHoy = d.toDateString() === hoy.toDateString();
  return esHoy
    ? d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function iconoTipo(tipo: string) {
  if (tipo === 'Guardia') return <ShieldCheck className="w-3.5 h-3.5" />;
  if (tipo === 'Cliente') return <Contact2 className="w-3.5 h-3.5" />;
  if (tipo.startsWith('Candidato')) return <UserSearch className="w-3.5 h-3.5" />;
  return <User className="w-3.5 h-3.5" />;
}

function VentanaChat({ chat }: { chat: ChatResumen }) {
  const { isEditor } = useAuth();
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['whatsapp-chat', chat.telefono],
    queryFn: () => apiFetch<{ telefono: string; bot_activo: number; mensajes: Mensaje[] }>(`/api/whatsapp/chats/${chat.telefono}`),
    refetchInterval: 3000, // "en vivo": refresca cada 3 segundos
  });

  const mensajes = data?.mensajes ?? [];
  const botActivo = data?.bot_activo ?? chat.bot_activo;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [mensajes.length]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['whatsapp-chat', chat.telefono] });
    queryClient.invalidateQueries({ queryKey: ['whatsapp-chats'] });
  };

  const enviarMutation = useMutation({
    mutationFn: () => apiFetch(`/api/whatsapp/chats/${chat.telefono}`, { method: 'POST', body: JSON.stringify({ mensaje: texto }) }),
    onSuccess: () => {
      setTexto('');
      invalidate();
      if (botActivo === 1) toast.info('Bot pausado en este chat — tú tienes el control. Reactívalo cuando termines.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleBotMutation = useMutation({
    mutationFn: (activo: boolean) => apiFetch(`/api/whatsapp/chats/${chat.telefono}`, { method: 'PATCH', body: JSON.stringify({ bot_activo: activo }) }),
    onSuccess: (_d, activo) => { invalidate(); toast.success(activo ? 'Bot reactivado en este chat' : 'Bot pausado — tú tienes el control'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">{chat.contacto_nombre || `+${chat.telefono}`}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">{iconoTipo(chat.contacto_tipo)} {chat.contacto_tipo} · +{chat.telefono}</p>
        </div>
        {isEditor && (
          <Button
            size="sm"
            variant={botActivo === 1 ? 'outline' : 'default'}
            disabled={toggleBotMutation.isPending}
            onClick={() => toggleBotMutation.mutate(botActivo !== 1)}
          >
            {botActivo === 1
              ? <><Pause className="w-3.5 h-3.5 mr-1.5" /> Pausar bot</>
              : <><Play className="w-3.5 h-3.5 mr-1.5" /> Reactivar bot</>}
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
        {mensajes.length === 0 && <p className="text-xs text-muted-foreground text-center pt-10">Sin mensajes en este chat.</p>}
        {mensajes.map((m) => {
          const esContacto = m.autor === 'contacto' || m.rol === 'user';
          const esHumano = m.autor === 'humano';
          return (
            <div key={m.id} className={`flex ${esContacto ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap shadow-sm ${
                esContacto ? 'bg-card border border-border rounded-bl-sm'
                : esHumano ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-emerald-600 text-white rounded-br-sm'
              }`}>
                {m.mensaje}
                <div className={`text-[10px] mt-1 flex items-center gap-1 ${esContacto ? 'text-muted-foreground' : 'text-white/75'}`}>
                  {!esContacto && (esHumano ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />)}
                  {esContacto ? 'Contacto' : esHumano ? 'Tú (manual)' : 'Bot'} · {formatHora(m.created_at)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isEditor && (
        <form
          className="flex items-center gap-2 p-3 border-t border-border bg-card"
          onSubmit={(e) => { e.preventDefault(); if (texto.trim()) enviarMutation.mutate(); }}
        >
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={botActivo === 1 ? 'Escribir aquí pausa el bot y tomas tú el control...' : 'Escribe tu mensaje...'}
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={!texto.trim() || enviarMutation.isPending}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      )}
    </div>
  );
}

export default function WhatsAppApp() {
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const { data: chats = [], isLoading } = useQuery({
    queryKey: ['whatsapp-chats'],
    queryFn: () => apiFetch<ChatResumen[]>('/api/whatsapp/chats'),
    refetchInterval: 5000, // bandeja en vivo
  });

  const filtrados = useMemo(() => {
    const term = busqueda.toLowerCase();
    return chats.filter((c) => c.telefono.includes(term) || (c.contacto_nombre ?? '').toLowerCase().includes(term));
  }, [chats, busqueda]);

  const chatActivo = chats.find((c) => c.telefono === seleccionado) ?? null;

  return (
    // Márgenes negativos para escapar del padding del layout y aprovechar casi toda la ventana
    <div className="-m-4 sm:-m-6 lg:-m-8 h-[calc(100svh-4rem-var(--safe-top)-var(--mobile-nav-height)-var(--safe-bottom))] flex flex-col animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border bg-card">
        <h1 className="text-base font-bold tracking-tight flex items-center gap-2"><MessageCircle className="w-5 h-5" /> WhatsApp <span className="text-xs font-normal text-muted-foreground hidden sm:inline">— bandeja en vivo del asistente</span></h1>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> En vivo</span>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[320px_1fr] bg-card overflow-hidden">
        <div className={`border-r border-border flex flex-col min-h-0 ${seleccionado ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar chat..." className="pl-9 h-9" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? <p className="text-xs text-muted-foreground p-4 animate-pulse">Cargando chats...</p>
              : filtrados.length === 0 ? <p className="text-xs text-muted-foreground p-4">Todavía no hay conversaciones. Cuando alguien escriba al número de WhatsApp, aparecerá aquí.</p>
              : filtrados.map((c) => (
                <button
                  key={c.telefono}
                  onClick={() => setSeleccionado(c.telefono)}
                  className={`w-full text-left px-3 py-2.5 border-b border-border/60 hover:bg-muted/60 transition-colors ${seleccionado === c.telefono ? 'bg-muted' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{c.contacto_nombre || `+${c.telefono}`}</p>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatHora(c.ultima_actividad)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">
                      {c.ultimo_autor === 'bot' && <Bot className="w-3 h-3 inline mr-1" />}
                      {c.ultimo_autor === 'humano' && <User className="w-3 h-3 inline mr-1" />}
                      {c.ultimo_mensaje}
                    </p>
                    <span className="flex items-center gap-1">
                      {c.bot_activo === 0 && <Badge variant="secondary" className="text-[9px] px-1.5">Manual</Badge>}
                      {c.no_leidos > 0 && <span className="min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center px-1">{c.no_leidos}</span>}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">{iconoTipo(c.contacto_tipo)} {c.contacto_tipo}</p>
                </button>
              ))}
          </div>
        </div>

        <div className={`min-h-0 ${seleccionado ? 'flex flex-col' : 'hidden md:flex'}`}>
          {chatActivo ? (
            <>
              <button className="md:hidden text-xs text-primary px-4 pt-2 text-left" onClick={() => setSeleccionado(null)}>← Volver a chats</button>
              <VentanaChat chat={chatActivo} />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3"><MessageCircle className="w-6 h-6 text-muted-foreground" /></div>
              <p className="text-sm font-semibold">Selecciona una conversación</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">Verás en tiempo real lo que el bot responde. Escribe en cualquier chat para pausar el bot y atenderlo tú.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
