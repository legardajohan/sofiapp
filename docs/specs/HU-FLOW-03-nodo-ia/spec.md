# HU-FLOW-03 — Conectar la IA en cualquier paso del flujo (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Cierra el vocabulario de nodos del constructor de flujos: hasta ahora la IA
> resolvía preguntas puntuales *dentro* de un nodo; aquí pasa a llevar la conversación durante
> varios turnos y devolver el control por la rama que corresponda.

**Estado:** creado

## Objetivo

Que un nodo del flujo pueda ceder el turno al asistente de IA, dejarlo conversar con el cliente
tantos turnos como haga falta, y **retomar el flujo por la rama que corresponde al resultado** de esa
conversación.

## Contexto de dominio (verificado por exploración de código antes de planear)

**La IA ya está conectada al motor, pero solo de a un turno.** `flow.runtime.service.ts:32-78`
resuelve las peticiones `requiere` del motor (`intencion`, `kb`, `captura`) con `AIService`. Cada una
es una pregunta cerrada que se responde de una vez y devuelve el control al flujo inmediatamente. Lo
que no existe es un nodo donde la IA **se quede** llevando la conversación.

**No hay ningún orquestador conversacional que reusar.** `HU-IA-01`/`HU-IA-02` se citan en
`docs/specs/HU-KB-01-cargar-conocimiento/` como consumidoras futuras del RAG, pero nunca se
escribieron. El único camino por el que hoy responde el bot es el motor de flujos
(`inbound-message.processor.ts:80-90`). Esta spec, por tanto, **construye** ese comportamiento
conversacional dentro del nodo, apoyándose en lo que sí existe: `AIService` con su caché, su
cortocircuito por FAQ y su RAG sobre la KB (`services/ai/ai.service.ts`).

**El motor es puro y así se queda.** `avanzar()` nunca hace IO: pide con `requiere` y el runtime
resuelve (`flow.engine.ts:184-190`). El nodo `ia` sigue exactamente ese contrato — es lo que permite
testear su lógica de ramificación sin tocar Gemini.

**La forma del nodo ya está inventada.** `intencion` es `etiquetas[] + ramaPorDefecto`, y
`HU-FLOW-01-V3` le dio handles de salida por rama derivados de `config` (`nodeVisuals.ts:54-101`).
El nodo `ia` reusa ese mismo esqueleto: `salidas[] + ramaPorDefecto`. Ni el canvas ni el inspector
necesitan un mecanismo nuevo.

**La diferencia real con `intencion`:**

| | `intencion` | `ia` |
|---|---|---|
| Turnos | Uno: clasifica y sale | Varios: conversa hasta poder decidir |
| Qué le dice al cliente | Nada | Responde con la KB y el objetivo del nodo |
| Historial que ve | El mensaje que disparó la invocación | La conversación real |
| Cuándo sale | Siempre, en el mismo turno | Cuando la IA lo decide, o al agotar `maxTurnos` |

## Alcance

Incluye:
- Tipo de nodo `ia` en el vocabulario del motor, del modelo y de la validación.
- Ejecución multi-turno del nodo en el motor puro y su resolución en el runtime.
- Historial conversacional real como contexto de la IA.
- Tipo de nodo `ia` en el editor de flujos, con sus handles de salida por rama.

Fuera de alcance (otros features):
- Un asistente de IA que responda **fuera** de un flujo → sería `HU-IA-01`, que no existe.
- Cambiar `AIService`, el RAG o el catálogo de prompts → `HT-AI-01` / épica KB.
- Que la IA ejecute acciones por su cuenta (function calling, herramientas): el nodo decide una
  salida, y las acciones las hacen los nodos `accion` que vengan después.
- Streaming de la respuesta o "escribiendo…" en la bandeja.

## Criterios de aceptación

1. Existe el tipo de nodo `ia` en `TIPOS_NODO`, con su rama `.strict()` en el
   `z.discriminatedUnion` de `flow.validation.ts` y su `case` en el `switch` exhaustivo de
   `flow.engine.ts`. Su config es `{ objetivo, salidas[], ramaPorDefecto, maxTurnos, usarKb }`.
2. **Un nodo `ia` cede el turno y retoma por una rama.** Cuando la IA determina que se cumplió una
   de las salidas declaradas, el flujo continúa por el `nodoDestino` de esa salida. Es el criterio
   literal de la historia.
3. **Continuidad conversacional.** Mientras la IA no pueda decidir una salida, responde al cliente y
   el flujo se queda en el nodo esperando el siguiente mensaje. Su contexto es el **historial real
   de la conversación**, no solo el último mensaje — que es todo lo que ven hoy `intencion`, `kb` y
   `captura`.
4. **El nodo termina siempre.** Al alcanzar `maxTurnos` el flujo sale por `ramaPorDefecto` sin
   volver a llamar a la IA. `maxTurnos` es obligatorio y acotado por Zod; un flujo no puede
   guardarse con un nodo `ia` capaz de conversar indefinidamente.
5. **La validación del grafo trata `ia` como un nodo que ramifica**, igual que `condicion` e
   `intencion`: los `nodoDestino` de sus salidas y su `ramaPorDefecto` deben existir, y un nodo
   alcanzable solo desde una salida de `ia` **no** cuenta como huérfano.
6. **La IA no pisa a un asesor humano.** Si `iaHabilitada` pasa a `false` mientras el flujo está en
   un nodo `ia`, el nodo deja de responder — igual que el resto del flujo.
7. **Cada respuesta del nodo consume cuota** `mensajesMes` como cualquier otro outbound, porque sale
   por `sendOutbound`. Con la cuota agotada el nodo no envía y queda registrado, sin tumbar el flujo.
8. **El editor soporta el nodo `ia`**: está en la paleta, expone en el canvas un punto de conexión
   por salida más el de la rama por defecto (mismo mecanismo que `intencion`, derivado de `config`
   y sin aristas huérfanas), y su panel permite editar objetivo, salidas, `maxTurnos` y `usarKb`.
   Terminado en light y dark con los tokens semánticos y componentes del UI kit.
9. **Aislamiento multi-tenant:** el historial que alimenta al nodo se lee con el repositorio
   tenant-safe y el `tenantId` del token/job; la llamada a `AIService` lleva ese mismo `tenantId`,
   de modo que la plantilla de prompt, la caché y la KB consultadas son las del tenant dueño de la
   conversación. Existe un test con dos tenants que demuestra que ni el historial ni la KB de uno
   alimentan nunca la respuesta del otro.
10. `pnpm --filter backend typecheck` en verde, `pnpm --filter backend test` en verde y
    `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.

## Dependencias

- `HU-FLOW-01-V3` (implementado) — el motor, el modelo `Flow`/`FlowState`, el editor y los handles
  por rama que este nodo reusa.
- `HU-FLOW-02` — **rama base.** No hay dependencia funcional entre ambas, pero las dos tocan
  `flow.types.ts`, `flow.validation.ts`, `flow.engine.ts` y `NodeInspector.tsx`; van secuenciales
  para no resolver el mismo conflicto dos veces.
- `HT-AI-01` (implementado) — `AIService` con `extract()`, caché, FAQ y RAG.
- `HU-KB-*` (implementado) — la base de conocimiento que consulta el nodo cuando `usarKb` es `true`.
- `HU-SAAS-02` (implementado) — la cuota `mensajesMes` del criterio 7.

## Riesgos aceptados

Un nodo `ia` gasta una llamada a Gemini por cada mensaje del cliente mientras dure. Las tres
defensas, todas ya presentes o exigidas aquí: `maxTurnos` obligatorio y acotado en Zod (criterio 4),
el `TOPE_RESOLUCIONES = 5` que ya limita las reentradas del runtime dentro de una invocación
(`flow.runtime.service.ts:30`), y la cuota `mensajesMes` sobre cada respuesta enviada (criterio 7).

## Nota de trazabilidad

Cierra el módulo **M06 — Constructor Visual de Flujos** de `docs/product.md` §5 (Fase 3) junto con
`HU-FLOW-01` y `HU-FLOW-02`. Se conserva el ID `HU-FLOW-03` del backlog del cliente.
