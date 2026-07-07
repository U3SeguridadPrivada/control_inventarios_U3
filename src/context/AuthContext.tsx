'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getRoleByEmail, Role } from '@/src/utils/roleMapping';


export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
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

  return (
    <AuthContext.Provider value={{
      ...state,
      login,
      logout,
      // roles basados en el email institucional
      userRole: getRoleByEmail(state.user?.email),
      isAdmin: state.user?.role === 'admin',
      isEditor: state.user?.role === 'admin' || state.user?.role === 'editor',
      isAdministrativos: getRoleByEmail(state.user?.email) === 'administrativos',
      isVentas: getRoleByEmail(state.user?.email) === 'ventas',
      isVisualizador: getRoleByEmail(state.user?.email) === 'visualizador',
      isSupervisor: getRoleByEmail(state.user?.email) === 'supervisor',
      isDirector: getRoleByEmail(state.user?.email) === 'director',
      isMarketing: getRoleByEmail(state.user?.email) === 'marketing',
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
