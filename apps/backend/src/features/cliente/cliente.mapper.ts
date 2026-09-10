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
 *
 * Desde HU-IA-04 es un **dato sensible** (ADR-0006, enmienda): lo escribe el modelo sobre el
 * transcript completo, así que puede citar en claro el correo o el documento que `toContactCard`
 * enmascara. Y al ser prosa no se puede enmascarar por partes —el mismo argumento con el que
 * ADR-0006 cerró las notas—, así que se omite entero en vez de recortarlo.
 *
 * El default es `false` igual que en `toContactCard` y `toDatosExtraidosResponse`: si mañana
 * aparece un tercer sitio que proyecte el resumen y su autor olvide pasar el permiso, el fallo es
 * ocultar de más, nunca filtrar.
 */
export function toResumenResponse(
  c: IResumenSource,
  puedeVerSensibles = false,
): IResumenResponse | null {
  if (!c.resumenIA || !puedeVerSensibles) return null;
  const desactualizado = !!c.ultimoMensajeAt && c.ultimoMensajeAt > c.resumenIA.mensajesHasta;
  return {
    texto: c.resumenIA.texto,
    generadoAt: c.resumenIA.generadoAt.toISOString(),
    desactualizado,
  };
}
