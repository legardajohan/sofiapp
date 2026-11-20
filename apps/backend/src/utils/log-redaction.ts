// Redacción de datos sensibles en los logs (HT-PAY-05). Defensa en profundidad: la regla sigue
// siendo no registrar PII ni secretos; esto cubre lo que se cuele.
//
// La lista de claves es EXACTA (nombre normalizado), no por subcadena: «cualquier clave que
// contenga `key`» rompería logs legítimos (`key` de la media huérfana, `tokens` de uso de IA).

export const MARCA_REDACTADO = '[REDACTADO]';
const MARCA_CIRCULAR = '[CIRCULAR]';
const MARCA_PROFUNDO = '[PROFUNDO]';
const PROFUNDIDAD_MAXIMA = 8;

/** Claves YA normalizadas (minúsculas, sin `_` ni `-`). */
export const CLAVES_REDACTADAS: ReadonlySet<string> = new Set([
  'authorization',
  'cookie',
  'setcookie',
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'acceptancetoken',
  'acceptpersonalauth',
  'secret',
  'apikey',
  'privatekey',
  'eventssecret',
  'integritysecret',
  'signature',
  'checksum',
  'xeventchecksum',
  'customeremail',
  'email',
  'correo',
  'telefono',
  'phone',
  'phonenumber',
  'documento',
  'legalid',
]);

export function normalizarClave(clave: string): string {
  return clave.toLowerCase().replace(/[_-]/g, '');
}

const PATRONES_VALOR: readonly RegExp[] = [
  /\b(?:prv|pub)_(?:test|prod)_[A-Za-z0-9]+/g,
  /\b(?:test|prod)_(?:events|integrity)_[A-Za-z0-9]+/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/g,
  /eyJ[\w-]+\.[\w-]+\.[\w-]+/g,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
];

/** Sustituye las porciones sensibles de un texto; el resto queda intacto. */
export function redactarTexto(texto: string): string {
  let salida = texto;
  for (const patron of PATRONES_VALOR) salida = salida.replace(patron, MARCA_REDACTADO);
  return salida;
}

function redactarValor(valor: unknown, profundidad: number, vistos: WeakSet<object>): unknown {
  if (typeof valor === 'string') return redactarTexto(valor);
  if (valor === null || typeof valor !== 'object') return valor;
  if (valor instanceof Date) return valor;
  if (valor instanceof Error) {
    return { name: valor.name, message: redactarTexto(valor.message) };
  }
  if (profundidad >= PROFUNDIDAD_MAXIMA) return MARCA_PROFUNDO;
  if (vistos.has(valor)) return MARCA_CIRCULAR;

  vistos.add(valor);
  try {
    if (Array.isArray(valor)) {
      return valor.map((v) => redactarValor(v, profundidad + 1, vistos));
    }
    const salida: Record<string, unknown> = {};
    for (const clave of Object.keys(valor)) {
      if (CLAVES_REDACTADAS.has(normalizarClave(clave))) {
        salida[clave] = MARCA_REDACTADO;
        continue;
      }
      try {
        salida[clave] = redactarValor(
          (valor as Record<string, unknown>)[clave],
          profundidad + 1,
          vistos,
        );
      } catch {
        // Un getter que lanza no debe tumbar el log: ese valor se oculta.
        salida[clave] = MARCA_REDACTADO;
      }
    }
    return salida;
  } finally {
    // Solo hay «circular» sobre el camino actual: un objeto repetido en ramas hermanas no lo es.
    vistos.delete(valor);
  }
}

/** Copia profunda redactada. No muta la entrada y nunca lanza. */
export function redactar(valor: unknown): unknown {
  try {
    return redactarValor(valor, 0, new WeakSet<object>());
  } catch {
    return MARCA_REDACTADO;
  }
}
