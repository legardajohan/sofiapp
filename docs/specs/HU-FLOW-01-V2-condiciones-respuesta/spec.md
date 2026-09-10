# HU-FLOW-01-V2 — Condiciones basadas en respuestas del cliente (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Es el runtime del constructor de flujos: el componente de mayor riesgo técnico del
> proyecto según `docs/product.md` §8.

**Estado:** creado

## Por qué V2

Sustituye a `docs/specs/HU-FLOW-01-condiciones-respuesta/` (creada el 2026-08-18, nunca
implementada). El contenido técnico de V1 sigue vigente — se conserva íntegro — pero dos cosas
cambiaron:

1. **Dependencias.** V1 se escribió cuando `HT-WA-01-V2` aún no estaba mergeada. Hoy
   (2026-08-29) `origin/develop` ya integra `HT-WA-01-V2`, `HT-WA-02`, `HU-CRM-01/02/03`,
   `HU-OMNI-01/02/04`, `HT-AI-01` y `HU-KB-01/02` — todas las dependencias están satisfechas.
2. **UX/UI explícita.** El usuario pidió expresamente que esta historia se implemente "de manera
   prolija" en experiencia de usuario e interfaz. V1 ya recogía varias de estas decisiones, pero
   como notas de `plan.md` (guía de implementación), no como criterios de aceptación verificables.
   V2 las eleva a criterios numerados (16–23) para que queden sujetas a la misma verificación que
   el resto de la historia.

## Objetivo

Permitir que un Administrador defina un flujo de conversación con nodos y ramas, y que el sistema
avance por la rama correcta según lo que responde el cliente. Es el primer momento en que SofiApp
**responde sola** por WhatsApp: hoy el worker inbound persiste el mensaje y no hace nada más
(`workers/inbound-message.processor.ts:71`, `TODO(Fase 3)`).

## Contexto de dominio (importante)

**No existe un modelo `Conversation`.** En este proyecto la conversación **es** el documento
`Cliente` (`docs/domain.md` §2). Por eso el estado del flujo se guarda en una colección propia
`flow_states`, con clave única `{tenantId, clienteId}`, y no como un campo más de `Cliente` — que ya
carga 20+ campos.

**El esquema ya estaba diseñado.** `docs/data-model.md` define las colecciones `flows` y
`flow_states` como trabajo de Fase 3, y `docs/architecture.md` ya fija `@xyflow/react` 12.x en el
stack y reserva el worker `flow-runtime`. Esta spec implementa ese diseño, no inventa uno nuevo.

### El flujo NO duplica la base de conocimiento

Esta es la restricción de diseño central de la historia, y entra como criterio verificable, no como
recomendación.

SofiApp ya sabe **qué** responder: la base de conocimiento (`HU-KB-01`), las FAQs con cortocircuito
semántico (`HU-KB-02`) y el `AIService` que encadena caché exacta → FAQ → RAG. Un flujo que
guardase sus propios textos de respuesta crearía una segunda fuente de verdad: el admin editaría la
KB y el bot seguiría contestando lo viejo desde un nodo.

Por eso el reparto es:

| Responsabilidad | Dónde vive |
|---|---|
| **Qué** se responde a una pregunta de conocimiento | KB + FAQs (`HU-KB-01/02`) |
| **Cuándo** se pregunta, **qué** se pide y **a dónde** se va después | El flujo |
| **Cómo** suena la marca (tono, instrucciones) | `PromptTemplate` del tenant (`HT-AI-01`) |

En la práctica: el nodo `kb` **delega** en `AIService.chat()` y no persiste ni una línea de
conocimiento; los nodos `condicion` e `intencion` solo enrutan y no admiten texto de respuesta. El
único nodo que lleva texto propio es `mensaje`, y es para lo operativo (saludo, confirmación,
despedida), no para responder preguntas del negocio.

### Vocabulario de nodos

El workflow que se quiere expresar —detectar intención, solicitar dato, ejecutar acción, consultar
KB, transferir a humano— se cubre con el enum ya documentado en `data-model.md`:

| Verbo | `tipo` de nodo | Qué hace |
|---|---|---|
| Detectar intención | `intencion` | Clasifica el mensaje contra las etiquetas que declara el nodo y ramifica |
| Solicitar dato | `captura` | Pide un dato y lo guarda en `flow_states.variables` |
| Ejecutar acción | `accion` | Efectos de dominio ya existentes (estado, etiquetas, lead, asignación) |
| Consultar KB | `kb` | Delega en `AIService.chat()`: caché → FAQ → RAG |
| Transferir a humano | `handoff` | Apaga `iaHabilitada` y avisa al asesor |
| — | `mensaje` | Envía texto operativo o plantilla |
| — | `condicion` | Ramifica por `igual_a \| contiene \| opcion_elegida` |
| — | `espera` | Pausa N minutos (lo consume `HU-FLOW-02`) |

## Alcance

Incluye:
- Modelos `Flow` (definición) y `FlowState` (runtime por conversación).
- Motor de ejecución **puro** y testeable sin infraestructura.
- Enganche en el worker inbound, con guardas para no pisar a un asesor humano.
- Endpoints `GET/POST /api/flows`, `GET/PUT /api/flows/:id`.
- Editor visual con `@xyflow/react`, con los 8 refuerzos de UX descritos en los criterios 16–23.

Fuera de alcance (otros features):
- Nodos `espera`, mensajes programados y recordatorio de 24 h → `HU-FLOW-02`.
- Envío fuera de la ventana de 24 h → `HT-WA-02` (esta spec lo consume vía `sendOutbound`).
- Versionado con historial navegable de flujos: se guarda `version` y `estado`, pero no hay UI de
  "volver a la versión anterior".
- Métricas de conversión por rama del flujo.
- Nodo `api` (llamadas HTTP salientes a terceros) del enum de `data-model.md`: se reserva el valor,
  no se implementa.

## Criterios de aceptación

1. `POST /api/flows` crea un flujo con `nodos` y `aristas`; `PUT /api/flows/:id` lo actualiza y
   sube `version`. `GET /api/flows` lista los del tenant y `GET /api/flows/:id` devuelve uno.
2. La validación de grafo rechaza en el borde (400, con Zod) un flujo con: nodos huérfanos (sin
   arista entrante y que no son el nodo de entrada), aristas que apuntan a un `id` inexistente,
   cero o más de un nodo de entrada, o `id` de nodo duplicados.
3. Como máximo **un** flujo por tenant tiene `activo: true`. Activar uno desactiva el anterior en la
   misma operación.
4. Un nodo `condicion` evalúa `igual_a`, `contiene` y `opcion_elegida` sobre la respuesta del
   cliente y el motor avanza por la arista correspondiente. `contiene` e `igual_a` comparan sin
   distinguir mayúsculas ni tildes.
5. Toda `condicion` tiene una rama por defecto; si ninguna condición casa, el motor toma esa rama y
   nunca se queda atascado ni lanza.
6. El motor de ejecución es una **función pura**: dados `(flow, flowState, mensajeEntrante)`
   devuelve `{ nodoSiguiente, efectos[] }` sin tocar Mongo, Redis ni la Graph API. Sus tests corren
   sin base de datos.
7. **Definition of Done de la historia:** existe un test que define un flujo con al menos dos ramas
   y demuestra que dos respuestas distintas del cliente recorren caminos distintos y terminan en
   nodos distintos.
8. Al llegar un mensaje entrante, el flujo avanza **solo si** el tenant tiene un flujo `activo` y
   `cliente.iaHabilitada` es `true`. Si un asesor tomó la conversación (`iaHabilitada: false`), el
   flujo no interviene.
9. Un nodo `handoff` pone `iaHabilitada: false` y emite el evento de tiempo real correspondiente, de
   modo que el flujo se detiene y la conversación queda para un humano.
10. **El flujo no duplica la KB:** el nodo `kb` no persiste texto de conocimiento — su `config` solo
    admite `{ pregunta, kSobrescrito?, siNoHayRespuesta }` — y los nodos `condicion` e `intencion`
    no admiten campos de texto de respuesta. Un intento de guardar un flujo que viole esto es
    rechazado por Zod con 400. Existe un test que lo demuestra.
11. El nodo `kb` responde llamando a `AIService.chat()`, de modo que hereda la caché exacta, el
    cortocircuito por FAQ y el RAG ya implementados, y su consumo queda registrado en
    `AiUsageLog` como cualquier otra llamada.
12. Todo envío del flujo pasa por `sendOutbound` (`HT-WA-02`), así que respeta la ventana de 24 h y
    consume la cuota `mensajesMes` del plan.
13. El editor visual permite crear nodos, arrastrarlos, conectarlos y definir las condiciones de
    cada rama; guarda el grafo y muestra los errores de validación del backend. Terminado en light
    y dark con los tokens semánticos.
14. **Aislamiento multi-tenant:** `Flow` y `FlowState` se leen y escriben siempre por el repositorio
    tenant-safe. Un flujo del tenant A no es legible ni ejecutable desde el tenant B, y el
    `FlowState` de una conversación de A nunca se resuelve con el flujo de B; existe un test que lo
    demuestra.
15. `pnpm --filter backend typecheck` en verde, `pnpm --filter backend test` en verde y
    `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.

### UX/UI (nuevo en V2 — antes eran notas de plan, ahora son verificables)

16. El editor muestra un **estado vacío guiado** cuando el flujo no tiene nodos: invita a crear el
    nodo de entrada en vez de mostrar un canvas en blanco sin affordance.
17. `FlowsPage` distingue **visualmente** (badge, no solo texto) cuál flujo está `activo` entre los
    listados del tenant.
18. Activar un flujo que desactivaría el flujo activo anterior pide **confirmación explícita**
    (`AlertDialog`) antes de aplicar el cambio.
19. Guardar el flujo muestra **estado de carga** (botón deshabilitado + spinner) durante la
    mutación; si el guardado falla, el canvas conserva los cambios sin perderlos.
20. El nodo `handoff` es **visualmente inequívoco** (color e icono propios) frente a los demás tipos
    de nodo: debe leerse como la salida del automatismo, no como un nodo más.
21. Los errores de validación que devuelve el backend se **anclan al nodo culpable** (resaltado +
    mensaje in situ en el `NodeInspector`), no un toast genérico con el detalle de Zod.
22. El `NodeInspector` no tapa el `FlowCanvas` en un viewport de laptop mínimo (~1280px de ancho):
    ambos conviven sin recortarse.
23. El editor completo (canvas, nodos, inspector, listado) queda terminado en **light y dark** con
    los tokens semánticos del proyecto; cero `bg-[#...]`.

## Dependencias

- `HT-WA-01-V2` (implementado) — sin webhook operativo no hay mensaje entrante que dispare nada.
- `HT-WA-02` (implementado) — aporta `sendOutbound`, por el que salen los mensajes del flujo.
- `HT-AI-01` + `HU-KB-01/02` (implementados) — el `AIService` y la KB en los que delegan los nodos
  `kb` e `intencion`.
- `HU-OMNI-01/02` (implementados) — la bandeja, `iaHabilitada` y el tiempo real del `handoff`.
- `HU-CRM-01` (implementado) — `createLeadFromConversation`, que reusa el nodo `accion`.

## Nota de trazabilidad

Realiza el módulo **M06 — Constructor Visual de Flujos** de `docs/product.md` §5 (Fase 3). Se
conserva el ID `HU-FLOW-01` del backlog del cliente, con sufijo `-V2` de replaneación interna.
