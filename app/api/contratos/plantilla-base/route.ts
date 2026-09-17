import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/db';
import { protocolos } from '@/src/db/schema';
import { eq, or, like } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();

  const plantilla = db.select().from(protocolos)
    .where(or(eq(protocolos.id, 29), like(protocolos.titulo, '%Contrato Individual de Trabajo%')))
    .get();

  if (!plantilla) {
    return NextResponse.json({ error: 'Plantilla de contrato no encontrada' }, { status: 404 });
  }

  return NextResponse.json(plantilla);
}

export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  try {
    const { contenido } = await req.json();
    if (!contenido) {
      return NextResponse.json({ error: 'Falta el contenido de la plantilla' }, { status: 400 });
    }

    // Buscar protocolo maestro #29 o por nombre
    const existente = db.select().from(protocolos)
      .where(or(eq(protocolos.id, 29), like(protocolos.titulo, '%Contrato Individual de Trabajo%')))
      .get();

    if (existente) {
      db.update(protocolos)
        .set({
          // La columna ya es de tipo JSON (drizzle serializa solo); pasarle
          // un string ya convertido lo codificaba dos veces y lo dejaba
          // ilegible al releerlo — por eso la Plantilla Base nunca se
          // aplicaba a los contratos siguientes.
          contenido,
          actualizado_en: new Date().toISOString(),
        })
        .where(eq(protocolos.id, existente.id))
        .run();
    } else {
      db.insert(protocolos)
        .values({
          id: 29,
          titulo: 'Contrato Individual de Trabajo - Tiempo Indeterminado (Periodo de Prueba)',
          categoria: 'Recursos Humanos',
          descripcion: 'Plantilla maestra editable del contrato laboral.',
          tipo: 'documento',
          pasos: [],
          contenido,
          prioridad: 'Alta',
          activo: 1,
        })
        .run();
    }

    return NextResponse.json({
      ok: true,
      mensaje: 'Plantilla base de contrato guardada exitosamente.',
    });
  } catch (e: any) {
    console.error('Error al guardar plantilla base:', e);
    return NextResponse.json({ error: e.message || 'Error al guardar plantilla' }, { status: 500 });
  }
}
