'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Role } from '@/src/utils/roleMapping';
import { puedeVerModulo, type AccesoUsuario, type PermisoModulo } from '@/src/lib/permisosModulos';


export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  /** Area derivada del correo institucional; la calcula el servidor. */
  areaRole?: Role;
  /** Permisos del rol personalizado asignado, si tiene uno. */
  permisos?: Record<string, PermisoModulo> | null;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isEditor: boolean;
  // Custom role booleans
  isAdministrativos: boolean;
  isVentas: boolean;
  isVisualizador: boolean;
  isSupervisor: boolean;
  isDirector: boolean;
  isMarketing: boolean;
  userRole: Role | null;
  /** true si el usuario puede ver el modulo indicado (ids de src/config/nav.ts). */
  puedeVer: (modulo: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'inv_token';
const USER_KEY = 'inv_user';

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ token: null, user: null, isLoading: true });

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || isTokenExpired(token)) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setState({ token: null, user: null, isLoading: false });
      return;
    }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (!res.ok) throw new Error('invalid');
        return res.json();
      })
      .then((user: AuthUser) => {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        setState({ token, user, isLoading: false });
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setState({ token: null, user: null, isLoading: false });
      });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Error al iniciar sesión');
    }
    const { token, user } = await res.json();
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setState({ token, user, isLoading: false });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setState({ token: null, user: null, isLoading: false });
  }, []);

  // El area y los permisos llegan resueltos del servidor (/api/auth/login y
  // /api/auth/me): las variables de correo por rol son privadas y nunca
  // estuvieron disponibles en el navegador.
  const acceso: AccesoUsuario | null = state.user
    ? {
        role: state.user.role,
        areaRole: state.user.areaRole ?? 'unknown',
        permisos: state.user.permisos ?? null,
      }
    : null;

  return (
    <AuthContext.Provider value={{
      ...state,
      login,
      logout,
      puedeVer: (modulo: string) => puedeVerModulo(modulo, acceso),
      // roles basados en el email institucional
      userRole: acceso?.areaRole ?? null,
      isAdmin: state.user?.role === 'admin',
      isEditor: state.user?.role === 'admin' || state.user?.role === 'editor',
      isAdministrativos: acceso?.areaRole === 'administrativos',
      isVentas: acceso?.areaRole === 'ventas',
      isVisualizador: acceso?.areaRole === 'visualizador',
      isSupervisor: acceso?.areaRole === 'supervisor',
      isDirector: acceso?.areaRole === 'director',
      isMarketing: acceso?.areaRole === 'marketing',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
