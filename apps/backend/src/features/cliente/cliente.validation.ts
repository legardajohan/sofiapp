import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
// `.optional()` es obligatorio: en Express 5 `req.body` queda `undefined` cuando la petición no
// trae cuerpo (Express 4 lo inicializaba en `{}`), así que un `z.object({})` a secas rechaza
// cualquier GET/PATCH sin body con "Required".
const empty = z.object({}).optional();

export const historySchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
  }),
});

export const extractSchema = z.object({
  body: empty,
  params: z.object({ id: objectId }),
  query: empty,
});

export type HistoryQuery = z.infer<typeof historySchema>['query'];
