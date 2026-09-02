// Vuelca la cartera de prospectos a un Excel para trabajarla fuera del sistema.
//
//   node scripts/exportar-prospectos-excel.mjs
//   node scripts/exportar-prospectos-excel.mjs --lote lote-01
//   node scripts/exportar-prospectos-excel.mjs --asesor fernando.rosas
//   node scripts/exportar-prospectos-excel.mjs --etapa Interesado --salida "C:/ruta/archivo.xlsx"
//
// Sale de la base de datos, no del CSV del DENUE: así el archivo trae también
// la etapa, el asesor asignado y la fecha del último contacto.
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { existsSync } from 'fs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');

const args = process.argv.slice(2);
const opcion = (nombre, def) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const filtroLote = opcion('lote', '');
const filtroAsesor = opcion('asesor', '');
const filtroEtapa = opcion('etapa', '');
const filtroPrioridad = opcion('prioridad', '');
const salida = opcion('salida', path.join(projectRoot, 'prospeccion', 'Lista de prospectos.xlsx'));

const dbPath = process.env.SQLITE_DB_PATH || path.join(projectRoot, 'db', 'app.db');
if (!existsSync(dbPath)) {
  console.error(`[excel] No existe la base de datos en ${dbPath}.`);
  process.exit(1);
}
const sqlite = new Database(dbPath, { readonly: true });

const condiciones = [];
const params = {};
if (filtroLote) { condiciones.push('c.lote = @lote'); params.lote = filtroLote; }
if (filtroEtapa) { condiciones.push('c.etapa = @etapa'); params.etapa = filtroEtapa; }
if (filtroPrioridad) { condiciones.push('c.prioridad = @prioridad'); params.prioridad = filtroPrioridad; }
if (filtroAsesor) { condiciones.push('lower(u.username) = lower(@asesor)'); params.asesor = filtroAsesor; }
const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

const filas = sqlite.prepare(`
  SELECT c.id, c.prioridad, c.puntaje, c.nombre, c.empresa, c.giro, c.codigo_scian,
         c.tamano, c.telefono, c.email, c.sitio_web, c.direccion, c.colonia, c.cp,
         c.alcaldia, c.etapa, u.username AS asesor, c.ultimo_contacto,
         c.proximo_seguimiento, c.motivo_perdida, c.lote, c.origen, c.id_denue,
         c.latitud, c.longitud,
         (SELECT COUNT(*) FROM prospecto_actividades a
           WHERE a.cliente_id = c.id AND a.tipo IN ('correo','whatsapp','llamada')) AS contactos,
         (SELECT COUNT(*) FROM cotizaciones z WHERE z.cliente_id = c.id) AS cotizaciones
  FROM clientes c
  LEFT JOIN users u ON u.id = c.asignado_a
  ${where}
  ORDER BY c.puntaje DESC, c.id ASC
`).all(params);

console.log(`[excel] ${filas.length.toLocaleString('es-MX')} prospectos para exportar.`);
if (!filas.length) {
  console.error('[excel] No hay nada que exportar con esos filtros.');
  process.exit(1);
}

const fechaCorta = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const wb = new ExcelJS.Workbook();
wb.creator = 'Suite U3';
wb.created = new Date();

// ---------------------------------------------------------------- Hoja 1
const ws = wb.addWorksheet('Lista de prospectos', {
  views: [{ state: 'frozen', ySplit: 1 }],
});

ws.columns = [
  { header: 'Prioridad', key: 'prioridad', width: 10 },
  { header: 'Puntaje', key: 'puntaje', width: 9 },
  { header: 'Establecimiento', key: 'nombre', width: 42 },
  { header: 'Razón social', key: 'empresa', width: 38 },
  { header: 'Giro', key: 'giro', width: 46 },
  { header: 'SCIAN', key: 'codigo_scian', width: 9 },
  { header: 'Tamaño', key: 'tamano', width: 18 },
  { header: 'Teléfono', key: 'telefono', width: 14 },
  { header: 'Correo', key: 'email', width: 34 },
  { header: 'Sitio web', key: 'sitio_web', width: 28 },
  { header: 'Domicilio', key: 'direccion', width: 52 },
  { header: 'Colonia', key: 'colonia', width: 26 },
  { header: 'CP', key: 'cp', width: 8 },
  { header: 'Alcaldía', key: 'alcaldia', width: 20 },
  { header: 'Etapa', key: 'etapa', width: 13 },
  { header: 'Asesor', key: 'asesor', width: 18 },
  { header: 'Contactos', key: 'contactos', width: 11 },
  { header: 'Cotizaciones', key: 'cotizaciones', width: 13 },
  { header: 'Último contacto', key: 'ultimo_contacto', width: 18 },
  { header: 'Próximo seguimiento', key: 'proximo_seguimiento', width: 19 },
  { header: 'Motivo de pérdida', key: 'motivo_perdida', width: 22 },
  { header: 'Lote', key: 'lote', width: 11 },
  { header: 'Folio Padrón', key: 'id_denue', width: 12 },
];

for (const f of filas) {
  ws.addRow({
    ...f,
    asesor: f.asesor || 'Sin asignar',
    ultimo_contacto: fechaCorta(f.ultimo_contacto),
    telefono: f.telefono || '',
    cp: f.cp || '',
  });
}

// Teléfono, CP y SCIAN como texto: si Excel los toma como número les come el
// cero inicial y los convierte en notación científica.
for (const clave of ['telefono', 'cp', 'codigo_scian', 'id_denue']) {
  ws.getColumn(clave).numFmt = '@';
  ws.getColumn(clave).alignment = { horizontal: 'left' };
}

const encabezado = ws.getRow(1);
encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
encabezado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
encabezado.alignment = { vertical: 'middle', horizontal: 'left' };
encabezado.height = 22;
ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

// Semáforo de prioridad: A verde, B azul, C gris. Se ve de un vistazo a quién marcar primero.
const RELLENO_PRIORIDAD = {
  A: { argb: 'FFD7F2E3' },
  B: { argb: 'FFDCE9F7' },
  C: { argb: 'FFEFEFEF' },
};
ws.eachRow((fila, i) => {
  if (i === 1) return;
  const relleno = RELLENO_PRIORIDAD[fila.getCell('prioridad').value];
  if (relleno) {
    fila.getCell('prioridad').fill = { type: 'pattern', pattern: 'solid', fgColor: relleno };
    fila.getCell('prioridad').font = { bold: true };
  }
  fila.alignment = { vertical: 'top' };
});

// ---------------------------------------------------------------- Hoja 2
const resumen = wb.addWorksheet('Resumen');
resumen.columns = [
  { header: 'Concepto', key: 'concepto', width: 46 },
  { header: 'Prospectos', key: 'total', width: 14 },
  { header: 'Porcentaje', key: 'pct', width: 12 },
];
resumen.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
resumen.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };

const total = filas.length;
const agregar = (concepto, n) => resumen.addRow({
  concepto, total: n, pct: total ? n / total : 0,
});
const titulo = (texto) => {
  const r = resumen.addRow({ concepto: texto });
  r.font = { bold: true };
  return r;
};
const contar = (campo, etiquetaVacia = 'Sin dato') => {
  const mapa = new Map();
  for (const f of filas) {
    const k = f[campo] || etiquetaVacia;
    mapa.set(k, (mapa.get(k) || 0) + 1);
  }
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
};

agregar('Total de prospectos', total);
agregar('Con correo', filas.filter((f) => f.email).length);
agregar('Con teléfono', filas.filter((f) => f.telefono).length);
agregar('Con correo y teléfono', filas.filter((f) => f.email && f.telefono).length);
agregar('Ya contactados', filas.filter((f) => f.ultimo_contacto).length);
agregar('Con cotización', filas.filter((f) => f.cotizaciones > 0).length);

resumen.addRow({});
titulo('Por prioridad');
for (const [k, n] of contar('prioridad')) agregar(k, n);

resumen.addRow({});
titulo('Por etapa del embudo');
for (const [k, n] of contar('etapa')) agregar(k, n);

resumen.addRow({});
titulo('Por asesor');
for (const [k, n] of contar('asesor', 'Sin asignar')) agregar(k, n);

resumen.addRow({});
titulo('Por alcaldía');
for (const [k, n] of contar('alcaldia')) agregar(k, n);

resumen.addRow({});
titulo('Giros más frecuentes (30 primeros)');
for (const [k, n] of contar('giro').slice(0, 30)) agregar(k, n);

resumen.getColumn('pct').numFmt = '0.0%';
resumen.getColumn('total').numFmt = '#,##0';

await wb.xlsx.writeFile(salida);
console.log(`[excel] Archivo escrito: ${salida}`);
