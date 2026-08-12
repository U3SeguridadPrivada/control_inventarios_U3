'use client';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100svh] flex items-center justify-center bg-background px-4 py-8 pt-[calc(2rem+var(--safe-top))] pb-[calc(2rem+var(--safe-bottom))]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <img src="/logo_b.png" alt="Logo U3" className="w-14 h-14 object-contain" />
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">Suite U3</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Inicia sesión para continuar</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl shadow-sm p-6 sm:p-8 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="username">Usuario o correo</label>
            <input
              id="username" type="text" autoComplete="username" required
              autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next"
              value={username} onChange={e => setUsername(e.target.value)}
              className="w-full h-11 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary transition"
              placeholder="tu_usuario o correo@dominio.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="password">Contraseña</label>
            <input
              id="password" type="password" autoComplete="current-password" required
              enterKeyHint="go"
              value={password} onChange={e => setPassword(e.target.value)}
              className="w-full h-11 px-3 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary transition"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full min-h-11 px-4 text-sm font-semibold text-white rounded-lg bg-primary hover:bg-primary/90 active:bg-primary/80 disabled:opacity-60 transition">
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
          <p className="text-center">
            <a href="/recuperar" className="text-xs text-muted-foreground hover:text-primary transition-colors">¿Olvidaste tu contraseña?</a>
          </p>
        </form>
      </div>
    </div>
  );
}
