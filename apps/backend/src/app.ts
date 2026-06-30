import express, { type Express } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/error-handler.middleware.js';
import { logger } from './utils/logger.js';

const app: Express = express();

app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// Montaje de routers (se añaden en features posteriores)

app.use(errorHandler);

const PORT = env.PORT;
app.listen(PORT, () => {
  logger.info(`Proceso WEB escuchando en http://localhost:${PORT}`);
});

export default app;
