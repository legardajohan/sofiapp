// Validación de las variables de Wompi (HT-PAY-01). Función pura: los tests la invocan sin tocar
// `process.env`, y `env.ts` solo traduce su resultado a issues de Zod.

export type ClaveWompi =
  | 'WOMPI_PUBLIC_KEY'
  | 'WOMPI_PRIVATE_KEY'
  | 'WOMPI_EVENTS_SECRET'
  | 'WOMPI_INTEGRITY_SECRET';

export const PREFIJOS_WOMPI: Readonly<
  Record<'sandbox' | 'production', Readonly<Record<ClaveWompi, string>>>
> = {
  sandbox: {
    WOMPI_PUBLIC_KEY: 'pub_test_',
    WOMPI_PRIVATE_KEY: 'prv_test_',
    WOMPI_EVENTS_SECRET: 'test_events_',
    WOMPI_INTEGRITY_SECRET: 'test_integrity_',
  },
  production: {
    WOMPI_PUBLIC_KEY: 'pub_prod_',
    WOMPI_PRIVATE_KEY: 'prv_prod_',
    WOMPI_EVENTS_SECRET: 'prod_events_',
    WOMPI_INTEGRITY_SECRET: 'prod_integrity_',
  },
};

export interface EntornoPagos {
  PAYMENTS_PROVIDER: 'wompi' | 'stub';
  WOMPI_ENV: 'sandbox' | 'production';
  WOMPI_PUBLIC_KEY?: string | undefined;
  WOMPI_PRIVATE_KEY?: string | undefined;
  WOMPI_EVENTS_SECRET?: string | undefined;
  WOMPI_INTEGRITY_SECRET?: string | undefined;
  WOMPI_REDIRECT_URL?: string | undefined;
}

export interface IncidenciaEntorno {
  path: string;
  message: string;
}

const CLAVES_CON_PREFIJO: readonly ClaveWompi[] = [
  'WOMPI_PUBLIC_KEY',
  'WOMPI_PRIVATE_KEY',
  'WOMPI_EVENTS_SECRET',
  'WOMPI_INTEGRITY_SECRET',
];

/**
 * Lista de incidencias; vacía si es válido o si el provider es `stub`. Los mensajes NUNCA incluyen
 * el valor de la variable: un secreto mal pegado no debe acabar en el log de arranque.
 */
export function validarEntornoPagos(valores: EntornoPagos): IncidenciaEntorno[] {
  if (valores.PAYMENTS_PROVIDER !== 'wompi') return [];

  const incidencias: IncidenciaEntorno[] = [];
  for (const clave of CLAVES_CON_PREFIJO) {
    const valor = valores[clave];
    if (!valor) {
      incidencias.push({ path: clave, message: 'Obligatoria cuando PAYMENTS_PROVIDER=wompi.' });
      continue;
    }
    const prefijo = PREFIJOS_WOMPI[valores.WOMPI_ENV][clave];
    if (!valor.startsWith(prefijo)) {
      incidencias.push({
        path: clave,
        message: `No corresponde a WOMPI_ENV=${valores.WOMPI_ENV}: debe empezar por "${prefijo}".`,
      });
    }
  }
  if (!valores.WOMPI_REDIRECT_URL) {
    incidencias.push({
      path: 'WOMPI_REDIRECT_URL',
      message: 'Obligatoria cuando PAYMENTS_PROVIDER=wompi.',
    });
  }
  return incidencias;
}
