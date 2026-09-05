import { env } from '../../config/env.js';

/**
 * Decisión del cortocircuito de FAQ (HU-KB-02-V2), en funciones **puras**.
 *
 * Por qué existe este módulo aparte del service: el score de coseno mide cercanía
 * TEMÁTICA, no intención. "¿A qué hora abren?" y "¿Cuál es el precio?" viven cerca en el
 * espacio vectorial porque hablan del mismo negocio, así que el mejor candidato puede
 * cruzar `FAQ_MATCH_THRESHOLD` siendo la FAQ equivocada. Dos señales más lo detectan sin
 * gastar un token: el **margen** sobre el segundo candidato y el **overlap léxico**.
 *
 * Todo aquí es total: no lanza, no toca Mongo ni la red, y el único `RegExp` es literal
 * (nunca se construye con texto del cliente). Es lo que permite que `matchFaq` siga
 * degradando a `{ matched: false }` ante cualquier fallo en vez de romper la conversación.
 */

export interface UmbralesFaqMatch {
  umbral: number;
  margenMinimo: number;
  overlapMinimo: number;
}

export interface SenalesFaqMatch {
  score: number;
  segundoScore?: number;
  margen: number;
  overlap: number;
  pasaUmbral: boolean;
  pasaMargen: boolean;
  pasaOverlap: boolean;
  /** Las tres señales en AND: ante la duda NO se cortocircuita. */
  aprobado: boolean;
}

/** Candidato ya reducido a lo que la decisión necesita. */
export interface CandidatoFaq {
  pregunta: string;
  score: number;
}

/**
 * Palabras que aparecen en casi toda pregunta y por tanto no distinguen una FAQ de otra.
 * Sin ellas, "¿cuál es el precio?" y "¿cuál es el horario?" compartirían tres tokens y el
 * overlap dejaría pasar justo la confusión que viene a bloquear.
 */
const PALABRAS_VACIAS: ReadonlySet<string> = new Set([
  'que', 'cual', 'cuales', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'como', 'donde', 'cuando',
  'por', 'para', 'con', 'sin', 'los', 'las', 'una', 'unos', 'unas', 'del', 'este', 'esta',
  'esto', 'ese', 'eso', 'hay', 'tiene', 'tienen', 'ser', 'son', 'estan', 'ustedes', 'usted',
  'mi', 'tu', 'su', 'sus', 'me', 'se', 'lo', 'al', 'si', 'no', 'muy', 'mas', 'ya', 'pero',
  'hasta', 'desde', 'sobre', 'ahi', 'alli', 'aqui', 'tambien', 'porque', 'hacer', 'puedo',
  'pueden', 'quiero', 'quisiera', 'necesito', 'saber', 'favor', 'hola', 'buenas', 'buenos',
]);

/** Por debajo de esto, lo que queda tras quitar las vacías es ruido ("de", "un", "yo"). */
const LARGO_MINIMO_TOKEN = 3;

/** Largo mínimo del prefijo para aceptar `hora` ↔ `horario` sin abrir la puerta a cualquier cosa. */
const LARGO_MINIMO_PREFIJO = 4;

/** Minúsculas y sin diacríticos, para que "asesoría" y "asesoria" comparen igual. */
function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Recorta el plural más común del español. No es un stemmer: son dos comparaciones de
 * string. Sin esto, "precios" y "precio" contarían como palabras distintas y la señal daría
 * falsos negativos absurdos.
 */
function raizAproximada(token: string): string {
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2); // meses → mes
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1); // precios → precio
  return token;
}

/** Palabras con carga semántica: sin tildes, sin vacías, sin tokens demasiado cortos. */
export function tokensSignificativos(texto: string): string[] {
  return normalizar(texto)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= LARGO_MINIMO_TOKEN && !PALABRAS_VACIAS.has(t));
}

/**
 * Dos tokens son la misma palabra si comparten raíz, o si uno es prefijo del otro con al
 * menos `LARGO_MINIMO_PREFIJO` caracteres ("hora" dentro de "horario"). Es deliberadamente
 * generoso: esta señal existe para bloquear temas ajenos, no para exigir literalidad.
 */
function coincidenTokens(a: string, b: string): boolean {
  const raizA = raizAproximada(a);
  const raizB = raizAproximada(b);
  if (raizA === raizB) return true;

  const [corta, larga] = raizA.length <= raizB.length ? [raizA, raizB] : [raizB, raizA];
  return corta.length >= LARGO_MINIMO_PREFIJO && larga.startsWith(corta);
}

/**
 * Coincidencia literal entre dos textos, en `[0,1]`.
 *
 * Se divide por el conjunto MENOR y no por la unión: la pregunta del cliente suele ser mucho
 * más corta que la de la FAQ, y castigar esa diferencia de longitud bloquearía matches buenos.
 * Si alguno de los dos no aporta ninguna palabra significativa, no hay evidencia léxica → 0.
 */
export function overlapLexico(a: string, b: string): number {
  const tokensA = tokensSignificativos(a);
  const tokensB = tokensSignificativos(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const [menor, mayor] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const coincidencias = menor.filter((t) => mayor.some((o) => coincidenTokens(t, o))).length;
  return coincidencias / menor.length;
}

/** Los tres mínimos vigentes. Único punto de lectura de `env`, para no dispersar umbrales. */
export function umbralesDesdeEnv(): UmbralesFaqMatch {
  return {
    umbral: env.FAQ_MATCH_THRESHOLD,
    margenMinimo: env.FAQ_MATCH_MIN_MARGIN,
    overlapMinimo: env.FAQ_MATCH_MIN_OVERLAP,
  };
}

/**
 * Evalúa las tres señales sobre el mejor candidato.
 *
 * **Sin segundo candidato el margen es el score entero**: un tenant con una sola FAQ activa
 * no tiene ambigüedad que medir, y bloquearlo dejaría el feature inútil justo al arrancar.
 */
export function evaluarSenales(
  preguntaEntrante: string,
  mejor: CandidatoFaq,
  segundoScore: number | undefined,
  umbrales: UmbralesFaqMatch,
): SenalesFaqMatch {
  const margen = segundoScore === undefined ? mejor.score : mejor.score - segundoScore;
  const overlap = overlapLexico(preguntaEntrante, mejor.pregunta);

  const pasaUmbral = mejor.score >= umbrales.umbral;
  const pasaMargen = margen >= umbrales.margenMinimo;
  const pasaOverlap = overlap >= umbrales.overlapMinimo;

  return {
    score: mejor.score,
    segundoScore,
    margen,
    overlap,
    pasaUmbral,
    pasaMargen,
    pasaOverlap,
    aprobado: pasaUmbral && pasaMargen && pasaOverlap,
  };
}
