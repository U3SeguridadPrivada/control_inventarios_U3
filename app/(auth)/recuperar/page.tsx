'use client';
import { useState, type FormEvent } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { AuthShell } from '@/src/components/auth/AuthShell';
import { Field, Callout } from '@/src/components/ui/field';
import { Input } from '@/src/components/ui/input';
import { Button } from '@/src/components/ui/button';

export default function RecuperarPage() {
  const [usuario, setUsuario] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar');
      setEnviado(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Recuperar contraseña" subtitle="Te enviaremos un enlace a tu correo.">
      {enviado ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/50 p-6 text-center">
          <MailCheck className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="text-sm leading-relaxed text-foreground">
            Si el usuario existe, enviamos un enlace de recuperación a su correo. Revisa tu bandeja de entrada (y el spam).
          </p>
          <a href="/login" className="inline-block text-sm font-semibold text-primary hover:underline">Volver al inicio de sesión</a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label="Usuario o correo">
            <Input
              type="text" required autoFocus className="h-11"
              value={usuario} onChange={(e) => setUsuario(e.target.value)}
              placeholder="tu_usuario o correo@dominio.com"
            />
          </Field>
          {error && <Callout tone="danger">{error}</Callout>}
          <Button type="submit" disabled={loading} className="h-11 w-full text-sm">
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
          </Button>
          <p className="text-center">
            <a href="/login" className="text-xs font-medium text-muted-foreground transition-colors hover:text-primary">Volver al inicio de sesión</a>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
