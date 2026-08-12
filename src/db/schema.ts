import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  role: text('role').notNull().default('viewer'),
  role_personalizado_id: integer('role_personalizado_id'),
  // Firma de correo individual (JSON: nombre, puesto, telefono, correo)
  firma_json: text('firma_json'),
  // Buzón personal del usuario para el módulo de Correo (IMAP entrada / SMTP salida)
  correo_imap_host: text('correo_imap_host'),
  correo_imap_puerto: integer('correo_imap_puerto').default(993),
  correo_smtp_host: text('correo_smtp_host'),
  correo_smtp_puerto: integer('correo_smtp_puerto').default(465),
  correo_ssl: integer('correo_ssl').notNull().default(1),
  correo_usuario: text('correo_usuario'),
  correo_password: text('correo_password'),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

export const guardias = sqliteTable('guardias', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  numero_elemento: text('numero_elemento').notNull().unique(),
  nombre: text('nombre').notNull(),
  estado: text('estado').default('Activo'),
  fecha_alta: text('fecha_alta').notNull(),
  fecha_baja: text('fecha_baja'),
  telefono: text('telefono'),
  direccion: text('direccion'),
});

export const guardia_documentos = sqliteTable('guardia_documentos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guardia_id: integer('guardia_id').notNull().references(() => guardias.id),
  nombre_documento: text('nombre_documento').notNull(),
  nombre_archivo: text('nombre_archivo').notNull(),
  tipo_mimetype: text('tipo_mimetype').notNull(),
  fecha_subida: text('fecha_subida').default(sql`(datetime('now'))`),
});

export const entradas = sqliteTable('entradas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fecha: text('fecha').notNull(),
  articulo: text('articulo').notNull(),
  talla: text('talla'),
  cantidad: integer('cantidad').notNull(),
  estado: text('estado').notNull(),
  motivo: text('motivo').notNull(),
  origen_devolucion: text('origen_devolucion'),
  guardia_id: integer('guardia_id').references(() => guardias.id),
  registrado_por: text('registrado_por'),
});

export const salidas = sqliteTable('salidas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fecha: text('fecha').notNull(),
  concepto: text('concepto').notNull(),
  articulo: text('articulo').notNull(),
  talla: text('talla'),
  cantidad: integer('cantidad').notNull(),
  nombre_guardia: text('nombre_guardia'),
  estado_asignacion: text('estado_asignacion').default('N/A'),
  estado_devuelto: text('estado_devuelto'),
  supervisor: text('supervisor'),
  prenda_cambiada_detalle: text('prenda_cambiada_detalle'),
  estado_fisico: text('estado_fisico').default('Nuevo'),
  observaciones: text('observaciones'),
  guardia_id: integer('guardia_id').references(() => guardias.id),
  registrado_por: text('registrado_por'),
  notas: text('notas'),
  // Fecha en que `estado_asignacion` cambió por última vez (devuelto/extraviado/etc.).
  // `fecha` conserva la fecha del movimiento original; esta columna es el rastro de auditoría
  // de la transición de estado, para no perder ninguna de las dos fechas.
  estado_actualizado_en: text('estado_actualizado_en'),
});

export const uniformes_campo = sqliteTable('uniformes_campo', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fecha: text('fecha').notNull(),
  guardia_id: integer('guardia_id').notNull().references(() => guardias.id),
  nombre_guardia: text('nombre_guardia').notNull(),
  articulos: text('articulos', { mode: 'json' }).notNull().$type<any[]>(),
});

export const bajas = sqliteTable('bajas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fecha: text('fecha').notNull(),
  guardia_id: integer('guardia_id').notNull().references(() => guardias.id),
  nombre_guardia: text('nombre_guardia').notNull(),
  numero_elemento: text('numero_elemento').notNull(),
  estado_general: text('estado_general').default('Pendiente'),
  checklist: text('checklist', { mode: 'json' }).notNull().$type<any[]>(),
});

export const mensajes = sqliteTable('mensajes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  remitente_id: integer('remitente_id').notNull().references(() => users.id),
  destinatario_id: integer('destinatario_id').notNull().references(() => users.id),
  asunto: text('asunto').notNull(),
  cuerpo: text('cuerpo').notNull(),
  leido: integer('leido').notNull().default(0),
  destacado: integer('destacado').notNull().default(0),
  eliminado_remitente: integer('eliminado_remitente').notNull().default(0),
  eliminado_destinatario: integer('eliminado_destinatario').notNull().default(0),
  responde_a_id: integer('responde_a_id'),
  es_html: integer('es_html').notNull().default(0),
  fecha_envio: text('fecha_envio').default(sql`(datetime('now'))`),
});

export const eventos_calendario = sqliteTable('eventos_calendario', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  titulo: text('titulo').notNull(),
  descripcion: text('descripcion'),
  fecha_inicio: text('fecha_inicio').notNull(),
  fecha_fin: text('fecha_fin'),
  todo_el_dia: integer('todo_el_dia').notNull().default(0),
  creado_por: integer('creado_por').notNull().references(() => users.id),
  guardia_id: integer('guardia_id').references(() => guardias.id),
  notificar_minutos_antes: integer('notificar_minutos_antes'),
  notificado: integer('notificado').notNull().default(0),
});

export const servicios = sqliteTable('servicios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  direccion: text('direccion'),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  creado_por: integer('creado_por').notNull().references(() => users.id),
});

export const servicio_guardias = sqliteTable('servicio_guardias', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  servicio_id: integer('servicio_id').notNull().references(() => servicios.id),
  guardia_id: integer('guardia_id').notNull().references(() => guardias.id),
  turno: text('turno'),
});

export const incidencias = sqliteTable('incidencias', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  guardia_id: integer('guardia_id').notNull().references(() => guardias.id),
  tipo: text('tipo').notNull(),
  gravedad: text('gravedad').default('Leve'),
  fecha: text('fecha').notNull(),
  descripcion: text('descripcion').notNull(),
  estado: text('estado').default('Abierta'),
  creado_por: integer('creado_por').notNull().references(() => users.id),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

export const roles_personalizados = sqliteTable('roles_personalizados', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull().unique(),
  descripcion: text('descripcion'),
  permisos: text('permisos', { mode: 'json' }).notNull().$type<Record<string, { ver: boolean; crear: boolean; editar: boolean; eliminar: boolean }>>(),
  color: text('color').default('slate'),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

export const clientes = sqliteTable('clientes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre').notNull(),
  tipo: text('tipo').notNull().default('Prospecto'),
  empresa: text('empresa'),
  email: text('email'),
  telefono: text('telefono'),
  direccion: text('direccion'),
  notas: text('notas'),
  creado_por: integer('creado_por').references(() => users.id),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

export const cotizaciones = sqliteTable('cotizaciones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  folio: text('folio').notNull().unique(),
  cliente_id: integer('cliente_id').notNull().references(() => clientes.id),
  fecha: text('fecha').notNull(),
  solicitante: text('solicitante'),
  atencion: text('atencion'),
  servicio_cotizado: text('servicio_cotizado'),
  ubicacion: text('ubicacion'),
  periodicidad: text('periodicidad').default('Quincenal'),
  vigencia_dias: integer('vigencia_dias').default(30),
  asesor_nombre: text('asesor_nombre'),
  asesor_puesto: text('asesor_puesto').default('Asesor Comercial'),
  items: text('items', { mode: 'json' }).notNull().$type<{ descripcion: string; unidad: string; cantidad: number; precio_unitario: number }[]>(),
  subtotal: real('subtotal').notNull(),
  iva: real('iva').notNull(),
  total: real('total').notNull(),
  estado: text('estado').default('Borrador'),
  notas: text('notas'),
  creado_por: integer('creado_por').references(() => users.id),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

export const ventas = sqliteTable('ventas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  folio: text('folio').notNull().unique(),
  cliente_id: integer('cliente_id').notNull().references(() => clientes.id),
  cotizacion_id: integer('cotizacion_id').references(() => cotizaciones.id),
  fecha: text('fecha').notNull(),
  monto_total: real('monto_total').notNull(),
  estado: text('estado').default('Pendiente'),
  metodo_pago: text('metodo_pago'),
  notas: text('notas'),
  creado_por: integer('creado_por').references(() => users.id),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

export const cuentas_bancarias = sqliteTable('cuentas_bancarias', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  banco: text('banco').notNull(),
  alias: text('alias').notNull(),
  numero_cuenta: text('numero_cuenta'),
  tipo: text('tipo').default('Cheques'),
  moneda: text('moneda').default('MXN'),
  saldo_actual: real('saldo_actual').notNull().default(0),
  activa: integer('activa').notNull().default(1),
  creado_por: integer('creado_por').references(() => users.id),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

export const movimientos_financieros = sqliteTable('movimientos_financieros', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fecha: text('fecha').notNull(),
  tipo: text('tipo').notNull(),
  categoria: text('categoria').notNull(),
  monto: real('monto').notNull(),
  cuenta_bancaria_id: integer('cuenta_bancaria_id').references(() => cuentas_bancarias.id),
  descripcion: text('descripcion'),
  // Campos Cuenta B (réplica de la plantilla Excel de ingresos/egresos)
  libro: text('libro').notNull().default('B'),
  medio_pago: text('medio_pago'),
  nombre: text('nombre'),
  tipo_detalle: text('tipo_detalle'),
  turno: text('turno'),
  alimentos: text('alimentos'),
  servicio: text('servicio'),
  guardia_id: integer('guardia_id').references(() => guardias.id),
  creado_por: integer('creado_por').references(() => users.id),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

// Configuración general del sitio (SMTP, etc.) como pares clave-valor
export const site_config = sqliteTable('site_config', {
  clave: text('clave').primaryKey(),
  valor: text('valor'),
});

// Tokens de recuperación de contraseña
export const password_resets = sqliteTable('password_resets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  token: text('token').notNull().unique(),
  expira: text('expira').notNull(),
  usado: integer('usado').notNull().default(0),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

// Libros/cuentas de movimientos (Cuenta A, Cuenta B). Cada uno tiene un único
// responsable que puede modificarlo; los viewers ven todos en solo lectura.
export const libros_financieros = sqliteTable('libros_financieros', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  usuario_id: integer('usuario_id').references(() => users.id),
  // Correo IMAP asociado a la cuenta (para consultar comprobantes/notificaciones)
  imap_correo: text('imap_correo'),
  imap_host: text('imap_host'),
  imap_puerto: integer('imap_puerto').default(993),
  imap_ssl: integer('imap_ssl').notNull().default(1),
  imap_password: text('imap_password'),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

// Vacantes de reclutamiento que el bot de WhatsApp ofrece a los candidatos
export const vacantes = sqliteTable('vacantes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  puesto: text('puesto').notNull(),
  ubicacion: text('ubicacion'),
  turno: text('turno'),
  sueldo: text('sueldo'),
  requisitos: text('requisitos'),
  descripcion: text('descripcion'),
  activa: integer('activa').notNull().default(1),
  creado_por: integer('creado_por').references(() => users.id),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

// Candidatos captados por el bot de reclutamiento (pipeline tipo ATS)
export const candidatos = sqliteTable('candidatos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nombre: text('nombre'),
  // Solo dígitos, normalizado por el webhook de WhatsApp
  telefono: text('telefono').notNull(),
  ciudad: text('ciudad'),
  edad: integer('edad'),
  experiencia: text('experiencia'),
  vacante_id: integer('vacante_id').references(() => vacantes.id),
  etapa: text('etapa').notNull().default('Nuevo'),
  etapa_actualizada_en: text('etapa_actualizada_en'),
  fecha_entrevista: text('fecha_entrevista'),
  evento_id: integer('evento_id').references(() => eventos_calendario.id),
  guardia_id: integer('guardia_id').references(() => guardias.id),
  origen: text('origen').default('WhatsApp'),
  notas: text('notas'),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

// Historial de conversación del bot de WhatsApp (memoria por teléfono)
export const whatsapp_conversaciones = sqliteTable('whatsapp_conversaciones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  telefono: text('telefono').notNull(),
  rol: text('rol').notNull(), // 'user' | 'model' (formato que consume Gemini)
  autor: text('autor').default('bot'), // 'contacto' | 'bot' | 'humano'
  mensaje: text('mensaje').notNull(),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

// Estado por chat de WhatsApp: pausa del bot y contadores para la bandeja en vivo
export const whatsapp_chats = sqliteTable('whatsapp_chats', {
  telefono: text('telefono').primaryKey(),
  bot_activo: integer('bot_activo').notNull().default(1),
  no_leidos: integer('no_leidos').notNull().default(0),
  ultima_actividad: text('ultima_actividad'),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

// Biblioteca de protocolos operativos (emergencias, rondines, RRHH...).
// Un protocolo `lista` es un procedimiento corto y vive en `pasos`; un protocolo
// `documento` es un manual con capitulado y vive en `contenido` (secciones y bloques).
export const protocolos = sqliteTable('protocolos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  titulo: text('titulo').notNull(),
  categoria: text('categoria').notNull().default('Operativo'),
  descripcion: text('descripcion'),
  tipo: text('tipo').notNull().default('lista'),
  pasos: text('pasos', { mode: 'json' }).notNull().$type<string[]>(),
  contenido: text('contenido', { mode: 'json' }).$type<Record<string, any> | null>(),
  prioridad: text('prioridad').notNull().default('Media'),
  activo: integer('activo').notNull().default(1),
  creado_por: integer('creado_por').references(() => users.id),
  actualizado_en: text('actualizado_en'),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

export const movimiento_evidencias = sqliteTable('movimiento_evidencias', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  movimiento_id: integer('movimiento_id').notNull().references(() => movimientos_financieros.id),
  nombre_documento: text('nombre_documento').notNull(),
  nombre_archivo: text('nombre_archivo').notNull(),
  tipo_mimetype: text('tipo_mimetype').notNull(),
  subido_por: integer('subido_por').references(() => users.id),
  fecha_subida: text('fecha_subida').default(sql`(datetime('now'))`),
});
