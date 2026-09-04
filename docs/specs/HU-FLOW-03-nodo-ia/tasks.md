# HU-FLOW-03 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Antes de tocar `apps/frontend`, invoca `emil-design-eng`,
> `impeccable:impeccable` y `frontend-design:frontend-design` (regla §7 del `CLAUDE.md` raíz).
>
> **Rama base:** `feat/HU-FLOW-02` ya mergeada. Ambas specs tocan `flow.types.ts`,
> `flow.validation.ts`, `flow.engine.ts` y `NodeInspector.tsx`; si HU-FLOW-02 no está integrada,
> para y avisa antes de empezar.
>
> **Regla que atraviesa el feature:** la decisión de por qué rama sale el nodo se toma en el
> **motor puro**, con los datos que el runtime ya resolvió. Si aparece una llamada a `AIService`
> dentro de `flow.engine.ts`, está mal.

## Implementación — Backend

### 1. Vocabulario y validación

- [ ] `features/flow/flow.types.ts`: `'ia'` en `TIPOS_NODO`; interfaz `ISalidaIa`; rama `ia` de
      `ConfigNodo` (`objetivo`, `salidas`, `ramaPorDefecto`, `maxTurnos`, `usarKb`).
- [ ] `features/flow/flow.types.ts`: `RequiereMotor` gana
      `{ tipo: 'ia'; objetivo; salidas; usarKb }` y `EntradaMotor.resueltos` gana
      `ia?: { respuesta: string; salida: string | null }`.
- [ ] `features/flow/flow.model.ts`: `'ia'` en el `enum` de `tipo` del `NodoSchema`.
- [ ] `features/flow/flow.validation.ts`: rama `.strict()` de `ia` con `maxTurnos` entre 1 y 10 y
      `salidas` entre 1 y 8.
- [ ] `features/flow/flow.validation.ts` (`superRefine` del grafo): `ia` se suma a los tipos que
      ramifican — sus `nodoDestino` y su `ramaPorDefecto` deben existir, y los nodos alcanzables
      desde ellos **no** cuentan como huérfanos (criterio 5). Son dos sitios: la comprobación de
      destinos y el conjunto de alcanzables.

### 2. Motor puro

- [ ] `features/flow/flow.engine.ts`: `case 'ia'` con las tres situaciones **en este orden** —
      (a) `resueltos.ia` presente → sale por la rama de `salida`, o responde y se queda si es
      `null`; (b) `turnos >= maxTurnos` → sale por `ramaPorDefecto` sin llamar a la IA;
      (c) primera pasada → emite `requiere` y cede el control.
      _Comprobar el tope antes de mirar `resueltos` tiraría una respuesta ya pagada a Gemini._
- [ ] Contador de turnos en `variables` bajo `_ia:<nodoId>:turnos`, y **borrado** del objeto de
      variables al salir del nodo por cualquier rama. Sin campo nuevo en `FlowState`.
- [ ] Al salir por una rama, el nodo **no** emite `enviar_mensaje`: habla el nodo destino.

### 3. Runtime

- [ ] `flow.runtime.service.ts`: `construirHistorial(tenantId, clienteId, limite)` — `findScoped`
      sobre `Message`, orden `createdAt` descendente, `limite`, array invertido; `sender: 'user'`
      → `'user'`, `bot`/`agent` → `'model'`; descarta mensajes sin `texto`.
      _Constante `TURNOS_HISTORIAL = 20` en el módulo, no una env var._
- [ ] `flow.runtime.service.ts`: usar `construirHistorial` **solo** en el caso `'ia'`.
      `intencion`, `kb` y `captura` conservan su historial de un turno.
- [ ] `flow.runtime.service.ts`: `resolverRequiere` case `'ia'` — **una sola** llamada a
      `ai.extract()` con dos `SlotSpec` (`respuesta`, `salida`) y schema
      `{ respuesta: string; salida: enum | '' → null }`.
- [ ] Con `usarKb: true`, anteponer al historial un turno con los fragmentos de
      `searchKnowledge(tenantId, mensajeCliente)` (`features/kb/kb.retrieval.service.ts`, ya
      tenant-scoped). Con `usarKb: false`, no se consulta la KB.

## Implementación — Frontend

- [ ] `features/flows/types.ts`: espejo exacto de `TIPOS_NODO` y de la rama `ia` de `ConfigNodo`.
- [ ] `components/nodeVisuals.ts`, los cinco puntos: `NODE_VISUALS.ia` (`Sparkles`,
      `destacado: true`), `configPorDefecto`, `resumenConfig`, `filasDeRama` (una fila por salida +
      la de defecto) y `configConDestino`; excluir `ia` de `tieneSalidaLineal`.
- [ ] `components/IaOutputsEditor.tsx`: lista de salidas (etiqueta + descripción + `DestinoSelect`),
      añadir y quitar, sobre el patrón ya probado de las etiquetas de `intencion`.
- [ ] `components/NodeInspector.tsx`: `<IaForm>` (objetivo, `usarKb`, `maxTurnos`, salidas,
      rama por defecto) + su rama en el render por `nodo.config.tipo`.
- [ ] Texto largo con el afordance "Ver más" de `HU-FLOW-01-V3` en las descripciones de las salidas;
      nada de scroll horizontal.
- [ ] El panel explica que **al elegir una salida, el mensaje lo da el nodo siguiente** — es la duda
      que tiene todo el que dibuja este nodo por primera vez.
- [ ] "Máximo de turnos" acompañado de su coste ("cada turno es una consulta al modelo"), no un
      número desnudo.
- [ ] Reusar `textarea`, `input`, `switch`, `select` del UI kit; nada hecho a mano.
- [ ] Revisar en **light y dark** con tokens semánticos; cero `bg-[#...]`.
- [ ] `AddNodeMenu.tsx` **no** se toca (itera `TIPOS_NODO`); confirmar que el tipo aparece solo.

## Tests (Vitest)

### Aislamiento multi-tenant (obligatorio)

- [ ] `flow.isolation.test.ts` (ampliar): con dos tenants que tienen un cliente cada uno,
      - [ ] `construirHistorial(tenantA, clienteDeB)` devuelve vacío: nunca mensajes de B.
      - [ ] La llamada a `AIService` de un nodo `ia` del tenant A lleva el `tenantId` de A, de modo
            que la plantilla de prompt, la clave de caché y la KB consultadas son las de A.
      - [ ] `searchKnowledge` se invoca con el `tenantId` de la conversación, nunca con otro.

### Motor puro — `flow.engine.test.ts`

- [ ] Sin `resueltos.ia`: devuelve `requiere: { tipo: 'ia', ... }` y no emite efectos.
- [ ] Con `salida` que coincide con una etiqueta: avanza al `nodoDestino` de esa salida
      (**criterio 2, el DoD de la historia**) y **no** envía la respuesta de ese turno.
- [ ] Con `salida` que no coincide con ninguna etiqueta: avanza por `ramaPorDefecto`.
- [ ] Con `salida: null`: emite `enviar_mensaje` con la respuesta, se queda en el nodo y deja
      `esperandoRespuesta: true` (criterio 3).
- [ ] El contador `_ia:<nodoId>:turnos` sube un turno por cada respuesta y **desaparece** de
      `variables` al salir del nodo por cualquier rama.
- [ ] Alcanzado `maxTurnos`: sale por `ramaPorDefecto` y **no** devuelve `requiere` (criterio 4).
- [ ] Un `resueltos.ia` que llega justo con el contador en el tope se atiende igual: no se descarta
      una respuesta ya generada.

### Validación — `flow.validation.test.ts`

- [ ] `maxTurnos: 0`, `maxTurnos: 11` y `salidas: []` → 400.
- [ ] Una clave extra en el `config` de un nodo `ia` → 400 (`.strict()`).
- [ ] Un `nodoDestino` de salida que no existe → 400.
- [ ] Un nodo alcanzable **solo** desde una salida de `ia` no se reporta como huérfano (criterio 5).

### Nodo `ia` de punta a punta — `flow.ia-node.test.ts`

- [ ] Con `AIService` mockeado devolviendo primero `salida: null` dos veces y luego una etiqueta:
      el flujo envía dos mensajes, se queda en el nodo entre medias y termina en el nodo destino.
- [ ] El historial que recibe el mock contiene los mensajes previos de la conversación en orden
      cronológico, no solo el último (criterio 3).
- [ ] Con `usarKb: false` no se llama a `searchKnowledge`; con `true`, sí, y sus fragmentos llegan
      al historial.
- [ ] `iaHabilitada: false` en el cliente → el nodo no responde ni llama a la IA (criterio 6).
- [ ] Cuota agotada → `sendOutbound` lanza, se registra y el flujo no se cae (criterio 7).

## Documentación

- [ ] `docs/domain.md` y `docs/data-model.md`: el nodo `ia` en el vocabulario de tipos de nodo, con
      su `config`.
- [ ] `docs/integrations/llm-provider.md`: el nodo `ia` como consumidor de `AIService.extract()` y
      de `searchKnowledge`. _Aprovechar para corregir la interfaz `ILlmProvider` del doc, que sigue
      sin `LlmCallResult<T>` ni `embedTexts` y ya no coincide con
      `integrations/llm/llm-provider.types.ts`._

## Verificación final

- [ ] `pnpm --filter backend typecheck` sin errores.
- [ ] `pnpm --filter backend test` con todos los tests en verde.
- [ ] `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.
- [ ] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.
- [ ] **Prueba manual E2E:** añadir un nodo `ia` con dos salidas al flujo demo de
      `seed-flow-crm-ventas.ts` y comprobar por WhatsApp que conversa varios turnos y retoma por la
      rama correcta.
- [ ] Las capturas de verificación quedaron en `.playwright-mcp/` o el scratchpad, y se borraron.

## Definición de "hecho"

Un flujo con un nodo de IA conversa con el cliente durante los turnos que haga falta, con el
historial real de la conversación como contexto, y retoma por la rama que corresponde a lo que pasó
en esa conversación. Con esto el vocabulario de nodos del módulo M06 queda cerrado.
