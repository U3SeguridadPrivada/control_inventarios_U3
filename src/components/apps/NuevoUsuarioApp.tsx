'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/src/context/AuthContext';
import { apiFetch } from '@/src/lib/api';

const ROLES = [
  { value: 'viewer', label: 'Visualizador — solo lectura' },
  { value: 'editor', label: 'Editor — puede registrar movimientos' },
  { value: 'admin', label: 'Administrador — acceso total' },
];

export default function NuevoUsuarioApp() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'viewer' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isAdmin) return (<div className="flex flex-col items-center justify-center h-[50vh] gap-3"><p className="text-lg font-semibold">Sin permisos</p><p className="text-sm text-muted-foreground">Solo los administradores pueden crear usuarios.</p></div>);

  function set(field: string, value: string) { setForm(f => ({ ...f, [field]: value })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError(''); setSuccess(''); setLoading(true);
    try {
      const user = await apiFetch<{ username: string; role: string }>('/api/auth/register', { method: 'POST', body: JSON.stringify(form) });
      setSuccess(`Usuario "${user.username}" creado correctamente con rol ${user.role}.`);
      setForm({ username: '', email: '', password: '', role: 'viewer' });
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  return (
    <div className="max-w-md mx-auto space-y-6 animate-in fade-in duration-300">
      <div><h1 className="text-2xl font-bold tracking-tight">Crear usuario</h1><p className="text-sm text-muted-foreground mt-1">El nuevo usuario podrá acceder al sistema con las credenciales que indiques.</p></div>
      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
        <div className="space-y-1.5"><label className="text-sm font-medium">Nombre de usuario</label><input type="text" required value={form.username} onChange={e => set('username', e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary transition" placeholder="nombre_usuario" /></div>
        <div className="space-y-1.5"><label className="text-sm font-medium">Correo electrónico</label><input type="email" required value={form.email} onChange={e => set('email', e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary transition" placeholder="correo@empresa.com" /></div>
        <div className="space-y-1.5"><label className="text-sm font-medium">Contraseña inicial</label><input type="password" required value={form.password} onChange={e => set('password', e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary transition" placeholder="Mín. 8 chars, 1 mayúscula, 1 número" /><p className="text-xs text-muted-foreground">Mínimo 8 caracteres, una mayúscula y un número.</p></div>
        <div className="space-y-1.5"><label className="text-sm font-medium">Rol</label><select value={form.role} onChange={e => set('role', e.target.value)} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary transition">{ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
        {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}
        {success && <p className="text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">{success}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={() => router.push('/usuarios')} className="flex-1 py-2.5 px-4 text-sm font-medium border border-border rounded-lg hover:bg-muted transition">Cancelar</button>
          <button type="submit" disabled={loading} className="flex-1 py-2.5 px-4 text-sm font-semibold text-white rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-60 transition">{loading ? 'Creando...' : 'Crear usuario'}</button>
        </div>
      </form>
    </div>
  );
}
