import { NextRequest } from 'next/server';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { normalizarNombreEstado } from '@/src/lib/direccionMexico';

/**
 * Busca colonias y estado a partir de un código postal mexicano, usando el
 * servicio público y gratuito de zippopotam.us (sin llave, no requiere
 * contrato con Correos de México). Si el servicio falla o no reconoce el CP
 * se devuelve una lista vacía para que el formulario caiga de nuevo a
 * captura manual sin romper el alta.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ cp: string }> }) {
  if (!verifyAuth(req)) return unauthorized();
  const { cp } = await params;

  if (!/^\d{5}$/.test(cp)) {
    return Response.json({ error: 'Código postal inválido' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.zippopotam.us/mx/${cp}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return Response.json({ colonias: [], estado: null });

    const data = await res.json();
    const places: Array<{ 'place name': string; state: string }> = data.places || [];
    const colonias = Array.from(new Set(places.map((p) => p['place name']))).filter(Boolean);
    const estado = places[0]?.state ? normalizarNombreEstado(places[0].state) : null;

    return Response.json({ colonias, estado });
  } catch {
    return Response.json({ colonias: [], estado: null });
  }
}
