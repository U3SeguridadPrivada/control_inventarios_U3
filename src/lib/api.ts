function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('inv_token');
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Una respuesta perdida conserva la clave de la captura al reintentar o recargar.
  let operationStorageKey: string | null = null;
  if (typeof window !== 'undefined' && (/^(?:\/api\/(?:entradas|salidas|prendas|inventario|bajas)(?:\/|$)|\/api\/guardias\/\d+\/baja$)/.test(path.split('?')[0])) && options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase())) {
    const identity = localStorage.getItem('inv_user') || '';
    operationStorageKey = 'inv-operation-' + JSON.stringify([identity, path, options.method, options.body]);
    const key = sessionStorage.getItem(operationStorageKey) || Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(operationStorageKey, key);
    headers['Idempotency-Key'] = headers['Idempotency-Key'] || key;
  }

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('inv_token');
    localStorage.removeItem('inv_user');
    window.location.href = '/login';
    throw new Error('Sesión expirada');
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (operationStorageKey && res.status < 500) sessionStorage.removeItem(operationStorageKey);
    throw new Error(data.error || `Error ${res.status}`);
  }

  const data = await res.json();
  if (operationStorageKey) sessionStorage.removeItem(operationStorageKey);
  return data;
}
