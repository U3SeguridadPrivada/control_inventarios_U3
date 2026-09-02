import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { clientes } from '@/src/db/schema';
import { asc, or, eq, ne, isNotNull } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';

/**
 * Lista ligera para los selectores de cliente del Cotizador y de Ventas.
 *
 * No devuelve la cartera completa a propósito: con los lotes del DENUE son
 * decenas de miles de registros y un <select> con esa cantidad de opciones
 * vuelve inservible la pantalla. Solo salen los que alguien ya trabajó —
 * clientes, prospectos que avanzaron de etapa o que ya tienen contacto
 * registrado. Un prospecto frío se cotiza desde su propio perfil, que es
 * donde se llega a él. Con `?todos=1` sí baja completa.
 */
export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();

  const todos = req.nextUrl.searchParams.get('todos') === '1';
  // Todo lo capturado a mano entra siempre: alguien lo dio de alta a propósito.
  // Lo único que se filtra es el prospecto frío que llegó por lote del DENUE.
  const trabajados = or(
    ne(clientes.origen, 'DENUE'),
    eq(clientes.tipo, 'Cliente'),
    ne(clientes.etapa, 'Nuevo'),
    isNotNull(clientes.ultimo_contacto),
  );

  const filas = db.select({
    id: clientes.id,
    nombre: clientes.nombre,
    empresa: clientes.empresa,
  })
    .from(clientes)
    .where(todos ? undefined : trabajados)
    .orderBy(asc(clientes.nombre))
    .all();

  return Response.json(filas);
}
