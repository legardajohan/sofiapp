# HU-KB-02-V2 — Plan técnico (CÓMO)

> El QUÉ está en `spec.md`; la ejecución en `tasks.md`. Este documento fija archivos y contratos.
> No redefine reglas: el aislamiento se rige por `docs/multi-tenancy.md` y el patrón de feature por
> `apps/backend/CLAUDE.md`.
>
> **Rama:** `feat/HU-IA-01` (la actual). No se crea rama nueva.

## Estado base verificado (antes de planear)

Los filtros del `CLAUDE.md` raíz (`--filter backend`) no matchean ningún paquete; los nombres reales
de los workspaces son **`@sofiapp/api`** y **`@sofiapp/web`**.

| Comando | Resultado |
|---|---|
| `pnpm --filter @sofiapp/api typecheck` | ✅ verde |
| `pnpm --filter @sofiapp/api test` | ✅ verde — **86 archivos, 850 tests**, 112 s |

## Decisiones de diseño

| Decisión | Elección | Por qué |
|---|---|---|
| Combinación de señales | **AND estricto** de umbral + margen + overlap | Un falso negativo cuesta tokens; un falso positivo cuesta credibilidad frente al prospecto. La asimetría manda: ante la duda, no se cortocircuita |
| Sin segundo candidato | La señal de margen **pasa** | Un tenant con una sola FAQ activa no tiene ambigüedad que medir; bloquearlo dejaría el feature inútil justo al arrancar |
| Dónde vive la lógica nueva | Módulo **puro** `kb-faq.matching.ts` | El service queda delgado (`clean-code-solid`); la parte con reglas es testeable sin mocks, sin Mongo y sin Gemini |
| Cálculo del overlap | Sobre el conjunto **menor** de tokens | Acota el resultado a `[0,1]` aunque una pregunta sea mucho más larga que la otra; un cociente sobre la unión (Jaccard) castiga injustamente a la FAQ larga |
| Tolerancia morfológica | Plural recortado + prefijo ≥ 4 | `precios`↔`precio` y `hora`↔`horario` son la misma palabra para un prospecto; sin esto la señal daría falsos negativos absurdos. Cuesta dos comparaciones de string, no un stemmer |
| `numCandidates` | `2 × 20 = 40` | Conserva el ratio 20× que ya tenía con `limit: 1`; Atlas necesita explorar un vecindario amplio para que el "segundo" sea el segundo de verdad |
| Orden de los candidatos | El **service** reordena por score | No se asume el orden de salida de Atlas: con dos elementos, ordenar es gratis y elimina una suposición |
| Reutilizar `normalizar` de `ai-handoff` | **No**: se reescribe local | Es privado de otro feature y son tres líneas; cruzar dos dominios por un helper así acopla features que no tienen nada que ver |

## Archivos a crear / tocar

```
apps/backend/src/
├── features/kb-faq/
│   ├── kb-faq.matching.ts          # NUEVO — módulo PURO: tokens, overlap, evaluación de señales
│   ├── kb-faq.matching.test.ts     # NUEVO — unit test del módulo puro, sin mocks
│   ├── kb-faq.repository.ts        # TOCAR — limit 1 → 2, numCandidates 20 → 40
│   ├── kb-faq.repository.test.ts   # TOCAR — el caso "un solo candidato" pasa a dos
│   ├── kb-faq.service.ts           # TOCAR — matchFaq y testFaq consumen las 3 señales
│   ├── kb-faq.service.test.ts      # TOCAR — bloque «horarios vs precios» + testFaq
│   ├── kb-faq.types.ts             # TOCAR — FaqTestSenales + campos nuevos en FaqTestResult
│   └── kb-faq.routes.test.ts       # TOCAR — el probador expone los tres mínimos
└── config/env.ts                   # TOCAR — 2 envs nuevas con su comentario de calibración

apps/frontend/src/features/knowledge-base/
├── types/faq.ts                    # TOCAR — espejo de FaqTestResult
└── components/FaqTester.tsx        # TOCAR — diagnóstico de las tres señales
```

**No se tocan** (y es parte del criterio 8 del spec): `kb-faq.model.ts`, `kb-faq.validation.ts`,
`kb-faq.controller.ts`, `kb-faq.routes.ts`, `services/ai/ai.service.ts`,
`services/ai/ai-service.types.ts`, `services/ai/ai-usage-log.model.ts`,
`scripts/create-kb-faq-vector-index.ts`. El refuerzo es interno a `matchFaq`.

**No hay `.env.example`** en el repo: las envs se documentan únicamente en los comentarios de
`config/env.ts`, que es el patrón vigente.

## Contratos

### `config/env.ts`

Dos líneas nuevas en el bloque «FAQ semántica (HU-KB-02)», justo tras `FAQ_MATCH_THRESHOLD`:

```ts
  // Margen mínimo del mejor candidato sobre el segundo (HU-KB-02-V2). MISMA escala normalizada que
  // FAQ_MATCH_THRESHOLD, así que 0.02 aquí ≈ 0.04 de coseno crudo. Cuando dos FAQs de temas
  // distintos compiten por la misma pregunta ("¿a qué hora abren?" contra horarios Y contra
  // precios) quedan empatadas dentro de esa franja: ahí el embedding está midiendo tema, no
  // intención, y responder literal es apostar. Sin segundo candidato (tenant con una sola FAQ) la
  // señal pasa: no hay ambigüedad que medir. Calibrar con POST /api/kb/faqs/test, nunca a ojo.
  FAQ_MATCH_MIN_MARGIN: z.coerce.number().min(0).max(1).default(0.02),
  // Coincidencia léxica mínima entre la pregunta entrante y la de la FAQ, medida sobre el conjunto
  // MÁS PEQUEÑO de tokens significativos (sin tildes, sin palabras vacías, con el plural recortado).
  // 0.2 ≈ "al menos una palabra clave de cada cinco". No cuesta ni una llamada a Gemini: es
  // texto→tokens. Escala propia, SIN relación con FAQ_MATCH_THRESHOLD. Deliberadamente severo: un
  // falso negativo solo manda la pregunta al LLM —que la responde igual, pagando tokens—; un falso
  // positivo manda al prospecto una respuesta literal equivocada. Súbelo si aún se cuelan
  // confusiones; bájalo si se pierden paráfrasis legítimas.
  FAQ_MATCH_MIN_OVERLAP: z.coerce.number().min(0).max(1).default(0.2),
```

### `kb-faq.repository.ts` — pipeline `$vectorSearch`

Único cambio del archivo. **El núcleo de aislamiento no se toca**: el comentario de cabecera del
archivo sigue siendo cierto palabra por palabra.

```ts
/**
 * El mejor candidato Y su rival inmediato: sin el segundo no hay margen que medir, y el margen es
 * lo que distingue "esta FAQ responde la pregunta" de "estas dos FAQs hablan del mismo tema".
 */
const CANDIDATOS_A_COMPARAR = 2;

const vectorStage = {
  $vectorSearch: {
    index: env.FAQ_VECTOR_INDEX,
    path: 'embedding',
    queryVector,
    // Mismo ratio 20× que tenía con un solo candidato: Atlas necesita explorar un vecindario
    // amplio para que el "segundo" sea el segundo de verdad y no un vecino cualquiera.
    numCandidates: CANDIDATOS_A_COMPARAR * 20,
    limit: CANDIDATOS_A_COMPARAR,
    filter: { tenantId: tid, activo: true },
  },
} as unknown as PipelineStage;
```

Etapas posteriores **idénticas**: `$match: { tenantId: tid, activo: true }` (defensivo) →
`$addFields: { score: { $meta: 'vectorSearchScore' } }` → `$project: { embedding: 0 }`.

`faqVectorSearchScoped` no cambia de firma: sigue devolviendo `Promise<ScoredFaq[]>`, ahora con
hasta dos elementos.

### `kb-faq.matching.ts` — NUEVO, puro

Sin imports de Mongoose, sin red, sin `ILlmProvider`. Solo `env` para los mínimos.

```ts
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
  aprobado: boolean;              // las tres, en AND
}

/** Los tres mínimos vigentes. Un solo punto de lectura de `env`, para no dispersar umbrales. */
export function umbralesDesdeEnv(): UmbralesFaqMatch;

/** Palabras con carga semántica: sin tildes, sin vacías, sin tokens de menos de 3 caracteres. */
export function tokensSignificativos(texto: string): string[];

/** Coincidencia literal entre dos textos, en [0,1]. Cero si alguno no aporta tokens. */
export function overlapLexico(a: string, b: string): number;

export function evaluarSenales(
  preguntaEntrante: string,
  mejor: { pregunta: string; score: number },
  segundoScore: number | undefined,
  umbrales: UmbralesFaqMatch,
): SenalesFaqMatch;
```

**Tokenización** (misma idea que el `normalizar` de `ai-handoff.service.ts:266`, reescrito local):

1. `texto.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')`
2. partir por `/[^\p{L}\p{N}]+/u` y descartar vacíos
3. descartar palabras vacías del español — constante `PALABRAS_VACIAS: ReadonlySet<string>` con
   `que, cual, cuales, cuanto, cuanta, cuantos, cuantas, como, donde, cuando, por, para, con, sin,
   los, las, una, unos, unas, del, este, esta, esto, eso, hay, tiene, tienen, ser, son, esta, estan,
   ustedes, mi, tu, su, sus, me, se, lo, al, si, no, muy, mas, ya, pero, hasta, desde, sobre`
4. descartar tokens de menos de 3 caracteres (después de quitar las vacías, lo que queda corto es
   ruido: `de`, `un`, `yo`)

**Coincidencia entre dos tokens** — `coincidenTokens(a, b): boolean`:

```ts
/** Recorta el plural más común del español. No es un stemmer: es dos comparaciones de string. */
function raizAproximada(token: string): string {
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);  // meses → mes
  if (token.length > 3 && token.endsWith('s'))  return token.slice(0, -1);  // precios → precio
  return token;
}
```

Coinciden si las raíces son iguales **o** una raíz es prefijo de la otra con la más corta de
longitud ≥ 4 (`hora` ↔ `horario`, `cost` ↔ `costo`). El mínimo de 4 evita que prefijos genéricos
disparen coincidencias falsas.

**Overlap**: `menor` y `mayor` son los dos conjuntos ordenados por tamaño;

```
overlap = |{ t ∈ menor : ∃ o ∈ mayor, coincidenTokens(t, o) }| / |menor|
```

Contar sobre el **menor** garantiza `[0,1]`. Si `menor` está vacío → `0`.

**Margen**: `segundoScore === undefined ? score : score - segundoScore`. Sin rival, margen pleno.

**Totalidad.** Ninguna de estas funciones lanza: el único `RegExp` es literal (nunca se construye con
texto del usuario), no hay acceso a índices sin comprobar, no hay división por cero (el caso
`|menor| === 0` retorna antes). Es lo que sostiene el criterio 7 del spec.

### `kb-faq.service.ts`

```ts
/** Los dos mejores candidatos del tenant, ordenados por score descendente. */
async function candidatosOrdenados(
  tenantId: TenantId,
  preguntaEntrante: string,
  provider: ILlmProvider,
): Promise<ScoredFaq[]> {
  const queryVector = await embedPregunta(preguntaEntrante, provider, 'RETRIEVAL_QUERY');
  const candidatos = await faqVectorSearchScoped(tenantId, queryVector);
  // No se asume el orden de salida de Atlas: con dos elementos ordenar es gratis.
  return [...candidatos].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
```

Sustituye a `mejorCandidato`, que desaparece (sus dos únicos llamadores son `matchFaq` y `testFaq`).

`matchFaq` — **firma y contrato de retorno intactos**, `try/catch` de degradación tal cual:

```ts
try {
  const [mejor, segundo] = await candidatosOrdenados(tenantId, preguntaEntrante, provider);
  if (!mejor || mejor.score === undefined) return { matched: false };

  const senales = evaluarSenales(
    preguntaEntrante,
    { pregunta: mejor.pregunta, score: mejor.score },
    segundo?.score,
    umbralesDesdeEnv(),
  );
  if (!senales.aprobado) return { matched: false };

  return { matched: true, respuesta: mejor.respuesta, confianza: mejor.score };
} catch (err: unknown) {
  logger.warn('Falló el matching de FAQ; se continúa con el flujo normal', { error: String(err) });
  return { matched: false };
}
```

`testFaq` — misma evaluación, sigue propagando errores, sigue devolviendo el candidato aunque no
pase, y ahora arma el diagnóstico completo:

```ts
const umbrales = umbralesDesdeEnv();
const [mejor, segundo] = await candidatosOrdenados(tenantId, preguntaEntrante, provider);
if (!mejor || mejor.score === undefined) return { matched: false, ...umbralesComoCampos };

const senales = evaluarSenales(preguntaEntrante, { pregunta: mejor.pregunta, score: mejor.score },
                               segundo?.score, umbrales);
return {
  matched: senales.aprobado,        // exactamente lo que haría matchFaq
  respuesta: mejor.respuesta,
  confianza: mejor.score,
  umbral: umbrales.umbral,
  margenMinimo: umbrales.margenMinimo,
  overlapMinimo: umbrales.overlapMinimo,
  faqId: mejor._id.toString(),
  pregunta: mejor.pregunta,
  segundaPregunta: segundo?.pregunta,
  senales: { /* score, segundoScore, margen, overlap y los tres booleanos */ },
};
```

`noUncheckedIndexedAccess` está activo, así que el destructuring `[mejor, segundo]` ya entrega
`ScoredFaq | undefined` y las guardas de arriba son obligatorias, no defensivas por gusto.
`exactOptionalPropertyTypes` **no** está activo, así que asignar `undefined` a un campo opcional
compila sin spread condicional.

### `kb-faq.types.ts` (y su espejo en `apps/frontend/.../types/faq.ts`)

`FaqMatchResult` **no se toca**. `FaqTestResult` crece:

```ts
/** Las tres señales del cortocircuito, tal como las evaluó el service. Solo para el probador. */
export interface FaqTestSenales {
  score: number;
  segundoScore?: number;
  margen: number;
  overlap: number;
  pasaUmbral: boolean;
  pasaMargen: boolean;
  pasaOverlap: boolean;
}

export interface FaqTestResult extends FaqMatchResult {
  umbral: number;
  margenMinimo: number;        // NUEVO
  overlapMinimo: number;       // NUEVO
  faqId?: string;
  pregunta?: string;           // la de la FAQ candidata, no la que escribió el admin
  segundaPregunta?: string;    // NUEVO — contra qué compitió el ganador
  senales?: FaqTestSenales;    // NUEVO — ausente si no hubo candidato
}
```

### Frontend — `FaqTester.tsx`

Se **conserva** el `ConfidenceMeter` con la marca del umbral (es el instrumento de calibración que
ya funciona) y se añade debajo la lectura de las tres señales. La pregunta que el admin trae a esta
pantalla es *«¿por qué esta pregunta no cortocircuitó?»*, así que:

- una fila por señal con su valor, su mínimo vigente y si pasó — `Badge` `success` / `secondary`,
  ambas ya vendorizadas;
- la señal que **bloqueó** es la que se destaca; si pasaron todas, el mensaje sigue siendo
  «Responde la FAQ, sin gastar tokens»;
- cuando hay segundo candidato se muestra su pregunta bajo el margen: es lo que explica un margen
  pequeño y lo que el admin necesita ver para decidir si fusiona o reescribe dos FAQs;
- copy en español, sin jerga de embeddings: «margen sobre la siguiente FAQ», «palabras en común».

Componentes de `src/components/ui/` y tokens semánticos exclusivamente; terminado en **light y
dark**. Antes de escribir el componente se invocan las skills de diseño del `CLAUDE.md` raíz §7
disponibles en la sesión (`frontend-design:frontend-design`; `emil-design-eng` e
`impeccable:impeccable` no están instaladas) y se aplican las reglas de `apps/frontend/CLAUDE.md`.

## Notas

- **Ninguna llamada extra a Gemini.** El camino normal sigue costando exactamente un
  `embedTexts(RETRIEVAL_QUERY)`, igual que hoy. Las dos señales nuevas son una resta y un conteo de
  strings.
- **Coste en Atlas: despreciable.** Pasar de `limit: 1` a `limit: 2` con `numCandidates` de 20 a 40
  es el mismo tipo de consulta sobre el mismo índice; no hay índice nuevo ni migración.
- **El cambio es reversible.** Poner `FAQ_MATCH_MIN_MARGIN=0` y `FAQ_MATCH_MIN_OVERLAP=0` devuelve
  exactamente el comportamiento anterior sin tocar código: útil si en producción hiciera falta
  aflojar de urgencia.
- **`$vectorSearch` no existe en `mongodb-memory-server`**: los tests validan el pipeline construido
  (patrón de `kb-faq.repository.test.ts`) y mockean `faqVectorSearchScoped` en el service. La
  verificación real del margen se hace con el probador contra Atlas.
- **Los defaults son un punto de partida, no una verdad.** `0.02` y `0.2` son conservadores por la
  asimetría del spec; la calibración honesta sale de correr el probador contra las FAQs reales del
  tenant.

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test          # base a superar: 86 archivos / 850 tests
pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint
```

Más el checklist de PR de `docs/multi-tenancy.md` §9 y, contra Atlas, el probador
`POST /api/kb/faqs/test` con el par «¿a qué hora abren?» / «¿cuál es el precio?» sobre dos FAQs
reales, para calibrar los dos mínimos con datos y no a ojo.
