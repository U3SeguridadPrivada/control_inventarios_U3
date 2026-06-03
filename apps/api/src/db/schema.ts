import { pgTable, serial, text, integer, jsonb, timestamp, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  email: varchar('email', { length: 100 }).notNull().unique(),
  password_hash: text('password_hash').notNull(),
  // 'admin' | 'editor' | 'viewer'
  role: varchar('role', { length: 20 }).notNull().default('viewer'),
  created_at: timestamp('created_at').defaultNow(),
});

export const guardias = pgTable('guardias', {
  id: serial('id').primaryKey(),
  numero_elemento: text('numero_elemento').unique().notNull(),
  nombre: text('nombre').notNull(),
  estado: text('estado').default('Activo'),
  fecha_alta: text('fecha_alta').notNull(),
  fecha_baja: text('fecha_baja')
});

export const entradas = pgTable('entradas', {
  id: serial('id').primaryKey(),
  fecha: text('fecha').notNull(),
  articulo: text('articulo').notNull(),
  talla: text('talla'),
  cantidad: integer('cantidad').notNull(),
  estado: text('estado').notNull(),
  motivo: text('motivo').notNull(),
  origen_devolucion: text('origen_devolucion'),
  guardia_id: integer('guardia_id').references(() => guardias.id),
  registrado_por: text('registrado_por')
});

export const salidas = pgTable('salidas', {
  id: serial('id').primaryKey(),
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
  notas: text('notas')
});

export const uniformes_campo = pgTable('uniformes_campo', {
  id: serial('id').primaryKey(),
  fecha: text('fecha').notNull(),
  guardia_id: integer('guardia_id').notNull().references(() => guardias.id),
  nombre_guardia: text('nombre_guardia').notNull(),
  articulos: jsonb('articulos').notNull()
});

export const bajas = pgTable('bajas', {
  id: serial('id').primaryKey(),
  fecha: text('fecha').notNull(),
  guardia_id: integer('guardia_id').notNull().references(() => guardias.id),
  nombre_guardia: text('nombre_guardia').notNull(),
  numero_elemento: text('numero_elemento').notNull(),
  estado_general: text('estado_general').default('Pendiente'),
  checklist: jsonb('checklist').notNull()
});
