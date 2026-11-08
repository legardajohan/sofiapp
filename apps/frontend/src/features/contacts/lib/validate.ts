import type { AtributoInput } from '../types.js';

/**
 * Validación del formulario de la ficha. Vive fuera del componente para que el diálogo se ocupe solo
 * de pintar: las reglas son de dominio y se leen mejor juntas que repartidas entre `onChange`.
 *
 * Es un espejo de lo que valida el backend (`cliente.validation.ts`), no un sustituto. El servidor
 * sigue siendo la autoridad; esto solo evita el viaje de ida y vuelta para decir algo que ya se
 * sabía antes de enviarlo.
 */

/** Errores de una fila de atributo, indexados por su posición en la lista. */
export type ErroresAtributos = Record<number, string>;

export interface ErroresFormulario {
  nombre?: string;
  telefono?: string;
  correo?: string;
  atributos: ErroresAtributos;
}

/** Mismo formato que acepta el backend: dígitos con indicativo, sin `+` ni separadores. */
const TELEFONO = /^\d{7,15}$/;

/**
 * Suficiente para atajar el error de dedo ("ana@", "ana empresa.com") antes de gastar una petición.
 * La comprobación seria la hace `z.string().email()` en el backend: duplicar aquí su gramática
 * completa solo conseguiría que las dos versiones se desincronicen.
 */
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Una fila en blanco es una que se agregó y no se llegó a usar: se descarta, no es un error. */
export function estaVacio(atributo: AtributoInput): boolean {
  return atributo.key === '' && atributo.valor.trim() === '';
}

function validarAtributos(atributos: AtributoInput[]): ErroresAtributos {
  const errores: ErroresAtributos = {};
  const vistos = new Map<string, number>();

  atributos.forEach((atributo, i) => {
    if (estaVacio(atributo)) return;

    // Media fila escrita no se descarta en silencio: quien tecleó algo y ve la fila desaparecer al
    // guardar no sabe si se guardó mal o si nunca existió.
    if (atributo.key === '') {
      errores[i] = 'Elige a qué campo pertenece este valor.';
      return;
    }
    if (atributo.valor.trim() === '') {
      errores[i] = 'Ponle un valor o quita el campo.';
      return;
    }

    // Un campo, un valor por contacto (HU-FLOW-05): lo identifica la clave del catálogo, no el texto.
    const previo = vistos.get(atributo.key);
    if (previo !== undefined) {
      errores[i] = `Ya hay un valor para "${atributos[previo]?.label.trim() || atributo.key}".`;
      return;
    }
    vistos.set(atributo.key, i);
  });

  return errores;
}

export function validarFicha(
  campos: { nombre: string; telefono: string; correo: string; atributos: AtributoInput[] },
  /** Nombre que el contacto tiene guardado: define si vaciar el campo es borrar algo o no. */
  nombreGuardado: string | null,
): ErroresFormulario {
  const errores: ErroresFormulario = { atributos: validarAtributos(campos.atributos) };

  // El teléfono nunca puede quedar vacío: es obligatorio en el documento y es por donde se contacta
  // a la persona. Se valida el formato aparte para poder decir cuál de las dos cosas falla.
  const telefono = campos.telefono.trim();
  if (telefono === '') {
    errores.telefono = 'El teléfono no puede quedar vacío.';
  } else if (!TELEFONO.test(telefono)) {
    errores.telefono = 'Solo dígitos, con indicativo y sin «+»: 573001112233.';
  }

  // El nombre solo se exige cuando había uno: un contacto que llegó por WhatsApp sin nombre puede
  // seguir sin él, pero borrar el que ya estaba lo dejaría irreconocible en la bandeja.
  if (campos.nombre.trim() === '' && (nombreGuardado ?? '') !== '') {
    errores.nombre = 'El nombre no puede quedar vacío.';
  }

  const correo = campos.correo.trim();
  if (correo !== '' && !CORREO.test(correo)) {
    errores.correo = 'Escribe un correo válido, como ana@empresa.com.';
  }

  return errores;
}

export function hayErrores(errores: ErroresFormulario): boolean {
  return (
    errores.nombre !== undefined ||
    errores.telefono !== undefined ||
    errores.correo !== undefined ||
    Object.keys(errores.atributos).length > 0
  );
}
