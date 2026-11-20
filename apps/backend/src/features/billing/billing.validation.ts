import { z } from 'zod';

/** `SOFI-` + 24 caracteres base32 (RFC 4648, sin padding). 120 bits de `randomBytes`. */
export const REFERENCIA_REGEX = /^SOFI-[A-Z2-7]{24}$/;

/** Para `GET /api/billing/intentos/:reference` (HU-BILL-02). */
export const referenceParamSchema = z.object({
  params: z.object({ reference: z.string().regex(REFERENCIA_REGEX) }),
});
