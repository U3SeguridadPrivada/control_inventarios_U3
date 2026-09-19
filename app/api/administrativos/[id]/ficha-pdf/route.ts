import { NextRequest } from 'next/server';
import { db } from '@/src/db';
import { personal_administrativo, administrativo_documentos } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifyAuth, unauthorized } from '@/src/lib/auth';
import { htmlToPdf } from '@/src/lib/pdf';
import { generateFichaAdministrativaHtml, FichaTecnicaData, FICHA_ADMIN_TEMPLATE_VERSION } from '@/src/lib/fichaAdministrativaHtml';
import { desglosarDireccion } from '@/src/lib/fichaTecnicaUtils';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAuth(req)) return unauthorized();
  const { id } = await params;
  const adminId = Number(id);

  const persona = db.select().from(personal_administrativo).where(eq(personal_administrativo.id, adminId)).get();
  if (!persona) return Response.json({ error: 'Personal no encontrado' }, { status: 404 });

  // Buscar si tiene fotografía subida en sus documentos del expediente
  let fotoBase64: string | null = null;
  const docs = db.select().from(administrativo_documentos).where(eq(administrativo_documentos.administrativo_id, adminId)).all();
  const fotoDoc = docs.find((d) => d.tipo_mimetype.startsWith('image/'));
  if (fotoDoc) {
    try {
      const filePathAdmin = path.join(process.cwd(), 'uploads', 'administrativos', fotoDoc.nombre_archivo);
      if (fs.existsSync(filePathAdmin)) {
        const buf = fs.readFileSync(filePathAdmin);
        fotoBase64 = `data:${fotoDoc.tipo_mimetype};base64,${buf.toString('base64')}`;
      }
    } catch (e) {
      console.warn('No se pudo cargar la foto del expediente:', e);
    }
  }

  let data: FichaTecnicaData;

  if (persona.ficha_tecnica_json) {
    try {
      data = JSON.parse(persona.ficha_tecnica_json);
      if (!data.fotoUrl && fotoBase64) {
        data.fotoUrl = fotoBase64;
      }
      if (!data.nombre) {
        data.nombre = persona.nombre;
      }
      if (!data.puesto) {
        data.puesto = persona.puesto;
      }
      if (!data.numeroElemento) {
        data.numeroElemento = persona.numero_empleado ?? undefined;
      }
      // Casi todo el personal es mexicano y radica en México: se rellena solo
      // si el campo sigue vacío, pero cualquier valor que capture el editor
      // (p.ej. otra nacionalidad) tiene prioridad y se conserva tal cual.
      if (!data.lugarNacimiento) data.lugarNacimiento = 'MÉXICO';
      if (!data.nacionalidad) data.nacionalidad = 'MEXICANA';
      if (!data.colonia && !data.delegacionMunicipio && data.calleNumero && (data.calleNumero.includes(';') || /,\s*col/i.test(data.calleNumero))) {
        const desglose = desglosarDireccion(data.calleNumero);
        data.calleNumero = desglose.calleNumero;
        data.colonia = desglose.colonia;
        data.delegacionMunicipio = desglose.delegacionMunicipio;
        data.estado = desglose.estado;
        data.cp = desglose.cp;
      }
    } catch {
      data = construirFichaInicial(persona, fotoBase64);
    }
  } else {
    data = construirFichaInicial(persona, fotoBase64);
  }

  const isInline = req.nextUrl.searchParams.get('inline') === 'true';
  const forceRefresh = req.nextUrl.searchParams.get('refresh') === 'true';

  // La caché se invalida sola: la llave incluye un hash del contenido real
  // (data + foto), así que un cambio hecho desde CUALQUIER editor -el modal
  // rápido, la ficha técnica completa- vuelve obsoleto el archivo viejo sin
  // que cada pantalla tenga que acordarse de avisarle a esta ruta.
  const huellaContenido = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex').slice(0, 12);
  const uploadsDir = path.join(process.cwd(), 'uploads', 'administrativos');
  const cachedFileName = `${adminId}-ficha-tecnica-${FICHA_ADMIN_TEMPLATE_VERSION}-${huellaContenido}.pdf`;
  const cachedFilePath = path.join(uploadsDir, cachedFileName);

  if (!forceRefresh && fs.existsSync(cachedFilePath)) {
    try {
      const cachedPdf = fs.readFileSync(cachedFilePath);
      return new Response(cachedPdf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `${isInline ? 'inline' : 'attachment'}; filename="ficha_${persona.numero_empleado || adminId}.pdf"`,
          'Cache-Control': 'no-store',
        },
      });
    } catch (e) {
      console.warn('Error leyendo PDF de ficha en caché:', e);
    }
  }

  const html = generateFichaAdministrativaHtml(data);
  const pdfBuffer = await htmlToPdf(html, {
    margin: { top: '6mm', bottom: '6mm', left: '10mm', right: '10mm' }
  });

  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    // Limpia los PDF cacheados de versiones de datos anteriores de este mismo
    // administrativo para no acumular huérfanos en el disco indefinidamente.
    const prefijo = `${adminId}-ficha-tecnica-${FICHA_ADMIN_TEMPLATE_VERSION}-`;
    for (const archivo of fs.readdirSync(uploadsDir)) {
      if (archivo.startsWith(prefijo) && archivo !== cachedFileName) {
        try { fs.unlinkSync(path.join(uploadsDir, archivo)); } catch {}
      }
    }
    fs.writeFileSync(cachedFilePath, Buffer.from(pdfBuffer));
  } catch (e) {
    console.warn('No se pudo guardar PDF en caché:', e);
  }

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${isInline ? 'inline' : 'attachment'}; filename="ficha_${persona.numero_empleado || adminId}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}

function construirFichaInicial(persona: any, fotoBase64: string | null): FichaTecnicaData {
  const desglose = desglosarDireccion(persona.direccion);
  return {
    numeroElemento: persona.numero_empleado,
    nombre: persona.nombre,
    puesto: persona.puesto || 'PERSONAL ADMINISTRATIVO',
    fotoUrl: fotoBase64,
    fechaNacimiento: '',
    edad: '',
    lugarNacimiento: 'CIUDAD DE MÉXICO',
    nacionalidad: 'MEXICANA',
    estadoCivil: 'SOLTERO(A)',
    estudios: 'LICENCIATURA',
    rfc: '',
    curp: '',
    imss: '',
    sexo: '',
    estatura: '',
    peso: '',
    calleNumero: desglose.calleNumero,
    colonia: desglose.colonia,
    entreCalles: '',
    cp: desglose.cp,
    delegacionMunicipio: desglose.delegacionMunicipio,
    estado: desglose.estado,
    tiempoResidencia: '',
    tiempoRadicarEstado: '',
    telefonoEmergencia: '',
    celular: persona.telefono || '',
    empleos: [
      { empresa: '', periodo: '', puesto: persona.puesto || 'ADMINISTRATIVO' },
      { empresa: '', periodo: '', puesto: '' },
    ],
  };
}
