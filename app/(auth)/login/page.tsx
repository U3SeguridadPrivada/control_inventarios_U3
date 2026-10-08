'use client';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/src/context/AuthContext';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { AuthShell } from '@/src/components/auth/AuthShell';
import { Field, Callout } from '@/src/components/ui/field';
import { Input } from '@/src/components/ui/input';
import { Button } from '@/src/components/ui/button';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <AuthShell title="Inicia sesión" subtitle="Ingresa con tu usuario o correo institucional.">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Usuario o correo">
          <Input
            type="text" autoComplete="username" required
            autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next"
            value={username} onChange={e => setUsername(e.target.value)}
            className="h-11"
            placeholder="tu_usuario o correo@dominio.com"
          />
        </Field>
        <Field label="Contraseña" htmlFor="password">
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              enterKeyHint="go"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="h-11 pr-11"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        {error && <Callout tone="danger">{error}</Callout>}
        <Button type="submit" disabled={loading} className="h-11 w-full text-sm">
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
        </Button>
        <p className="text-center">
          <a href="/recuperar" className="text-xs font-medium text-muted-foreground transition-colors hover:text-primary">¿Olvidaste tu contraseña?</a>
        </p>
      </form>
    </AuthShell>
  );
}
