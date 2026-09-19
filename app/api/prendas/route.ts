import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { catalogo_prendas } from '@/src/db/schema';
import { eq, asc } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();

  const soloActivas = req.nextUrl.searchParams.get('solo_activas') === '1';
  const rows = soloActivas
    ? db.select().from(catalogo_prendas).where(eq(catalogo_prendas.activo, 1)).orderBy(asc(catalogo_prendas.nombre)).all()
    : db.select().from(catalogo_prendas).orderBy(asc(catalogo_prendas.nombre)).all();
  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  try {
    const { nombre, categoria, requiere_talla, tallas, stock_minimo, costo_estimado } = await req.json();
    const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : '';
    if (!nombreLimpio) return Response.json({ error: 'El nombre de la prenda es requerido' }, { status: 400 });

    const result = db.insert(catalogo_prendas).values({
      nombre: nombreLimpio,
      categoria: categoria || 'Uniformes',
      requiere_talla: requiere_talla ? 1 : 0,
      tallas: requiere_talla && Array.isArray(tallas) ? tallas : null,
      stock_minimo: stock_minimo != null ? Number(stock_minimo) : 5,
      costo_estimado: costo_estimado != null && costo_estimado !== '' ? Number(costo_estimado) : null,
    }).returning().get();
    return Response.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return Response.json({ error: 'Ya existe una prenda con ese nombre en el catálogo' }, { status: 409 });
    }
    return Response.json({ error: 'Error al crear la prenda' }, { status: 500 });
  }
}
