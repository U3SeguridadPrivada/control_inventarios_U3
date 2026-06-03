import { Express } from 'express';
import { requireAuth } from '../middleware/auth';
import authRouter from './auth';
import guardiasRouter from './guardias';
import entradasRouter from './entradas';
import salidasRouter from './salidas';
import bajasRouter from './bajas';
import dashboardRouter from './dashboard';
import inventarioRouter from './inventario';
import uniformesCampoRouter from './uniformes_campo';

export const registerRoutes = (app: Express) => {
  // Auth — pública (login) y protegida (register, me)
  app.use('/api/auth', authRouter);

  // Todos los demás endpoints requieren estar autenticado
  app.use('/api/guardias', requireAuth, guardiasRouter);
  app.use('/api/entradas', requireAuth, entradasRouter);
  app.use('/api/salidas', requireAuth, salidasRouter);
  app.use('/api/bajas', requireAuth, bajasRouter);
  app.use('/api/dashboard', requireAuth, dashboardRouter);
  app.use('/api/inventario', requireAuth, inventarioRouter);
  app.use('/api/uniformes-campo', requireAuth, uniformesCampoRouter);
};
