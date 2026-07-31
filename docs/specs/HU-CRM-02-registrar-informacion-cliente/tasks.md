# HU-CRM-02 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. El QUÉ está en `spec.md`, el CÓMO en `plan.md`.

## Preparación

- [x] `git fetch origin` y crear la rama desde el remoto:
      `git checkout -b feat/HU-CRM-02 origin/develop`.
- [ ] **PENDIENTE (acción humana):** generar la clave de producción/desarrollo
      (`openssl rand -hex 32`) y añadir `DATA_ENC_KEY=<64 hex>` al `.env` local y a las variables
      del Droplet. **No** commitear el valor. Sin ella el arranque no falla, pero el primer intento
      de guardar un dato sensible lanza. En tests ya está inyectada por `vitest.config.ts`.
- [x] Confirmar que `TENANT_TOKEN_ENC_KEY` sigue configurada: el refactor de `crypto.util.ts` no
      cambió la firma pública, `channel.service.ts` no se tocó y `tests/unit/crypto.util.test.ts`
      sigue en verde.

## Implementación — Backend

Utilidades y transversales primero: todo lo demás depende de ellas.

- [x] Refactorizar `utils/crypto.util.ts`: extraer `encryptWith(key, txt)` / `decryptWith(key, txt)`
      y dejar `encrypt` / `decrypt` como envoltorio sobre la clave de tenant. **Firma pública sin
      cambios** — `channel.service.ts` no se toca.
- [x] Crear `utils/field-crypto.util.ts` con `encryptField` / `decryptField` / `isEncrypted` y el
      marcador `enc:v1:`. `decryptField` devuelve tal cual lo que no lleva marcador (dato legado).
- [x] Crear `utils/mask.util.ts` con `MASK_VALOR`, `maskCorreo`, `maskDocumento`.
- [x] Añadir `DATA_ENC_KEY` a `config/env.ts` (64 hex, `.optional()`) y a `.env.example`.
- [x] Crear `middlewares/authorize-subrol.middleware.ts`: `SUBROLES_DATOS_SENSIBLES`,
      `puedeVerDatosSensibles(user)` (admin sin subrol ⇒ `true`) y `authorizeSubrol(subroles)`.
- [x] Extender `features/audit/audit.types.ts`: `AuditAccion` += `'cliente.update'`,
      `'contact-note.create'`; `AuditEntidad` += `'contact-note'`.

Feature `cliente` (orden del patrón de 6 archivos):

- [x] `cliente.types.ts` — `IAtributoPersonalizado`, `IAtributoResponse`, `UpdateClienteDTO`;
      `correoEnc?` / `documentoEnc?` / `atributos` en `ICliente`; `correo`, `documento`,
      `atributos`, `puedeVerSensibles` en `IContactCardResponse`.
- [x] `cliente.model.ts` — `AtributoSchema` (`_id: false`) + los tres campos nuevos. **Sin índices
      nuevos.**
- [x] `cliente.validation.ts` — `updateClienteSchema` con `.strict()` y el `.refine()` de "al menos
      un campo".
- [x] `cliente.service.ts` — `updateCliente(tenantId, actorId, clienteId, dto, puedeVerSensibles)`
      en el orden de `plan.md` (gate → `findByIdScoped` → `$set`/`$unset` cifrando →
      `findOneAndUpdateScoped` → auditoría → mapper). Adaptar `toContactCardResponse` y
      `toDatosExtraidosResponse` para recibir `puedeVerSensibles` y enmascarar.
- [x] `cliente.service.ts` — `extractContactData` cifra el `correo` con `encryptField` antes de
      persistir `datosExtraidos` (criterio 9).
- [x] `cliente.controller.ts` — `updateClienteController`; `getContactHistoryController` calcula
      `puedeVerSensibles` desde `req.user` y lo propaga.
- [x] `cliente.routes.ts` — `PATCH /:id` con `authenticateJWT → requireTenant → authorize(['admin'])
      → validate(updateClienteSchema) → asyncHandler`.

Feature `contact-note` (los 6 archivos, en orden):

- [x] `contact-note.types.ts` — `IContactNote`, `IContactNoteDocument`, `CreateNotaDTO`,
      `INotaResponse`.
- [x] `contact-note.model.ts` — colección `contact_notes`, `tenantId` required+index, índice
      `{ tenantId, clienteId, createdAt: -1 }`.
- [x] `contact-note.validation.ts` — `createNotaSchema` (`texto` 1–2000) y `listNotasSchema`
      (`page`/`limit` con defaults, como `historySchema`).
- [x] `contact-note.service.ts` — `createNota` (valida el `clienteId` contra el tenant **antes** de
      escribir, cifra el texto, audita) y `listNotas` (descifra, hidrata autores con
      `findUsersByIds` en lote, pagina).
- [x] `contact-note.controller.ts` — dos controllers delgados; `clienteId` de `req.params`,
      `autorId` de `req.user!.sub`, query desde `req.validatedQuery`.
- [x] `contact-note.routes.ts` — `Router({ mergeParams: true })`, `POST /` y `GET /` con
      `authorizeSubrol(SUBROLES_DATOS_SENSIBLES)` en la cadena.
- [x] Montar en `app.ts`: `app.use('/api/clientes/:clienteId/notas', contactNoteRoutes)`
      **inmediatamente antes** de `app.use('/api/clientes', clienteRoutes)`.

## Implementación — Frontend

- [x] **Antes de escribir el primer componente**, invocar `emil-design-eng` y
      `frontend-design:frontend-design` y aplicar sus criterios. `impeccable:impeccable`
      **no está instalada** en el entorno (`Unknown skill`); su criterio se aplicó a mano
      (jerarquía, carga cognitiva, a11y, estados vacíos/error, copy) y queda dicho aquí.
- [x] `src/lib/roles.ts` — `puedeVerDatosSensibles(user)`, gemelo del helper del backend.
- [x] `features/inbox/types.ts` — `correo`, `documento`, `atributos`, `puedeVerSensibles` en
      `ContactCardDTO`.
- [x] `features/contacts/types.ts` — `ContactPatchPayload`, `AtributoDTO`, `NotaDTO`.
- [x] `features/contacts/api.ts` — `updateContact`, `fetchNotas`, `createNota`. **Rutas sin el
      prefijo `/api`.**
- [x] `features/contacts/lib/errors.ts` — extractor de mensaje + detector de `403` (para que la
      tarjeta de notas se oculte en vez de mostrar error).
- [x] `features/contacts/hooks/` — `useUpdateContact`, `useContactNotas`, `useCreateNota` con las
      invalidaciones de `plan.md`.
- [x] `components/SensitiveValue.tsx` — valor enmascarado + candado + tooltip explicativo.
- [x] `components/AtributosEditor.tsx` — filas label/valor/`Switch` sensible/quitar + "Agregar".
- [x] `components/ContactEditDialog.tsx` — patrón de la casa; resiembra al abrir con ref
      `sembrado`; campos sensibles `disabled` sin permiso.
- [x] `components/ContactNotesCard.tsx` — misma anatomía que `ContactSummaryCard`; estado vacío,
      skeleton, limpieza del campo tras guardar.
- [x] `features/contacts/index.ts` — superficie pública del slice.
- [x] Cablear en `features/inbox/components/ContactPanel.tsx` (botón "Editar datos" +
      `<ContactNotesCard>`) y `ContactCard.tsx` (correo / documento / atributos).
- [x] Los cuatro componentes nuevos usan **solo tokens semánticos**, verificado por grep: cero
      `bg-[#…]` / `text-[#…]` / `border-[#…]` en `features/contacts/` ni en los dos de `inbox/`
      tocados. Al heredar los tokens, claro y oscuro salen de la misma hoja.
- [ ] **PENDIENTE (acción humana):** revisión visual en claro y oscuro con la app corriendo. No se
      pudo hacer en esta sesión (requiere MongoDB, Redis y `GEMINI_API_KEY` levantados).

## Tests

- [x] `tests/unit/field-crypto.util.test.ts` — ida y vuelta; el cifrado lleva el marcador; un valor
      sin marcador pasa tal cual; dos cifrados del mismo texto **difieren** (IV aleatorio);
      descifrar con otra clave falla.
- [x] `middlewares/authorize-subrol.middleware.test.ts` — `director`/`manager` pasan; `admin` sin
      subrol pasa; `coordinator`/`secretary` → `403`.
- [x] `tests/unit/cliente.update.service.test.ts`:
  - [x] Edita campos no sensibles y los persiste.
  - [x] `correo` y `documento` quedan **cifrados** en el documento y en claro en la respuesta de un
        autorizado.
  - [x] Un `coordinator` que manda `correo` recibe `403` y **no se escribe nada** del body.
  - [x] Un `coordinator` que manda solo `nombre` recibe `200`.
  - [x] La lectura de un `coordinator` devuelve `correo`/`documento` enmascarados y
        `puedeVerSensibles: false`.
  - [x] El `AuditEvent` de `cliente.update` **no contiene** el valor del correo ni del documento.
  - [x] `null` explícito borra el campo; ausente no lo toca.
  - [x] Una clave desconocida (`estadoComercial`, `telefono`, `tagIds`) → `400`.
- [x] `tests/unit/contact-note.service.test.ts` — crea y lista; el texto queda cifrado en Mongo; el
      autor viene resuelto; el orden es descendente por `createdAt`; el `clienteId` inexistente
      → `404`.
- [x] `tests/isolation/contact-note.isolation.test.ts` — **un solo archivo** para los dos endpoints
      (se planearon dos; separarlos duplicaría el mismo `seedClienteEn`): parchear un `Cliente` del
      tenant A desde el B → `404` con el documento intacto; escribir un sensible ajeno no deja
      `correoEnc`; una nota del A no se lee desde el B; crear una nota desde el B con un
      `clienteId` del A falla **sin escribir**; dos tenants no se ven las notas; un id ajeno y uno
      inexistente devuelven el **mismo** 404 y el mismo mensaje.
- [x] `tests/unit/contact-note.routes.test.ts` — **no estaba en el plan.** Se añadió al detectar que
      ningún test cubría el **montaje**: `/api/clientes/:clienteId/notas` va registrado antes que
      `/api/clientes` y Express 5 (path-to-regexp v8) es estricto con los patrones. Cubre también
      que el montaje no tapa `/history` y el gate de subrol extremo a extremo.
- [x] `tests/unit/contact-history.service.test.ts` — **no hizo falta adaptarlo**: los mappers
      recibieron `puedeVerSensibles` con valor por defecto, así que la firma siguió siendo
      compatible. Sigue en verde sin cambios.
- [x] Front: `ContactEditDialog.test.tsx` (guardar deshabilitado sin cambios; campos sensibles
      deshabilitados sin permiso) y `ContactNotesCard.test.tsx` (estado vacío; se limpia tras
      guardar; no se renderiza ante `403`).
- [x] Actualizar fixtures de `ContactPanel.test.tsx` con los campos nuevos.

## Documentación

- [x] `docs/data-model.md` — campos nuevos de `clientes`, sección `## contact_notes`, acciones
      nuevas en `audit_events` con la advertencia del `'[cifrado]'`, nota sobre `customFields`.
- [x] `docs/domain.md` — glosario, entidades, invariante de `ContactNote`.
- [x] `docs/api-contract.md` §6 — filas de `PATCH /clientes/:id` (reescrita), `POST`/`GET
      /clientes/:id/notas` y `GET /clientes/:id/history` (nota sobre el enmascarado).
- [x] `docs/adr/0006-subrol-datos-sensibles.md` — ADR nuevo (estado *aceptado*) + fila en
      `docs/adr/README.md`.
- [x] ~~`docs/specs/HU-CRM-01-…/spec.md`~~ — **NO APLICA en esta rama.** `origin/develop` no tiene
      HU-CRM-01: no existen ni el feature `lead` ni su carpeta de spec (viven en `feat/HU-CRM-01`,
      sin mergear). La corrección de la referencia obsoleta a `HU-CRM-02` habrá que hacerla al
      integrar esa rama.
- [x] `spec.md` de este feature — `**Estado:** implementado`.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` sin errores. *(El filtro del plan decía `backend`; el
      nombre real del paquete es `@sofiapp/api`.)*
- [x] `pnpm --filter @sofiapp/api test` en verde: **416/416**, 57 archivos, incluido el de
      aislamiento.
- [x] `pnpm --filter @sofiapp/web build` y `lint` en verde.
- [ ] `pnpm --filter @sofiapp/web test` — **9/9 de los tests nuevos pasan**, pero la suite completa
      queda roja por **fallos preexistentes ajenos a este feature**. Baseline medido en
      `origin/develop` limpio (con `git stash`): 9 tests rojos en `TagSelector.test.tsx` +
      `kb-progress.test.ts` caído. Tras este feature quedan **4 + kb-progress**: se arreglaron 5 al
      añadir el `TooltipProvider` que faltaba en el render aislado de `TagSelector`. Los 4
      restantes ("Crear etiqueta", HU-OMNI-04) y `kb-progress` (`0 !== 1`, HU-KB) son desajustes
      reales de esas features, no huecos de entorno: arreglarlos exigiría cambiar su
      comportamiento sin spec. **Fuera de alcance, reportado.**
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 completo:
      `*Scoped` en toda query · `tenantId` del token · modelo nuevo con `tenantId` required+index ·
      `requireTenant` tras `authenticateJWT` · test de aislamiento añadido.
- [x] **Cifrado verificado por aserción automática, no a ojo:** `cliente.update.service.test.ts` y
      `contact-note.service.test.ts` serializan el documento recién guardado y comprueban que el
      texto claro del correo, el documento, el atributo sensible y la nota **no aparece por ningún
      lado**, y que el valor persistido empieza por `enc:v1:`.
- [ ] **PENDIENTE (acción humana):** lectura en crudo con Compass/`mongosh` contra la base real, y
      prueba end-to-end (bandeja → editar correo/documento/atributo sensible → agregar nota →
      entrar como `coordinator` y ver máscaras, sin tarjeta de notas y con `403` al editar el
      correo). Requiere MongoDB, Redis y `GEMINI_API_KEY` levantados; no disponible en esta sesión.
- [x] `git status` sin `*.png`/`*.jpg` de verificación visual (no se tomaron capturas).

## Definición de "hecho"

El asesor puede completar y corregir a mano la ficha del contacto sin salir de la conversación, y
dejar notas de seguimiento. Todo lo que es dato personal —correo, documento, notas y los atributos
marcados como sensibles— está cifrado en la base de datos y solo se muestra en claro a los subroles
autorizados; el resto lo ve enmascarado y sabe por qué. Cada cambio deja rastro en `AuditEvent` sin
que la bitácora se convierta en la copia legible de lo que el cifrado protege. El aislamiento entre
tenants está probado sobre los dos endpoints nuevos.
