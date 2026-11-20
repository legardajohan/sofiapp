// Ventanas y prefijos de Redis de los limitadores de pagos (HT-PAY-05). El máximo sale de `env`;
// ventana y prefijo son constantes: cambiarlos es una decisión de código, no de despliegue.

export const LIMITE_WEBHOOK_PAGOS = { ventanaMs: 60_000, prefijo: 'rl:pagos:webhook:' } as const;

export const LIMITE_INTENTOS_PAGO = {
  ventanaMs: 10 * 60_000,
  prefijo: 'rl:pagos:intentos:',
} as const;
