# HU-KB-02 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Contratos exactos en `plan.md`; criterios en `spec.md`.
> Convención de commits: `feat(kb-faq): <descripción>`.

## 0 · Preparación

- [x] Rama `feat/HU-KB-02` creada desde `develop` actualizado.
- [x] Carpeta `docs/specs/HU-KB-02-faqs-cache/` con `spec.md`, `plan.md` y `tasks.md`.

## 1 · Backend — configuración

- [ ] `config/env.ts`: añadir bloque `// FAQ semántica (HU-KB-02)` con `FAQ_VECTOR_INDEX`
      (default `'kb_faqs_vector'`) y `FAQ_MATCH_THRESHOLD` (`z.coerce.number().min(0).max(1).default(0.85)`).
- [ ] Documentar ambas en `.env.example` y `apps/backend/.env.example`, con la nota de que el score
      de Atlas está normalizado a `(1 + cos) / 2` (0.85 ≈ coseno 0.70). _(criterio 5)_

## 2 · Backend — feature `kb-faq` (orden del patrón de 6 archivos)

- [ ] `features/kb-faq/kb-faq.types.ts`: `IKbFaq`, `IKbFaqDocument`, `CreateFaqDTO`, `UpdateFaqDTO`,
      `TestFaqDTO`, `IKbFaqResponse` (**sin `embedding`**), `KbFaqsListResponse`,
      `DeleteKbFaqResponse`, `FaqMatchResult`, `FaqTestResult`. _(criterios 4, 5, 8)_
- [ ] `features/kb-faq/kb-faq.model.ts`: schema con `tenantId` required+index, `pregunta`,
      `respuesta`, `embedding: [Number]` required, `activo` default `true`, `{ timestamps: true }`;
      índices `{ tenantId, pregunta }` **unique** y `{ tenantId, createdAt: -1 }`; comentario sobre
      el índice de Atlas. _(criterio 3)_
- [ ] `features/kb-faq/kb-faq.validation.ts`: `createFaqSchema`, `updateFaqSchema` (con `.refine` de
      "al menos un campo"), `listFaqsSchema`, `deleteFaqSchema`, `testFaqSchema`. _(criterio 1)_
- [ ] `features/kb-faq/kb-faq.repository.ts`: `buildFaqVectorSearchPipeline` +
      `faqVectorSearchScoped`, con `filter: { tenantId, activo: true }`, `limit: 1`, `$match`
      defensivo, `$addFields` del `$meta` y `$project: { embedding: 0 }`. Comentario de cabecera
      declarándolo único autorizado a `aggregate` sobre `KbFaq`. _(criterios 4, 5, 10)_
- [ ] `features/kb-faq/kb-faq.service.ts`:
  - [ ] `mapKbFaqToResponse` — no copia `embedding`, fechas a ISO, spread condicional. _(criterio 4)_
  - [ ] `listFaqs` con `findScoped` + `.select('-embedding')` + `countScoped`. _(criterios 1, 4)_
  - [ ] `createFaq` — duplicado → `AppError(…, 409)`; embebe con `RETRIEVAL_DOCUMENT`;
        `createScoped`. _(criterios 2, 3)_
  - [ ] `updateFaq` — 404 si no existe; **re-embebe solo si cambia `pregunta`**; valida duplicado
        al renombrar; `findOneAndUpdateScoped`. _(criterios 1, 2, 3)_
  - [ ] `deleteFaq` — 404 si no existe; `findOneAndDeleteScoped`. _(criterio 1)_
  - [ ] `matchFaq` — embebe con `RETRIEVAL_QUERY`, `faqVectorSearchScoped`, compara contra
        `env.FAQ_MATCH_THRESHOLD`; ante error degrada a `{ matched: false }`. _(criterio 5)_
  - [ ] `testFaq` — devuelve el mejor candidato aunque no supere el umbral, con `umbral`, `faqId`
        y la `pregunta` de la FAQ; propaga errores. _(criterio 8)_
- [ ] `features/kb-faq/kb-faq.controller.ts`: 5 controllers delgados, `tenantId` del token, query
      desde `req.validatedQuery`, POST → 201 y el resto → 200. Sin `try/catch`. _(criterios 1, 10)_
- [ ] `features/kb-faq/kb-faq.routes.ts`: 5 rutas con la cadena de middlewares en orden fijo y
      `authorize(['admin'])`; `/test` registrado antes de `/:id`. _(criterio 1)_
- [ ] `app.ts`: `import kbFaqRoutes` + `app.use('/api/kb/faqs', kbFaqRoutes);` junto al montaje de
      `/api/kb`.
- [ ] `scripts/create-kb-faq-vector-index.ts`: idempotente vía `listSearchIndexes()`, campos
      `embedding` (vector, `KB_EMBED_DIM`, cosine) + filtros `tenantId` y `activo`. _(criterio 5)_

## 3 · Backend — integración con `AIService`

- [ ] `services/ai/ai-service.types.ts`: `FaqMatchResult`, `type FaqMatcher`, y `fromFaq?: boolean`
      en `AiResult<T>`. _(criterio 6)_
- [ ] `services/ai/ai-usage-log.model.ts`: campo `fromFaq` (`Boolean`, default `false`) en el schema
      y en `IAiUsageLog`. _(criterio 7)_
- [ ] `services/ai/ai.service.ts`:
  - [ ] Tercer parámetro `faqMatcher: FaqMatcher` con no-op por defecto.
  - [ ] Bloque de cortocircuito en `chat()` **después** del `getCached` y **antes** del
        `generateReply`: deriva la última pregunta con `role: 'user'`, llama al matcher, y con match
        retorna `{ data, cacheHit: true, fromFaq: true, tokens en 0 }` + `logUsage`. _(criterios 6, 7)_
  - [ ] `fromFaq: false` explícito en los `logUsage` preexistentes de `chat`/`extract`/`classify`.
  - [ ] `createAIService(redis)` cablea `matchFaq` como tercer argumento — **único** punto de
        contacto entre `services/ai/` y `features/kb-faq/`.

## 4 · Frontend

- [ ] ⚠️ **Antes de escribir cualquier componente**, invocar las skills `emil-design-eng`,
      `impeccable:impeccable` y `frontend-design:frontend-design` y aplicar sus criterios (regla no
      negociable del `CLAUDE.md` raíz).
- [ ] `features/knowledge-base/types/faq.ts` + barrel en `types/index.ts`: `IKbFaq`,
      `CreateFaqPayload`, `UpdateFaqPayload`, `KbFaqsListResponse`, `FaqTestResult`.
- [ ] `api/kb-faqs.ts`: `getKbFaqs`, `createKbFaq`, `updateKbFaq`, `deleteKbFaq`, `testKbFaq` —
      rutas **sin** prefijo `/api`.
- [ ] `features/knowledge-base/pages/KnowledgeFaqsPage.tsx`: cabecera + probador + tabla + estado
      del diálogo. _(criterio 9)_
- [ ] `features/knowledge-base/components/FaqTable.tsx`: shadcn `Table`, columnas Pregunta /
      Respuesta truncada / Activo (`Badge`) / Acciones (`Pencil`, `Trash2` con `aria-label` y
      `disabled` durante mutaciones), fila de estado vacío, `window.confirm` al borrar.
      `useQuery(['kb','faqs'])` + invalidación en cada mutación. _(criterio 9)_
- [ ] `features/knowledge-base/components/FaqFormDialog.tsx`: `Dialog` con `Input` de pregunta,
      `Textarea` de respuesta (con contador), `Switch` de activo; modo crear/editar por presencia de
      la prop `faq`; reset de campos y mensajes al cambiar de FAQ. _(criterio 9)_
- [ ] `features/knowledge-base/components/FaqTester.tsx`: `useMutation` sobre `testKbFaq`; muestra
      `confianza` en %, `umbral` vigente, pregunta candidata y `Badge` de resultado; copy que
      explique que bajo el umbral la consulta iría al LLM. _(criterios 8, 9)_
- [ ] `features/knowledge-base/index.ts`: exportar `KnowledgeFaqsPage` y los tipos nuevos.
- [ ] `router.tsx`: ruta `/settings/knowledge/faqs` con `lazy` + `Suspense` +
      `RequireRole roles={['admin']}`. _(criterio 9)_
- [ ] `components/layout/nav-config.ts`: `children: NavSubItem[]` en «Base de Conocimiento» con
      «Documentos» y «Preguntas frecuentes». _(criterio 9)_
- [ ] Revisión visual en **light y dark**: solo tokens semánticos, cero colores crudos, cero
      `<table>` a mano. _(criterio 9)_

## 5 · Tests (Vitest)

- [ ] `kb-faq.service.test.ts`:
  - [ ] `createFaq` genera y persiste el `embedding` llamando a `embedTexts` con
        `taskType: 'RETRIEVAL_DOCUMENT'`. _(criterio 2)_
  - [ ] `updateFaq` con solo `respuesta` o solo `activo` → `embedTexts` **no** se llama y el
        embedding previo se conserva. _(criterio 2)_
  - [ ] `updateFaq` cambiando `pregunta` → `embedTexts` se llama una vez. _(criterio 2)_
  - [ ] Pregunta duplicada al crear y al renombrar → `AppError` 409. _(criterio 3)_
  - [ ] `matchFaq` con score ≥ umbral → `{ matched: true, respuesta, confianza }`; con score <
        umbral → `{ matched: false }`. _(criterio 5)_
  - [ ] FAQ con `activo: false` nunca matchea. _(criterio 5)_
  - [ ] `matchFaq` con el provider lanzando error → `{ matched: false }`, no propaga. _(criterio 5)_
  - [ ] `testFaq` devuelve candidato + `umbral` aunque `matched` sea `false`. _(criterio 8)_
  - [ ] `mapKbFaqToResponse` no expone `embedding`. _(criterio 4)_
  - [ ] **Aislamiento:** tenant B no lee, no edita y no borra la FAQ del tenant A (404 en los tres
        casos); `matchFaq` del tenant B nunca devuelve la respuesta del tenant A. _(criterio 10)_
- [ ] `kb-faq.repository.test.ts` (no se ejecuta el pipeline — `$vectorSearch` no existe en
      `mongodb-memory-server`):
  - [ ] El pipeline lleva `filter.tenantId` con el ObjectId correcto y `activo: true`. _(criterio 10)_
  - [ ] Hay `$match` defensivo con `tenantId` después del `$vectorSearch`. _(criterio 10)_
  - [ ] `$project` incluye `{ embedding: 0 }` y hay `$addFields` con `$meta: 'vectorSearchScore'`.
        _(criterios 4, 5)_
  - [ ] Usa `env.FAQ_VECTOR_INDEX` como nombre de índice.
- [ ] `kb-faq.routes.test.ts` (supertest):
  - [ ] 401 sin token en los 5 endpoints.
  - [ ] 403 con rol `asesor` / no admin. _(criterio 1)_
  - [ ] 201 al crear, 200 al listar/editar/borrar/probar con rol `admin`. _(criterio 1)_
  - [ ] Mutaciones sin cabecera CSRF → rechazadas.
  - [ ] Body inválido (pregunta < 3 chars, respuesta > 2000) → 400 con `{ message, errors }`.
  - [ ] Ninguna respuesta contiene el campo `embedding`. _(criterio 4)_
  - [ ] **Aislamiento vía HTTP:** el admin del tenant B recibe 404 al `PATCH`/`DELETE` sobre el id
        de una FAQ del tenant A. _(criterio 10)_
- [ ] `services/ai/ai.service.test.ts` (ampliar):
  - [ ] Con match: `provider.generateReply` **no** se llama; el resultado trae `fromFaq: true`,
        `cacheHit: true`, `totalTokens: 0` y `data` = respuesta de la FAQ. _(criterio 6)_
  - [ ] Sin match: `generateReply` se llama y el resultado trae `fromFaq: false`. _(criterio 6)_
  - [ ] Con hit de caché Redis: el `faqMatcher` **no** se llama. _(criterio 7)_
  - [ ] Historial sin ningún turno `role: 'user'`: el matcher no se llama y el flujo sigue normal.
        _(criterio 6)_
  - [ ] El `AiUsageLog` de una respuesta desde FAQ se registra con `fromFaq: true` y tokens en 0.
        _(criterio 7)_
- [ ] Frontend — `FaqTable.test.tsx`: render con datos, estado vacío, badge de activo/inactivo y
      disparo de las acciones (patrón de `admin-plans/components/PlanTable.test.tsx`).

## 6 · Verificación final

- [ ] `pnpm --filter @sofiapp/api typecheck` sin errores. _(criterio 11)_
- [ ] `pnpm --filter @sofiapp/api test` en verde, incluidos los tests de aislamiento. _(criterios 10, 11)_
- [ ] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde
      (`--max-warnings 0`). _(criterio 11)_
- [ ] Checklist de PR de `docs/multi-tenancy.md` §9 revisado: cero `Model.find/create/findById`
      directos fuera de `kb-faq.repository.ts`, `tenantId` siempre del token.
- [ ] `git status` limpio de capturas (`*.png`/`*.jpg`) antes de commitear.
- [ ] **Nota de despliegue registrada:** ejecutar
      `pnpm --filter @sofiapp/api exec tsx --env-file .env src/scripts/create-kb-faq-vector-index.ts`
      en cada entorno (requiere Atlas M10+) antes de esperar matches.

## Definición de «hecho»

El admin gestiona sus preguntas frecuentes desde `/settings/knowledge/faqs`, puede calibrar el
umbral con el probador viendo scores reales, y `AIService.chat()` devuelve la respuesta literal de
la FAQ con `totalTokens: 0` y `fromFaq: true` cuando la consulta entrante supera el umbral — sin
tocar Gemini. El aislamiento multi-tenant está probado en service, repositorio y HTTP. El ahorro
queda registrado en `AiUsageLog` y se hará visible end-to-end cuando la HU de auto-reply conecte
`AIService.chat()` en `workers/inbound-message.processor.ts`.
