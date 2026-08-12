'use client';
import { useState, Suspense, type FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';

function RestablecerForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmar) { setError('Las contraseñas no coinciden'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al restablecer');
      router.push('/login?restablecida=1');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="bg-card border border-border rounded-2xl shadow-sm p-8 text-center space-y-3">
        <p className="text-sm text-destructive">El enlace no es válido — falta el token de recuperación.</p>
        <a href="/recuperar" className="inline-block text-sm font-semibold text-primary hover:underline">Solicitar uno nuevo</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl shadow-sm p-8 space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="password">Nueva contraseña</label>
        <input
          id="password" type="password" required minLength={6} autoFocus autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary transition"
          placeholder="Mínimo 6 caracteres"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="confirmar">Confirmar contraseña</label>
        <input
          id="confirmar" type="password" required minLength={6} autoComplete="new-password"
          value={confirmar} onChange={(e) => setConfirmar(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary transition"
          placeholder="Repite la contraseña"
        />
      </div>
      {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}
      <button type="submit" disabled={loading}
        className="w-full py-2.5 px-4 text-sm font-semibold text-white rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-60 transition">
        {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
      </button>
    </form>
  );
}

export default function RestablecerPage() {
  return (
    <div className="min-h-[100svh] flex items-center justify-center bg-background px-4 py-8 pt-[calc(2rem+var(--safe-top))] pb-[calc(2rem+var(--safe-bottom))]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center"><KeyRound className="w-7 h-7 text-primary" /></div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">Nueva contraseña</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Crea tu nueva contraseña de acceso</p>
          </div>
        </div>
        <Suspense fallback={null}>
          <RestablecerForm />
        </Suspense>
      </div>
    </div>
  );
}
