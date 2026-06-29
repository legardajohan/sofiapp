import { connectDB } from './db.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import app from './app.js';

const start = async (): Promise<void> => {
  await connectDB();
  app.listen(env.PORT, () => {
    logger.info(`API en http://localhost:${env.PORT}`);
  });
};

start().catch((err) => {
  logger.error('Error al iniciar el servidor', { err });
  process.exit(1);
});
