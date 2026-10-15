import { AppError } from '../../utils/AppError.js';
import type { IParametroDinamico } from './campaign.types.js';

/** Lo mínimo del destinatario que hace falta para resolver sus variables. */
export interface IContactoParametros {
  nombre?: string | null;
  telefono: string;
}

/**
 * Parámetros finales de la plantilla para UN destinatario (HU-MARK-05).
 *
 * Cada parámetro dinámico toma el dato del contacto; si el contacto no lo tiene (o es solo
 * espacios), queda el texto de respaldo guardado en `parametros[indice]`. Meta rechaza un
 * parámetro vacío, así que el respaldo no es cosmético: sin él ese envío fallaría.
 */
export function resolverParametros(
  parametros: readonly string[],
  dinamicos: readonly IParametroDinamico[],
  contacto: IContactoParametros,
): string[] {
  const resueltos = [...parametros];
  for (const { indice, campo } of dinamicos) {
    const valor = contacto[campo]?.trim();
    if (valor && indice < resueltos.length) resueltos[indice] = valor;
  }
  return resueltos;
}

/**
 * Coherencia entre los parámetros y sus variables, con los valores **finales** de la campaña.
 *
 * Va en el service y no solo en Zod porque al reprogramar puede cambiar uno sin el otro: quitar
 * parámetros dejaría variables apuntando a un `{{n}}` que ya no existe.
 */
export function assertParametrosDinamicos(
  parametros: readonly string[],
  dinamicos: readonly IParametroDinamico[],
): void {
  const vistos = new Set<number>();
  for (const { indice } of dinamicos) {
    if (indice >= parametros.length) {
      throw new AppError('Una variable de contacto apunta a un parámetro que no existe.', 400, {
        indice,
      });
    }
    if (vistos.has(indice)) {
      throw new AppError('Un parámetro solo puede tener una variable de contacto.', 400, { indice });
    }
    if (!parametros[indice]?.trim()) {
      throw new AppError(
        'Indica qué texto usar cuando el contacto no tenga el dato de la variable.',
        400,
        { indice },
      );
    }
    vistos.add(indice);
  }
}
