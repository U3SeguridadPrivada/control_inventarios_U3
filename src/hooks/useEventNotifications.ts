'use client';
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { useAuth } from '@/src/context/AuthContext';
import { toast } from 'sonner';
import { sendDeviceNotification } from '@/src/lib/deviceNotifications';

interface EventoProximo {
  id: number;
  titulo: string;
  fecha_inicio: string;
}

export function useEventNotifications() {
  const { user } = useAuth();
  const notificadosRef = useRef<Set<number>>(new Set());

  const { data } = useQuery({
    queryKey: ['eventosProximos'],
    queryFn: () => apiFetch<EventoProximo[]>('/api/eventos?proximos=1'),
    refetchInterval: 60_000,
    enabled: !!user,
  });

  useEffect(() => {
    if (!data) return;
    for (const evento of data) {
      if (notificadosRef.current.has(evento.id)) continue;
      notificadosRef.current.add(evento.id);
      const hora = new Date(evento.fecha_inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      toast(`Recordatorio: ${evento.titulo}`, { description: `Hoy a las ${hora}` });
      sendDeviceNotification(`Recordatorio: ${evento.titulo}`, {
        body: `Hoy a las ${hora}`,
        data: { url: '/agenda' },
      });
      apiFetch(`/api/eventos/${evento.id}`, { method: 'PATCH', body: JSON.stringify({ accion: 'notificado' }) }).catch(() => {});
    }
  }, [data]);
}

