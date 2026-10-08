/* Regresiones del cálculo de CURP y RFC (src/lib/rfcCurp.ts). Sin base de datos ni servidor: `npm run test:rfc-curp`. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  cache.set(filename, mod);
  const nativeRequire = createRequire(filename);
  const req = (name) => (name.startsWith('@/') ? load(name.slice(2) + '.ts') : nativeRequire(name));
  new vm.Script(`(function(require,module,exports){${code}\n})`, { filename }).runInThisContext()(req, mod, mod.exports);
  return mod.exports;
}

const m = load('src/lib/rfcCurp.ts');
const persona = (nombres, apellidoPaterno, apellidoMaterno, dia, mes, anio, sexo, lugarNacimiento) =>
  ({ nombres, apellidoPaterno, apellidoMaterno, dia, mes, anio, sexo, lugarNacimiento });

const pruebas = [];
const prueba = (nombre, fn) => pruebas.push({ nombre, fn });

// --- Vectores reales -------------------------------------------------------------------------------------------
prueba('CURP y RFC completos del ejemplo del contrato (ISRAEL MONROY SAN MARTIN)', () => {
  const d = persona('Israel', 'Monroy', 'San Martin', '25', 'noviembre', '1989', 'Masculino', 'México');
  assert.equal(m.calcularCURP(d), 'MOSI891125HMCNNS02');
  assert.equal(m.calcularRFC(d), 'MOSI891125H59'); // homoclave H5 + dígito 9
});
prueba('CURP del ejemplo de la documentación de RENAPO', () => {
  assert.equal(m.calcularCURP(persona('Gloria', 'Hernández', 'García', '27', 'abril', '1956', 'Femenino', 'Veracruz')), 'HEGG560427MVZRRL04');
});
prueba('RFC de los vectores de la librería calcula-rfc', () => {
  assert.equal(m.calcularRFC(persona('Juan', 'Pérez', 'García', '1', 'enero', '1980')), 'PEGJ800101LN4');
  assert.equal(m.calcularRFC(persona('María', 'López', 'Sánchez', '15', 'mayo', '1990')), 'LOSM9005158B4');
});

// --- Reglas de las letras --------------------------------------------------------------------------------------
prueba('Entidades de la CURP (Querétaro es QT, extranjero NE)', () => {
  assert.equal(m.codigoEntidadCurp('Querétaro'), 'QT');
  assert.equal(m.codigoEntidadCurp('Nacido en el extranjero'), 'NE');
  assert.equal(m.codigoEntidadCurp('Ciudad de México'), 'DF');
  assert.equal(m.codigoEntidadCurp('México'), 'MC');
});
prueba('MARIA/JOSE y partículas se omiten; apellido corto; un solo apellido', () => {
  assert.equal(m.calcularClaveRFC(persona('María José', 'De la Cruz', 'Pérez', '3', 'febrero', '1991')), 'CUPJ910203');
  assert.equal(m.calcularClaveRFC(persona('Luis', 'Ek', 'Pech', '3', 'febrero', '1991')), 'EPLU910203');
  assert.equal(m.calcularClaveRFC(persona('Luis', 'Pérez', '', '3', 'febrero', '1991')), 'PELU910203');
});
prueba('Palabras inconvenientes: RFC cambia la 4a letra, CURP la 2a', () => {
  assert.equal(m.calcularClaveRFC(persona('Anselmo', 'Putz', 'Torres', '3', 'febrero', '1991')), 'PUTX910203');
  assert.equal(m.calcularCURP(persona('Anselmo', 'Putz', 'Torres', '3', 'febrero', '1991', 'Masculino', 'Jalisco')).slice(0, 4), 'PXTA');
  assert.equal(m.calcularCURP(persona('Alberto', 'Cortes', 'Lara', '3', 'febrero', '1991', 'Masculino', 'Jalisco')).slice(0, 4), 'CXLA');
});
prueba('CURP: Ñ -> X, sin materno -> X, diferenciador A desde 2000', () => {
  assert.equal(m.calcularCURP(persona('Ñandú', 'Muñoz', 'Ñañez', '3', 'febrero', '2001', 'Masculino', 'Jalisco')).slice(0, 4), 'MUXX');
  assert.equal(m.calcularCURP(persona('Luis', 'Pérez', '', '3', 'febrero', '1991', 'Masculino', 'Jalisco')).slice(0, 4), 'PEXL');
  assert.equal(m.calcularCURP(persona('Luis', 'Pérez', 'Gil', '3', 'febrero', '2001', 'Masculino', 'Jalisco'))[16], 'A');
});

// --- Datos que faltan / fechas ----------------------------------------------------------------------------------
prueba('Sin sexo ni lugar de nacimiento no hay CURP, pero sí RFC', () => {
  const d = persona('Luis', 'Pérez', 'Gil', '3', 'febrero', '1991');
  assert.equal(m.calcularCURP(d), null);
  assert.ok(m.calcularRFC(d));
  assert.deepEqual(m.datosFaltantes(d, 'curp'), ['sexo', 'lugar de nacimiento']);
  assert.deepEqual(m.datosFaltantes(d, 'rfc'), []);
});
prueba('Fechas: no existe, es futura, formatos de fichas antiguas', () => {
  assert.equal(m.fechaNacimientoValida('31', 'febrero', '1990'), null);
  assert.equal(m.fechaNacimientoValida('1', 'enero', '2099'), null);
  assert.deepEqual(m.parsearFechaNacimiento('15/03/1998'), { dia: '15', mes: 'marzo', anio: '1998' });
  assert.deepEqual(m.parsearFechaNacimiento('15 de marzo de 1998'), { dia: '15', mes: 'marzo', anio: '1998' });
});

// --- Validadores y lectura de una CURP ----------------------------------------------------------------------------
prueba('Validadores de CURP y RFC', () => {
  assert.equal(m.validarCURP('HEGG560427MVZRRL04').ok, true);
  assert.equal(m.validarCURP('HEGG560427MVZRRL05').ok, false); // dígito verificador
  assert.equal(m.validarCURP('HEGG560427MVZRRL0').ok, false); // largo
  assert.equal(m.validarRFC('MOSI891125H59').ok, true);
  assert.equal(m.validarRFC('MOSI891125H58').ok, false);
  assert.equal(m.validarRFC('MOSI891125').ok, false); // falta homoclave
});
prueba('Una CURP válida entrega fecha, sexo y lugar de nacimiento', () => {
  assert.deepEqual(m.desglosarCURP('HEGG560427MVZRRL04'), { dia: '27', mes: 'abril', anio: '1956', sexo: 'Femenino', lugarNacimiento: 'Veracruz' });
  assert.equal(m.desglosarCURP('HEGG560427MVZRRL05'), null);
});

// --- Nombre por partes ---------------------------------------------------------------------------------------------
prueba('División del nombre completo y vigencia de las partes guardadas', () => {
  assert.deepEqual(m.dividirNombreCompleto('Juan Carlos Pérez de la Cruz'), { nombres: 'Juan Carlos', apellidoPaterno: 'Pérez', apellidoMaterno: 'de la Cruz' });
  const guardadas = { nombres: 'Juan Carlos', apellidoPaterno: 'Pérez', apellidoMaterno: 'López' };
  assert.deepEqual(m.partesDeNombre('Juan Carlos Pérez López', guardadas), guardadas);
  assert.deepEqual(m.partesDeNombre('Pedro Gómez Ruiz', guardadas), { nombres: 'Pedro', apellidoPaterno: 'Gómez', apellidoMaterno: 'Ruiz' });
  assert.equal(m.unirNombreCompleto({ nombres: ' Ana ', apellidoPaterno: 'Díaz', apellidoMaterno: '' }), 'Ana Díaz');
});

let fallas = 0;
for (const { nombre, fn } of pruebas) {
  try {
    fn();
    console.log(`ok     ${nombre}`);
  } catch (err) {
    fallas++;
    console.log(`FALLA  ${nombre}\n       ${String(err.message).split('\n').join('\n       ')}`);
  }
}
console.log(fallas ? `\n${fallas} prueba(s) fallaron` : `\n${pruebas.length} pruebas de CURP/RFC correctas`);
process.exit(fallas ? 1 : 0);
