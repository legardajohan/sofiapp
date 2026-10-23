# HU-FLOW-04 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Frontend: invocar las 3 skills de diseño antes de cada componente (raíz §7).

## Implementación — Backend (`apps/backend/src/features/flow/`)

- [x] `flow.types.ts`: `TipoTrigger`, `ITriggerFlow`, `IFlow.trigger?`. (CA 1)
- [x] `flow.model.ts`: subdocumento `trigger` con default `{ tipo: 'siempre' }`. (CA 1)
- [x] `flow.validation.ts`: Zod discriminado `.strict()`; palabras 1..20; HH:mm; `desde < hasta`; zona IANA;
      aceptar `trigger` en create/update. (CA 6)
- [x] `flow.trigger.ts`: `evaluarTrigger` puro reutilizando la normalización del motor. (CA 2, 3, 4)
- [x] `flow.runtime.service.ts`: helper `flujoEnCurso`; evaluar trigger solo al iniciar; retornar
      `{ atendido }`; `esPrimerMensaje` por repositorio scoped. (CA 3, 5)
- [x] `flow.service.ts`/`flow.controller.ts`: el service persiste y devuelve `trigger`; el controller no cambia; confirmar que `trigger` viaja en create/update
      y en las respuestas (controller delgado). (CA 7)
- [x] `workers/inbound-message.processor.ts`: si el flow no atiende → `atenderConSofi`. (CA 2)
- [x] Docs: `docs/data-model.md` (`flows`) y `docs/api-contract.md`.

## Implementación — Frontend (`apps/frontend/src/features/flows/`)

- [x] `types.ts`: `ITriggerFlow` y `trigger` en `FlowDTO`/`SaveFlowPayload`. (CA 7)
- [x] `nodeVisuals.ts`: `NODE_DESCRIPCION` (9 tipos) y `describirRelacion()`. (CA 8, 9)
- [x] `AddNodeMenu.tsx`: `Tooltip` shadcn por opción, hover y foco. (CA 8)
- [x] `components/edges/FlowEdge.tsx` + `edgeTypes` en `FlowCanvas`. (CA 9)
- [x] `FlowCanvas.tsx`: `fitViewOptions`, `minZoom/maxZoom`, `colorMode` desde `useTheme()`. (CA 10, 11)
- [x] `FlowNode.tsx` `w-60`; `FlowEditorPage.tsx` paso de grilla 300. (CA 10)
- [x] `index.css`: `--xy-*`, `Controls`, `Background` y labels con tokens correctos en dark; sin colores
      arbitrarios. (CA 11)
- [x] `TriggerSettings.tsx` y montaje en `FlowEditorPage.tsx` (estado junto a `entrada`, enviado al guardar). (CA 7)

## Tests

- [x] `flow.trigger.test.ts`: siempre; palabra clave con tildes/mayúsculas; primer mensaje; horario dentro,
      fuera, día no permitido y zona horaria distinta. (CA 2, 3, 4)
- [x] `flow.validation.test.ts`: triggers inválidos rechazados. (CA 6)
- [x] `flow.trigger.runtime.test.ts`: flow en curso no re-evalúa; flow terminado vuelve a exigir el trigger;
      flow sin trigger = comportamiento actual; `primer_mensaje` con el repositorio scoped. (CA 1, 3, 5)
- [x] `inbound-message.processor.test.ts`: trigger no cumplido → Sofi; cumplido → flow. (CA 2)
- [x] **`flow.trigger.runtime.test.ts` (bloque de aislamiento): el flow y el trigger del tenant A no se
      evalúan ni disparan para un cliente del tenant B; cada tenant evalúa SU trigger; `primer_mensaje` no
      cuenta mensajes de otro tenant.** (CA 12)
- [x] Confirmar que `tenantId` sigue naciendo del token en `POST/PUT /api/flows` con `trigger` (cubierto por
      `flow.routes.test.ts`/`flow.isolation.test.ts` existentes; revisar que pasen con el campo nuevo). (CA 12)
- [x] Frontend: `describirRelacion`, descripciones de `AddNodeMenu`, `TriggerSettings`. (CA 8, 9, 7)

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` en verde. (CA 13)
- [x] `pnpm --filter @sofiapp/api test` completo en verde: 178 archivos, 1868 tests. (CA 13)
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde; tests del frontend: 87 de 88 archivos pasan. El que falta, `knowledge-base/pages/KnowledgeBasePage.test.tsx`, se cae con `Maximum call stack size exceeded` también en `develop` (no es de este feature). (CA 13)
- [x] Checklist PR de `docs/multi-tenancy.md` §9: el trigger se evalúa con `tenantId` del webhook/token, `countScoped`/`findOneScoped` sin `Model.find` directo, sin índices nuevos.
- [x] Revisión manual del usuario en `/flows/new`, light y dark: aprobada. (CA 8-11)

## Definición de "hecho"

Todos los criterios de `spec.md` cumplidos, tests de aislamiento en verde, light y dark prolijos con tokens
semánticos, docs de datos/API actualizados, `**Estado:** implementado` en `spec.md` al cerrar
`/sdd-implement`.
