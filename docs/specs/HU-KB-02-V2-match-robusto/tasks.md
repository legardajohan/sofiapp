# HU-KB-02-V2 — Tasks

> Checklist de ejecución. El QUÉ está en `spec.md`, el CÓMO en `plan.md`.
> Se ejecuta con `/sdd-implement HU-KB-02-V2-match-robusto` **sobre la rama actual
> `feat/HU-IA-01`** — no se crea rama nueva (norma del repo: todas las historias de IA van ahí).

## 0. Antes de empezar

- [x] Confirmar que estás en `feat/HU-IA-01` (`git branch --show-current`).
- [x] Punto de partida verde ya verificado en la planeación: `typecheck` ✅ y `test` ✅
      (**86 archivos / 850 tests**). Si no lo está al empezar, arreglar eso primero.
- [x] Releer las skills obligatorias antes de tocar código: `multi-tenancy-guard`,
      `typescript-strict-mode`, `clean-code-solid`.
- [x] Ojo con los filtros: los paquetes son **`@sofiapp/api`** y **`@sofiapp/web`**
      (`--filter backend` no matchea nada).

## 1. Implementación (en orden de dependencias)

### 1.1 Configuración

- [x] `config/env.ts`: añadir `FAQ_MATCH_MIN_MARGIN` (`z.coerce.number().min(0).max(1).default(0.02)`)
      y `FAQ_MATCH_MIN_OVERLAP` (`...default(0.2)`) en el bloque «FAQ semántica (HU-KB-02)», justo
      tras `FAQ_MATCH_THRESHOLD`.
- [x] Escribir el comentario de calibración de cada una (texto en `plan.md`): escala, por qué ese
      default, qué pasa sin segundo candidato, y que se calibra con `POST /api/kb/faqs/test`.
      **Ningún umbral escrito a mano en el código.**

### 1.2 Tipos

- [x] `kb-faq.types.ts`: añadir `FaqTestSenales` y extender `FaqTestResult` con `margenMinimo`,
      `overlapMinimo`, `segundaPregunta?` y `senales?`.
- [x] **Verificar que `FaqMatchResult` queda intacto** — es el contrato con `AIService`.

### 1.3 Módulo de matching (puro)

- [x] Crear `kb-faq.matching.ts` con `UmbralesFaqMatch`, `SenalesFaqMatch`, `umbralesDesdeEnv`,
      `tokensSignificativos`, `overlapLexico` y `evaluarSenales`. Tipos de retorno explícitos, cero
      `any`, cero imports de Mongoose / red / `ILlmProvider`.
- [x] Constante `PALABRAS_VACIAS: ReadonlySet<string>` con las vacías del español del `plan.md`.
- [x] `raizAproximada` (recorte de plural) + `coincidenTokens` (raíces iguales **o** prefijo con la
      más corta de longitud ≥ 4).
- [x] `overlapLexico` cuenta sobre el conjunto **menor** → resultado acotado a `[0,1]`; conjunto
      vacío → `0`.
- [x] `evaluarSenales`: `margen = segundoScore === undefined ? score : score - segundoScore`
      (**sin segundo candidato la señal de margen pasa**), y `aprobado` como AND de las tres.
- [x] Repasar que ninguna función pueda lanzar: `RegExp` solo literales, sin división por cero, sin
      accesos a índice sin comprobar.

### 1.4 Repositorio

- [x] `kb-faq.repository.ts`: constante `CANDIDATOS_A_COMPARAR = 2`; `limit: CANDIDATOS_A_COMPARAR`
      y `numCandidates: CANDIDATOS_A_COMPARAR * 20`. Actualizar el comentario que hoy dice «solo
      interesa el mejor candidato».
- [x] **No tocar nada más del pipeline**: `filter: { tenantId: tid, activo: true }`, el `$match`
      defensivo, el `$addFields` del score y el `$project { embedding: 0 }` quedan idénticos.

### 1.5 Service

- [x] Sustituir `mejorCandidato` por `candidatosOrdenados`, que ordena por `score` descendente antes
      de devolver (no se asume el orden de salida de Atlas).
- [x] `matchFaq`: evaluar las tres señales con `evaluarSenales` + `umbralesDesdeEnv()`; devolver
      `{ matched: false }` si `!aprobado`. **Firma, contrato de retorno y `try/catch` de degradación
      sin cambios.**
- [x] `testFaq`: misma evaluación; devolver el candidato aunque no pase, con `umbral`,
      `margenMinimo`, `overlapMinimo`, `faqId`, `pregunta`, `segundaPregunta` y `senales`. Su
      `matched` debe ser el AND completo. Sigue propagando errores.
- [x] Comprobar que el service no ganó lógica de negocio suelta: las reglas viven en
      `kb-faq.matching.ts` (`clean-code-solid`).

### 1.6 Frontend

- [x] **Antes de escribir el componente**, invocar las skills de diseño del `CLAUDE.md` raíz §7
      disponibles en la sesión (`frontend-design:frontend-design`) y aplicar sus criterios.
- [x] `types/faq.ts`: espejar `FaqTestSenales` y los campos nuevos de `FaqTestResult`.
- [x] `FaqTester.tsx`: conservar el `ConfidenceMeter` con la marca del umbral; añadir la lectura de
      las tres señales (valor · mínimo vigente · si pasó), destacando la que bloqueó, y mostrar la
      pregunta del segundo candidato cuando exista.
- [x] Solo componentes de `src/components/ui/` y tokens semánticos; cero `bg-[#...]`. Revisar en
      **light y dark**.

## 2. Tests

### 2.1 `kb-faq.matching.test.ts` (NUEVO, sin mocks)

- [x] `tokensSignificativos` quita tildes, palabras vacías y tokens de menos de 3 caracteres.
- [x] Plural: `precios`↔`precio`, `horarios`↔`horario`, `meses`↔`mes` coinciden.
- [x] Prefijo: `hora`↔`horario` coinciden; `casa`↔`costo` no.
- [x] **Caso raíz:** `overlapLexico('¿a qué hora abren?', '¿Cuál es el precio del curso?') === 0`.
- [x] `overlapLexico` queda en `[0,1]` con conjuntos de tamaños muy distintos.
- [x] Texto sin tokens significativos («¿y eso?») → `0`, sin lanzar.
- [x] `evaluarSenales` **sin segundo candidato** → `pasaMargen: true` y `margen === score`.
- [x] `evaluarSenales` con empate exacto de scores → `pasaMargen: false`, `aprobado: false`.
- [x] `aprobado` es el AND: falla cualquiera de las tres → `false`.

### 2.2 `kb-faq.repository.test.ts` (TOCAR)

- [x] El caso «pide un solo candidato» pasa a `limit === 2` y `numCandidates >= limit * 10`, con el
      `index` del entorno.
- [x] **Los cinco casos de aislamiento siguen verdes sin cambiar su intención:** tenantId del
      argumento en el `filter`, string → `ObjectId`, `$match` defensivo con el mismo tenant,
      `activo: true` en ambos sitios, `embedding: 0` en la proyección.

### 2.3 `kb-faq.service.test.ts` (TOCAR) — bloque «horarios vs precios»

Dos FAQs temáticamente cercanas del mismo tenant como fixture.

- [x] **(a)** score sobre umbral, margen ínfimo (p. ej. 0.87 vs 0.865) y overlap 0 →
      `{ matched: false }` (la conversación va al RAG/LLM).
- [x] **(b)** margen amplio pero overlap 0 (paráfrasis sin palabras comunes) → `{ matched: false }`.
- [x] **(c)** overlap alto pero margen ínfimo → `{ matched: false }`.
- [x] **(d)** margen y overlap suficientes → `{ matched: true }` con la **respuesta literal** de la
      FAQ y su `confianza`.
- [x] **(e)** candidato único (sin segundo) con overlap suficiente → `{ matched: true }`: el tenant
      con una sola FAQ no se rompe.
- [x] **(f)** el mock devuelve los candidatos desordenados (el segundo con score mayor) → se evalúa
      el ganador real.
- [x] Siguen verdes sin cambios: sin candidatos, FAQ inactiva, `taskType: 'RETRIEVAL_QUERY'`.
- [x] **Degradación:** fallo del provider → `{ matched: false }`; fallo del `$vectorSearch` →
      `{ matched: false }`. Ninguno propaga.
- [x] **Aislamiento:** `faqVectorSearchScoped` se invoca siempre con el tenant recibido, y un
      candidato de otro tenant nunca entra en la evaluación de señales.
- [x] `testFaq`: devuelve candidato bajo umbral con `senales` y los tres mínimos; marca cuál señal
      falló; expone `segundaPregunta`; sigue propagando errores.

### 2.4 `kb-faq.routes.test.ts` (TOCAR)

- [x] `POST /api/kb/faqs/test` responde 200 con `umbral`, `margenMinimo` y `overlapMinimo` del
      entorno.

### 2.4b `FaqTester.test.tsx` (NUEVO — no estaba en el plan)

El componente no tenía test y el bloque de señales es justo la parte con lógica de presentación.

- [x] Con las tres en verde, dice que la FAQ responde sin gastar tokens.
- [x] Cada señal muestra su valor y el mínimo vigente.
- [x] Señala **cuál** bloqueó cuando el overlap es cero pese a un parecido alto.
- [x] Con el margen bloqueando, muestra contra qué FAQ compitió.
- [x] Sin segunda FAQ, el margen no se mide y lo explica.
- [x] Sin candidato, no dibuja las señales.

### 2.5 Sin cambios, pero deben seguir verdes

- [x] `services/ai/ai.service.test.ts` — el contrato `FaqMatchResult` es idéntico.
- [x] `tests/isolation/**` completo.

## 3. Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` en verde (cero `any`, tipos de retorno explícitos).
- [x] `pnpm --filter @sofiapp/api test` en verde — **no menos de 850 tests**, más los nuevos.
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde.
- [x] `pnpm --filter @sofiapp/web test` en verde (incluye el `FaqTester.test.tsx` nuevo).
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 completo.
- [~] `FaqTester` revisado en **light y dark** — verificado por inspección: todas las clases usadas
      son tokens semánticos y los cuatro que toca el bloque nuevo (`--success`, `--destructive`,
      `--destructive-subtle`, `--muted-foreground`) están definidos tanto en `:root` como en `.dark`
      de `src/index.css`. **Falta la revisión visual con la app corriendo**: en esta sesión no hay
      MCP de Playwright y levantar la SPA contra el API exige Mongo + Redis.
- [x] Sin `*.png`/`*.jpg` de verificación colados en `git status` antes del commit.
- [ ] **PENDIENTE (requiere entorno):** calibración manual contra Atlas con el probador y el par
      «¿a qué hora abren?» / «¿cuál es el precio?» sobre dos FAQs reales; anotar los valores
      observados si difieren de los defaults. Necesita Atlas M10+ con el índice `kb_faqs_vector` y
      FAQs cargadas, así que no se puede cerrar desde aquí. Los defaults `0.02` / `0.2` son un punto
      de partida razonado, no medido.

## Definición de «hecho»

1. Los 12 criterios de aceptación de `spec.md` se cumplen y están cubiertos por un test.
2. «¿A qué hora abren?» con dos FAQs cercanas **ya no** devuelve el precio: cae al RAG/LLM.
3. Un tenant con una sola FAQ activa **sigue** cortocircuitando.
4. `matchFaq` degrada a `{ matched: false }` ante cualquier fallo; la conversación nunca se rompe.
5. El aislamiento multi-tenant del pipeline está intacto y demostrado por los tests que ya existían.
6. Los dos mínimos son configurables por env; no hay un solo umbral escrito a mano en el código.
7. El probador del admin explica **cuál** señal bloqueó, en light y dark.
8. `spec.md` actualizado a `**Estado:** implementado`.
