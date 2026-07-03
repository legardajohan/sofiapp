import type { ErrorRequestHandler } from 'express';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  logger.error('Unhandled error', { error: String(err) });
  res.status(500).json({ message: 'Error interno del servidor.' });
};
