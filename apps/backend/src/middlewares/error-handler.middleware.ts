import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    // Errores con `code` de negocio llevan un envelope estructurado (`success/code/data`);
    // el resto conserva la forma mínima `{ message }` de siempre.
    if (err.code) {
      res.status(err.statusCode).json({
        success: false,
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { data: err.details } : {}),
      });
      return;
    }
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      message: 'Error de validación.',
      errors: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  // Clave única duplicada de Mongo (E11000): es un conflicto del cliente, no un fallo del servidor.
  // Se responde 409 en vez de 500 para toda la app (planes, tenants, etc.).
  if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000) {
    res.status(409).json({ message: 'Ya existe un registro con un valor único duplicado.' });
    return;
  }

  logger.error('Unhandled error', { error: String(err) });
  res.status(500).json({ message: 'Error interno del servidor.' });
};
