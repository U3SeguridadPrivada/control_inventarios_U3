'use client';
import { useState, Suspense, type FormEvent } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AuthShell } from '@/src/components/auth/AuthShell';
import { PasswordInput } from '@/src/components/ui/password-input';
import { Field, Callout } from '@/src/components/ui/field';
import { Button } from '@/src/components/ui/button';

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
      <div className="space-y-3 rounded-xl border border-border bg-muted/50 p-6 text-center">
        <p className="text-sm text-destructive">El enlace no es válido — falta el token de recuperación.</p>
        <a href="/recuperar" className="inline-block text-sm font-semibold text-primary hover:underline">Solicitar uno nuevo</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field label="Nueva contraseña" htmlFor="password">
        <PasswordInput
          id="password" required minLength={6} autoFocus autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 6 caracteres"
        />
      </Field>
      <Field label="Confirmar contraseña" htmlFor="confirmar">
        <PasswordInput
          id="confirmar" required minLength={6} autoComplete="new-password"
          value={confirmar} onChange={(e) => setConfirmar(e.target.value)}
          placeholder="Repite la contraseña"
        />
      </Field>
      {error && <Callout tone="danger">{error}</Callout>}
      <Button type="submit" disabled={loading} className="h-11 w-full text-sm">
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
      </Button>
    </form>
  );
}

export default function RestablecerPage() {
  return (
    <AuthShell title="Nueva contraseña" subtitle="Crea tu nueva contraseña de acceso.">
      <Suspense fallback={null}>
        <RestablecerForm />
      </Suspense>
    </AuthShell>
  );
}
