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

/**
 * Resultado del popup de Meta (HT-WA-03). `.strict()`: si alguien reintenta mandar un `accessToken`
 * por aquí, es un error del cliente y no se ignora en silencio.
 */
export const embeddedSignupSchema = z.object({
  body: z
    .object({
      code: z.string().min(1),
      wabaId: z.string().min(1),
      phoneNumberId: z.string().min(1),
    })
    .strict(),
  params: z.object({}),
  query: z.object({}),
});

/** El PIN solo viaja cuando Meta pidió el que el número ya tenía (422 `pin_required`). */
export const activateSchema = z.object({
  body: z
    .object({
      pin: z.string().regex(/^\d{6}$/, 'El PIN tiene 6 dígitos.').optional(),
    })
    .strict(),
  params: z.object({}),
  query: z.object({}),
});

export type EmbeddedSignupBody = z.infer<typeof embeddedSignupSchema>['body'];
export type ActivateBody = z.infer<typeof activateSchema>['body'];

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
