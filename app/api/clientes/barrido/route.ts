import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { barridos, users } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { accesoDeUsuario } from '@/src/lib/accesoUsuario';
import { puedeVerModulo } from '@/src/lib/permisosModulos';
import { iniciarBarrido, disponiblesParaBarrido, MAX_POR_BARRIDO } from '@/src/lib/barrido';

/** Estado del barrido en curso (o del último) para la barra de progreso. */
export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();

  const recientes = db.select({
    id: barridos.id,
    canal: barridos.canal,
    plantilla: barridos.plantilla,
    lote: barridos.lote,
    objetivo: barridos.objetivo,
    enviados: barridos.enviados,
    fallidos: barridos.fallidos,
    estado: barridos.estado,
    detalle: barridos.detalle,
    created_at: barridos.created_at,
    terminado_at: barridos.terminado_at,
    usuario: users.username,
  })
    .from(barridos)
    .leftJoin(users, eq(barridos.usuario_id, users.id))
    .orderBy(desc(barridos.id))
    .limit(10)
    .all();

  const url = req.nextUrl.searchParams;
  const canal = (url.get('canal') === 'whatsapp' ? 'whatsapp' : 'correo') as 'correo' | 'whatsapp';
  const disponibles = disponiblesParaBarrido({
    usuarioId: authUser.id,
    canal,
    plantillaId: 'presentacion',
    cantidad: MAX_POR_BARRIDO,
    lote: url.get('lote') || null,
    soloMios: url.get('soloMios') === '1',
    prioridad: url.get('prioridad') || null,
  });

  return Response.json({ recientes, disponibles, maximo: MAX_POR_BARRIDO });
}

/** Arranca un barrido de primer contacto. Envía de verdad: el aviso va en la UI. */
export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();
  if (authUser.role === 'viewer') return forbidden();

  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: 'Solicitud mal formada' }, { status: 400 });
  if (body.canal !== 'correo' && body.canal !== 'whatsapp') {
    return Response.json({ error: 'Canal no válido' }, { status: 400 });
  }

  try {
    const fila = iniciarBarrido({
      usuarioId: authUser.id,
      canal: body.canal,
      plantillaId: body.plantilla || 'presentacion',
      cantidad: Number(body.cantidad) || MAX_POR_BARRIDO,
      lote: body.lote || null,
      soloMios: Boolean(body.soloMios),
      prioridad: body.prioridad || null,
    });
    return Response.json(fila, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'No se pudo iniciar el barrido' }, { status: 400 });
  }
}
