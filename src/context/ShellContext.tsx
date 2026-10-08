'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const KEY = 'u3_sidebar_collapsed';

interface ShellValue {
  /** true cuando el menu lateral esta reducido a iconos. */
  collapsed: boolean;
  toggle: () => void;
}

const ShellContext = createContext<ShellValue>({ collapsed: false, toggle: () => {} });

/**
 * Estado del marco de la aplicacion (menu lateral contraido o expandido). Se
 * recuerda por navegador; si el almacenamiento no esta disponible simplemente
 * arranca expandido.
 */
export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(KEY) === '1');
    } catch {
      /* sin almacenamiento: se queda expandido */
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((actual) => {
      const siguiente = !actual;
      try {
        localStorage.setItem(KEY, siguiente ? '1' : '0');
      } catch {
        /* no pasa nada: solo no se recuerda la preferencia */
      }
      return siguiente;
    });
  }, []);

  const value = useMemo(() => ({ collapsed, toggle }), [collapsed, toggle]);
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  return useContext(ShellContext);
}
