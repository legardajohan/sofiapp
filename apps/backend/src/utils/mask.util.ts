/**
 * Enmascarado de los datos sensibles del contacto para los subroles no autorizados (HU-CRM-02).
 *
 * La regla de diseño es la misma en los tres casos: dejar visible lo justo para que el usuario
 * **sepa que el dato existe** y pueda cotejarlo, sin poder leerlo ni copiarlo. Un campo vaciado
 * sería peor que enmascarado — el asesor volvería a pedir un dato que ya está registrado.
 */

export const MASK_VALOR = '••••••';

/**
 * `diego@empresa.com` → `d••••@empresa.com`. El dominio no se oculta a propósito: permite
 * confirmar "sí, ya tenemos su correo corporativo" sin revelar la cuenta.
 */
export function maskCorreo(correo: string): string {
  const at = correo.lastIndexOf('@');
  if (at <= 0) return MASK_VALOR;

  const usuario = correo.slice(0, at);
  const dominio = correo.slice(at);
  // Con un solo carácter antes de la arroba no hay nada que revelar sin revelarlo todo.
  const inicial = usuario.length > 1 ? usuario[0] : '';

  return `${inicial}••••${dominio}`;
}

/** `1085271234` → `••••1234`. Los últimos 4 permiten cotejar contra un soporte sin exponer el número. */
export function maskDocumento(documento: string): string {
  if (documento.length <= 4) return MASK_VALOR;
  return `••••${documento.slice(-4)}`;
}
