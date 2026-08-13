export type Role =
  | 'administrativos'
  | 'ventas'
  | 'visualizador'
  | 'supervisor'
  | 'director'
  | 'marketing'
  | 'guardia'
  | 'unknown';

/**
 * Returns the role associated with a given institutional email.
 * The mapping is defined via environment variables in .env.local.
 * If the email does not match any configured variable, 'unknown' is returned.
 *
 * SOLO SERVIDOR: las variables no llevan el prefijo NEXT_PUBLIC_, asi que en
 * el navegador valdrian `undefined` y todo caeria en 'unknown'. En el cliente
 * usa el `areaRole` que devuelven /api/auth/login y /api/auth/me.
 */
export function getRoleByEmail(email: string | null | undefined): Role {
  if (!email) return 'unknown';
  const normalized = email.trim().toLowerCase();
  if (process.env.ADMINISTRATIVOS_EMAIL?.toLowerCase() === normalized) return 'administrativos';
  if (process.env.VENTAS_EMAIL?.toLowerCase() === normalized) return 'ventas';
  if (process.env.VISUALIZADOR_EMAIL?.toLowerCase() === normalized) return 'visualizador';
  if (process.env.SUPERVISOR_EMAIL?.toLowerCase() === normalized) return 'supervisor';
  if (process.env.DIRECTOR_EMAIL?.toLowerCase() === normalized) return 'director';
  if (process.env.MARKETING_EMAIL?.toLowerCase() === normalized) return 'marketing';
  return 'unknown';
}
