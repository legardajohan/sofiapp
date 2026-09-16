import { z } from 'zod';
import { MESSAGING_TIERS, QUALITY_RATINGS } from './channel.types.js';

export const connectSchema = z.object({
  body: z.object({
    wabaId: z.string().min(1),
    phoneNumberId: z.string().min(1),
    accessToken: z.string().min(1),
  }),
  params: z.object({}),
  query: z.object({}),
});

/** Sin cuerpo: el número a sondear es el del canal del tenant, que nace del token. */
export const syncTierSchema = z.object({
  body: z.object({}).strict(),
  params: z.object({}),
  query: z.object({}),
});

/**
 * Override manual (HU-MARK-01). `.strict()` y `.refine()` por el mismo motivo que en los catálogos:
 * un `PATCH` vacío respondería `200` sin haber cambiado nada y parecería que se guardó.
 */
export const updateTierSchema = z.object({
  body: z
    .object({
      messagingTier: z.enum(MESSAGING_TIERS).optional(),
      qualityRating: z.enum(QUALITY_RATINGS).optional(),
    })
    .strict()
    .refine((b) => b.messagingTier !== undefined || b.qualityRating !== undefined, {
      message: 'No hay nada que cambiar: envía «messagingTier» o «qualityRating».',
    }),
  params: z.object({}),
  query: z.object({}),
});

export type UpdateTierBody = z.infer<typeof updateTierSchema>['body'];
