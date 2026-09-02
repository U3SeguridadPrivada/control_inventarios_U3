import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { clientes, users } from '@/src/db/schema';
import { desc, asc, eq, and, or, like, count, isNull, type SQL } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { accesoDeUsuario } from '@/src/lib/accesoUsuario';
import { puedeVerModulo } from '@/src/lib/permisosModulos';

const POR_PAGINA = 50;

/**
 * La cartera importada del DENUE son decenas de miles de registros: el filtrado
 * y la paginación van en SQL, nunca en el navegador.
 */
export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();

  const url = req.nextUrl.searchParams;
  const etapa = url.get('etapa');
  const asignado = url.get('asignado');
  const prioridad = url.get('prioridad');
  const origen = url.get('origen');
  const tipo = url.get('tipo');
  const alcaldia = url.get('alcaldia');
  const q = (url.get('q') || '').trim();
  const pagina = Math.max(1, Number(url.get('pagina') || '1'));
  const porPagina = Math.min(200, Number(url.get('porPagina') || POR_PAGINA));

  // Los filtros de contexto se comparten; el de etapa se aplica aparte para que
  // el resumen del embudo siga mostrando todas las columnas al filtrar por una.
  const contexto: SQL[] = [];
  if (prioridad && prioridad !== 'Todas') contexto.push(eq(clientes.prioridad, prioridad));
  if (origen && origen !== 'Todos') contexto.push(eq(clientes.origen, origen));
  if (tipo && tipo !== 'Todos') contexto.push(eq(clientes.tipo, tipo));
  if (alcaldia && alcaldia !== 'Todas') contexto.push(eq(clientes.alcaldia, alcaldia));
  if (asignado === 'sin') contexto.push(isNull(clientes.asignado_a));
  else if (asignado === 'mios') contexto.push(eq(clientes.asignado_a, authUser.id));
  else if (asignado && asignado !== 'Todos') contexto.push(eq(clientes.asignado_a, Number(asignado)));
  if (q) {
    const patron = `%${q}%`;
    const busqueda = or(
      like(clientes.nombre, patron),
      like(clientes.empresa, patron),
      like(clientes.email, patron),
      like(clientes.telefono, patron),
      like(clientes.giro, patron),
    );
    if (busqueda) contexto.push(busqueda);
  }

  const whereContexto = contexto.length ? and(...contexto) : undefined;
  const filtraEtapa = Boolean(etapa && etapa !== 'Todas');
  const where = filtraEtapa ? and(...contexto, eq(clientes.etapa, etapa!)) : whereContexto;

  const total = db.select({ n: count() }).from(clientes).where(where).get()?.n ?? 0;

  const items = db.select({
    id: clientes.id,
    nombre: clientes.nombre,
    tipo: clientes.tipo,
    empresa: clientes.empresa,
    email: clientes.email,
    telefono: clientes.telefono,
    direccion: clientes.direccion,
    notas: clientes.notas,
    etapa: clientes.etapa,
    asignado_a: clientes.asignado_a,
    asignado_nombre: users.username,
    ultimo_contacto: clientes.ultimo_contacto,
    proximo_seguimiento: clientes.proximo_seguimiento,
    motivo_perdida: clientes.motivo_perdida,
    origen: clientes.origen,
    id_denue: clientes.id_denue,
    giro: clientes.giro,
    codigo_scian: clientes.codigo_scian,
    tamano: clientes.tamano,
    prioridad: clientes.prioridad,
    puntaje: clientes.puntaje,
    sitio_web: clientes.sitio_web,
    colonia: clientes.colonia,
    cp: clientes.cp,
    alcaldia: clientes.alcaldia,
    latitud: clientes.latitud,
    longitud: clientes.longitud,
    created_at: clientes.created_at,
  })
    .from(clientes)
    .leftJoin(users, eq(clientes.asignado_a, users.id))
    .where(where)
    // Primero lo más prometedor y lo que lleva más tiempo sin tocarse.
    .orderBy(desc(clientes.puntaje), asc(clientes.ultimo_contacto), desc(clientes.id))
    .limit(porPagina)
    .offset((pagina - 1) * porPagina)
    .all();

  const porEtapa = db.select({ etapa: clientes.etapa, n: count() })
    .from(clientes)
    .where(whereContexto)
    .groupBy(clientes.etapa)
    .all();

  return Response.json({ total, pagina, porPagina, items, porEtapa });
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();
  if (authUser.role === 'viewer') return forbidden();

  try {
    const b = await req.json();
    if (!b.nombre) return Response.json({ error: 'Falta el nombre' }, { status: 400 });

    const nuevo = db.insert(clientes).values({
      nombre: b.nombre,
      tipo: b.tipo || 'Prospecto',
      empresa: b.empresa,
      email: b.email,
      telefono: b.telefono,
      direccion: b.direccion,
      notas: b.notas,
      etapa: b.etapa || 'Nuevo',
      asignado_a: b.asignado_a ?? null,
      proximo_seguimiento: b.proximo_seguimiento ?? null,
      origen: b.origen || 'Manual',
      giro: b.giro ?? null,
      alcaldia: b.alcaldia ?? null,
      creado_por: authUser.id,
    }).returning().get();
    return Response.json(nuevo, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al crear el cliente' }, { status: 500 });
  }
}
