import type { IResumenIA, IResumenResponse } from './cliente.types.js';

/**
 * Forma mínima de un `Cliente` (lean) para proyectar su resumen. Se pide justo esto y no el
 * documento entero para que quien la use pueda proyectar solo estos dos campos en la consulta.
 */
export interface IResumenSource {
  resumenIA?: IResumenIA;
  ultimoMensajeAt?: Date;
}

/**
 * El resumen queda desactualizado si llegaron mensajes después de generarlo.
 *
 * Vive en un mapper y no en `cliente.service` porque lo consume también el listado de leads
 * (HU-CRM-03), y `cliente.service` ya importa de `lead.service` (`findLeadIdsByClientes`): tenerlo
 * allí obligaría a un ciclo de imports en tiempo de ejecución. La regla de `desactualizado` sigue
 * teniendo un solo dueño, que es lo que importa.
 */
export function toResumenResponse(c: IResumenSource): IResumenResponse | null {
  if (!c.resumenIA) return null;
  const desactualizado = !!c.ultimoMensajeAt && c.ultimoMensajeAt > c.resumenIA.mensajesHasta;
  return {
    texto: c.resumenIA.texto,
    generadoAt: c.resumenIA.generadoAt.toISOString(),
    desactualizado,
  };
}
