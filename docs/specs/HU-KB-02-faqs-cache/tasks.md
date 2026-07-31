# HU-KB-02 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Contratos exactos en `plan.md`; criterios en `spec.md`.
> Convención de commits: `feat(kb-faq): <descripción>`.

## 0 · Preparación

- [x] Rama `feat/HU-KB-02` creada desde `develop` actualizado.
- [x] Carpeta `docs/specs/HU-KB-02-faqs-cache/` con `spec.md`, `plan.md` y `tasks.md`.

## 1 · Backend — configuración

- [x] `config/env.ts`: añadir bloque `// FAQ semántica (HU-KB-02)` con `FAQ_VECTOR_INDEX`
      (default `'kb_faqs_vector'`) y `FAQ_MATCH_THRESHOLD` (`z.coerce.number().min(0).max(1).default(0.85)`).
- [ ] Documentar ambas en `.env.example` y `apps/backend/.env.example`, con la nota de que el score
      de Atlas está normalizado a `(1 + cos) / 2` (0.85 ≈ coseno 0.70). _(criterio 5)_
      **Pendiente: ambos archivos están fuera de los permisos de la sesión (lectura y escritura
      denegadas). Las dos líneas a pegar están en el resumen del feature.**

## 2 · Backend — feature `kb-faq` (orden del patrón de 6 archivos)

- [x] `features/kb-faq/kb-faq.types.ts`: `IKbFaq`, `IKbFaqDocument`, `LeanKbFaq`, `CreateFaqDTO`,
      `UpdateFaqDTO`, `TestFaqDTO`, `IKbFaqResponse` (**sin `embedding`**), `KbFaqsListResponse`,
      `DeleteKbFaqResponse`, `FaqMatchResult`, `FaqTestResult`. _(criterios 4, 5, 8)_
- [x] `features/kb-faq/kb-faq.model.ts`: schema con `tenantId` required+index, `pregunta`,
      `respuesta`, `embedding: [Number]` required, `activo` default `true`, `{ timestamps: true }`;
      índices `{ tenantId, pregunta }` **unique** y `{ tenantId, createdAt: -1 }`; comentario sobre
      el índice de Atlas. _(criterio 3)_
- [x] `features/kb-faq/kb-faq.validation.ts`: `createFaqSchema`, `updateFaqSchema` (con `.refine` de
      "al menos un campo"), `listFaqsSchema`, `deleteFaqSchema`, `testFaqSchema`. _(criterio 1)_
      _`activo` en la query se validó con `z.enum(['true','false']).transform(...)`: `z.coerce.boolean()`
      convierte el string `"false"` en `true`._
- [x] `features/kb-faq/kb-faq.repository.ts`: `buildFaqVectorSearchPipeline` +
      `faqVectorSearchScoped`, con `filter: { tenantId, activo: true }`, `limit: 1`, `$match`
      defensivo, `$addFields` del `$meta` y `$project: { embedding: 0 }`. Comentario de cabecera
      declarándolo único autorizado a `aggregate` sobre `KbFaq`. _(criterios 4, 5, 10)_
- [x] `features/kb-faq/kb-faq.service.ts`:
  - [x] `mapKbFaqToResponse` — no copia `embedding`, fechas a ISO. _(criterio 4)_
  - [x] `listFaqs` con `findScoped` + `.select('-embedding')` + `countScoped`. _(criterios 1, 4)_
  - [x] `createFaq` — duplicado → `AppError(…, 409)` (pre-chequeo **y** captura del error 11000 por
        carrera); embebe con `RETRIEVAL_DOCUMENT`; `createScoped`. _(criterios 2, 3)_
  - [x] `updateFaq` — 404 si no existe; **re-embebe solo si cambia `pregunta`**; valida duplicado
        al renombrar; `findOneAndUpdateScoped`. _(criterios 1, 2, 3)_
  - [x] `deleteFaq` — 404 si no existe; `findOneAndDeleteScoped`. _(criterio 1)_
  - [x] `matchFaq` — embebe con `RETRIEVAL_QUERY`, `faqVectorSearchScoped`, compara contra
        `env.FAQ_MATCH_THRESHOLD`; ante error degrada a `{ matched: false }`. _(criterio 5)_
  - [x] `testFaq` — devuelve el mejor candidato aunque no supere el umbral, con `umbral`, `faqId`
        y la `pregunta` de la FAQ; propaga errores. _(criterio 8)_
- [x] `features/kb-faq/kb-faq.controller.ts`: 5 controllers delgados, `tenantId` del token, query
      desde `req.validatedQuery`, POST → 201 y el resto → 200. Sin `try/catch`. _(criterios 1, 10)_
- [x] `features/kb-faq/kb-faq.routes.ts`: 5 rutas con la cadena de middlewares en orden fijo y
      `authorize(['admin'])`; `/test` registrado antes de `/:id`. _(criterio 1)_
- [x] `app.ts`: `import kbFaqRoutes` + `app.use('/api/kb/faqs', kbFaqRoutes);` **antes** del montaje
      de `/api/kb` (Express resuelve por orden de registro).
- [x] `scripts/create-kb-faq-vector-index.ts`: idempotente vía `listSearchIndexes()`, campos
      `embedding` (vector, `KB_EMBED_DIM`, cosine) + filtros `tenantId` y `activo`. _(criterio 5)_

## 3 · Backend — integración con `AIService`

- [x] `services/ai/ai-service.types.ts`: `FaqMatchResult`, `type FaqMatcher`, y `fromFaq?: boolean`
      en `AiResult<T>`. _(criterio 6)_
- [x] `services/ai/ai-usage-log.model.ts`: campo `fromFaq` (`Boolean`, default `false`) en el schema
      y en `IAiUsageLog`. _(criterio 7)_
- [x] `services/ai/ai.service.ts`:
  - [x] Tercer parámetro `faqMatcher: FaqMatcher` con no-op por defecto.
  - [x] Bloque de cortocircuito en `chat()` **después** del `getCached` y **antes** del
        `generateReply`: deriva la última pregunta con `role: 'user'`, llama al matcher, y con match
        retorna `{ data, cacheHit: true, fromFaq: true, tokens en 0 }` + `logUsage`. _(criterios 6, 7)_
  - [x] `fromFaq: false` explícito en los `logUsage` preexistentes de `chat`/`extract`/`classify`.
  - [x] `createAIService(redis)` cablea `matchFaq` como tercer argumento — único punto que importa
        el feature desde `services/ai/`.

## 4 · Frontend

- [~] Skills de diseño obligatorias antes de escribir componentes. **`frontend-design:frontend-design`
      aplicada; `emil-design-eng` e `impeccable:impeccable` NO están instaladas en el entorno
      (`Unknown skill`)** — sus criterios se aplicaron desde conocimiento propio (ver notas de
      animación abajo). Queda pendiente instalarlas y repasar la vista con ellas.
- [x] `features/knowledge-base/types/faq.ts` + barrel en `types/index.ts`: `IKbFaq`,
      `CreateFaqPayload`, `UpdateFaqPayload`, `KbFaqsListResponse`, `FaqTestResult`.
- [x] `api/kb-faqs.ts`: `getKbFaqs`, `createKbFaq`, `updateKbFaq`, `deleteKbFaq`, `testKbFaq` +
      helper `faqErrorMessage` — rutas **sin** prefijo `/api`.
- [x] `features/knowledge-base/pages/KnowledgeFaqsPage.tsx`: cabecera + probador + tabla + estado
      del diálogo. _(criterio 9)_
- [x] `features/knowledge-base/components/FaqTable.tsx`: shadcn `Table`, columnas Pregunta /
      Respuesta truncada (`line-clamp-2` + `title`) / Activa (`Switch`) / Acciones (`Pencil`,
      `Trash2` con `aria-label` y `disabled` durante mutaciones), estado vacío accionable,
      `Skeleton` mientras carga, `window.confirm` al borrar, toasts con `sonner`.
      `useQuery(['kb','faqs'])` + invalidación en cada mutación. _(criterio 9)_
- [x] `features/knowledge-base/components/FaqFormDialog.tsx`: `Dialog` con `Input` de pregunta,
      `Textarea` de respuesta (con contador), `Switch` de activo; modo crear/editar por presencia de
      la prop `faq`; reset de campos y mensajes al abrir. _(criterio 9)_
- [x] `features/knowledge-base/components/FaqTester.tsx`: `useMutation` sobre `testKbFaq`; medidor
      de confianza con marca del umbral, score en % con `tabular-nums`, FAQ candidata y su
      respuesta. _(criterios 8, 9)_
- [x] `features/knowledge-base/index.ts`: exportar `KnowledgeFaqsPage` y los tipos nuevos.
- [x] `router.tsx`: ruta `/settings/knowledge/faqs` con `lazy` + `Suspense` +
      `RequireRole roles={['admin']}`. _(criterio 9)_
- [x] `components/layout/nav-config.ts`: `children: NavSubItem[]` en «Base de Conocimiento» con
      «Documentos» y «Preguntas frecuentes». _(criterio 9)_
- [x] Solo tokens semánticos y componentes de `src/components/ui/`; cero colores crudos, cero
      `<table>` a mano. Utilidades poco usadas (`min-w-32`, `line-clamp-2`, `size-9`,
      `slide-in-from-bottom-1`, `origin-left`, `motion-reduce`) verificadas en el CSS compilado.
      _(criterio 9)_
- [x] Animación: el relleno del medidor usa `scaleX` (propiedad de composición) en vez de `width`,
      500 ms `ease-out`; el bloque de resultado entra con `fade-in` + `slide-in-from-bottom-1` en
      200 ms; ambos anulados bajo `prefers-reduced-motion`. Los botones con mutación en curso
      cambian de contenido sin desplazar el layout (`min-w-32` / `sm:w-28`).
- [ ] Revisión visual en navegador (light y dark). **No ejecutada**: requiere levantar Mongo, Redis
      y el backend. Verificado en su lugar por build, lint, tests y auditoría de tokens.

## 5 · Tests (Vitest)

- [x] `kb-faq.service.test.ts` (30 casos):
  - [x] `createFaq` genera y persiste el `embedding` con `taskType: 'RETRIEVAL_DOCUMENT'`. _(criterio 2)_
  - [x] `updateFaq` con solo `respuesta` o solo `activo` → `embedTexts` **no** se llama y el
        embedding previo se conserva. _(criterio 2)_
  - [x] `updateFaq` cambiando `pregunta` → `embedTexts` se llama una vez; reenviar la misma
        pregunta no re-embebe. _(criterio 2)_
  - [x] Pregunta duplicada al crear y al renombrar → `AppError` 409; la misma pregunta en otro
        tenant sí se permite. _(criterio 3)_
  - [x] `matchFaq` con score ≥ umbral → `{ matched: true, respuesta, confianza }`; con score <
        umbral o sin candidatos → `{ matched: false }`. _(criterio 5)_
  - [x] `matchFaq` degrada a `{ matched: false }` si falla el provider o el `$vectorSearch`. _(criterio 5)_
  - [x] `testFaq` devuelve candidato + `umbral` aunque `matched` sea `false`, y propaga errores. _(criterio 8)_
  - [x] `mapKbFaqToResponse` y `listFaqs` no exponen `embedding`. _(criterio 4)_
  - [x] **Aislamiento:** tenant B no lee, no edita y no borra la FAQ del tenant A (404 en los tres
        casos, con el dato intacto); `matchFaq` se ejecuta siempre contra el tenant recibido. _(criterio 10)_
- [x] `kb-faq.repository.test.ts` (6 casos, no se ejecuta el pipeline — `$vectorSearch` no existe en
      `mongodb-memory-server`): `filter.tenantId` correcto desde string y ObjectId, `activo: true`
      en el `$vectorSearch` **y** en el `$match` defensivo, `$project: { embedding: 0 }`,
      `$meta: 'vectorSearchScore'`, `limit: 1` y `env.FAQ_VECTOR_INDEX`. _(criterios 4, 5, 10)_
- [x] `kb-faq.routes.test.ts` (18 casos): 401 sin token, 403 con `superadmin` y con `asesor`,
      200/201 con `admin`, mutación sin cabecera CSRF rechazada, body inválido → 400 con
      `{ message, errors }`, duplicado → 409, ninguna respuesta trae `embedding`, y **aislamiento
      vía HTTP**: `PATCH`/`DELETE` sobre una FAQ de otro tenant → 404. _(criterios 1, 3, 4, 10)_
- [x] `services/ai/ai.service.test.ts` (ampliado): con match `generateReply` **no** se llama y el
      resultado trae `fromFaq: true` / `cacheHit: true` / `totalTokens: 0`; sin match el flujo
      normal; con hit de caché Redis el matcher **no** se llama; historial sin turnos de usuario no
      llama al matcher; `matched: true` sin `respuesta` no cortocircuita; el `AiUsageLog` queda con
      `fromFaq: true` y tokens en 0. _(criterios 6, 7)_
- [x] `FaqTable.test.tsx` (6 casos): render con datos, estado vacío, estado del `Switch` según
      `activo`, `onEdit`/`onCreate`, y error de carga con botón de reintentar.

## 6 · Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores. _(criterio 11)_
- [x] `pnpm --filter @sofiapp/api test` → **45 archivos, 303 tests en verde**, incluidos los de
      aislamiento. _(criterios 10, 11)_
- [x] `pnpm --filter @sofiapp/web build` en verde. _(criterio 11)_
- [x] `pnpm --filter @sofiapp/web lint` en verde (`--max-warnings 0`). _(criterio 11)_
- [x] `pnpm --filter @sofiapp/web test` → **3 archivos, 19 tests en verde**.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado: cero `Model.find/create/findById`
      directos fuera de `kb-faq.repository.ts`, `tenantId` siempre del token.
- [x] `git status` sin capturas (`*.png`/`*.jpg`) coladas.
- [ ] **Nota de despliegue (operativa, por entorno):** ejecutar
      `pnpm --filter @sofiapp/api exec tsx --env-file .env src/scripts/create-kb-faq-vector-index.ts`
      (requiere Atlas M10+) antes de esperar matches. Sin el índice, `matchFaq` degrada a
      `{ matched: false }` y todo sigue funcionando por el flujo normal, sin ahorro.

## Definición de «hecho»

El admin gestiona sus preguntas frecuentes desde `/settings/knowledge/faqs`, puede calibrar el
umbral con el probador viendo scores reales, y `AIService.chat()` devuelve la respuesta literal de
la FAQ con `totalTokens: 0` y `fromFaq: true` cuando la consulta entrante supera el umbral — sin
tocar Gemini. El aislamiento multi-tenant está probado en service, repositorio y HTTP. El ahorro
queda registrado en `AiUsageLog` y se hará visible end-to-end cuando la HU de auto-reply conecte
`AIService.chat()` en `workers/inbound-message.processor.ts`.
