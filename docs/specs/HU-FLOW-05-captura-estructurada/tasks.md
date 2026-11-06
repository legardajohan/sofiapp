# HU-FLOW-05 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Rama: `feat/HU-FLOW-05`.

## 0. Corrección del motor primero (criterios 1–2)

> Va primero porque es un bug en producción e independiente del resto: el test de regresión debe
> fallar **antes** del fix y pasar después.

- [ ] Test de regresión en `flow.runtime.service.test.ts`: `kb → ia` en el mismo turno envía ambos
      mensajes en orden (falla con el código actual).
- [ ] Test: `accion (aplicar_etiquetas) → ia` aplica la etiqueta.
- [ ] Test: tope de 5 resoluciones con `requiere` pendiente → se ejecutan los efectos acumulados y el
      estado queda en el nodo pendiente.
- [ ] `correrMotor`: acumular `efectos` de todas las rondas y ejecutar el acumulado.
- [ ] `flow.types.ts`: `resueltos.capturaFallida`. `resolverRequiere('captura')` lo devuelve cuando
      no hay valor; el motor sigue esperando sin `requiere`.
- [ ] Test: captura sin dato extraído → **una** llamada a `extract` en ese mensaje.

## 1. Catálogo `contact-field` (criterios 3–6)

- [ ] `contact-field.types.ts`: `TIPOS_DATO_CAMPO`, `CAMPOS_FIJOS_CONTACTO`, `CLAVES_RESERVADAS`,
      `IContactField(Document)`, DTOs, `IContactFieldResponse`.
- [ ] `contact-field.model.ts`: `tenantId` requerido + indexado; índices únicos `{tenantId,key}` y
      `{tenantId,labelNormalizado}`; `{tenantId,activo,orden}`.
- [ ] `contact-field.validation.ts`: schemas `{ body, params, query }` `.strict()`.
- [ ] `contact-field.service.ts`: list / create (slug + reservadas + duplicados) / update (sin tocar
      `key`) / archive / `getCamposPorKey` / `assertKeysDelCatalogo`. Solo `*Scoped`, `AppError`, `.lean()`.
- [ ] `contact-field.controller.ts`: delgado, `tenantId` del token, mapea a `IContactFieldResponse`.
- [ ] `contact-field.routes.ts`: cadena fija de middlewares, `authorize(['admin'])`.
- [ ] Montar `app.use('/api/campos-contacto', contactFieldRoutes)` en `app.ts`.
- [ ] `seed/backfill-contact-fields.ts` + llamada al arrancar junto a `backfillContactOptions`.

## 2. Captura con destino (criterios 7–14)

- [ ] `flow.types.ts`: `DestinoCaptura`, campos opcionales de `captura`, efecto `guardar_dato`,
      `EntradaMotor.contacto`.
- [ ] `flow.validation.ts`: `destino` (discriminatedUnion estricta), `saltarSiExiste`, `sobrescribir`.
- [ ] `flow.service.ts`: canonizar `campo`/`tipoDato`, defaults y `assertKeysDelCatalogo` en
      `createFlow`/`updateFlow` (`400` con el id del nodo).
- [ ] `flow.engine.ts`: saltar si existe · efecto `guardar_dato` · variable siempre actualizada.
- [ ] Mover `ACTOR_SISTEMA_FLUJO` a una constante compartida.
- [ ] `cliente.service.ts`: `guardarDatoDesdeFlujo` (validación, sobrescribir, fusión por key, cifrado
      helper, máximo 30, auditoría enmascarada).
- [ ] `flow.runtime.service.ts`: snapshot `contacto` por mensaje; `SlotSpec` con opciones de rol y
      `tipoDato` del catálogo; `ejecutarEfecto('guardar_dato')` + efecto de prueba.
- [ ] `sandbox.types.ts`: `dato_guardado`.

## 3. Ficha del contacto (criterio 15)

- [ ] `cliente.validation.ts`: `label`/`sensible` opcionales en atributos.
- [ ] `updateCliente`: keys del catálogo (archivadas solo si ya estaban); `label`/`sensible` desde el
      catálogo.

## 4. Frontend (criterios 14, 16–19)

> Antes de escribir cualquier componente: invocar `emil-design-eng`, `impeccable:impeccable` y
> `frontend-design:frontend-design` (regla 7 del `CLAUDE.md` raíz). Usar shadcn/ui; revisar claro y oscuro.

- [ ] `contacts/api.ts` + `types.ts` + `hooks/useContactFields.ts`.
- [ ] `CamposPersonalizadosManager.tsx` (crear, renombrar, tipo, sensible, archivar; errores en línea).
- [ ] `CampoPersonalizadoSelect.tsx` con "Crear campo…".
- [ ] `AtributosEditor.tsx`: elegir del catálogo en vez de teclear el nombre.
- [ ] `flows/types.ts` + `CapturaForm`: "Guardar en", variable de solo lectura, interruptores, chips de
      rol, aviso si la key está archivada.
- [ ] `assistant-sandbox`: tipo + tarjeta `dato_guardado`.

## 5. Tests

- [ ] `contact-field.service.test.ts`: crear; slug estable al renombrar; duplicado por key y por label
      sin tildes → `409`; reservadas (`nombre`, `Email`, `Teléfono`) → `400`; archivar.
- [ ] `backfill-contact-fields.test.ts`: crea las keys que faltan, `sensible` por OR, idempotente,
      omite reservadas.
- [ ] `flow.validation.test.ts`: destino válido/ inválido; flujo sin destino sigue validando.
- [ ] `flow.engine.test.ts`: saltar si existe (no envía pregunta, variable con el valor guardado);
      no saltar con `saltarSiExiste: false`; efecto `guardar_dato` solo con destino ≠ variable;
      config legada sin destino = comportamiento actual.
- [ ] `flow.service`: canoniza `campo`; key inexistente/archivada → `400`.
- [ ] `cliente.guardar-dato.test.ts`: sobrescribir `false` con dato previo → no escribe; `true` →
      escribe; correo inválido → `invalido`; rol fuera del catálogo → `invalido`; atributo
      `numero` inválido; fusión por key sin tocar otros atributos; auditoría con `'[oculto]'`.
- [ ] `updateCliente`: atributo con key fuera del catálogo → `400`; label del body ignorado.
- [ ] **Aislamiento** (`contact-field.isolation.test.ts`, `flow.isolation.test.ts`):
  - [ ] campo del tenant A no se lista / edita / archiva desde B (`404`);
  - [ ] flujo de B con key que solo existe en A → `400`;
  - [ ] `guardar_dato` no escribe en un `Cliente` de otro tenant;
  - [ ] el backfill de A no crea campos en B.
- [ ] Frontend: `CapturaForm.test.tsx`, `CamposPersonalizadosManager.test.tsx`, ajuste de
      `ContactEditDialog.test.tsx` y `SandboxChat.test.tsx`.

## 6. Documentación

- [ ] `docs/data-model.md`: `contact_fields`; config de `captura`; nota de `atributos` (key del catálogo).
- [ ] `docs/domain.md`: glosario e invariantes.
- [ ] `docs/api-contract.md`: `/api/campos-contacto` y el `400` del PATCH de clientes.
- [ ] `docs/adr/0013-catalogo-campos-contacto.md`.
- [ ] `.test-chat/00-flows-documentation.md`: destino de captura y fin del bug de efectos (fuera de git).

## Verificación final

- [ ] `pnpm --filter @sofiapp/api typecheck` sin errores.
- [ ] `pnpm --filter @sofiapp/api test` en verde (incluye aislamiento y regresión del motor).
- [ ] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint && pnpm --filter @sofiapp/web test`.
- [ ] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.
- [ ] `spec.md` → `**Estado:** implementado`.

## Definición de "hecho"

Un flujo puede preguntar el nombre, la institución o el rol y dejarlos en la ficha del contacto con
claves únicas por empresa, sin volver a preguntar lo que ya se sabe. Los campos personalizados de la
ficha y de los flujos salen del mismo catálogo. Y el motor ya no pierde mensajes ni acciones cuando
un nodo de IA sigue a otro nodo en el mismo turno.
