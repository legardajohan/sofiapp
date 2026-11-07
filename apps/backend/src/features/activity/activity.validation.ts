import { z } from 'zod';

// No hace falta `.optional()`: `validate.middleware` normaliza `req.body ?? {}` antes de parsear.
const empty = z.object({});

/**
 * El latido no lleva datos: quién late sale del token y cuándo, del reloj del servidor. Un cuerpo
 * con `tenantId`, `userId` o una hora se descarta en silencio — nada de lo que manda el navegador
 * puede mover el crédito.
 */
export const heartbeatSchema = z.object({ body: empty, params: empty, query: empty });
