import { ESTADOS_PAGO_TERMINALES } from '@sofiapp/shared';
import type { EstadoPago, EstadoPagoTerminal } from '@sofiapp/shared';

/** Funciones puras de la máquina de estados del pago: `PENDIENTE → terminal`, y de ahí no se sale. */

export function esTerminal(estado: EstadoPago): estado is EstadoPagoTerminal {
  return (ESTADOS_PAGO_TERMINALES as readonly string[]).includes(estado);
}

export function esTransicionValida(desde: EstadoPago, hacia: EstadoPago): boolean {
  return desde === 'PENDIENTE' && esTerminal(hacia);
}
