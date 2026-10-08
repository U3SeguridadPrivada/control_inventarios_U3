/* Regresiones de inventario. SQLite aislado en memoria, JWT real, sin tocar db/app.db. */
const { crearEntorno, root } = require('./lib/inventario-harness.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { NextRequest } = require('next/server');
const ExcelJS = require('exceljs');
const ts = require('typescript');
const vm = require('node:vm');
process.env.JWT_SECRET = 'inventario-prueba-local-sin-uso-en-produccion';
const { sqlite, load } = crearEntorno();
const inv = load('src/lib/inventario.ts');
const report = load('src/lib/inventarioTemplate.ts');
const { signToken } = load('src/lib/auth.ts');
const fecha = load('src/lib/fecha.ts').fechaMexico();
const results = [];
let user;
function reset() {
  sqlite.exec("UPDATE inventario_contexto SET usuario=NULL,fecha=NULL,operacion_id=NULL,motivo=NULL");
  for (const t of ['bajas','salidas','entradas','inventario_ajustes','catalogo_prendas','guardias','inventario_solicitudes','users','roles_personalizados','inventario_eventos']) sqlite.prepare('DELETE FROM '+t).run();
  sqlite.exec("UPDATE inventario_meta SET valor='2025-01-01' WHERE clave='historial_desde'");
  sqlite.prepare('INSERT INTO catalogo_prendas (id,nombre,requiere_talla,tallas) VALUES (1,?,?,?)').run('Camisolas',1,JSON.stringify(['M','G']));
  sqlite.prepare('INSERT INTO guardias (id,nombre,numero_elemento,estado,fecha_alta) VALUES (1,?,?,?,?)').run('Guardia Prueba','TEST-1','Activo','2025-01-01');
  sqlite.prepare('INSERT INTO users (id,username,email,password_hash,role) VALUES (1,?,?,?,?)').run('auditoria','test@example.invalid','no-login','admin');
  sqlite.exec("UPDATE inventario_eventos SET fecha='2025-01-01'");
  user={id:1,username:'auditoria',role:'admin'};
}
async function call(route,payload={},method='POST',id='1',options={}) {
  const headers={'Content-Type':'application/json','Idempotency-Key':options.key||randomUUID()};
  if(user) headers.Authorization='Bearer '+signToken(user);
  if(options.noKey) delete headers['Idempotency-Key'];
  const req=new NextRequest('http://localhost/api/'+route.replace('[id]',id)+(options.query||''), {method,headers,...(method==='GET'?{}:{body:JSON.stringify(payload)})});
  const res=await load('app/api/'+route+'/route.ts')[method](req,{params:Promise.resolve({id})});
  const data=options.binary?Buffer.from(await res.arrayBuffer()):await res.json();
  return {status:res.status,data};
}
async function entry(cantidad=3,extra={}){const r=await call('entradas',{fecha,articulo:'Camisolas',talla:'M',cantidad,estado:'Nuevo',motivo:'Compra',...extra});assert.equal(r.status,201,JSON.stringify(r));return r.data;}
async function assign(cantidad=1,extra={}){return call('salidas/bulk',{items:[{fecha,guardia_id:1,articulo:'Camisolas',talla:'M',cantidad,...extra}]});}
function summary(){return inv.calcularInventarioResumen().find(r=>r.articulo==='Camisolas');}
function ids(){return sqlite.prepare("SELECT * FROM salidas WHERE anulado=0 AND estado_asignacion='Uniforme en Campo' ORDER BY id").all();}
async function scenario(name,fn){reset();try{await fn();results.push({name,ok:true});console.log('OK '+name);}catch(e){results.push({name,ok:false,error:e.stack});console.error('FALLO '+name+'\n'+e.stack);}}
async function main(){
await scenario('Compra, asignación y devolución conservan piezas y autor',async()=>{
await entry(3,{registrado_por:'intruso'});assert.equal((await assign()).status,201);
const origen=ids()[0];await entry(1,{motivo:'Devolución de Equipo',salida_id:origen.id,guardia_id:1,estado:'Usado'});
assert.equal(summary().totalExistente,3);assert.equal(summary().enCampo,0);assert.equal(summary().almacenUsado,1);
assert.equal(sqlite.prepare('SELECT registrado_por FROM entradas LIMIT 1').get().registrado_por,'auditoria');
});
await scenario('Devolución libre rechazada y procedencia externa explícita',async()=>{
await entry(1);await assign();assert.equal((await call('entradas',{fecha,cantidad:1,motivo:'Devolución de Equipo',estado:'Usado'})).status,400);
assert.equal(summary().totalExistente,1);assert.equal((await call('entradas',{fecha,articulo:'Camisolas',talla:'M',cantidad:1,motivo:'Ingreso externo',estado:'Usado'})).status,400);
await entry(1,{motivo:'Ingreso externo',origen_devolucion:'Donación folio 4'});assert.equal(summary().totalExistente,2);
});
await scenario('Talla obligatoria, exacta y stock atómico',async()=>{
await entry(1);assert.equal((await assign(1,{talla:null})).status,400);assert.equal((await assign(1,{talla:'G'})).status,400);assert.equal((await assign()).status,201);assert.equal((await assign()).status,400);assert.equal(summary().almacen,0);
});
await scenario('Lotes inválidos revierten todos los renglones',async()=>{
await entry(2);const r=await call('salidas/bulk',{items:[{fecha,guardia_id:1,articulo:'Camisolas',talla:'M',cantidad:1},{fecha,guardia_id:1,articulo:'Camisolas',talla:'G',cantidad:1}]});assert.equal(r.status,400);assert.equal(ids().length,0);assert.equal(summary().almacen,2);
});
await scenario('Asignaciones sin guardia, inactivas o ficticias rechazadas',async()=>{
await entry();for(const guardia_id of [null,999])assert.equal((await call('salidas',{fecha,articulo:'Camisolas',talla:'M',cantidad:1,concepto:'Uniforme en Campo',guardia_id,estado_fisico:'Nuevo'})).status,guardia_id===999?404:400);
sqlite.exec("UPDATE guardias SET estado='Baja Definitiva'");assert.equal((await assign()).status,400);
});
await scenario('Cantidades enteras, fechas, artículo, talla y estados validados',async()=>{
for(const extra of [{cantidad:1.5},{cantidad:-1},{cantidad:true},{cantidad:1000001},{fecha:'2025-02-30'},{fecha:'2999-01-01'},{articulo:'fantasma'},{talla:'ZZ'},{estado:'ROTO'}])assert.equal((await call('entradas',{fecha,articulo:'Camisolas',talla:'M',cantidad:1,estado:'Nuevo',motivo:'Compra',...extra})).status,400,JSON.stringify(extra));
assert.equal(summary().almacen,0);
});
await scenario('Reposición cambia talla y enlaza entrada con salida correcta',async()=>{
await entry(1);await entry(2,{talla:'G'});await assign();const origen=ids()[0];
const item={fecha,guardia_id:1,articulo:'Camisolas',talla:'M',talla_nueva:'G',cantidad:1,salida_id:origen.id};
for(const extra of [{estadoEntregado:'Inutilizable'},{estadoDevolucion:'ROTO'}])assert.equal((await call('salidas/reposicion',{items:[item],...extra})).status,400);
assert.equal((await call('salidas/reposicion',{items:[item],estadoDevolucion:'Usado'})).status,201);assert.equal(summary().totalExistente,3);assert.equal(ids()[0].talla,'G');
const nueva=ids()[0],retorno=sqlite.prepare('SELECT * FROM entradas WHERE salida_origen_id=?').get(origen.id);assert.equal(nueva.salida_origen_id,retorno.salida_origen_id);assert.equal(nueva.operacion_id,retorno.operacion_id);
});
await scenario('Recuperar extravío específico no consume asignación activa',async()=>{
await entry(2);await assign();await assign();const [a,b]=ids();
assert.equal((await call('salidas/extravio',{items:[{fecha,guardia_id:1,articulo:'Camisolas',talla:'M',cantidad:1,salida_id:a.id}]})).status,201);
await entry(1,{motivo:'Recuperado',estado:'Usado',guardia_id:1,salida_id:a.id});assert.equal(summary().perdidas,0);assert.equal(ids()[0].id,b.id);assert.equal(summary().totalExistente,2);
});
await scenario('Devoluciones de prendas archivadas y conservación de históricos',async()=>{
await entry(1);await assign();const salida_id=ids()[0].id;assert.equal((await call('prendas/[id]',{},'DELETE')).status,200);await entry(1,{motivo:'Recuperado',guardia_id:1,salida_id,estado:'Usado'});assert.equal(summary().archivada,true);assert.equal(summary().almacen,1);
});
await scenario('Extravío genérico rechazado; daño físico permanece al archivar',async()=>{
await entry(2,{estado:'Inutilizable'});assert.equal((await call('salidas',{fecha,concepto:'Extravío',articulo:'Camisolas',talla:'M',cantidad:1})).status,400);
assert.equal((await call('salidas',{fecha,concepto:'Inutilizable',articulo:'Camisolas',talla:'M',cantidad:1,estado_fisico:'Inutilizable'})).status,201);await call('prendas/[id]',{},'DELETE');assert.equal(summary().perdidas,1);assert.equal(summary().almacenInutilizable,1);
});
await scenario('Baja parcial deja el resto pendiente y completa en segunda entrega',async()=>{
await entry(3);await assign(3);const baja=await call('guardias/[id]/baja',{fecha});assert.equal(baja.status,200,JSON.stringify(baja));
const payload={accion:'Devuelto',salida_id:baja.data.checklist[0].salida_id,cantidadItem:1,estadoFisicoDevolucion:'Usado'};const key=randomUUID();
const primero=await call('bajas/[id]/process',payload,'POST',String(baja.data.id),{key});assert.equal(primero.status,200);assert.equal(primero.data.allCompleted,false);assert.equal(summary().perdidas,0);assert.equal(summary().enBajas,2);
assert.deepEqual((await call('bajas/[id]/process',payload,'POST',String(baja.data.id),{key})).data,primero.data);
assert.equal((await call('bajas/[id]/process',{accion:'Cerrar'},'POST',String(baja.data.id))).status,400);
const pendiente=primero.data.baja.checklist.find(c=>c.estado==='Pendiente');const segundo=await call('bajas/[id]/process',{...payload,salida_id:pendiente.salida_id,cantidadItem:2},'POST',String(baja.data.id));assert.equal(segundo.data.allCompleted,true);assert.equal(summary().almacenUsado,3);assert.equal(summary().enBajas,0);
});
await scenario('Baja vacía termina y no acepta devolución por ruta paralela',async()=>{
const r=await call('guardias/[id]/baja',{fecha});assert.equal(r.data.estado_general,'Completada');
});
await scenario('Carga inicial atómica y equipo previo mantienen stock físico',async()=>{
assert.equal((await call('entradas/lote',{fecha,items:[{articulo:'Camisolas',talla:'M',nuevo:2},{articulo:'Camisolas',talla:'G',nuevo:-1}]})).status,400);assert.equal(summary().almacen,0);
assert.equal((await call('entradas/lote',{fecha,items:[{articulo:'Camisolas',talla:'M',nuevo:2,usado:1,inutilizable:1}]})).status,201);
const p={fecha,guardia_id:1,items:[{articulo:'Camisolas',talla:'M',cantidad:3,estado_fisico:'Usado'}]},key=randomUUID();assert.equal((await call('salidas/equipo-previo',p,'POST','1',{key})).status,201);await call('salidas/equipo-previo',p,'POST','1',{key});assert.equal(summary().almacen,4);assert.equal(summary().enCampo,3);
});
await scenario('Idempotencia de entradas: reintento, conflicto y clave requerida',async()=>{
const p={fecha,articulo:'Camisolas',talla:'M',cantidad:2,estado:'Nuevo',motivo:'Compra'},key=randomUUID();const a=await call('entradas',p,'POST','1',{key});const b=await call('entradas',p,'POST','1',{key});assert.deepEqual(a,b);assert.equal(summary().almacen,2);assert.equal((await call('entradas',{...p,cantidad:3},'POST','1',{key})).status,409);assert.equal((await call('entradas',p,'POST','1',{noKey:true})).status,400);
});
await scenario('Catálogo no cambia regla ni retira tallas usadas; renombra checklist',async()=>{
await entry();await assign();await call('guardias/[id]/baja',{fecha});
const p={nombre:'Camisolas',categoria:'Uniformes',requiere_talla:true,tallas:['M','G'],stock_minimo:5};
assert.equal((await call('prendas/[id]',{...p,requiere_talla:false,tallas:[]},'PUT')).status,400);assert.equal((await call('prendas/[id]',{...p,tallas:['G']},'PUT')).status,400);
assert.equal((await call('prendas/[id]',{...p,nombre:'Camisa nueva'},'PUT')).status,200);assert.equal(JSON.parse(sqlite.prepare('SELECT checklist FROM bajas').get().checklist)[0].articulo,'Camisa nueva');
});
await scenario('Catálogo renombra ajustes sin perder el saldo',async()=>{
await call('inventario/ajuste',{articulo:'Camisolas',talla:'M',estado:'Nuevo',contado:5,saldo_esperado:0,motivo:'Conteo documentado'});
await call('prendas/[id]',{nombre:'Camisa nueva',categoria:'Uniformes',requiere_talla:true,tallas:['M','G'],stock_minimo:5},'PUT');assert.equal(inv.calcularInventarioResumen().find(r=>r.articulo==='Camisa nueva').almacen,5);assert.equal(inv.calcularInventarioResumen().length,1);
});
await scenario('Saldos negativos y equipo huérfano son visibles',async()=>{
sqlite.prepare("INSERT INTO salidas(fecha,articulo,talla,cantidad,concepto,estado_fisico,estado_asignacion) VALUES (?,?,?,1,'Uniforme en Campo','Nuevo','Uniforme en Campo')").run(fecha,'Camisolas','M');assert.equal(summary().inconsistente,true);assert.equal(inv.calcularInventarioDetalle()[0].almacenNuevo,-1);const campo=await call('uniformes-campo',{},'GET');assert.equal(campo.data[0].sinResponsable,true);
const html=report.buildInventarioHtml(inv.calcularInventarioResumen(),inv.calcularInventarioDetalle());assert.ok(html.includes('Revisar saldo'));assert.ok(html.includes('>-1<'));assert.ok(!html.includes('5 piezas o menos'));
});
await scenario('Expedientes de homónimos se separan por ID',async()=>{
await entry();await assign();sqlite.prepare("INSERT INTO guardias(id,nombre,numero_elemento,estado,fecha_alta) VALUES(2,'Guardia Prueba','TEST-2','Activo',?)").run(fecha);
assert.equal((await call('guardias/[id]/expediente',{},'GET','2')).data.salidas.length,0);
});
await scenario('Gráfica conserva el año y recientes incluye cambios de estado',async()=>{
await entry(2,{fecha:'2025-10-06'});await entry(3,{fecha:'2026-10-06'});await assign();await call('salidas/extravio',{items:[{fecha,guardia_id:1,articulo:'Camisolas',talla:'M',cantidad:1,salida_id:ids()[0].id}]});const r=await call('dashboard/metrics',{},'GET');assert.ok(r.data.chartData.some(c=>c.fecha==='2025-10-06'&&c.Entradas===2));assert.ok(r.data.chartData.some(c=>c.fecha==='2026-10-06'&&c.Entradas===3));assert.match(r.data.recentMovements[0].motivo,/Extrav/i);
});
await scenario('JWT real y permisos en base prevalecen sobre token antiguo',async()=>{
user=null;assert.equal((await call('entradas',{},'GET')).status,401);user={id:1,username:'auditoria',role:'admin'};sqlite.exec("UPDATE users SET role='viewer'");assert.equal((await call('entradas',{fecha})).status,403);
sqlite.prepare('INSERT INTO roles_personalizados(id,nombre,permisos) VALUES(1,?,?)').run('Restringido',JSON.stringify({entradas:{ver:true,crear:false,editar:false,eliminar:false},inventario:{ver:false,crear:false,editar:false,eliminar:false}}));sqlite.exec("UPDATE users SET role='editor', role_personalizado_id=1");assert.equal((await call('entradas',{fecha})).status,403);assert.equal((await call('inventario',{},'GET')).status,403);assert.equal((await call('entradas',{},'GET')).status,200);
});
await scenario('Anulación de operación emparejada restaura stock y campo',async()=>{
await entry(3);await assign();await call('salidas/reposicion',{items:[{fecha,guardia_id:1,articulo:'Camisolas',talla:'M',cantidad:1,salida_id:ids()[0].id}]});const e=sqlite.prepare("SELECT * FROM entradas WHERE motivo LIKE 'Reposición%'").get();const r=await call('inventario/anular',{tabla:'entradas',id:e.id,motivo:'Captura equivocada'});assert.equal(r.status,200,JSON.stringify(r));assert.equal(summary().almacenNuevo,2);assert.equal(summary().almacenUsado,0);assert.equal(summary().enCampo,1);
});
await scenario('Anulación rechaza saldo negativo y, desde una fila, deshace primero su última operación',async()=>{
const e=await entry(1);await assign();const s=ids()[0];assert.equal((await call('inventario/anular',{tabla:'entradas',id:e.id,motivo:'Error de captura'})).status,400);
await entry(1,{motivo:'Recuperado',salida_id:s.id,guardia_id:1});assert.equal(summary().enCampo,0);
assert.equal((await call('inventario/anular',{tabla:'salidas',id:s.id,motivo:'Error de captura'})).status,200);assert.equal(summary().enCampo,1);assert.equal(summary().totalExistente,1);
assert.equal((await call('inventario/anular',{tabla:'entradas',id:e.id,motivo:'Error de captura'})).status,400);
});
await scenario('Conteo registra diferencia y rechaza saldo desactualizado',async()=>{
await entry(3);const p={articulo:'Camisolas',talla:'M',estado:'Nuevo',contado:1,saldo_esperado:3,motivo:'Conteo folio C-1'};assert.equal((await call('inventario/ajuste',p)).status,200);assert.equal(summary().almacen,1);assert.equal(summary().ajusteNeto,-2);assert.equal((await call('inventario/ajuste',p)).status,409);assert.equal((await call('inventario/ajuste',{...p,contado:-1})).status,400);
});
await scenario('Corte reconstruye estados, conserva autor y rechaza antes de base',async()=>{
await entry(3,{fecha:'2026-10-05'});await assign(1,{fecha:'2026-10-06'});await entry(1,{motivo:'Recuperado',estado:'Usado',salida_id:ids()[0].id,guardia_id:1,fecha});
assert.equal(inv.calcularInventarioResumen('2026-10-05')[0].almacen,3);assert.equal(inv.calcularInventarioResumen('2026-10-06')[0].enCampo,1);assert.equal(inv.calcularInventarioResumen(fecha)[0].enCampo,0);assert.equal((await call('inventario',{},'GET','1',{query:'?corte=2024-01-01'})).status,400);
const hist=await call('inventario/historial',{},'GET');assert.equal(hist.data.eventos[0].usuario,'auditoria');assert.ok(hist.data.eventos[0].registrado_en.endsWith('Z'));
});
await scenario('Excel real contiene filtros, tallas y fórmulas con total calculado',async()=>{
await entry(4);await call('prendas',{nombre:'Botas',categoria:'Calzado',requiere_talla:false,tallas:[],stock_minimo:1});await entry(2,{articulo:'Botas',talla:null});const r=await call('inventario/export-excel',{},'GET','1',{query:'?buscar=Camisolas',binary:true});assert.equal(r.status,200);const wb=new ExcelJS.Workbook();await wb.xlsx.load(r.data);assert.equal(wb.worksheets.length,3);assert.equal(wb.getWorksheet('Existencias').rowCount,3);assert.equal(wb.getWorksheet('Existencias').getCell('G3').value.result,4);assert.equal(wb.getWorksheet('Tallas').getCell('B2').value,'M');
});
await scenario('Formulario rechaza 1.5 sin expandirlo a dos piezas',async()=>{
const filename=path.join(root,'src/components/apps/SalidasApp.tsx'),source=fs.readFileSync(filename,'utf8'),parsed=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let handler;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(parsed)==='handleSubmitMulti')handler=n.initializer.getText(parsed);ts.forEachChild(n,visit);}visit(parsed);assert.ok(handler);let enviado=false,errores=[];
const context={guardiaId:'1',seleccion:{Camisolas:{talla:'M',cantidad:1.5}},isCampo:true,formData:{fecha,guardia_id:'1'},selectedGuardia:'1',selectedGuardiaId:'1',selectedItems:[{articulo:'Camisolas',talla:'M',cantidad:1.5}],items:[{articulo:'Camisolas',talla:'M',cantidad:1.5}],toast:{error:m=>errores.push(m)},bulkMutation:{mutate:()=>enviado=true},Number};
// El contexto del formulario se comprueba con el handler real.
const identifiers=[...handler.matchAll(/\b(?:multiForm|formMulti|multiItems)\b/g)].map(m=>m[0]);
for(const k of identifiers)context[k]=k.toLowerCase().includes('items')?context.items:{guardia_id:'1',fecha,items:context.items};
try{vm.runInNewContext(ts.transpileModule('('+handler+')()', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);}catch(e){if(e instanceof ReferenceError||e.name==='ReferenceError')throw Error('Completar fixture UI: '+e.message);throw e;}
assert.equal(enviado,false);assert.ok(errores.length);
});
await scenario('WhatsApp solo elimina chats, preserva inventario',async()=>{
await entry(2);assert.equal((await call('whatsapp/chats',{confirmar:'BORRAR TODO'},'DELETE')).status,400);assert.equal((await call('whatsapp/chats',{confirmar:'BORRAR CHATS'},'DELETE')).status,200);assert.equal(summary().almacen,2);
});
await scenario('Fecha operativa México evita adelanto de UTC',async()=>{
assert.equal(load('src/lib/fecha.ts').fechaMexico(new Date('2026-10-08T02:00:00Z')),'2026-10-07');
});
await scenario('JSON nulo se rechaza sin errores internos', async()=>{
for(const route of ['entradas','salidas','salidas/bulk','salidas/reposicion','entradas/lote','inventario/ajuste','inventario/anular','prendas']) assert.equal((await call(route,null)).status,400,route);
});
await scenario('Permisos de captura permiten referencias sin conceder edición', async()=>{
const no={ver:false,crear:false,editar:false,eliminar:false};sqlite.prepare('INSERT INTO roles_personalizados(id,nombre,permisos) VALUES(1,?,?)').run('Captura',JSON.stringify({inventario:no,salidas:no,'uniformes-campo':no,entradas:{...no,ver:true,crear:true}}));sqlite.exec("UPDATE users SET role='editor',role_personalizado_id=1");
assert.equal((await call('prendas',{},'GET')).status,200);assert.equal((await call('inventario/detalle',{},'GET')).status,200);assert.equal((await call('salidas',{},'GET')).status,200);assert.equal((await call('prendas',{nombre:'Prohibido'})).status,403);assert.equal((await call('inventario',{},'GET')).status,403);
});
await scenario('Anular devolución de baja no desajusta checklist ni estado',async()=>{
await entry();await assign();const b=await call('guardias/[id]/baja',{fecha});const item=b.data.checklist[0];await call('bajas/[id]/process',{accion:'Devuelto',salida_id:item.salida_id,cantidadItem:1},'POST',String(b.data.id));const e=sqlite.prepare('SELECT id FROM entradas WHERE salida_origen_id=?').get(item.salida_id);assert.equal((await call('inventario/anular',{tabla:'entradas',id:e.id,motivo:'Error de captura'})).status,400);assert.equal(sqlite.prepare('SELECT estado FROM guardias WHERE id=1').get().estado,'Baja Definitiva');assert.equal(summary().enBajas,0);
});
await scenario('Fecha de transición anterior a entrega se rechaza',async()=>{
await entry();await assign();assert.equal((await call('salidas/extravio',{items:[{fecha:'2025-01-01',guardia_id:1,articulo:'Camisolas',talla:'M',cantidad:1,salida_id:ids()[0].id}]})).status,400);assert.equal(summary().enCampo,1);
});
await scenario('Cliente conserva clave tras fallo de red y la renueva al confirmar',async()=>{
const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};const keys=[];let fail=true;
const context={exports:{},window:{},localStorage:storage,sessionStorage:storage,FormData,crypto:require('node:crypto').webcrypto,fetch:async(p,o)=>{keys.push(o.headers['Idempotency-Key']);if(fail){fail=false;throw Error('sin respuesta');}return Response.json({ok:true})}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/api.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
await assert.rejects(()=>context.exports.apiFetch('/api/entradas',{method:'POST',body:'{}'}));await context.exports.apiFetch('/api/entradas',{method:'POST',body:'{}'});await context.exports.apiFetch('/api/entradas',{method:'POST',body:'{}'});assert.equal(keys[0],keys[1]);assert.notEqual(keys[1],keys[2]);
await context.exports.apiFetch('/api/bajas/1/process',{method:'POST',body:'{}'});assert.ok(keys[3]);await context.exports.apiFetch('/api/clientes',{method:'POST',body:'{}'});assert.equal(keys[4],undefined);
});
await scenario('Anular deshace un extravío y después la asignación; la vista previa lo explica',async()=>{
await entry(2);await assign(2);const s=ids()[0];
assert.equal((await call('salidas/extravio',{items:[{fecha,guardia_id:1,articulo:'Camisolas',talla:'M',cantidad:1,salida_id:s.id}]})).status,201);
assert.equal(summary().perdidas,1);assert.equal(summary().enCampo,1);
const ext=sqlite.prepare("SELECT * FROM salidas WHERE estado_asignacion='Extraviado'").get();
const vista=await call('inventario/anular',{},'GET','1',{query:'?tabla=salidas&id='+ext.id});assert.equal(vista.data.puede,true);assert.equal(vista.data.tipo,'Extravío');
assert.equal((await call('inventario/anular',{tabla:'salidas',id:ext.id,motivo:'El extravío fue un error'})).status,200);
assert.equal(summary().perdidas,0);assert.equal(summary().enCampo,2);assert.equal(summary().almacen,0);
const vivo=ids();assert.equal(vivo.length,1);assert.equal(vivo[0].cantidad,2);
assert.equal((await call('inventario/anular',{},'GET','1',{query:'?tabla=salidas&id='+vivo[0].id})).data.tipo,'Asignación en campo');
assert.equal((await call('inventario/anular',{tabla:'salidas',id:vivo[0].id,motivo:'La asignación fue un error'})).status,200);
assert.equal(summary().enCampo,0);assert.equal(summary().almacen,2);
});
await scenario('Corregir cantidad, talla y estado respeta existencias y deja a Anular el valor original',async()=>{
const e=await entry(5);const corregir=(tabla,id,extra={})=>call('inventario/corregir',{tabla,id,motivo:'Error de captura',...extra});
assert.equal((await corregir('entradas',e.id,{cantidad:3})).status,200);assert.equal(summary().almacen,3);assert.equal(summary().totalEntradas,3);
const ev=sqlite.prepare("SELECT * FROM inventario_eventos WHERE motivo LIKE 'Corrección:%'").get();assert.equal(ev.usuario,'auditoria');assert.equal(JSON.parse(ev.antes).cantidad,5);assert.equal(JSON.parse(ev.despues).cantidad,3);assert.equal(ev.operacion_id,sqlite.prepare('SELECT operacion_id FROM entradas WHERE id=?').get(e.id).operacion_id);
await assign(2);const s=ids()[0];
assert.equal((await corregir('entradas',e.id,{cantidad:1})).status,400);assert.equal(summary().almacen,1);
assert.equal((await corregir('salidas',s.id,{cantidad:4})).status,400);
assert.equal((await corregir('salidas',s.id,{cantidad:3})).status,200);assert.equal(summary().enCampo,3);assert.equal(summary().almacen,0);
assert.equal((await corregir('salidas',s.id,{cantidad:1})).status,200);assert.equal(summary().enCampo,1);assert.equal(summary().almacen,2);
for(const extra of [{cantidad:1.5},{cantidad:0},{cantidad:'x'},{motivo:'x'},{},{talla:'ZZ'},{estado:'Inutilizable'},{estado:'Usado'}])assert.equal((await corregir('salidas',s.id,extra)).status,400,JSON.stringify(extra));
await entry(2,{talla:'G'});assert.equal((await corregir('salidas',s.id,{talla:'G'})).status,200);
assert.equal(inv.calcularInventarioDetalle().find(d=>d.talla==='G').almacenNuevo,1);assert.equal(summary().almacen,4);
assert.equal((await call('inventario/anular',{tabla:'salidas',id:s.id,motivo:'La asignación completa fue un error'})).status,200);
const original=sqlite.prepare('SELECT cantidad,talla,anulado FROM salidas WHERE id=?').get(s.id);assert.deepEqual({...original},{cantidad:2,talla:'M',anulado:1});
assert.equal(summary().enCampo,0);assert.equal(summary().almacen,5);
});
await scenario('Corregir un renglón de la carga inicial no toca los demás; anular revierte toda la carga',async()=>{
assert.equal((await call('entradas/lote',{fecha,items:[{articulo:'Camisolas',talla:'M',nuevo:9},{articulo:'Camisolas',talla:'G',nuevo:3}]})).status,201);
const m=sqlite.prepare("SELECT id FROM entradas WHERE talla='M'").get(),g=sqlite.prepare("SELECT id FROM entradas WHERE talla='G'").get();
assert.equal((await call('inventario/corregir',{tabla:'entradas',id:m.id,cantidad:2,motivo:'En M eran 2'})).status,200);
assert.equal(summary().almacen,5);assert.equal(sqlite.prepare('SELECT cantidad FROM entradas WHERE id=?').get(g.id).cantidad,3);
assert.equal((await call('inventario/anular',{tabla:'entradas',id:g.id,motivo:'La carga estaba repetida'})).status,200);
assert.equal(summary().almacen,0);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM entradas WHERE anulado=0').get().n,0);assert.equal(sqlite.prepare('SELECT cantidad FROM entradas WHERE id=?').get(m.id).cantidad,9);
});
await scenario('Corregir equipo previo mantiene emparejadas la entrada y la salida',async()=>{
const p={fecha,guardia_id:1,items:[{articulo:'Camisolas',talla:'M',cantidad:3,estado_fisico:'Usado'},{articulo:'Camisolas',talla:'G',cantidad:2,estado_fisico:'Usado'}]};
assert.equal((await call('salidas/equipo-previo',p)).status,201);
const filas=()=>({e:sqlite.prepare('SELECT * FROM entradas ORDER BY id').all(),s:sqlite.prepare('SELECT * FROM salidas ORDER BY id').all()});
let {e,s}=filas();
assert.equal((await call('inventario/corregir',{tabla:'salidas',id:s[1].id,cantidad:1,motivo:'Eran 2 camisolas G'})).status,200);
({e,s}=filas());assert.deepEqual([e[1].cantidad,s[1].cantidad,e[0].cantidad,s[0].cantidad],[1,1,3,3]);
assert.equal((await call('inventario/corregir',{tabla:'entradas',id:e[0].id,cantidad:4,estado:'Nuevo',motivo:'Eran 4 nuevas'})).status,200);
({e,s}=filas());assert.deepEqual([e[0].cantidad,s[0].cantidad,e[0].estado,s[0].estado_fisico],[4,4,'Nuevo','Nuevo']);
assert.equal(summary().enCampo,5);assert.equal(summary().almacen,0);
assert.equal((await call('inventario/corregir',{tabla:'entradas',id:e[0].id,estado:'Inutilizable',motivo:'Estado equivocado'})).status,400);
assert.equal((await call('inventario/anular',{tabla:'entradas',id:e[1].id,motivo:'Todo el equipo previo estaba mal'})).status,200);
assert.equal(summary().enCampo,0);assert.equal(summary().totalEntradas,0);
});
await scenario('Corregir se rechaza si hubo cambios posteriores, si es compuesto o si es anterior a la bitácora',async()=>{
await entry(3);await assign(2);const s=ids()[0];
assert.equal((await call('salidas/extravio',{items:[{fecha,guardia_id:1,articulo:'Camisolas',talla:'M',cantidad:1,salida_id:s.id}]})).status,201);
const corregir=(tabla,id)=>call('inventario/corregir',{tabla,id,cantidad:1,motivo:'Error de captura'});
for(const f of sqlite.prepare('SELECT id FROM salidas WHERE anulado=0').all())assert.equal((await corregir('salidas',f.id)).status,400);
const ext=sqlite.prepare("SELECT id FROM salidas WHERE estado_asignacion='Extraviado'").get();
assert.equal((await call('inventario/anular',{tabla:'salidas',id:ext.id,motivo:'El extravío fue un error'})).status,200);
assert.equal((await corregir('salidas',ids()[0].id)).status,200);assert.equal(summary().enCampo,1);
await entry(1,{motivo:'Devolución de Equipo',salida_id:ids()[0].id,guardia_id:1,estado:'Usado'});
const dev=sqlite.prepare("SELECT id FROM entradas WHERE motivo='Devolución de Equipo'").get();
assert.equal((await corregir('entradas',dev.id)).status,400);
sqlite.prepare('INSERT INTO entradas(fecha,articulo,talla,cantidad,estado,motivo) VALUES (?,?,?,?,?,?)').run(fecha,'Camisolas','M',3,'Nuevo','Compra');
const viejo=sqlite.prepare('SELECT id FROM entradas ORDER BY id DESC').get();
assert.equal((await corregir('entradas',viejo.id)).status,400);
const vista=await call('inventario/anular',{},'GET','1',{query:'?tabla=entradas&id='+viejo.id});assert.equal(vista.data.puede,false);assert.match(vista.data.bloqueo,/anterior a la bitácora/);
});
await scenario('Renombrar un guardia o una prenda no bloquea anular ni corregir ni pisa el nombre nuevo',async()=>{
await entry(3);await assign(2);const s=ids()[0];
assert.equal((await call('salidas/extravio',{items:[{fecha,guardia_id:1,articulo:'Camisolas',talla:'M',cantidad:1,salida_id:s.id}]})).status,201);
const g=await call('guardias/[id]',{nombre:'Guardia Renombrado',numero_elemento:'TEST-1',fecha_alta:'2025-01-01',estado:'Activo'},'PUT');assert.equal(g.status,200,JSON.stringify(g.data));
const p=await call('prendas/[id]',{nombre:'Camisa nueva',categoria:'Uniformes',requiere_talla:true,tallas:['M','G'],stock_minimo:5},'PUT');assert.equal(p.status,200,JSON.stringify(p.data));
const ext=sqlite.prepare("SELECT id FROM salidas WHERE estado_asignacion='Extraviado'").get();
assert.equal((await call('inventario/anular',{tabla:'salidas',id:ext.id,motivo:'El extravío fue un error'})).status,200);
const fila=ids()[0];assert.equal(fila.nombre_guardia,'Guardia Renombrado');assert.equal(fila.articulo,'Camisa nueva');assert.equal(fila.cantidad,2);
assert.equal((await call('inventario/corregir',{tabla:'salidas',id:fila.id,cantidad:1,motivo:'Solo se entregó una'})).status,200);
assert.equal(inv.calcularInventarioResumen().find(r=>r.articulo==='Camisa nueva').enCampo,1);
});
await scenario('Anular exige deshacer primero lo posterior dentro de una misma captura',async()=>{
await entry(1);await entry(1,{talla:'G'});
assert.equal((await call('salidas/bulk',{items:[{fecha,guardia_id:1,articulo:'Camisolas',talla:'M',cantidad:1},{fecha,guardia_id:1,articulo:'Camisolas',talla:'G',cantidad:1}]})).status,201);
const [a,b]=ids();
assert.equal((await call('salidas/extravio',{items:[{fecha,guardia_id:1,articulo:'Camisolas',talla:'M',cantidad:1,salida_id:a.id}]})).status,201);
const bloqueo=await call('inventario/anular',{tabla:'salidas',id:b.id,motivo:'Captura equivocada'});assert.equal(bloqueo.status,400);assert.match(bloqueo.data.error,/Extrav/);
assert.equal((await call('inventario/anular',{tabla:'salidas',id:a.id,motivo:'El extravío fue un error'})).status,200);
assert.equal((await call('inventario/anular',{tabla:'salidas',id:b.id,motivo:'Captura equivocada'})).status,200);
assert.equal(summary().enCampo,0);assert.equal(summary().almacen,2);
});
await scenario('Corregir y anular respetan los permisos del rol personalizado',async()=>{
const e=await entry(2);const no={ver:true,crear:false,editar:false,eliminar:false};
sqlite.prepare('INSERT INTO roles_personalizados(id,nombre,permisos) VALUES(1,?,?)').run('Solo captura',JSON.stringify({entradas:{...no,crear:true},inventario:no,salidas:no}));
sqlite.exec("UPDATE users SET role='editor', role_personalizado_id=1");
const corregir=()=>call('inventario/corregir',{tabla:'entradas',id:e.id,cantidad:1,motivo:'Error de captura'}),anular=()=>call('inventario/anular',{tabla:'entradas',id:e.id,motivo:'Error de captura'});
assert.equal((await corregir()).status,403);assert.equal((await anular()).status,403);
sqlite.prepare('UPDATE roles_personalizados SET permisos=?').run(JSON.stringify({entradas:{...no,editar:true}}));
assert.equal((await corregir()).status,200);assert.equal((await anular()).status,403);
});
await scenario('Anular no toca piezas de un proceso de baja abierto',async()=>{
await entry(1);await assign();const s=ids()[0];assert.equal((await call('guardias/[id]/baja',{fecha})).status,200);
const r=await call('inventario/anular',{tabla:'salidas',id:s.id,motivo:'Error de captura'});assert.equal(r.status,400);assert.match(r.data.error,/proceso de baja/);
assert.equal((await call('inventario/anular',{},'GET','1',{query:'?tabla=salidas&id='+s.id})).data.puede,false);assert.equal(summary().enBajas,1);
});
await scenario('Corregir una baja por daño ajusta pérdidas y existencias',async()=>{
await entry(3,{estado:'Inutilizable'});
assert.equal((await call('salidas',{fecha,concepto:'Inutilizable',articulo:'Camisolas',talla:'M',cantidad:2,estado_fisico:'Inutilizable'})).status,201);
assert.equal(summary().perdidas,2);assert.equal(summary().almacenInutilizable,1);
const s=sqlite.prepare("SELECT id FROM salidas WHERE concepto='Inutilizable'").get();
assert.equal((await call('inventario/corregir',{tabla:'salidas',id:s.id,cantidad:1,motivo:'Solo se dio de baja una'})).status,200);
assert.equal(summary().perdidas,1);assert.equal(summary().almacenInutilizable,2);
assert.equal((await call('inventario/corregir',{tabla:'salidas',id:s.id,cantidad:4,motivo:'Más de lo que había'})).status,400);
});
await scenario('Bitácora anterior sin deshecho_por: el arranque la actualiza y, si no, anular y corregir la agregan',async()=>{
const tiene=()=>sqlite.prepare('PRAGMA table_info(inventario_eventos)').all().some(c=>c.name==='deshecho_por');
const quitar=()=>sqlite.exec('DROP INDEX IF EXISTS inventario_eventos_operacion;ALTER TABLE inventario_eventos DROP COLUMN deshecho_por');
const e=await entry(2);const antes=sqlite.prepare('SELECT COUNT(*) n FROM inventario_eventos').get().n;
quitar();assert.ok(!tiene());
const {migrarInventario}=load('src/db/inventarioMigracion.ts');migrarInventario(sqlite);migrarInventario(sqlite);
assert.ok(tiene());assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM inventario_eventos').get().n,antes);
quitar();assert.equal((await call('inventario/anular',{},'GET','1',{query:'?tabla=entradas&id='+e.id})).data.puede,true);assert.ok(tiene());
quitar();assert.equal((await call('inventario/corregir',{tabla:'entradas',id:e.id,cantidad:1,motivo:'Error de captura'})).status,200);assert.ok(tiene());
assert.equal((await call('inventario/anular',{tabla:'entradas',id:e.id,motivo:'Error de captura'})).status,200);
});
fs.writeFileSync(path.join(root,'docs/pruebas-inventario-2026-10-07.json'),JSON.stringify({fecha:new Date().toISOString(),entorno:'SQLite en memoria; JWT real; sin datos productivos',total:results.length,aprobadas:results.filter(r=>r.ok).length,resultados:results},null,2));sqlite.close();if(results.some(r=>!r.ok))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
