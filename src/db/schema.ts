import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  role: text('role').notNull().default('viewer'),
  created_at: text('created_at').default(sql`(datetime('now'))`),
});

export const guardias = sqliteTable('guardias', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  numero_elemento: text('numero_elemento').notNull().unique(),
  nombre: text('nombre').notNull(),
  estado: text('estado').default('Activo'),
  fecha_alta: text('fecha_alta').notNull(),
  fecha_baja: text('fecha_baja'),
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
