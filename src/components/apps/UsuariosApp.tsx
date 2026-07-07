'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/src/context/AuthContext';
import { apiFetch } from '@/src/lib/api';
import { UserPlus, Trash2, Shield, Eye, Edit3, KeyRound, X } from 'lucide-react';
import { toast } from 'sonner';

interface User { id: number; username: string; email: string; role: string; role_personalizado_id: number | null; created_at: string; }
interface RolPersonalizado { id: number; nombre: string; }

const ROLE_INFO: Record<string, { label: string; color: string; icon: typeof Shield }> = {
  admin:  { label: 'Administrador', color: 'bg-violet-100 text-violet-700 border-violet-200', icon: Shield },
  editor: { label: 'Editor',        color: 'bg-blue-100 text-blue-700 border-blue-200',       icon: Edit3 },
  viewer: { label: 'Visualizador',  color: 'bg-slate-100 text-slate-600 border-slate-200',    icon: Eye },
};

function fmtDatetime(iso: string) { return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }

export default function UsuariosApp() {
  const { user: me, isAdmin } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);
  const [pwModal, setPwModal] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: () => apiFetch<User[]>('/api/auth/users'), enabled: isAdmin });
  const { data: rolesPersonalizados = [] } = useQuery({ queryKey: ['roles'], queryFn: () => apiFetch<RolPersonalizado[]>('/api/roles'), enabled: isAdmin });

  const roleMutation = useMutation({ mutationFn: ({ id, role }: { id: number; role: string }) => apiFetch(`/api/auth/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('Rol actualizado'); }, onError: (e: Error) => toast.error(e.message) });
  const rolPersonalizadoMutation = useMutation({ mutationFn: ({ id, role_personalizado_id }: { id: number; role_personalizado_id: number | null }) => apiFetch(`/api/auth/users/${id}`, { method: 'PATCH', body: JSON.stringify({ role_personalizado_id }) }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('Rol personalizado asignado'); }, onError: (e: Error) => toast.error(e.message) });
  const deleteMutation = useMutation({ mutationFn: (id: number) => apiFetch(`/api/auth/users/${id}`, { method: 'DELETE' }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); setConfirmDelete(null); toast.success('Usuario eliminado'); }, onError: (e: Error) => toast.error(e.message) });
  const pwMutation = useMutation({ mutationFn: ({ id, password }: { id: number; password: string }) => apiFetch(`/api/auth/users/${id}/password`, { method: 'PATCH', body: JSON.stringify({ password }) }), onSuccess: () => { setPwModal(null); setNewPassword(''); toast.success('Contraseña actualizada'); }, onError: (e: Error) => toast.error(e.message) });

  if (!isAdmin) return (<div className="flex flex-col items-center justify-center h-[50vh] gap-3"><p className="text-lg font-semibold">Sin permisos</p><p className="text-sm text-muted-foreground">Solo los administradores pueden gestionar usuarios.</p></div>);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold tracking-tight">Gestión de Usuarios</h1><p className="text-sm text-muted-foreground mt-0.5">{(users as User[]).length} usuario{(users as User[]).length !== 1 ? 's' : ''} registrado{(users as User[]).length !== 1 ? 's' : ''} en el sistema.</p></div>
        <button onClick={() => router.push('/usuarios/nuevo')} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg bg-primary hover:bg-primary/90 transition"><UserPlus className="w-4 h-4" /> Crear usuario</button>
      </div>
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
        {isLoading ? <div className="py-12 text-center text-sm text-muted-foreground">Cargando usuarios...</div> : (
          <table className="w-full text-sm min-w-[700px]">
            <thead><tr className="border-b border-border bg-muted/40">
              <th className="text-left px-5 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Usuario</th>
              <th className="text-left px-5 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Correo</th>
              <th className="text-left px-5 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Creado</th>
              <th className="text-left px-5 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Rol</th>
              <th className="text-right px-5 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Acciones</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {(users as User[]).map(u => {
                const isMe = u.id === me?.id;
                const info = ROLE_INFO[u.role] ?? ROLE_INFO.viewer;
                const Icon = info.icon;
                return (
                  <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">{u.username.slice(0, 2).toUpperCase()}</div><div><p className="font-semibold leading-tight">{u.username}{isMe && <span className="ml-2 text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full font-normal">Tú</span>}</p><p className="text-xs text-muted-foreground">ID #{u.id}</p></div></div></td>
                    <td className="px-5 py-4 text-muted-foreground">{u.email}</td>
                    <td className="px-5 py-4 text-muted-foreground text-xs whitespace-nowrap">{fmtDatetime(u.created_at)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${info.color}`}><Icon className="w-3 h-3" />{info.label}</span>
                        {!isMe && <select value={u.role} disabled={roleMutation.isPending} onChange={e => roleMutation.mutate({ id: u.id, role: e.target.value })} className="text-xs border border-border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer disabled:opacity-50"><option value="viewer">Visualizador</option><option value="editor">Editor</option><option value="admin">Administrador</option></select>}
                        <select
                          value={u.role_personalizado_id ?? ''}
                          disabled={rolPersonalizadoMutation.isPending}
                          onChange={e => rolPersonalizadoMutation.mutate({ id: u.id, role_personalizado_id: e.target.value ? Number(e.target.value) : null })}
                          title="Rol personalizado"
                          className="text-xs border border-dashed border-border rounded-md px-2 py-1 bg-background text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer disabled:opacity-50"
                        >
                          <option value="">Sin rol personalizado</option>
                          {rolesPersonalizados.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="px-5 py-4"><div className="flex items-center justify-end gap-2">
                      <button onClick={() => { setPwModal(u); setNewPassword(''); setShowPw(false); }} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted px-3 py-1.5 rounded-lg transition"><KeyRound className="w-3.5 h-3.5" />Cambiar contraseña</button>
                      {!isMe && <button onClick={() => setConfirmDelete(u)} className="inline-flex items-center gap-1.5 text-xs text-destructive hover:bg-destructive/10 px-3 py-1.5 rounded-lg transition"><Trash2 className="w-3.5 h-3.5" />Eliminar</button>}
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {pwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-4"><div><h2 className="text-base font-bold">Cambiar contraseña</h2><p className="text-xs text-muted-foreground mt-0.5">Usuario: <span className="font-semibold text-foreground">{pwModal.username}</span></p></div><button onClick={() => setPwModal(null)} className="p-1.5 hover:bg-muted rounded-lg transition"><X className="w-4 h-4 text-muted-foreground" /></button></div>
            <div className="space-y-1.5"><label className="text-sm font-medium">Nueva contraseña</label>
              <div className="relative"><input type={showPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mín. 8 chars, 1 mayúscula, 1 número" className="w-full px-3 py-2 pr-16 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary transition" /><button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground px-2 py-1">{showPw ? 'Ocultar' : 'Ver'}</button></div>
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres, una mayúscula y un número.</p>
            </div>
            <div className="flex gap-3 mt-5"><button onClick={() => setPwModal(null)} className="flex-1 py-2.5 text-sm font-medium border border-border rounded-lg hover:bg-muted transition">Cancelar</button><button onClick={() => pwMutation.mutate({ id: pwModal.id, password: newPassword })} disabled={pwMutation.isPending || newPassword.length < 8} className="flex-1 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-60 transition">{pwMutation.isPending ? 'Guardando...' : 'Guardar'}</button></div>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 mx-auto mb-4"><Trash2 className="w-6 h-6 text-destructive" /></div>
            <h2 className="text-lg font-bold text-center">¿Eliminar usuario?</h2>
            <p className="text-sm text-muted-foreground text-center mt-2">Se eliminará permanentemente la cuenta de <span className="font-semibold text-foreground">{confirmDelete.username}</span>.</p>
            <div className="flex gap-3 mt-6"><button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 text-sm font-medium border border-border rounded-lg hover:bg-muted transition">Cancelar</button><button onClick={() => deleteMutation.mutate(confirmDelete.id)} disabled={deleteMutation.isPending} className="flex-1 py-2.5 text-sm font-semibold text-white rounded-lg bg-destructive hover:bg-destructive/90 disabled:opacity-60 transition">{deleteMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
