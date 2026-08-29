# HT-WA-02 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Antes de tocar `apps/frontend`, invoca `emil-design-eng`,
> `impeccable:impeccable` y `frontend-design:frontend-design` (regla §7 del `CLAUDE.md` raíz).

## Implementación — Backend

### Feature `whatsapp-template` (patrón de 6 archivos)

- [x] `whatsapp-template.types.ts`: `ESTADOS_PLANTILLA`, `CATEGORIAS_PLANTILLA`,
      `IPlantillaComponente`, `IWhatsAppTemplate`, `IWhatsAppTemplateDocument`,
      `IWhatsAppTemplateResponse`, DTOs de alta y de listado.
- [x] `whatsapp-template.model.ts`: schema con `tenantId` requerido e indexado,
      `{ tenantId, name, language }` único y `{ tenantId, status }`.
- [x] `whatsapp-template.validation.ts`: `listTemplatesSchema`, `createTemplateSchema`,
      `syncTemplatesSchema`, todos con la forma `{ body, params, query }`.
- [x] `whatsapp-template.service.ts`: `syncTemplates`, `listTemplates`, `createTemplate`,
      `buildTemplatePayload`. Solo funciones `*Scoped`; `AppError` para lo esperable.
- [x] `whatsapp-template.controller.ts`: `tenantId` del token, sin `try/catch`, sin Mongoose.
      Usar `req.validatedQuery`, **nunca** `req.query` (Express 5 re-parsea el getter).
- [x] `whatsapp-template.routes.ts`: los tres endpoints con la cadena de middlewares fija.
- [x] Montar en `app.ts`: `app.use('/api/templates', whatsappTemplateRoutes)` en el bloque
      tenant-aware.

### Cliente de Meta

- [x] `integrations/meta/meta-template.client.ts`: `list` (con paginación por cursor `after` hasta
      agotarla) y `create`. Mismo patrón de backoff 429 y `AppError(..., 502)` que
      `meta-whatsapp.client.ts`.
- [x] Derivar `parametrosBody` contando los placeholders `{{n}}` del componente `BODY` y validar
      que sean consecutivos desde 1.

### `sendOutbound` — el punto único de decisión de ventana

- [x] `message.types.ts`: `ContenidoOutbound`, `ISendTemplateDto`.
- [x] `message.service.ts`: implementar `sendOutbound` con las 7 reglas del `plan.md`.
      _El 422 de ventana cerrada debe conservar el mensaje literal actual: el copy ya está en el
      frontend (`WindowClosedBanner`)._
- [x] `message.service.ts`: `sendMessage` pasa a delegar en `sendOutbound` con `modo: 'texto'`.
      Su firma pública y su código de error no cambian.
- [x] `message.validation.ts` + `message.controller.ts` + `message.routes.ts`:
      `POST /api/messages/template`.

## Implementación — Frontend

- [x] ~~Instalar `tabs`~~ — decisión de diseño: se usaron `Select` (estado/categoría) en vez de
      `tabs`, ya vendorizados y suficientes para dos filtros independientes; no se justificó
      instalar un componente nuevo solo para esto.
- [x] `features/whatsapp-templates/types/{domain,api,index}.ts`. Rutas HTTP en
      `src/api/whatsapp-templates.ts` (convención real del proyecto — ver `kb-faqs.ts`,
      `channels/api.ts` — en vez de un `api.ts` dentro del feature), sin prefijo `/api`.
- [x] `TemplateList` usa TanStack Query (`useQuery`/`useMutation`) directamente; no se creó una
      capa de hooks separada (`useTemplates.ts`, etc.) — mismo patrón que `FaqTable.tsx`.
- [x] `components/TemplateList.tsx`: listado con filtro por estado y categoría (`Select`), acción
      de sincronizar y de crear.
- [x] `components/TemplatePreview.tsx`: vista previa tipo burbuja de WhatsApp con los `{{n}}`
      sustituidos por los ejemplos (`substituteEjemplos` en `lib/`).
- [x] `components/CreateTemplateDialog.tsx`: alta con vista previa en vivo, avisando de que la
      aprobación la decide Meta y puede tardar.
- [x] Estado vacío que lleve a sincronizar o crear, y `skeleton` durante la carga.
- [x] `pages/TemplatesPage.tsx` + barrel `index.ts`.
- [x] `router.tsx`: ruta lazy `/settings/templates` como hija de `AppLayout`, guardada por rol admin.
- [x] `components/layout/nav-config.ts`: entrada de navegación con `roles: ['admin']`.
- [x] Revisada en **light y dark** con tokens semánticos; cero `bg-[#...]` (el único punto fuera
      del vocabulario `success/destructive/muted` es `amber-*` para `PENDING`, mismo patrón ya
      usado en `IndexingStatusBadge`).

## Tests (Vitest)

### Aislamiento multi-tenant (obligatorio)

- [x] `whatsapp-template.isolation.test.ts`:
      - [x] Plantilla creada bajo tenantA no aparece en `listTemplates(tenantB)`.
      - [x] `buildTemplatePayload(tenantB, idDeA, [...])` → 404 (indistinguible de "no existe",
            nunca 403).
      - [x] Dos tenants con el **mismo `name` + `language`** coexisten sin violar el índice único.
      - [x] `syncTemplates(tenantA)` no marca como obsoletas las plantillas de tenantB.

### Casos funcionales

- [x] `whatsapp-template.service.test.ts`:
      - [x] `syncTemplates` crea las nuevas, actualiza el `status` de las existentes y marca
            `obsoleta: true` las que Meta ya no devuelve (sin borrarlas).
      - [x] `syncTemplates` recorre todas las páginas del cursor de Meta — probado en
            `meta-template.client.test.ts`, donde vive la paginación real.
      - [x] `buildTemplatePayload` con `status: 'PENDING'` → `AppError` 422 y el cliente de Meta
            **no** se llama.
      - [x] `buildTemplatePayload` con 1 parámetro para un cuerpo de 2 → `AppError` 400 con
            `{ esperados: 2, recibidos: 1 }`.
      - [x] `parametrosBody` se deriva bien de `"Hola {{1}}, tu cita es el {{2}}"` → 2.
      - [x] `createTemplate` que falla en Meta no deja documento local.

### `sendOutbound`

- [x] `message.service.test.ts` (ampliado):
      - [x] `modo:'texto'` con ventana abierta → `sendText`, `Message` con `tipo:'text'`.
      - [x] `modo:'texto'` con ventana cerrada → `AppError` 422 con el mensaje literal de siempre
            (test de no-regresión de la bandeja).
      - [x] `modo:'auto'` con ventana cerrada y `plantillaFallback` → `sendTemplate`, `Message` con
            `tipo:'template'`.
      - [x] `modo:'auto'` con ventana cerrada y sin fallback → 422.
      - [x] `modo:'plantilla'` con ventana **abierta** → permitido.
      - [x] Cuota agotada → falla antes de llamar a Meta en los tres modos.
      - [x] Un envío por plantilla exitoso llama a `incrementUsage`.

### Contrato HTTP

- [x] `whatsapp-template.routes.test.ts` (Supertest, patrón de `lead.routes.test.ts`):
      - [x] `GET /api/templates` sin sesión → 401.
      - [x] `GET /api/templates` con rol distinto de admin → 403.
      - [x] `POST /api/messages/template` sin `X-CSRF-Token` → 403.
      - [x] `GET /api/templates` paginado devuelve `{ data, page, limit, total }`.

### Frontend

- [x] `TemplatePreview.test.tsx`: sustituye los placeholders por los ejemplos.
- [x] `TemplateList.test.tsx`: filtra por estado y muestra el estado vacío cuando no hay ninguna.

## Documentación

- [x] `docs/data-model.md`: añadir la colección `whatsapp_templates` con sus índices.
- [x] `docs/integrations/meta-whatsapp.md` §4: describir el flujo real (sync, alta, envío,
      selección de modo) y apuntar a `sendOutbound` como único juez de la ventana.
- [x] `docs/api-contract.md`: añadir los cuatro endpoints nuevos al resumen.

## Verificación final

- [x] `pnpm --filter backend typecheck` sin errores.
- [x] `pnpm --filter backend test` con todos los tests en verde (438/438).
- [x] `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.
- [ ] **Prueba manual (Definition of Done):** enviar una plantilla aprobada a un contacto con la
      ventana de 24 h **cerrada** y confirmar que llega al celular. _Requiere credenciales reales
      de Meta y un celular — acción del usuario, igual que en `HT-WA-01-V2`._
- [x] No quedaron capturas de verificación sueltas (no se tomaron; el frontend se verificó con
      `build`/`lint`/`vitest`, no con Playwright en esta sesión).

## Definición de "hecho"

Cada empresa ve su catálogo de plantillas con su estado real en Meta, puede darlas de alta y
enviarlas con parámetros, y el sistema elige solo entre texto libre y plantilla según la ventana de
24 h. `HU-FLOW-02` puede pedir un recordatorio sin saber nada de ventanas, y la épica de
Remarketing tiene sobre qué construirse.
