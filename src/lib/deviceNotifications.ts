'use client';

export interface DeviceNotificationOptions {
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
}

/** Comprueba si las notificaciones del navegador son soportadas. */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Obtiene el estado actual del permiso ('granted', 'denied', 'default'). */
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

/** Solicita el permiso para mostrar notificaciones en el dispositivo. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return 'denied';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error('Error al solicitar permiso de notificaciones:', err);
    return Notification.permission;
  }
}

/** Envía una notificación nativa al dispositivo/navegador. */
export async function sendDeviceNotification(
  title: string,
  options: DeviceNotificationOptions = {}
): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  const defaultOptions: NotificationOptions = {
    icon: options.icon || '/icons/icon-192.png',
    badge: options.badge || '/icons/icon-192.png',
    body: options.body,
    tag: options.tag,
    data: options.data || { url: '/' },
  };

  try {
    // Si hay un Service Worker activo, usar showNotification para mejor integración en móviles
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration && registration.showNotification) {
        await registration.showNotification(title, defaultOptions);
        return true;
      }
    }

    // Fallback a la API de Notificaciones estándar
    const notif = new Notification(title, defaultOptions);
    if (options.data?.url) {
      notif.onclick = () => {
        window.focus();
        if (typeof options.data?.url === 'string') {
          window.location.href = options.data.url;
        }
        notif.close();
      };
    }
    return true;
  } catch (err) {
    console.error('Error enviando notificación al dispositivo:', err);
    return false;
  }
}
