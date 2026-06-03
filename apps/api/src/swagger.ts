import { OpenAPIRegistry, extendZodWithOpenApi, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import * as schema from './db/schema';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

export const GuardiaSchema = z.object({
  id: z.number(),
  numero_elemento: z.string(),
  nombre: z.string(),
  estado: z.string().nullable(),
  fecha_alta: z.string(),
  fecha_baja: z.string().nullable()
});

export const EntradaSchema = z.object({
  id: z.number(),
  fecha: z.string(),
  articulo: z.string(),
  talla: z.string().nullable(),
  cantidad: z.number(),
  estado: z.string(),
  motivo: z.string(),
  origen_devolucion: z.string().nullable(),
  registrado_por: z.string().nullable()
});

export const SalidaSchema = z.object({
  id: z.number(),
  fecha: z.string(),
  concepto: z.string(),
  articulo: z.string(),
  talla: z.string().nullable(),
  cantidad: z.number(),
  nombre_guardia: z.string().nullable(),
  estado_asignacion: z.string().nullable(),
  guardia_id: z.number().nullable()
});
export const InventarioItemSchema = z.object({
  articulo: z.string(),
  totalEntradas: z.number(),
  almacen: z.number(),
  enCampo: z.number(),
  enBajas: z.number(),
  perdidas: z.number(),
  totalExistente: z.number(),
  stockBajo: z.boolean()
});

// Register models
registry.register('Guardia', GuardiaSchema);
registry.register('Entrada', EntradaSchema);
registry.register('Salida', SalidaSchema);
registry.register('InventarioItem', InventarioItemSchema);

// Register paths
registry.registerPath({
  method: 'get',
  path: '/api/guardias',
  description: 'Get all guardias',
  responses: {
    200: {
      description: 'List of guardias',
      content: { 'application/json': { schema: z.array(GuardiaSchema) } }
    }
  }
});

registry.registerPath({
  method: 'get',
  path: '/api/inventario',
  description: 'Get total inventory calculations',
  responses: {
    200: {
      description: 'Inventario array',
      content: { 'application/json': { schema: z.array(InventarioItemSchema) } }
    }
  }
});

export const getOpenApiSpec = () => {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'SecureUniform API',
      description: 'API for SecureUniform Inventory Management',
    },
    servers: [{ url: 'http://localhost:3001' }],
  });
};
