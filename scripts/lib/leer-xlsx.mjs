// Lector mínimo de .xlsx sin dependencias externas: el archivo es un ZIP con XML
// dentro. El proyecto no tiene librería de Excel y solo necesitamos leer celdas,
// así que se descomprime a mano (zlib) y se parsea el XML de cada hoja.
import fs from 'node:fs';
import zlib from 'node:zlib';

function leerZip(ruta) {
  const buf = fs.readFileSync(ruta);
  // El directorio central se localiza desde el final del archivo (EOCD)
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 70000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error(`No parece un archivo xlsx válido: ${ruta}`);
  const nEntradas = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const archivos = {};
  for (let i = 0; i < nEntradas; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const nombre = buf.toString('utf8', off + 46, off + 46 + nameLen);
    // Los tamaños de la cabecera local pueden venir en cero (data descriptor),
    // por eso se usan los del directorio central.
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const ini = localOff + 30 + lNameLen + lExtraLen;
    const datos = buf.subarray(ini, ini + compSize);
    archivos[nombre] = metodo === 8 ? zlib.inflateRawSync(datos) : Buffer.from(datos);
    off += 46 + nameLen + extraLen + commentLen;
  }
  return archivos;
}

const desescapar = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&amp;/g, '&');

function leerCadenas(xml) {
  if (!xml) return [];
  const out = [];
  for (const si of xml.split('<si>').slice(1)) {
    const cuerpo = si.split('</si>')[0];
    let texto = '';
    for (const m of cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) texto += m[1];
    out.push(desescapar(texto));
  }
  return out;
}

// Serial de Excel -> fecha ISO (el sistema de fechas de 1900 arranca en 1899-12-30)
const serialAFecha = (n) => new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);

// Qué estilos corresponden a un formato de fecha, para no devolver el serial crudo
function estilosDeFecha(xmlEstilos) {
  const fechas = new Set();
  if (!xmlEstilos) return fechas;
  const propios = new Set();
  for (const m of xmlEstilos.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    if (/[dmyhs]/i.test(m[2]) && !/(\[|red)/i.test(m[2])) propios.add(+m[1]);
  }
  const integrados = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
  const cellXfs = (xmlEstilos.match(/<cellXfs[\s\S]*?<\/cellXfs>/) || [''])[0];
  let i = 0;
  for (const m of cellXfs.matchAll(/<xf[^>]*numFmtId="(\d+)"[^>]*\/?>/g)) {
    if (integrados.has(+m[1]) || propios.has(+m[1])) fechas.add(i);
    i++;
  }
  return fechas;
}

function leerHoja(xml, cadenas, formatosFecha) {
  const filas = [];
  for (const mf of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const celdas = {};
    // La celda autocerrada va primero en la alternancia: si no, <c r="G9"/> se
    // "come" el contenido de la celda siguiente y desplaza toda la fila.
    for (const mc of mf[2].matchAll(/<c([^>]*?)\/>|<c([^>]*?)>([\s\S]*?)<\/c>/g)) {
      const attrs = mc[1] ?? mc[2] ?? '';
      const cuerpo = mc[3] ?? '';
      const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1];
      if (!ref) continue;
      const tipo = (attrs.match(/t="(\w+)"/) || [])[1];
      const estilo = (attrs.match(/s="(\d+)"/) || [])[1];
      let valor = null;
      if (tipo === 's') {
        const v = (cuerpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        valor = v != null ? cadenas[+v] : null;
      } else if (tipo === 'inlineStr') {
        let t = '';
        for (const m of cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) t += m[1];
        valor = desescapar(t);
      } else {
        const v = (cuerpo.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (v != null && v !== '') {
          const num = Number(v);
          valor = Number.isNaN(num) ? desescapar(v)
            : (estilo != null && formatosFecha.has(+estilo) && num > 20000 && num < 80000) ? serialAFecha(num) : num;
        }
      }
      if (valor !== null && valor !== '') celdas[ref] = valor;
    }
    if (Object.keys(celdas).length) filas.push({ n: +mf[1], celdas });
  }
  return filas;
}

/** Devuelve [{ nombre, filas: [{ n, celdas: { A: valor, ... } }] }] */
export function leerLibro(ruta) {
  const z = leerZip(ruta);
  const txt = (n) => (z[n] ? z[n].toString('utf8') : null);
  const cadenas = leerCadenas(txt('xl/sharedStrings.xml'));
  const formatosFecha = estilosDeFecha(txt('xl/styles.xml'));
  const wb = txt('xl/workbook.xml') || '';
  const rels = txt('xl/_rels/workbook.xml.rels') || '';
  const destinos = {};
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    destinos[m[1]] = m[2].replace(/^\/?xl\//, '').replace(/^\//, '');
  }
  const hojas = [];
  for (const m of wb.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"[^>]*\/?>/g)) {
    const xml = txt('xl/' + destinos[m[2]]);
    hojas.push({ nombre: desescapar(m[1]), filas: xml ? leerHoja(xml, cadenas, formatosFecha) : [] });
  }
  return hojas;
}
