import { z } from 'zod';

/** Validador reutilizable de ObjectId de Mongo (24 hex). Fuente única para todos los features. */
export const objectIdSchema = z.string().length(24).regex(/^[0-9a-f]{24}$/i, 'ID inválido');
