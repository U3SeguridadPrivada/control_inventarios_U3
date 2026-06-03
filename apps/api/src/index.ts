import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { registerRoutes } from './routes';
import { getOpenApiSpec } from './swagger';

const app = express();
const PORT = process.env.PORT || 3001;

// En desarrollo permite cualquier puerto localhost; en producción usa FRONTEND_URL
const allowedOrigin = (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
  if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin) || origin === process.env.FRONTEND_URL) {
    cb(null, true);
  } else {
    cb(new Error('CORS no permitido'));
  }
};

app.use(helmet());
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(getOpenApiSpec()));
app.get('/openapi.json', (_req, res) => res.json(getOpenApiSpec()));

registerRoutes(app);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler — catches any unhandled error thrown in route handlers
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Crash safeguard for unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
