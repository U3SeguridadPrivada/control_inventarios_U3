'use client';
import { useState, type FormEvent } from 'react';
import { MailCheck } from 'lucide-react';

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
    <div className="min-h-[100svh] flex items-center justify-center bg-background px-4 py-8 pt-[calc(2rem+var(--safe-top))] pb-[calc(2rem+var(--safe-bottom))]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <img src="/logo_b.png" alt="Logo U3" className="w-14 h-14 object-contain" />
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">Recuperar contraseña</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Te enviaremos un enlace a tu correo</p>
          </div>
        </div>

        {enviado ? (
          <div className="bg-card border border-border rounded-2xl shadow-sm p-8 text-center space-y-3">
            <MailCheck className="w-10 h-10 text-emerald-600 mx-auto" />
            <p className="text-sm">Si el usuario existe, enviamos un enlace de recuperación a su correo. Revisa tu bandeja de entrada (y el spam).</p>
            <a href="/login" className="inline-block text-sm font-semibold text-primary hover:underline">Volver al inicio de sesión</a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl shadow-sm p-8 space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="usuario">Usuario o correo</label>
              <input
                id="usuario" type="text" required autoFocus
                value={usuario} onChange={(e) => setUsuario(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary transition"
                placeholder="tu_usuario o correo@dominio.com"
              />
            </div>
            {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-60 transition">
              {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
            </button>
            <p className="text-center">
              <a href="/login" className="text-xs text-muted-foreground hover:text-primary transition-colors">Volver al inicio de sesión</a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
