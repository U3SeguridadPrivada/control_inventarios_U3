import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { cotizaciones } from '@/src/db/schema';
import { desc, sql } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();
  return Response.json(db.select().from(cotizaciones).orderBy(desc(cotizaciones.id)).all());
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  try {
    const { cliente_id, fecha, items, notas, solicitante, atencion, servicio_cotizado, ubicacion, periodicidad, vigencia_dias, asesor_nombre, asesor_puesto } = await req.json();
    if (!cliente_id || !fecha || !Array.isArray(items) || items.length === 0) {
      return Response.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }

    const subtotal = items.reduce((acc: number, it: any) => acc + Number(it.cantidad) * Number(it.precio_unitario), 0);
    const iva = Math.round(subtotal * 0.16 * 100) / 100;
    const total = Math.round((subtotal + iva) * 100) / 100;

    // Obtener la fecha en formato mmddaa a partir del campo fecha enviado
    const [year, month, day] = fecha.split('-');
    const fechaCode = `${month}${day}${year.slice(-2)}`;
    const prefijoFolio = `U3SP-${fechaCode}-`;

    // Buscar el folio máximo del día para evitar colisiones si se borran cotizaciones
    const maxFolioRow = db.select({ folio: cotizaciones.folio })
      .from(cotizaciones)
      .where(sql`${cotizaciones.folio} LIKE ${prefijoFolio + '%'}`)
      .orderBy(desc(cotizaciones.folio))
      .limit(1)
      .get();

    let nextNum = 1;
    if (maxFolioRow?.folio) {
      const parts = maxFolioRow.folio.split('-');
      const lastPart = parts[parts.length - 1];
      const num = parseInt(lastPart, 10);
      if (!isNaN(num)) {
        nextNum = num + 1;
      }
    }
    const folio = `${prefijoFolio}${String(nextNum).padStart(4, '0')}`;

    const nueva = db.insert(cotizaciones).values({
      folio,
      cliente_id: Number(cliente_id),
      fecha,
      solicitante: solicitante || null,
      atencion: atencion || null,
      servicio_cotizado: servicio_cotizado || null,
      ubicacion: ubicacion || null,
      periodicidad: periodicidad || 'Quincenal',
      vigencia_dias: vigencia_dias ? Number(vigencia_dias) : 30,
      asesor_nombre: asesor_nombre || null,
      asesor_puesto: asesor_puesto || 'Asesor Comercial',
      items,
      subtotal: Math.round(subtotal * 100) / 100,
      iva,
      total,
      notas: notas || null,
      creado_por: authUser.id,
    }).returning().get();
    return Response.json(nueva, { status: 201 });
  } catch {
    return Response.json({ error: 'Error al crear la cotización' }, { status: 500 });
  }
}
