'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/src/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select } from '@/src/components/ui/select';
import { Settings, Landmark, Mail, UserCircle, Lock, Send, Bot, Smartphone, Download, Bell, BellOff, CheckCircle2 } from 'lucide-react';
import { Textarea } from '@/src/components/ui/textarea';
import { toast } from 'sonner';
import { useAuth } from '@/src/context/AuthContext';
import { usePwaInstall } from '@/src/lib/pwa';
import { getNotificationPermission, requestNotificationPermission, sendDeviceNotification } from '@/src/lib/deviceNotifications';


interface SmtpConfig { smtp_host: string; smtp_puerto: string; smtp_ssl: boolean; smtp_usuario: string; smtp_from_nombre: string; app_url: string; tiene_password: boolean }

interface Libro {
  id: string; nombre: string; usuario_id: number | null; responsable: string | null; puede_editar: boolean;
  imap_correo?: string | null; imap_host?: string | null; imap_puerto?: number | null; imap_ssl?: number; imap_tiene_password?: boolean;
}
interface Usuario { id: number; username: string; role: string }

function LibroConfigCard({ libro, usuarios, onGuardar, guardando }: { libro: Libro; usuarios: Usuario[]; onGuardar: (cambios: Record<string, unknown>) => void; guardando: boolean }) {
  const [form, setForm] = useState({
    usuario_id: libro.usuario_id ? String(libro.usuario_id) : '',
    imap_correo: libro.imap_correo || '',
    imap_host: libro.imap_host || '',
    imap_puerto: String(libro.imap_puerto ?? 993),
    imap_ssl: (libro.imap_ssl ?? 1) === 1,
    imap_password: '',
  });

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Landmark className="w-4 h-4" /></div>
        <p className="text-sm font-bold">{libro.nombre}</p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground"><UserCircle className="w-3.5 h-3.5" /> Responsable (usuario de la aplicación)</label>
        <Select value={form.usuario_id} onChange={(e) => setForm((f) => ({ ...f, usuario_id: e.target.value }))}>
          <option value="">Sin responsable</option>
          {usuarios.filter((u) => u.role !== 'viewer').map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground"><Mail className="w-3.5 h-3.5" /> Correo IMAP de la cuenta</label>
        <Input type="email" value={form.imap_correo} onChange={(e) => setForm((f) => ({ ...f, imap_correo: e.target.value }))} placeholder="cuenta@dominio.com" />
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <Input value={form.imap_host} onChange={(e) => setForm((f) => ({ ...f, imap_host: e.target.value }))} placeholder="Servidor (imap.dominio.com)" />
          <Input type="number" value={form.imap_puerto} onChange={(e) => setForm((f) => ({ ...f, imap_puerto: e.target.value }))} placeholder="993" />
        </div>
        <Input type="password" value={form.imap_password} onChange={(e) => setForm((f) => ({ ...f, imap_password: e.target.value }))} placeholder={libro.imap_tiene_password ? 'Contraseña guardada — escribe para cambiarla' : 'Contraseña'} autoComplete="new-password" />
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={form.imap_ssl} onChange={(e) => setForm((f) => ({ ...f, imap_ssl: e.target.checked }))} className="rounded border-border" /> Usar SSL/TLS
        </label>
      </div>

      <div className="flex justify-end">
        <Button size="sm" disabled={guardando} onClick={() => onGuardar({
          usuario_id: form.usuario_id ? Number(form.usuario_id) : null,
          imap_correo: form.imap_correo,
          imap_host: form.imap_host,
          imap_puerto: form.imap_puerto,
          imap_ssl: form.imap_ssl,
          ...(form.imap_password ? { imap_password: form.imap_password } : {}),
        })}>{guardando ? 'Guardando...' : 'Guardar'}</Button>
      </div>
    </div>
  );
}

function SmtpConfigCard() {
  const { data: config } = useQuery({ queryKey: ['smtp-config'], queryFn: () => apiFetch<SmtpConfig>('/api/ajustes/smtp') });
  const [form, setForm] = useState({ smtp_host: '', smtp_puerto: '465', smtp_ssl: true, smtp_usuario: '', smtp_from_nombre: 'U3 Seguridad Privada', app_url: '', smtp_password: '' });
  const [pruebaPara, setPruebaPara] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (config) setForm((f) => ({ ...f, smtp_host: config.smtp_host, smtp_puerto: String(config.smtp_puerto), smtp_ssl: config.smtp_ssl, smtp_usuario: config.smtp_usuario, smtp_from_nombre: config.smtp_from_nombre, app_url: config.app_url }));
  }, [config]);

  const guardarMutation = useMutation({
    mutationFn: () => apiFetch('/api/ajustes/smtp', { method: 'PUT', body: JSON.stringify(form) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['smtp-config'] }); toast.success('Configuración SMTP guardada'); setForm((f) => ({ ...f, smtp_password: '' })); },
    onError: (e: Error) => toast.error(e.message),
  });

  const probarMutation = useMutation({
    mutationFn: () => apiFetch('/api/ajustes/smtp-test', { method: 'POST', body: JSON.stringify({ para: pruebaPara }) }),
    onSuccess: () => toast.success('Correo de prueba enviado — revisa la bandeja'),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Servidor SMTP</label>
          <Input value={form.smtp_host} onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value }))} placeholder="smtp.dominio.com" />
        </div>
        <div className="grid grid-cols-[90px_1fr] gap-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Puerto</label>
            <Input type="number" value={form.smtp_puerto} onChange={(e) => setForm((f) => ({ ...f, smtp_puerto: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Seguridad</label>
            <label className="flex items-center gap-2 h-10 text-sm cursor-pointer">
              <input type="checkbox" checked={form.smtp_ssl} onChange={(e) => setForm((f) => ({ ...f, smtp_ssl: e.target.checked }))} className="rounded border-border" /> SSL/TLS
            </label>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Usuario / correo remitente</label>
          <Input value={form.smtp_usuario} onChange={(e) => setForm((f) => ({ ...f, smtp_usuario: e.target.value }))} placeholder="sistema@dominio.com" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Contraseña</label>
          <Input type="password" value={form.smtp_password} onChange={(e) => setForm((f) => ({ ...f, smtp_password: e.target.value }))} placeholder={config?.tiene_password ? 'Contraseña guardada — escribe para cambiarla' : 'Contraseña'} autoComplete="new-password" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Nombre del remitente</label>
          <Input value={form.smtp_from_nombre} onChange={(e) => setForm((f) => ({ ...f, smtp_from_nombre: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">URL pública del sitio (para los enlaces de los correos)</label>
          <Input value={form.app_url} onChange={(e) => setForm((f) => ({ ...f, app_url: e.target.value }))} placeholder="https://miapp.up.railway.app" />
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-border">
        <div className="flex items-center gap-2 pt-3">
          <Input className="w-56" type="email" value={pruebaPara} onChange={(e) => setPruebaPara(e.target.value)} placeholder="correo@para-prueba.com" />
          <Button size="sm" variant="outline" disabled={!pruebaPara || probarMutation.isPending} onClick={() => probarMutation.mutate()}>
            <Send className="w-3.5 h-3.5 mr-1.5" /> {probarMutation.isPending ? 'Enviando...' : 'Probar'}
          </Button>
        </div>
        <div className="pt-3">
          <Button size="sm" disabled={guardarMutation.isPending} onClick={() => guardarMutation.mutate()}>{guardarMutation.isPending ? 'Guardando...' : 'Guardar SMTP'}</Button>
        </div>
      </div>
    </div>
  );
}

interface BotConfig { bot_empresa_info: string; bot_reglas: string; bot_horario_entrevistas: string; bot_direccion_entrevistas: string }

function BotConfigCard() {
  const { data: config } = useQuery({ queryKey: ['bot-config'], queryFn: () => apiFetch<BotConfig>('/api/ajustes/bot') });
  const [form, setForm] = useState<BotConfig>({ bot_empresa_info: '', bot_reglas: '', bot_horario_entrevistas: '', bot_direccion_entrevistas: '' });
  const queryClient = useQueryClient();

  useEffect(() => { if (config) setForm(config); }, [config]);

  const guardarMutation = useMutation({
    mutationFn: () => apiFetch('/api/ajustes/bot', { method: 'PUT', body: JSON.stringify(form) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['bot-config'] }); toast.success('Configuración del asistente guardada'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4 max-w-2xl">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Información de la empresa (servicios que ofrece, zonas de operación, alcances)</label>
        <Textarea rows={4} value={form.bot_empresa_info} onChange={(e) => setForm((f) => ({ ...f, bot_empresa_info: e.target.value }))} placeholder="Ej. U3 Seguridad Privada ofrece guardias intramuros, escoltas y custodias en Yucatán y Quintana Roo. No manejamos seguridad electrónica ni traslado de valores..." />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Reglas adicionales del bot (qué puede decir y qué no)</label>
        <Textarea rows={3} value={form.bot_reglas} onChange={(e) => setForm((f) => ({ ...f, bot_reglas: e.target.value }))} placeholder="Ej. Nunca prometas sueldo exacto; el pago es semanal; los cursos los paga la empresa..." />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Horario disponible para entrevistas</label>
          <Input value={form.bot_horario_entrevistas} onChange={(e) => setForm((f) => ({ ...f, bot_horario_entrevistas: e.target.value }))} placeholder="Lunes a viernes de 9:00 a 14:00" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Lugar de las entrevistas</label>
          <Input value={form.bot_direccion_entrevistas} onChange={(e) => setForm((f) => ({ ...f, bot_direccion_entrevistas: e.target.value }))} placeholder="Calle 60 #123, Centro, Mérida" />
        </div>
      </div>
      <div className="flex justify-end pt-1 border-t border-border">
        <div className="pt-3">
          <Button size="sm" disabled={guardarMutation.isPending} onClick={() => guardarMutation.mutate()}>{guardarMutation.isPending ? 'Guardando...' : 'Guardar asistente'}</Button>
        </div>
      </div>
    </div>
  );
}

function DispositivoPwaConfigCard() {
  const { canInstall, installed, isIosDevice, triggerInstall } = usePwaInstall();
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>('default');

  useEffect(() => {
    setNotifPerm(getNotificationPermission());
  }, []);

  const handleInstallClick = async () => {
    if (installed) {
      toast.info('Suite U3 ya está instalada en este dispositivo.');
      return;
    }
    const success = await triggerInstall();
    if (!success) {
      if (isIosDevice) {
        toast.info('Para instalar en iOS: Toca Compartir ⎋ y luego "Agregar a inicio" ⊕', { duration: 6000 });
      } else {
        toast.info('Para instalar: Haz clic en el menú (⋮ o ⋯) de tu navegador y selecciona "Instalar Suite U3"', { duration: 6000 });
      }
    }
  };

  const handlePermisoNotificaciones = async () => {
    if (notifPerm === 'granted') {
      sendDeviceNotification('Prueba Suite U3', { body: 'Las notificaciones funcionan correctamente en este dispositivo.' });
      toast.success('Notificación de prueba enviada al dispositivo');
      return;
    }
    const perm = await requestNotificationPermission();
    setNotifPerm(perm);
    if (perm === 'granted') {
      toast.success('Notificaciones del dispositivo activadas');
      sendDeviceNotification('Notificaciones Activadas', { body: 'Suite U3 te enviará avisos en este dispositivo.' });
    } else {
      toast.error('Permiso de notificaciones no concedido o bloqueado');
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Estado Instalación PWA */}
        <div className="border border-border rounded-lg p-3.5 space-y-3 bg-muted/30 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Smartphone className="w-4 h-4 text-primary" />
              <h4 className="text-xs font-bold text-foreground">Aplicación (PWA)</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {installed
                ? 'La aplicación Suite U3 está instalada en modo nativo en este dispositivo.'
                : 'Instala Suite U3 para abrirla directamente desde tu pantalla de inicio sin barra de navegador.'}
            </p>
          </div>
          <div className="pt-2">
            {installed ? (
              <div className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                <CheckCircle2 className="w-4 h-4" /> App Instalada
              </div>
            ) : (
              <Button size="sm" onClick={handleInstallClick} className="gap-1.5 w-full font-bold">
                <Download className="w-4 h-4" /> Instalar App Ahora
              </Button>
            )}
          </div>
        </div>

        {/* Estado Notificaciones del Dispositivo */}
        <div className="border border-border rounded-lg p-3.5 space-y-3 bg-muted/30 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Bell className="w-4 h-4 text-primary" />
              <h4 className="text-xs font-bold text-foreground">Notificaciones del Dispositivo</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {notifPerm === 'granted'
                ? 'Notificaciones activas. Recibirás avisos directos de correos y eventos.'
                : 'Permite alertas en tu pantalla o barra del sistema al recibir correos o recordatorios.'}
            </p>
          </div>
          <div className="pt-2">
            <Button
              size="sm"
              variant={notifPerm === 'granted' ? 'outline' : 'default'}
              onClick={handlePermisoNotificaciones}
              className={`gap-1.5 w-full font-bold ${
                notifPerm === 'granted' ? 'border-emerald-300 text-emerald-800 hover:bg-emerald-50' : ''
              }`}
            >
              <Bell className="w-4 h-4" />
              {notifPerm === 'granted' ? 'Probar Notificación' : 'Activar Notificaciones'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


export default function AjustesApp() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: libros = [], isLoading: loadingLibros } = useQuery({ queryKey: ['libros-financieros'], queryFn: () => apiFetch<Libro[]>('/api/libros-financieros'), enabled: isAdmin });
  const { data: usuarios = [] } = useQuery({ queryKey: ['usuarios-admin'], queryFn: () => apiFetch<Usuario[]>('/api/auth/users'), enabled: isAdmin });

  const guardarLibroMutation = useMutation({
    mutationFn: ({ id, ...cambios }: { id: string } & Record<string, unknown>) =>
      apiFetch(`/api/libros-financieros/${id}`, { method: 'PATCH', body: JSON.stringify(cambios) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['libros-financieros'] }); toast.success('Configuración guardada'); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in duration-500">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4"><Lock className="w-6 h-6 text-muted-foreground" /></div>
        <h2 className="text-lg font-bold">Solo administradores</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">Los ajustes del sitio solo están disponibles para el administrador.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Settings className="w-6 h-6" /> Ajustes del Sitio</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configuración general de la aplicación</p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-1.5"><Smartphone className="w-4 h-4" /> Dispositivo y Aplicación PWA</h2>
          <p className="text-sm text-muted-foreground">Estado de instalación de la app y notificaciones push en este dispositivo.</p>
        </div>
        <DispositivoPwaConfigCard />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Cuentas de finanzas</h2>
          <p className="text-sm text-muted-foreground">Responsable y correo IMAP de cada cuenta. El responsable es la única persona (además del administrador) que puede ver y modificar su cuenta; solo aparecen usuarios de la aplicación, no guardias. Los usuarios de solo lectura ven todas las cuentas sin poder editarlas.</p>
        </div>
        {loadingLibros ? (
          <p className="text-sm text-muted-foreground animate-pulse py-4">Cargando cuentas...</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {libros.map((l) => (
              <LibroConfigCard key={l.id} libro={l} usuarios={usuarios} guardando={guardarLibroMutation.isPending} onGuardar={(cambios) => guardarLibroMutation.mutate({ id: l.id, ...cambios })} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-1.5"><Bot className="w-4 h-4" /> Asistente de WhatsApp</h2>
          <p className="text-sm text-muted-foreground">Conocimiento que el bot usa para responder a candidatos y prospectos: qué hace la empresa, sus límites y el horario para agendar entrevistas. Se aplica al instante, sin reiniciar nada. Las vacantes se administran en el módulo de Reclutamiento.</p>
        </div>
        <BotConfigCard />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Correo del sitio (SMTP)</h2>
          <p className="text-sm text-muted-foreground">Servidor con el que el sistema envía correos: recuperación de contraseña, notificaciones de mensajes y de asignación de cuentas. Es también el respaldo cuando un usuario no tiene configurado su buzón personal.</p>
        </div>
        <SmtpConfigCard />
      </section>
    </div>
  );
}

