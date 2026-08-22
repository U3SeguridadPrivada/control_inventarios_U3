import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { protocolos } from '@/src/db/schema';
import { eq, or, like } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

// Hay dos reglamentos y viven en la misma tabla `protocolos` con categoria
// 'Reglamento'. Se distinguen por `contenido.ambito`; los registros antiguos
// sin ese campo se consideran del ambito de oficinas.
export type AmbitoReglamento = 'oficinas' | 'guardias';

const AMBITOS: Record<AmbitoReglamento, { archivo: string; titulo: string; descripcion: string; subtitulo: string }> = {
  oficinas: {
    archivo: 'reglamento-oficinas.json',
    titulo: 'Reglamento Interior de Trabajo - Personal de Oficina · Corporativo Insurgentes',
    descripcion: 'Reglamento normativo de observancia obligatoria y exclusiva para el personal de oficina de U3 Seguridad Privada en el Corporativo de Insurgentes.',
    subtitulo: 'Horarios, alimentos, salidas y disciplina para el personal de oficina del Corporativo Insurgentes.',
  },
  guardias: {
    archivo: 'reglamento-guardias.json',
    titulo: 'Reglamento Interior de Trabajo - Personal Operativo de Seguridad (Guardias)',
    descripcion: 'Reglamento normativo de observancia obligatoria para el personal operativo de seguridad de U3 asignado a instalaciones de clientes.',
    subtitulo: 'Turnos, relevos, consignas, uniforme, novedades y disciplina del personal operativo.',
  },
};

function resolverAmbito(valor: string | null | undefined): AmbitoReglamento {
  return valor === 'guardias' ? 'guardias' : 'oficinas';
}

function ambitoDe(registro: { contenido?: Record<string, any> | null }): AmbitoReglamento {
  return resolverAmbito(registro?.contenido?.ambito);
}

function cargarBaseDesdeDisco(ambito: AmbitoReglamento) {
  const meta = AMBITOS[ambito];
  const jsonPath = path.join(process.cwd(), 'src', 'data', meta.archivo);

  if (!existsSync(jsonPath)) {
    return {
      titulo: meta.titulo,
      categoria: 'Reglamento',
      prioridad: 'Alta',
      resumen: meta.descripcion,
      contenido: { ambito, version: '1.0', subtitulo: meta.subtitulo, secciones: [] },
    };
  }

  const base = JSON.parse(readFileSync(jsonPath, 'utf8'));
  base.contenido = { ...(base.contenido || {}), ambito };
  return base;
}

function buscarRegistro(ambito: AmbitoReglamento) {
  const registros = db.select().from(protocolos).where(
    or(
      eq(protocolos.categoria, 'Reglamento'),
      like(protocolos.titulo, '%Reglamento%')
    )
  ).all();

  return registros.find((r) => ambitoDe(r) === ambito) ?? null;
}

export async function GET(req: NextRequest) {
  if (!verifyAuth(req)) return unauthorized();

  const ambito = resolverAmbito(req.nextUrl.searchParams.get('ambito'));

  try {
    let registro = buscarRegistro(ambito);

    if (!registro) {
      const base = cargarBaseDesdeDisco(ambito);
      registro = db.insert(protocolos).values({
        titulo: base.titulo || AMBITOS[ambito].titulo,
        categoria: 'Reglamento',
        descripcion: base.resumen || base.descripcion || AMBITOS[ambito].descripcion,
        tipo: 'documento',
        pasos: [],
        contenido: base.contenido,
        prioridad: base.prioridad || 'Alta',
        activo: 1,
        actualizado_en: new Date().toISOString(),
      }).returning().get();
    }

    return Response.json(registro);
  } catch (err: any) {
    console.error('Error en GET /api/reglamento:', err);
    return Response.json({ error: 'Error al consultar reglamento' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (authUser.role === 'viewer') return forbidden();

  try {
    const body = await req.json();
    const { titulo, descripcion, contenido, prioridad, activo } = body;
    const ambito = resolverAmbito(body.ambito ?? contenido?.ambito ?? req.nextUrl.searchParams.get('ambito'));
    const meta = AMBITOS[ambito];
    const ahora = new Date().toISOString();

    // El ambito nunca se pierde aunque el editor guarde un contenido sin el campo.
    const contenidoFinal = contenido ? { ...contenido, ambito } : null;

    const existente = buscarRegistro(ambito);

    if (existente) {
      const actualizado = db.update(protocolos)
        .set({
          titulo: titulo?.trim() || existente.titulo,
          categoria: 'Reglamento',
          descripcion: descripcion ?? existente.descripcion,
          tipo: 'documento',
          contenido: contenidoFinal ?? existente.contenido,
          prioridad: prioridad || existente.prioridad,
          activo: activo === false || activo === 0 ? 0 : 1,
          actualizado_en: ahora,
        })
        .where(eq(protocolos.id, existente.id))
        .returning()
        .get();

      return Response.json(actualizado);
    }

    const creado = db.insert(protocolos).values({
      titulo: titulo?.trim() || meta.titulo,
      categoria: 'Reglamento',
      descripcion: descripcion || meta.descripcion,
      tipo: 'documento',
      pasos: [],
      contenido: contenidoFinal ?? { ambito, version: '1.0', subtitulo: meta.subtitulo, secciones: [] },
      prioridad: prioridad || 'Alta',
      activo: 1,
      actualizado_en: ahora,
    }).returning().get();

    return Response.json(creado);
  } catch (err: any) {
    console.error('Error en PUT /api/reglamento:', err);
    return Response.json({ error: 'Error al actualizar el reglamento' }, { status: 500 });
  }
}
