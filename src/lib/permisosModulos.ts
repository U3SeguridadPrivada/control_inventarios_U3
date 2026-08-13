import type { Role } from '@/src/utils/roleMapping';

export interface PermisoModulo {
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
}

/**
 * Areas (rol derivado del correo institucional) que pueden ver cada modulo
 * cuando el usuario no tiene un rol personalizado asignado. Los modulos que no
 * aparecen aqui no tienen restriccion por area.
 */
export const AREAS_POR_MODULO: Record<string, Role[]> = {
  clientes: ['administrativos', 'ventas'],
};

/**
 * Datos de acceso del usuario. Los resuelve el servidor desde la base de
 * datos; el cliente solo los lee para ocultar lo que no corresponde.
 */
export interface AccesoUsuario {
  role: 'admin' | 'editor' | 'viewer';
  areaRole: Role;
  /** Permisos del rol personalizado asignado, si tiene uno. */
  permisos: Record<string, PermisoModulo> | null;
}

/**
 * Reglas de visibilidad de un modulo, en orden:
 *   1. el administrador de la cuenta ve todo;
 *   2. un modulo que no aparece en AREAS_POR_MODULO es libre para cualquier
 *      usuario con sesion (asi, dar de alta un modulo aqui es lo unico que
 *      hace falta para restringirlo, y ninguno pierde acceso por accidente);
 *   3. si el usuario tiene rol personalizado asignado, manda su permiso "ver";
 *   4. si no, decide el area del correo institucional.
 */
export function puedeVerModulo(modulo: string, acceso: AccesoUsuario | null | undefined): boolean {
  if (!acceso) return false;
  if (acceso.role === 'admin') return true;

  const areas = AREAS_POR_MODULO[modulo];
  if (!areas) return true;

  const permiso = acceso.permisos?.[modulo];
  if (permiso) return permiso.ver;

  return areas.includes(acceso.areaRole);
}
