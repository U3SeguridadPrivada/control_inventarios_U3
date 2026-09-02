import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { clientes, users } from '@/src/db/schema';
import { eq, and, isNull, isNotNull, ne, desc, or, like, inArray, count, type SQL } from 'drizzle-orm';
import { verifyAuth, unauthorized, forbidden } from '@/src/lib/auth';
import { accesoDeUsuario } from '@/src/lib/accesoUsuario';
import { puedeVerModulo } from '@/src/lib/permisosModulos';
import { registrarActividad } from '@/src/lib/actividades';

const CATEGORIAS_GIRO: Record<string, { label: string; icon: string; keywords: string[] }> = {
  condominios: {
    label: 'Condominios y Bienes Raíces',
    icon: '🏢',
    keywords: ['inmobiliaria', 'bienes raíces', 'condominio', 'multifamiliar', 'administración de bienes', 'oficinas'],
  },
  hoteles: {
    label: 'Hoteles y Hospedaje',
    icon: '🏨',
    keywords: ['hotel', 'hospedaje', 'motel', 'alojamiento'],
  },
  fabricas: {
    label: 'Fábricas, Naves y Bodegas',
    icon: '🏭',
    keywords: ['industrial', 'naves', 'almacenamiento', 'carga', 'bodega', 'manufactura', 'planta'],
  },
  hospitales: {
    label: 'Hospitales y Clínicas',
    icon: '🏥',
    keywords: ['hospital', 'médic', 'sanatorio', 'clínica', 'consultorio', 'laboratorio'],
  },
  escuelas: {
    label: 'Escuelas y Universidades',
    icon: '🎓',
    keywords: ['escuela', 'colegio', 'universidad', 'educación', 'instituto'],
  },
  bancos: {
    label: 'Bancos, Financieras y Joyerías',
    icon: '🏦',
    keywords: ['banca', 'financier', 'joyerí', 'reloj', 'empeño', 'crédito', 'bolsa', 'seguros', 'fianza'],
  },
  construccion: {
    label: 'Obras y Constructoras',
    icon: '🏗️',
    keywords: ['construcción', 'edificación', 'urbanización', 'obra'],
  },
  restaurantes: {
    label: 'Restaurantes y Salones',
    icon: '🍽️',
    keywords: ['restaurante', 'salón', 'plaza', 'bar', 'cafetería'],
  },
  corporativos: {
    label: 'Corporativos y Despachos',
    icon: '💼',
    keywords: ['corporativ', 'consultoría', 'bufete', 'jurídic', 'notarí', 'contabilidad'],
  },
};

/**
 * GET: Obtiene las estadísticas de la tanda activa del asesor:
 * - Total asignados
 * - Cuántos en etapa Nuevo (sin tocar)
 * - Cuántos trabajados (contactado, interesado, cotizado, ganado, perdido)
 * - Porcentaje de avance de su tanda
 * - Disponibilidad de prospectos sin asignar por categoría en CDMX
 */
export async function GET(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();

  const url = req.nextUrl.searchParams;
  const targetAsesorId = url.get('asesorId') ? Number(url.get('asesorId')) : authUser.id;

  // Estadísticas de la tanda del asesor
  const misProspectos = db.select({
    id: clientes.id,
    etapa: clientes.etapa,
    ultimo_contacto: clientes.ultimo_contacto,
  }).from(clientes).where(eq(clientes.asignado_a, targetAsesorId)).all();

  const total = misProspectos.length;
  let nuevos = 0;
  let contactados = 0;
  let interesados = 0;
  let cotizados = 0;
  let ganados = 0;
  let perdidos = 0;

  for (const p of misProspectos) {
    if (p.etapa === 'Nuevo' && !p.ultimo_contacto) nuevos++;
    else if (p.etapa === 'Contactado') contactados++;
    else if (p.etapa === 'Interesado') interesados++;
    else if (p.etapa === 'Cotizado') cotizados++;
    else if (p.etapa === 'Ganado') ganados++;
    else if (p.etapa === 'Perdido') perdidos++;
    else contactados++; // Cualquier otro estado con contacto cuenta como trabajado
  }

  const trabajados = total - nuevos;
  const porcentaje = total > 0 ? Math.round((trabajados / total) * 100) : 0;

  // Conteo de prospectos disponibles en el padrón maestro sin asignar
  const poolSinAsignar = db.select({ n: count() })
    .from(clientes)
    .where(isNull(clientes.asignado_a))
    .get()?.n ?? 0;

  return Response.json({
    ok: true,
    tanda: {
      total,
      nuevos,
      trabajados,
      contactados,
      interesados,
      cotizados,
      ganados,
      perdidos,
      porcentaje,
    },
    poolSinAsignar,
    categorias: Object.entries(CATEGORIAS_GIRO).map(([k, v]) => ({
      id: k,
      label: v.label,
      icon: v.icon,
    })),
  });
}

/**
 * POST: El asesor toma una tanda (por defecto 200 datos) con sus propios parámetros:
 * {
 *   cantidad: 200,
 *   categoria: 'condominios' | 'hoteles' | 'fabricas' | ... | 'todas',
 *   alcaldia: 'Cuauhtémoc' | 'Miguel Hidalgo' | ... | 'Todas',
 *   canal: 'todos' | 'wa' | 'mail' | 'ambos',
 *   prioridad: 'Todas' | 'A' | 'B' | 'C',
 *   asesorId?: number
 * }
 */
export async function POST(req: NextRequest) {
  const authUser = verifyAuth(req);
  if (!authUser) return unauthorized();
  if (!puedeVerModulo('clientes', accesoDeUsuario(authUser.id))) return forbidden();
  if (authUser.role === 'viewer') return forbidden();

  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: 'Datos no válidos' }, { status: 400 });

  const cantidad = Math.min(1000, Math.max(10, Number(body.cantidad || 200)));
  const categoriaKey = String(body.categoria || 'todas').toLowerCase();
  const alcaldia = body.alcaldia && body.alcaldia !== 'Todas' ? body.alcaldia : null;
  const canal = body.canal || 'todos';
  const prioridad = body.prioridad && body.prioridad !== 'Todas' ? body.prioridad : null;

  // Asignar al asesor solicitado (o a sí mismo si no se especifica)
  const targetAsesorId = body.asesorId ? Number(body.asesorId) : authUser.id;
  const asesorUser = db.select({ username: users.username })
    .from(users)
    .where(eq(users.id, targetAsesorId))
    .get();

  if (!asesorUser) {
    return Response.json({ error: 'Asesor no encontrado' }, { status: 404 });
  }

  // Filtros en SQL
  const filtros: SQL[] = [isNull(clientes.asignado_a)];

  // Filtro de categoría / giro
  if (categoriaKey !== 'todas' && CATEGORIAS_GIRO[categoriaKey]) {
    const kws = CATEGORIAS_GIRO[categoriaKey].keywords;
    const orFilters = kws.map((kw) => like(clientes.giro, `%${kw}%`));
    filtros.push(or(...orFilters)!);
  }

  // Filtro de alcaldía (CDMX)
  if (alcaldia) {
    filtros.push(eq(clientes.alcaldia, alcaldia));
  }

  // Filtro de prioridad
  if (prioridad) {
    filtros.push(eq(clientes.prioridad, prioridad));
  }

  // Filtro de canal
  if (canal === 'wa') {
    filtros.push(and(isNotNull(clientes.telefono), ne(clientes.telefono, ''))!);
  } else if (canal === 'mail') {
    filtros.push(and(isNotNull(clientes.email), ne(clientes.email, ''))!);
  } else if (canal === 'ambos') {
    filtros.push(and(
      isNotNull(clientes.telefono), ne(clientes.telefono, ''),
      isNotNull(clientes.email), ne(clientes.email, ''),
    )!);
  }

  // Extraer los mejores candidatos disponibles
  const candidatos = db.select({ id: clientes.id })
    .from(clientes)
    .where(and(...filtros))
    .orderBy(desc(clientes.puntaje), desc(clientes.id))
    .limit(cantidad)
    .all();

  if (!candidatos.length) {
    return Response.json({
      ok: false,
      error: 'No se encontraron prospectos sin asignar con esos parámetros específicos. Prueba seleccionando otra alcaldía o giro.',
      asignados: 0,
    }, { status: 400 });
  }

  const ids = candidatos.map((c) => c.id);

  // Asignar en transacción
  db.transaction((tx) => {
    tx.update(clientes)
      .set({ asignado_a: targetAsesorId })
      .where(inArray(clientes.id, ids))
      .run();
  });

  // Registrar actividad
  const catNombre = CATEGORIAS_GIRO[categoriaKey]?.label || 'Padrón General';
  for (const id of ids) {
    registrarActividad({
      clienteId: id,
      usuarioId: authUser.id,
      tipo: 'asignacion',
      mensaje: `Asignado en tanda de ${ids.length} (${catNombre}) a ${asesorUser.username}`,
    });
  }

  return Response.json({
    ok: true,
    asignados: ids.length,
    asesor: asesorUser.username,
    categoria: catNombre,
    mensaje: `Se cargaron exitosamente ${ids.length} prospectos de ${catNombre} a la bandeja de ${asesorUser.username}.`,
  });
}
