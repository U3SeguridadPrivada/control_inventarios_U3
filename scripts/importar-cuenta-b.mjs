// Importa el historial de la Cuenta B (mayo–julio 2026) desde los Excel de
// CONTROL_SEMANAL_CUENTA_B al módulo Finanzas.
//
// Por qué no se importan los archivos tal cual: la misma información vive
// repetida en varios sitios y una carga ingenua infla el saldo.
//   · La hoja `Consolidado` y `CONSILIACIÓN DE EGRESOS` del semanal son
//     derivadas de las 4 hojas de captura: se ignoran.
//   · Cada semanal abre con dos ingresos falsos ("SALDO EN TARJETA/EFECTIVO DEL
//     ULTIMO REPORTE") que solo arrastran el saldo de la semana anterior: 24
//     filas por $170,375.52 que NO son ingresos reales.
//   · Los consolidados mensuales son superconjunto de los semanales (0
//     movimientos existen solo en un semanal), así que son la fuente principal;
//     pero pierden el MOTIVO y el MEDIO DE PAGO, que se recuperan cruzando
//     contra el semanal correspondiente.
//   · Cada mensual trae su propio "SALDO INICIO DE MES"; solo el de mayo es un
//     saldo real, junio y julio son arrastres.
//   · Los días de frontera entre semanas (08-may, 15-may…) NO están duplicados
//     y hay filas idénticas legítimas dentro de un mismo archivo, así que
//     deduplicar por fecha o por contenido borraría datos buenos.
//
// Uso: node scripts/importar-cuenta-b.mjs [carpeta] [--reemplazar]
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import path from 'path';
import { leerLibro } from './lib/leer-xlsx.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
const reemplazar = args.includes('--reemplazar');
const DIR = args.find((a) => !a.startsWith('--')) || 'D:/Control de inventario/CONTROL_SEMANAL_CUENTA_B';

const LIBRO = 'B';
// El consolidado de julio termina el día 24; del 25 al 31 la única fuente es el
// semanal de corrección.
const CORTE_MENSUAL = '2026-07-24';

const CAT_HE = 'H.E. Y DOBLETES';
const CAT_ANTICIPOS = 'ANTICIPOS';
const CAT_GASTOS = 'GASTOS DIVERSOS';
const CAT_INGRESOS = 'INGRESOS';
// Categoría propia de la migración: los retiros de efectivo desde la tarjeta que
// el Excel nunca registró (ver reconstruirTraspasos más abajo). No es un ingreso
// ni un gasto real, solo mueve dinero de un medio de pago al otro.
const CAT_TRASPASO = 'TRASPASO';

const limpiar = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const norm = (v) => limpiar(v).toUpperCase();
const redondear = (n) => Math.round(n * 100) / 100;
const esFecha = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const esArrastre = (m) => m.categoria === CAT_INGRESOS && /ULTIMO REPORTE/i.test(m.descripcion || '');
const esSaldoInicio = (m) => m.categoria === CAT_INGRESOS && /SALDO INICIO/i.test(m.destino || m.descripcion || '');

// Clave comparable entre mensual y semanal. El mensual no conserva el MOTIVO de
// H.E. (en su lugar concatena el SERVICIO), por eso se cruza por los campos que
// sí comparten ambas fuentes.
function clave(m) {
  if (m.categoria === CAT_HE) return [m.fecha, 'HE', m.monto, norm(m.nombre), norm(m.tipo_detalle), norm(m.turno)].join('|');
  if (m.categoria === CAT_INGRESOS) return [m.fecha, 'ING', m.monto, norm(m.descripcion)].join('|');
  return [m.fecha, m.categoria, m.monto, norm(m.nombre), norm(m.descripcion)].join('|');
}

// ─────────────── Lectura de los semanales (4 hojas de captura) ───────────────
const HOJAS = {
  [CAT_HE]:        { monto: 'I', campos: { medio_pago: 'A', tipo_detalle: 'C', nombre: 'D', turno: 'E', alimentos: 'F', servicio: 'G', descripcion: 'H' } },
  [CAT_ANTICIPOS]: { monto: 'E', campos: { medio_pago: 'A', nombre: 'C', descripcion: 'D' } },
  [CAT_GASTOS]:    { monto: 'E', campos: { medio_pago: 'A', nombre: 'C', descripcion: 'D' } },
  [CAT_INGRESOS]:  { monto: 'D', campos: { medio_pago: 'A', descripcion: 'C' } },
};

function leerSemanal(archivo) {
  const movs = [];
  for (const hoja of leerLibro(path.join(DIR, archivo))) {
    const cfg = HOJAS[hoja.nombre];
    if (!cfg) continue; // Consolidado, CONSILIACIÓN y ANÁLISIS son derivados
    for (const fila of hoja.filas) {
      if (fila.n <= 4) continue; // encabezados del formato
      const fecha = fila.celdas.B;
      const monto = fila.celdas[cfg.monto];
      if (!esFecha(fecha) || typeof monto !== 'number' || monto === 0) continue;
      const m = { archivo, categoria: hoja.nombre, fecha, monto: redondear(monto) };
      for (const [campo, col] of Object.entries(cfg.campos)) m[campo] = limpiar(fila.celdas[col]) || null;
      // En el Excel la columna es el texto completo "ALIMENTOS: SI"
      if (m.alimentos) m.alimentos = m.alimentos.replace(/^ALIMENTOS:\s*/i, '');
      movs.push(m);
    }
  }
  return movs;
}

// ─────────────── Lectura de los consolidados mensuales ───────────────
function leerMensual(archivo) {
  const movs = [];
  for (const hoja of leerLibro(path.join(DIR, archivo))) {
    for (const fila of hoja.filas) {
      const fecha = fila.celdas.A;
      if (!esFecha(fecha)) continue;
      const origen = norm(fila.celdas.E);
      const categoria = !origen || origen === CAT_INGRESOS ? CAT_INGRESOS : origen;
      const monto = categoria === CAT_INGRESOS ? fila.celdas.C : fila.celdas.D;
      if (typeof monto !== 'number' || monto === 0) continue;
      const destino = limpiar(fila.celdas.B);
      const partes = destino.split(',').map((s) => s.trim());
      const m = { archivo, categoria, fecha, monto: redondear(monto), destino };
      if (categoria === CAT_HE) {
        // DESTINO = TIPO , NOMBRE , TURNO , ALIMENTOS: X , SERVICIO
        m.tipo_detalle = partes[0] || null;
        m.nombre = partes[1] || null;
        m.turno = partes[2] || null;
        m.alimentos = (partes[3] || '').replace(/^ALIMENTOS:\s*/i, '') || null;
        m.servicio = partes[4] || null;
        m.descripcion = null; // el motivo solo existe en el semanal
      } else if (categoria === CAT_INGRESOS) {
        m.medio_pago = partes.length > 1 ? partes[0] : null;
        m.descripcion = (partes.length > 1 ? partes.slice(1).join(' , ') : destino) || null;
      } else {
        m.nombre = partes[0] || null;
        m.descripcion = partes.slice(1).join(' , ') || null;
      }
      movs.push(m);
    }
  }
  return movs;
}

// ─────────────── Construcción del conjunto a importar ───────────────
if (!existsSync(DIR)) {
  console.error(`[cuenta-b] No encuentro la carpeta de los Excel: ${DIR}`);
  process.exit(1);
}
const archivos = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.xlsx'));
const nombresSemanales = archivos.filter((f) => f.startsWith('CONTROL_SEMANAL'));
const nombresMensuales = archivos.filter((f) => f.startsWith('CONSOLIDADO'));
if (!nombresMensuales.length) {
  console.error('[cuenta-b] No hay consolidados mensuales en la carpeta; son la fuente principal.');
  process.exit(1);
}

const semanales = nombresSemanales.flatMap(leerSemanal);
const mensuales = nombresMensuales.flatMap(leerMensual);

// Índice del semanal para recuperar motivo y medio de pago. Se consume por
// coincidencia para respetar las filas repetidas legítimas.
const indiceSemanal = new Map();
for (const m of semanales) {
  if (esArrastre(m)) continue;
  const k = clave(m);
  if (!indiceSemanal.has(k)) indiceSemanal.set(k, []);
  indiceSemanal.get(k).push(m);
}

const importados = [];
let enriquecidos = 0;

/**
 * El histórico arranca con la apertura que declara el primer semanal, ya
 * repartida entre tarjeta y efectivo.
 *
 * La alternativa era usar el "SALDO INICIO DE MAYO" del consolidado mensual más
 * los movimientos de ese primer día, pero el mensual no registra el medio de
 * pago de los egresos: eso dejaba 43 movimientos sin repartir y desviaba los
 * saldos por medio en exactamente esos $3,000.69 y $5,645.00. Además, esos
 * movimientos del primer día pertenecen al reporte de la semana anterior, que
 * no forma parte de este corpus.
 */
const arrastresIniciales = semanales
  .filter(esArrastre)
  .sort((a, b) => a.fecha.localeCompare(b.fecha));
if (!arrastresIniciales.length) {
  console.error('[cuenta-b] Ningún semanal declara saldo de apertura; no puedo fijar el arranque.');
  process.exit(1);
}
const INICIO = arrastresIniciales[0].fecha;
for (const a of arrastresIniciales.filter((a) => a.fecha === INICIO)) {
  importados.push({
    categoria: CAT_INGRESOS, fecha: INICIO, monto: a.monto, medio_pago: a.medio_pago,
    descripcion: `SALDO INICIAL EN ${a.medio_pago} AL ${INICIO}`, nombre: null,
    tipo_detalle: null, turno: null, alimentos: null, servicio: null,
  });
}

for (const m of mensuales.sort((a, b) => a.fecha.localeCompare(b.fecha))) {
  // Lo anterior al arranque ya está representado por la apertura declarada.
  if (m.fecha <= INICIO) continue;
  if (esSaldoInicio(m)) continue; // junio y julio solo arrastran el mes previo
  const coincidencias = indiceSemanal.get(clave(m));
  const detalle = coincidencias && coincidencias.length ? coincidencias.shift() : null;
  if (detalle) enriquecidos++;
  importados.push({
    categoria: m.categoria,
    fecha: m.fecha,
    monto: m.monto,
    medio_pago: detalle?.medio_pago ?? m.medio_pago ?? null,
    nombre: detalle?.nombre ?? m.nombre ?? null,
    tipo_detalle: detalle?.tipo_detalle ?? m.tipo_detalle ?? null,
    turno: detalle?.turno ?? m.turno ?? null,
    alimentos: detalle?.alimentos ?? m.alimentos ?? null,
    servicio: detalle?.servicio ?? m.servicio ?? null,
    descripcion: detalle?.descripcion ?? m.descripcion ?? null,
  });
}

// Cola del periodo: lo posterior al corte solo existe en el semanal
const cola = semanales
  .filter((m) => m.fecha > CORTE_MENSUAL && !esArrastre(m))
  .sort((a, b) => a.fecha.localeCompare(b.fecha))
  .map(({ archivo, ...m }) => m);
importados.push(...cola);

/**
 * Reconstruye los retiros de efectivo entre tarjeta y efectivo.
 *
 * El Excel nunca los capturó como movimiento: cada semana volvía a declarar
 * "SALDO EN TARJETA" y "SALDO EN EFECTIVO" desde cero, y esa re-declaración
 * absorbía el traspaso en silencio. Con saldo continuo eso ya no ocurre, así que
 * el efectivo se hunde y la tarjeta se infla exactamente en la misma cantidad.
 *
 * El importe sale de comparar, en cada frontera semanal, el saldo por medio que
 * cierra una semana contra el que declara abrir la siguiente. Solo se acepta el
 * traspaso cuando ambas diferencias son opuestas (se compensan): esa es la firma
 * de un movimiento interno y no de un error de captura.
 */
function reconstruirTraspasos() {
  const porArchivo = new Map();
  for (const m of semanales) {
    if (!porArchivo.has(m.archivo)) porArchivo.set(m.archivo, []);
    porArchivo.get(m.archivo).push(m);
  }
  // Ordenar por la fecha con la que abre cada semanal, no por nombre de archivo
  const semanas = [...porArchivo.entries()]
    .map(([archivo, movs]) => {
      const arrastres = movs.filter(esArrastre);
      const declarado = {};
      for (const a of arrastres) declarado[a.medio_pago] = a.monto;
      const cierre = {};
      for (const medio of ['TARJETA', 'EFECTIVO']) {
        const propios = movs.filter((m) => m.medio_pago === medio && !esArrastre(m));
        const ing = propios.filter((m) => m.categoria === CAT_INGRESOS).reduce((s, m) => s + m.monto, 0);
        const egr = propios.filter((m) => m.categoria !== CAT_INGRESOS).reduce((s, m) => s + m.monto, 0);
        cierre[medio] = (declarado[medio] ?? 0) + ing - egr;
      }
      return {
        archivo,
        abre: arrastres.length ? arrastres[0].fecha : movs.map((m) => m.fecha).sort()[0],
        cierra: movs.map((m) => m.fecha).sort().at(-1),
        declarado,
        cierre,
      };
    })
    .sort((a, b) => a.abre.localeCompare(b.abre));

  const traspasos = [];
  const saltadas = [];
  for (let i = 0; i < semanas.length - 1; i++) {
    const previa = semanas[i];
    const actual = semanas[i + 1];
    // Si falta el semanal intermedio la cadena se rompe y los números no son
    // comparables: no se inventa nada ahí.
    if (actual.abre !== previa.cierra) { saltadas.push({ desde: previa.archivo, hasta: actual.archivo, motivo: 'falta el semanal intermedio' }); continue; }
    const difT = redondear((actual.declarado.TARJETA ?? 0) - previa.cierre.TARJETA);
    const difE = redondear((actual.declarado.EFECTIVO ?? 0) - previa.cierre.EFECTIVO);
    if (Math.abs(difT + difE) >= 0.01) { saltadas.push({ desde: previa.archivo, hasta: actual.archivo, motivo: `las diferencias no se compensan (${difT} / ${difE})` }); continue; }
    if (Math.abs(difE) < 0.01) continue; // esa semana no hubo traspaso
    const haciaEfectivo = difE > 0;
    const monto = Math.abs(difE);
    const nota = haciaEfectivo ? 'RETIRO DE EFECTIVO DESDE LA TARJETA' : 'DEPÓSITO DE EFECTIVO A LA TARJETA';
    const base = { categoria: CAT_TRASPASO, fecha: actual.abre, monto, descripcion: `${nota} (reconstruido en la migración)` };
    traspasos.push(
      { ...base, salida: true, medio_pago: haciaEfectivo ? 'TARJETA' : 'EFECTIVO' },
      { ...base, salida: false, medio_pago: haciaEfectivo ? 'EFECTIVO' : 'TARJETA' },
    );
  }
  return { traspasos, saltadas };
}

const { traspasos, saltadas } = reconstruirTraspasos();
importados.push(...traspasos);

// ─────────────── Listas de DEPÓSITOS NÓMINA ───────────────
/**
 * Junto a los Excel viajan unas listas "DEPÓSITOS NÓMINA" (cuatro PDF, una
 * imagen de WhatsApp y un xlsx) con el desglose de cada quincena. Por regla
 * general NO son movimientos: describen el mismo dinero que ya está capturado en
 * GASTOS DIVERSOS y cargarlas duplicaría el egreso. Sirven como control cruzado
 * —cada renglón debe tener un gasto que le corresponda ese día— y como respaldo
 * de los pagos que el Excel sí perdió.
 *
 * La transcripción es a mano porque los PDF y la imagen no se pueden leer desde
 * aquí (el proyecto no tiene lector de PDF ni OCR), y vive junto al JSON de
 * descuadres en src/data/: este volumen es exFAT y los directorios nuevos que
 * crea el script no sobreviven, así que se usan solo carpetas que ya existen.
 *
 * Sin este archivo el cruce daría cero huecos, que es indistinguible de "todo
 * cuadra": en un control de dinero esa confusión no puede pasar en silencio.
 */
const rutaDepositos = path.join(projectRoot, 'src', 'data', 'depositos-nomina-cuenta-b.json');
if (!existsSync(rutaDepositos)) {
  console.error(`[cuenta-b] Falta ${path.relative(projectRoot, rutaDepositos)}: sin él no se puede cruzar la nómina contra los depósitos.`);
  process.exit(1);
}
const listasDepositos = JSON.parse(readFileSync(rutaDepositos, 'utf8')).listas;

/**
 * Cruza una lista de depósitos contra los gastos ya cargados de ese día y
 * devuelve los renglones que no tienen movimiento que los respalde.
 *
 * El cruce es por importe y no por nombre: las listas usan el nombre completo
 * ("JOSÉ AUGUSTO PRIETO GUEVARA") y el Excel una forma corta y con otra
 * ortografía ("JOSÉ AUGUSTO PRIETO"), así que casar por texto daría falsos
 * huecos. Se tolera hasta un peso porque el Excel a veces redondea los centavos
 * del depósito; esa diferencia se reporta aparte en vez de darse por buena.
 */
const TOLERANCIA_CENTAVOS = 1;
function cruzarDeposito(lista) {
  const candidatos = importados.filter((m) => m.fecha === lista.fecha && m.categoria === CAT_GASTOS);
  const usados = new Set();
  const sinRegistrar = [];
  const diferencias = [];
  for (const renglon of lista.renglones) {
    const i = candidatos.findIndex((m, idx) => !usados.has(idx) && Math.abs(m.monto - renglon.monto) <= TOLERANCIA_CENTAVOS);
    if (i === -1) {
      sinRegistrar.push(renglon);
      continue;
    }
    usados.add(i);
    const registrado = candidatos[i].monto;
    if (Math.abs(registrado - renglon.monto) >= 0.01) {
      diferencias.push({
        fecha: lista.fecha, fuente: lista.fuente, nombre: renglon.nombre, concepto: renglon.concepto,
        monto_lista: renglon.monto, monto_registrado: registrado, diferencia: redondear(registrado - renglon.monto),
      });
    }
  }
  return { sinRegistrar, diferencias };
}

// ─────────────── Movimientos recuperados fuera del Excel ───────────────
/**
 * Se perdió el reporte semanal del 12 al 19 de junio y con él la captura de esa
 * quincena: faltaban tanto el cobro del cliente como los pagos de nómina de esos
 * días. El usuario confirmó ambos huecos, así que se reponen aquí.
 *
 * Los ingresos se declaran uno por uno; la nómina no se vuelve a transcribir,
 * se promueven los renglones de la lista de depósitos que el cruce marque como
 * no registrados. Así la lista sigue siendo la única fuente de esos importes y
 * no hay dos copias que se puedan desincronizar.
 */
const rutaRecuperados = path.join(projectRoot, 'src', 'data', 'recuperados-cuenta-b.json');
const recuperados = [];
const correcciones = [];
const normalizados = [];
if (existsSync(rutaRecuperados)) {
  const doc = JSON.parse(readFileSync(rutaRecuperados, 'utf8'));
  // Los nombres que el libro ya usa, para avisar si un renglón promovido trae
  // uno nuevo que en realidad es una persona ya registrada con otra escritura.
  const nombresDelLibro = new Set(importados.map((m) => m.nombre).filter(Boolean));
  const canonicos = doc.nombres_canonicos ?? {};

  for (const m of doc.movimientos ?? []) {
    recuperados.push({
      categoria: m.categoria, fecha: m.fecha, monto: redondear(m.monto),
      medio_pago: m.medio_pago ?? null, descripcion: m.descripcion ?? null,
      nombre: m.nombre ?? null, tipo_detalle: null, turno: null, alimentos: null, servicio: null,
    });
  }

  for (const { fecha, medio_pago } of doc.promover_nomina ?? []) {
    const lista = listasDepositos.find((l) => l.fecha === fecha);
    if (!lista) {
      console.error(`[cuenta-b] recuperados-cuenta-b.json promueve la nómina del ${fecha}, pero no hay lista de depósitos de esa fecha.`);
      process.exit(1);
    }
    for (const r of cruzarDeposito(lista).sinRegistrar) {
      // El depósito trae el nombre legal completo y el libro una forma corta:
      // sin traducir, la misma persona quedaría partida en dos.
      const nombre = canonicos[r.nombre] ?? r.nombre;
      if (!canonicos[r.nombre] && !nombresDelLibro.has(r.nombre)) {
        console.log(`[cuenta-b] "${r.nombre}" (${fecha}) no está en nombres_canonicos ni en el libro: revisar si es alguien ya registrado con otra escritura.`);
      }
      recuperados.push({
        categoria: CAT_GASTOS, fecha, monto: redondear(r.monto),
        medio_pago: medio_pago ?? null, descripcion: r.concepto, nombre,
        tipo_detalle: null, turno: null, alimentos: null, servicio: null,
      });
    }
  }
  importados.push(...recuperados);

  // Erratas de captura del Excel: la misma persona escrita de dos formas queda
  // partida en dos en cualquier reporte por persona.
  for (const [mal, bueno] of Object.entries(doc.normalizar_nombres ?? {})) {
    const afectados = importados.filter((m) => m.nombre === mal);
    if (!afectados.length) {
      console.log(`[cuenta-b] normalizar_nombres tiene "${mal}", que ya no aparece en el libro: se puede quitar del JSON.`);
      continue;
    }
    for (const m of afectados) m.nombre = bueno;
    normalizados.push({ de: mal, a: bueno, movimientos: afectados.length });
  }

  // Importes que el Excel capturó distinto del comprobante: manda el depósito.
  for (const c of doc.correcciones ?? []) {
    const candidatos = importados.filter((m) => m.fecha === c.fecha && m.categoria === c.categoria
      && m.nombre === c.nombre && Math.abs(m.monto - c.monto_excel) < 0.01);
    if (candidatos.length !== 1) {
      console.error(`[cuenta-b] La corrección de ${c.nombre} el ${c.fecha} encaja con ${candidatos.length} movimientos; debe encajar con exactamente uno.`);
      process.exit(1);
    }
    candidatos[0].monto = redondear(c.monto_correcto);
    correcciones.push(c);
  }
}

importados.sort((a, b) => a.fecha.localeCompare(b.fecha));

// ─────────────── Verificación de saldos declarados vs calculados ───────────────
// Cada semanal declara con cuánto abre. Ese arrastre debe coincidir con el saldo
// calculado a esa fecha; si no, hay un error de captura que el responsable de la
// cuenta tiene que localizar.
// Los traspasos llevan su propio sentido; el resto lo marca la categoría.
const esEntrada = (m) => (m.categoria === CAT_TRASPASO ? !m.salida : m.categoria === CAT_INGRESOS);
const saldoHasta = (fecha) => redondear(importados
  .filter((m) => m.fecha <= fecha)
  .reduce((s, m) => s + (esEntrada(m) ? m.monto : -m.monto), 0));

const descuadres = [];
const explicados = [];
for (const archivo of nombresSemanales) {
  const delArchivo = semanales.filter((m) => m.archivo === archivo);
  const arrastres = delArchivo.filter(esArrastre);
  if (!arrastres.length) continue;
  const fechaCorte = arrastres[0].fecha;
  const declarado = redondear(arrastres.reduce((s, m) => s + m.monto, 0));
  /**
   * El día del corte lo comparten dos reportes: el que cierra ya capturó parte de
   * ese día y el que abre captura el resto. El saldo se declara en medio, así que
   * `saldoHasta(fechaCorte)` —que incluye el día completo— trae de más justo los
   * movimientos que este reporte capturó ese día, y que al declarar el saldo
   * todavía no habían pasado. Se descuentan para que la comparación tenga sentido.
   *
   * Antes estos cortes se saltaban por ambiguos; saltarlos dejaba sin revisar 4 de
   * los 13 y el aviso salía vacío aunque hubiera un error real.
   */
  const propiosEseDia = delArchivo.filter((m) => m.fecha === fechaCorte && !esArrastre(m));
  const aunNoPasaba = redondear(propiosEseDia.reduce((s, m) => s + (m.categoria === CAT_INGRESOS ? m.monto : -m.monto), 0));
  const calculado = redondear(saldoHasta(fechaCorte) - aunNoPasaba);
  /**
   * Los movimientos repuestos y las correcciones no estaban en el Excel cuando
   * se declaró ese saldo, así que el reporte tenía que quedar corto justo en su
   * neto. Cuando la diferencia es exactamente esa, el corte no es un error por
   * aclarar sino la huella de lo que ya arreglamos: se marca explicado para no
   * mandar al responsable a buscar algo que no existe.
   */
  const netoAjustes = redondear(
    recuperados.filter((m) => m.fecha <= fechaCorte).reduce((s, m) => s + (m.categoria === CAT_INGRESOS ? m.monto : -m.monto), 0)
    + correcciones.filter((c) => c.fecha <= fechaCorte).reduce((s, c) => s + (c.monto_excel - c.monto_correcto), 0),
  );
  const diferencia = redondear(declarado - calculado);
  if (Math.abs(diferencia) < 0.01) continue;
  const registro = {
    fecha: fechaCorte,
    declarado,
    calculado,
    diferencia,
    detalle_declarado: arrastres.map((a) => ({ medio_pago: a.medio_pago, monto: a.monto })),
    fuente: archivo,
  };
  if (Math.abs(diferencia + netoAjustes) < 0.01) explicados.push({ ...registro, neto_ajustes: netoAjustes });
  else descuadres.push(registro);
}
explicados.sort((a, b) => a.fecha.localeCompare(b.fecha));

// Si la diferencia es la misma en todos los cortes, no son varios errores sino
// uno solo al principio que se arrastra: decirlo evita mandar al responsable a
// revisar semanas que en realidad cuadran.
descuadres.sort((a, b) => a.fecha.localeCompare(b.fecha));
const constante = descuadres.length > 1 && descuadres.every((d) => d.diferencia === descuadres[0].diferencia);
const diagnostico = descuadres.length ? {
  constante,
  diferencia: descuadres[0].diferencia,
  desde: descuadres[0].fecha,
  puntos: descuadres.length,
} : null;

// ─────────────── Cruce final contra las listas de DEPÓSITOS NÓMINA ───────────────
// Se rehace ya con los recuperados dentro, así que lo que quede aquí es lo que
// sigue sin respaldo: si un hueco se repuso, deja de reportarse solo.
const faltantes = [];
const diferencias = [];
for (const lista of listasDepositos) {
  const { sinRegistrar, diferencias: difs } = cruzarDeposito(lista);
  diferencias.push(...difs);
  if (sinRegistrar.length) {
    faltantes.push({
      fecha: lista.fecha,
      fuente: lista.fuente,
      total: redondear(sinRegistrar.reduce((s, r) => s + r.monto, 0)),
      completa: sinRegistrar.length === lista.renglones.length,
      renglones: sinRegistrar,
    });
  }
  // Control de la transcripción a mano: si la suma no cuadra con el total que
  // declara el documento, algún renglón se copió mal.
  const suma = redondear(lista.renglones.reduce((s, r) => s + r.monto, 0));
  if (Math.abs(suma - lista.total_declarado) > TOLERANCIA_CENTAVOS) {
    console.log(`[cuenta-b] Revisar la transcripción de ${lista.fuente}: suma ${suma} contra el total declarado ${lista.total_declarado}.`);
  }
}

const totalFaltante = redondear(faltantes.reduce((s, f) => s + f.total, 0));

const rutaDescuadres = path.join(projectRoot, 'src', 'data', 'descuadres-cuenta-b.json');
mkdirSync(path.dirname(rutaDescuadres), { recursive: true });
writeFileSync(rutaDescuadres, JSON.stringify({
  libro: LIBRO,
  generado: new Date().toISOString().slice(0, 10),
  diagnostico,
  descuadres,
  // Cortes que no cuadran contra el Excel pero cuya causa ya conocemos: son la
  // huella de lo que se repuso. Se guardan para dejar rastro, no para alarmar.
  explicados,
  correcciones,
  nomina: { total: totalFaltante, faltantes, diferencias },
}, null, 2) + '\n', 'utf8');

// ─────────────── Escritura en la base ───────────────
const dbPath = process.env.SQLITE_DB_PATH || path.join(projectRoot, 'db', 'app.db');
if (!existsSync(path.dirname(dbPath))) mkdirSync(path.dirname(dbPath), { recursive: true });
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

const desde = importados[0].fecha;
const hasta = importados[importados.length - 1].fecha;
// El script solo administra las categorías del formato de la Cuenta B: si el
// usuario capturó movimientos de otra categoría en estas fechas, no se tocan.
const CATS = [CAT_HE, CAT_ANTICIPOS, CAT_GASTOS, CAT_INGRESOS, CAT_TRASPASO];
const marcasCat = CATS.map(() => '?').join(',');
const filtroPropio = `libro = ? AND fecha BETWEEN ? AND ? AND categoria IN (${marcasCat})`;
const paramsPropio = [LIBRO, desde, hasta, ...CATS];
const yaHay = sqlite.prepare(
  `SELECT COUNT(*) AS n FROM movimientos_financieros WHERE ${filtroPropio}`
).get(...paramsPropio).n;

if (yaHay && !reemplazar) {
  console.error(`\n[cuenta-b] La cuenta ${LIBRO} ya tiene ${yaHay} movimientos entre ${desde} y ${hasta}.`);
  console.error('[cuenta-b] No se importó nada. Vuelve a correrlo con --reemplazar para sustituirlos.\n');
  sqlite.close();
  process.exit(1);
}

const insertar = sqlite.prepare(`
  INSERT INTO movimientos_financieros
    (fecha, tipo, categoria, monto, descripcion, libro, medio_pago, nombre, tipo_detalle, turno, alimentos, servicio)
  VALUES
    (@fecha, @tipo, @categoria, @monto, @descripcion, @libro, @medio_pago, @nombre, @tipo_detalle, @turno, @alimentos, @servicio)
`);

const cargar = sqlite.transaction((filas) => {
  if (yaHay) {
    // Las evidencias apuntan a los movimientos: se sueltan primero.
    sqlite.prepare(`
      DELETE FROM movimiento_evidencias WHERE movimiento_id IN
        (SELECT id FROM movimientos_financieros WHERE ${filtroPropio})
    `).run(...paramsPropio);
    const borrados = sqlite.prepare(
      `DELETE FROM movimientos_financieros WHERE ${filtroPropio}`
    ).run(...paramsPropio);
    console.log(`[cuenta-b] ${borrados.changes} movimientos anteriores retirados.`);
  }
  for (const m of filas) {
    // Las hojas de anticipos, gastos e ingresos no traen los campos de H.E.,
    // así que se completan explícitamente para no dejar parámetros sin enlazar.
    insertar.run({
      fecha: m.fecha,
      tipo: esEntrada(m) ? 'Ingreso' : 'Gasto',
      categoria: m.categoria,
      monto: m.monto,
      descripcion: m.descripcion ?? null,
      libro: LIBRO,
      medio_pago: m.medio_pago ?? null,
      nombre: m.nombre ?? null,
      tipo_detalle: m.tipo_detalle ?? null,
      turno: m.turno ?? null,
      alimentos: m.alimentos ?? null,
      servicio: m.servicio ?? null,
    });
  }
});
cargar(importados);

// ─────────────── Resumen ───────────────
const porCategoria = {};
for (const m of importados) porCategoria[m.categoria] = (porCategoria[m.categoria] || 0) + 1;
// Los traspasos no son ingreso ni gasto: solo cambian el dinero de medio de pago.
const reales = importados.filter((m) => m.categoria !== CAT_TRASPASO);
const ingresos = redondear(reales.filter((m) => m.categoria === CAT_INGRESOS).reduce((s, m) => s + m.monto, 0));
const egresos = redondear(reales.filter((m) => m.categoria !== CAT_INGRESOS).reduce((s, m) => s + m.monto, 0));
const saldoPorMedio = (medio) => redondear(importados
  .filter((m) => m.medio_pago === medio)
  .reduce((s, m) => s + (esEntrada(m) ? m.monto : -m.monto), 0));
const money = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

console.log(`\n[cuenta-b] ${importados.length} movimientos importados (${desde} a ${hasta}).`);
for (const [cat, n] of Object.entries(porCategoria)) console.log(`   ${cat}: ${n}`);
console.log(`[cuenta-b] ${enriquecidos} enriquecidos con motivo y medio de pago del semanal.`);
console.log(`[cuenta-b] Descartadas ${semanales.filter(esArrastre).length} filas de arrastre semanal.`);
console.log(`[cuenta-b] Ingresos ${money(ingresos)} · Egresos ${money(egresos)} · Saldo final ${money(redondear(ingresos - egresos))}`);
console.log(`[cuenta-b] Saldo en tarjeta ${money(saldoPorMedio('TARJETA'))} · en efectivo ${money(saldoPorMedio('EFECTIVO'))}`);
const sinMedio = importados.filter((m) => !m.medio_pago).length;
if (sinMedio) console.log(`[cuenta-b] ${sinMedio} movimientos sin medio de pago (el consolidado mensual no lo registra en los egresos).`);

if (traspasos.length) {
  console.log(`\n[cuenta-b] ${traspasos.length / 2} traspasos reconstruidos entre tarjeta y efectivo (el Excel nunca los capturó):`);
  for (const t of traspasos.filter((t) => t.salida)) {
    console.log(`   ${t.fecha}: ${money(t.monto)} sale de ${t.medio_pago}`);
  }
  console.log('   Cada uno es una salida y una entrada por el mismo importe, así que la existencia total no cambia.');
}
for (const s of saltadas) {
  console.log(`[cuenta-b] Sin traspaso entre ${s.desde.slice(24, 45)} y ${s.hasta.slice(24, 45)}: ${s.motivo}`);
}

if (descuadres.length) {
  console.log(`\n[cuenta-b] ATENCIÓN: el saldo declarado en los reportes no coincide con la suma de los movimientos en ${descuadres.length} corte(s):`);
  for (const d of descuadres) {
    console.log(`   ${d.fecha}: el reporte declara ${money(d.declarado)} y los movimientos suman ${money(d.calculado)} (diferencia ${money(d.diferencia)})`);
  }
  if (constante) {
    console.log(`\n   La diferencia es siempre la misma (${money(diagnostico.diferencia)}) desde el primer corte (${diagnostico.desde}),`);
    console.log('   así que es UN solo error en esa fecha que se arrastra hasta el final, no uno por semana.');
    console.log(`   Hay que revisar qué pasó el ${diagnostico.desde}: de ahí en adelante todos los saldos del reporte vienen corridos.`);
  }
  console.log('   El aviso aparece en el módulo Finanzas para que el responsable de la cuenta lo localice.');
}

if (recuperados.length) {
  const ing = recuperados.filter((m) => m.categoria === CAT_INGRESOS);
  const egr = recuperados.filter((m) => m.categoria !== CAT_INGRESOS);
  const suma = (ms) => redondear(ms.reduce((s, m) => s + m.monto, 0));
  console.log(`\n[cuenta-b] ${recuperados.length} movimientos repuestos fuera del Excel (src/data/recuperados-cuenta-b.json):`);
  console.log(`   ${ing.length} ingreso(s) por ${money(suma(ing))} y ${egr.length} egreso(s) por ${money(suma(egr))}.`);
  for (const m of ing) console.log(`      ${m.fecha}  ${money(m.monto).padStart(12)}  ${m.descripcion}`);
  console.log(`   Efecto neto en el saldo: ${money(redondear(suma(ing) - suma(egr)))}.`);
}

for (const c of correcciones) {
  console.log(`[cuenta-b] Corregido ${c.fecha} ${c.nombre}: ${money(c.monto_excel)} → ${money(c.monto_correcto)}. ${c.motivo}`);
}
for (const n of normalizados) {
  console.log(`[cuenta-b] Unificado "${n.de}" → "${n.a}" (${n.movimientos} movimiento(s)).`);
}

if (explicados.length) {
  console.log(`\n[cuenta-b] ${explicados.length} corte(s) no cuadran contra el Excel, pero la causa ya se conoce:`);
  console.log(`   son la huella de lo repuesto (${money(explicados[0].neto_ajustes)} de neto), así que el reporte tenía que quedar corto justo en eso.`);
  console.log(`   Del ${explicados[0].fecha} al ${explicados.at(-1).fecha}. No se marcan como pendientes en la app.`);
}

if (faltantes.length) {
  console.log(`\n[cuenta-b] ATENCIÓN: las listas de DEPÓSITOS NÓMINA documentan ${money(totalFaltante)} en pagos que ningún Excel registró:`);
  for (const f of faltantes) {
    const alcance = f.completa ? 'la quincena completa' : `${f.renglones.length} renglón(es)`;
    console.log(`   ${f.fecha}: ${alcance}, ${money(f.total)} (${f.fuente})`);
    for (const r of f.renglones) console.log(`      ${money(r.monto).padStart(12)}  ${r.nombre} — ${r.concepto}`);
  }
  console.log('   No se cargan como movimientos: primero hay que confirmar de qué cuenta salió el dinero.');
}
for (const d of diferencias) {
  console.log(`[cuenta-b] ${d.fecha}: ${d.nombre} aparece con ${money(d.monto_registrado)} en el Excel y ${money(d.monto_lista)} en ${d.fuente}.`);
}
console.log(`\n[cuenta-b] base de datos: ${dbPath}`);
console.log(`[cuenta-b] descuadres escritos en: ${path.relative(projectRoot, rutaDescuadres)}`);
sqlite.close();
