import { z } from 'zod';

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
  params: z.object({}),
  query: z.object({}),
});

// AUTH-05: cambio de la propia contraseña, siempre con la actual.
export const changeOwnPasswordSchema = z.object({
  body: z
    .object({
      actual: z.string().min(1, 'Ingresa tu contraseña actual.').max(128),
      nueva: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(128),
    })
    .strict(),
  params: z.object({}),
  query: z.object({}),
});
