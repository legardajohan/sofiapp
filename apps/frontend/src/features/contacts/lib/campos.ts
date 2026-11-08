import type { CampoContactoDTO } from '../types.js';

/**
 * Nombres que un campo personalizado NO puede usar: ya existen como datos fijos del contacto. Espejo
 * de `CLAVES_RESERVADAS` del backend (que sigue siendo quien manda): se repite aquí solo para avisar
 * en el campo ANTES de enviar, en vez de dejar al usuario esperando un 400.
 */
const RESERVADOS = new Set([
  'nombre',
  'name',
  'correo',
  'email',
  'documento',
  'telefono',
  'celular',
  'rol',
  'rolcontacto',
  'nivelinteres',
  'objecionprincipal',
]);

/** Minúsculas, sin tildes y sin espacios repetidos: como lee un nombre una persona. */
export function normalizarNombre(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Error de un nombre de campo antes de enviarlo, o `null` si está bien. `idPropio` excluye al propio
 * campo al renombrarlo (puede conservar su nombre con otra mayúscula).
 */
export function validarNombreCampo(
  label: string,
  existentes: CampoContactoDTO[],
  idPropio?: string,
): string | null {
  const limpio = label.trim();
  if (!limpio) return 'El campo necesita un nombre.';
  if (limpio.length > 60) return 'El nombre no puede superar los 60 caracteres.';

  const sinSeparadores = normalizarNombre(limpio).replace(/[^a-z0-9]/g, '');
  if (RESERVADOS.has(sinSeparadores)) {
    return `«${limpio}» ya es un dato fijo del contacto: elígelo en «Dato del contacto».`;
  }

  const normalizado = normalizarNombre(limpio);
  const repetido = existentes.some((c) => c.id !== idPropio && normalizarNombre(c.label) === normalizado);
  if (repetido) return 'Ya existe un campo con ese nombre.';
  return null;
}
