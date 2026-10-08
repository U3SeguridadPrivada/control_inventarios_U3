const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const root = path.resolve(__dirname, '../..');
function crearEntorno(sqlite = new Database(':memory:'), inicializar = true) {
  const cache = new Map(); let db;
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const mod = { exports: {} }; cache.set(filename, mod); const nativeRequire = createRequire(filename);
    const req = name => name === '@/src/db' ? { db } : name.startsWith('@/') ? load(name.slice(2) + '.ts') : nativeRequire(name);
    new vm.Script(`(function(require,module,exports,__filename,__dirname){${code}\n})`, { filename }).runInThisContext()(req, mod, mod.exports, filename, path.dirname(filename));
    return mod.exports;
  }
  if (inicializar) {
    const init = fs.readFileSync(path.join(root, 'src/db/index.ts'), 'utf8').match(/const INIT_SQL = `([\s\S]*?)`;/)[1];
    sqlite.exec(init);
    sqlite.exec('ALTER TABLE salidas ADD COLUMN estado_actualizado_en TEXT; ALTER TABLE users ADD COLUMN role_personalizado_id INTEGER REFERENCES roles_personalizados(id)');
  }
  load('src/db/inventarioMigracion.ts').migrarInventario(sqlite);
  db = drizzle(sqlite, { schema: load('src/db/schema.ts') });
  return { sqlite, db, load };
}
module.exports = { crearEntorno, root };
