# HU-IA-04 — Visualizar conversación, etiquetas y resumen (roles) (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`.

**Estado:** implementado

## Objetivo

Que quien abre una conversación tenga delante, sin buscar nada, las tres cosas que necesita para
responder: **lo que se dijo** (el hilo), **cómo está clasificada** (las etiquetas) y **de qué va**
(el resumen). Y que el resumen —prosa que la IA escribe sobre toda la conversación— quede sujeto al
mismo control de acceso que el resto de los datos personales del contacto.

De las tres piezas, dos ya están en la vista. La historia se juega en la tercera, y en cerrar la
fuga que abre.

## Punto de partida: qué ya existe

Verificado en el código, no asumido. Todo lo de esta tabla se **reutiliza**; nada se rehace.

| Pieza | Dónde vive hoy |
|---|---|
| Hilo de la conversación en la columna central | `ConversationThread` montado en `InboxPage.tsx`, con `useThread` → `GET /conversations/:id/messages` |
| Etiquetas visibles y quitables sin abrir menú | Franja de `TagChip` bajo la cabecera de `InboxPage.tsx`; `TagSelector` para aplicarlas |
| Etiquetas ya hidratadas en el DTO | `toConversationResponse` (`conversation.mapper.ts`) devuelve `tags: ITagResponse[]` — la bandeja no hace una segunda llamada |
| Resumen por IA persistido | `Cliente.resumenIA` + `toResumenResponse()` (`cliente.service.ts:150`), con `desactualizado` derivado de `ultimoMensajeAt` |
| Generación del resumen bajo demanda | `generateConversationSummary()` (`conversation.service.ts:271`) → `POST /conversations/:id/summary` |
| Tarjeta de resumen ya diseñada | `ContactSummaryCard.tsx` (estados vacío / pendiente / desactualizado / regenerar) |
| Gate de datos sensibles por subrol | `puedeVerDatosSensibles(user)` y `authorizeSubrol(subroles)` (`authorize-subrol.middleware.ts`), con `SUBROLES_DATOS_SENSIBLES = ['director','manager']` |
| Enmascarado en lectura | `maskCorreo` / `maskDocumento` / `MASK_VALOR` (`utils/mask.util.ts`) |
| Gemelo del gate en la UI | `puedeVerDatosSensibles()` y `MOTIVO_DATOS_SENSIBLES` (`src/lib/roles.ts`) |
| Decisión de arquitectura que lo gobierna | `docs/adr/0006-subrol-datos-sensibles.md` |
| Refresco en vivo de la bandeja | `useInboxRealtime.ts` (`message:new`, `conversation:updated`, `conversation:assigned`) |

## Los huecos reales (verificados en el código)

1. **El resumen no está en la vista de la conversación.** Vive en la ficha del contacto, tercera
   columna, que arranca **colapsada** (`useInboxStore.ts` → `contactPanelOpen: false`) y exige pasar
   cinco tarjetas de scroll —contacto, «Editar datos», lead, notas, extracción— antes de llegar a
   `ContactSummaryCard`. En la práctica, nadie lo lee antes de contestar.

2. **El resumen es el único campo de la ficha sin control de acceso.** `getContactHistory`
   (`cliente.service.ts:217-223`) enmascara `contacto` y `datosExtraidos` pasándoles
   `puedeVerSensibles`, pero devuelve `resumen: toResumenResponse(cliente)` **sin ese argumento**.
   `toResumenResponse` ni siquiera lo acepta.

3. **Y eso es una fuga real, no teórica.** El resumen se genera sobre el transcript **completo** de
   la conversación. Un `coordinator` ve `d••••@empresa.com` en la tarjeta de contacto y, dos
   tarjetas más abajo, puede leer «el cliente dejó su correo diego@empresa.com» en el resumen. Es
   exactamente la forma de dato que ADR-0006 cerró para las notas, con este argumento literal: *"es
   prosa libre donde acaba cualquier cosa y no hay forma de enmascararla selectivamente"*.

4. **Ninguna ruta de conversación distingue subroles.** Las nueve de `conversation.routes.ts` llevan
   `authorize(['admin'])` y nada más. `POST /:id/summary` —que además paga una llamada al LLM de
   entre 7 y 26 s— está abierta a cualquier admin.

5. **No hay `GET` del resumen.** Solo existe el `POST` que lo genera, y `GET /clientes/:id/history`,
   que para leer tres frases arrastra la ficha completa más veinte mensajes. Una vista que quiera
   mostrar el resumen hoy paga todo eso.

6. **El hilo se renderiza dos veces.** `ContactPanel.tsx` monta su propio `ConversationThread` con
   `history.mensajes.data` al final del panel, mientras la columna central ya pinta el mismo hilo
   con `useThread`. Con la ficha abierta, la misma conversación aparece duplicada en pantalla.

7. **El subrol `asesor` que nombra el título de la historia no existe.** Los subroles son
   `director | manager | coordinator | secretary` (`user.types.ts`). "Asesor" es el nombre coloquial
   de cualquier `admin` del tenant, no un subrol asignable.

8. **Hoy ningún usuario tiene `subrol`.** AUTH-02 lo dejó como metadata y nunca hubo CRUD para
   asignarlo; un `admin` sin subrol conserva acceso total, por decisión explícita de ADR-0006. El
   gate solo se activa sembrando el subrol a mano. Los criterios de abajo se verifican con tests que
   lo siembran, no con datos de producción.

## Alcance

Incluye:

**Backend**
- `GET /api/conversations/:id/overview`: cabecera + etiquetas + resumen + los permisos del usuario
  que pregunta, en una sola lectura ligera. **Sin el hilo** — pagina y llega por tiempo real.
- `getConversationOverview(tenantId, clienteId, puedeVerSensibles)` en el service, sobre el
  repositorio scoped y reutilizando `toConversationResponse` y `toResumenResponse`.
- **El resumen entra en el conjunto de datos sensibles**: `toResumenResponse` pasa a recibir el
  permiso, y `getContactHistory` se lo pasa. El gate va en el service, no solo en la ruta nueva, o
  la fuga se sortea llamando al endpoint viejo.
- `POST /conversations/:id/summary` se cierra con `authorizeSubrol(SUBROLES_DATOS_SENSIBLES)`: quien
  no puede leer el resumen tampoco puede pagarlo.
- Nota de enmienda en `docs/adr/0006-subrol-datos-sensibles.md`: el resumen se suma al conjunto que
  gobierna el subrol, por el mismo argumento que las notas.

**Frontend**
- Tira de resumen colapsable en la columna central, entre las etiquetas y el hilo: dos líneas y
  «Ver más», con el estado recordado por conversación.
- Cuando el resumen está vedado, la tira muestra **el motivo**, no un hueco.
- Se quita el `ConversationThread` duplicado de `ContactPanel`.
- `ContactSummaryCard` respeta el permiso, para que la ficha y la tira no se contradigan.

Fuera de alcance:
- **CRUD de subroles.** Sigue pendiente desde AUTH-02 y ADR-0006 ya registró su ausencia. Sin él el
  gate no se activa en producción; esta historia no lo resuelve y lo deja dicho.
- Restringir acciones operativas por subrol (responder, etiquetar, toggle de Sofi, reasignar,
  convertir en lead). Quedan abiertas a cualquier `admin`: quitárselas a un `coordinator` es la
  misma pérdida de funcionalidad que ADR-0006 ya lamentó con las notas.
- Mover la ficha del contacto, cambiar su orden interno o añadir una cuarta columna.
- Resumen automático al abrir la conversación: se sigue generando bajo demanda, porque cuesta.
- Paginación del hilo dentro de `overview`.
- Un motor de permisos granular por usuario. ADR-0006 ya lo dejó apuntado como destino a largo
  plazo; esta historia no lo abre.

## Criterios de aceptación

1. **Las tres piezas en una vista.** Con una conversación abierta y sin abrir la ficha del contacto,
   se ven a la vez el hilo, las etiquetas aplicadas y el resumen. Sin toggles y sin scroll lateral.
2. **El resumen no empuja al hilo fuera de pantalla.** La tira nace colapsada a dos líneas; «Ver
   más» la expande y el estado se recuerda mientras dure la sesión de esa conversación.
3. **Sin resumen todavía, la tira invita a generarlo** en vez de mostrarse vacía; el estado
   `desactualizado` sigue siendo visible, como ya lo era en la ficha.
4. **`GET /api/conversations/:id/overview` responde** `{ conversation, resumen, permisos }`.
   `conversation` trae las etiquetas ya hidratadas; `resumen` es `null` si no se ha generado.
5. **El endpoint no incluye el hilo**, a propósito: el hilo pagina y se refresca por tiempo real.
6. **`permisos` describe al usuario que pregunta:** `verResumen`, `generarResumen` y `verSensibles`,
   resueltos con `puedeVerDatosSensibles` del token, nunca con nada que venga del cliente.
7. **El resumen queda vedado a `coordinator` y `secretary`:** `overview` devuelve `resumen: null` y
   `permisos.verResumen: false` para ellos, y `resumen` poblado para `director` y `manager`.
8. **La misma regla en el endpoint antiguo:** `GET /clientes/:id/history` deja de devolver el
   resumen a quien no puede verlo. Un test lo comprueba, porque cerrar solo la ruta nueva no cierra
   nada.
9. **`POST /conversations/:id/summary` responde 403** a `coordinator` y `secretary`, y sigue
   funcionando para `director` y `manager`.
10. **Un `admin` sin `subrol` conserva acceso total** a las tres piezas y a la generación. Es la
    regla vigente de ADR-0006 y no cambia aquí: romperla dejaría fuera a todos los tenants actuales.
11. **Vedado no es vacío.** Con `verResumen: false`, la tira y `ContactSummaryCard` muestran el
    motivo (`MOTIVO_DATOS_SENSIBLES`) y ocultan el botón de generar. Distinguir "no hay resumen" de
    "no puedes verlo" es requisito, no matiz.
12. **La UI oculta, el backend decide.** La visibilidad de la tira se toma de `permisos` del
    servidor, no de una comprobación de rol hecha solo en el navegador.
13. **El hilo aparece una sola vez.** Con la ficha del contacto desplegada, la conversación no se
    duplica en pantalla.
14. **Aislamiento multi-tenant:** el `overview` de una conversación de tenantA responde 404 con un
    token de tenantB; toda lectura nueva pasa por el repositorio `*Scoped` y el `tenantId` nace del
    token. Test de aislamiento añadido y en verde.
15. **Backend en verde:** `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`) y
    `pnpm --filter @sofiapp/api test` sin errores ni regresiones.
16. **Frontend en verde:** `pnpm --filter @sofiapp/web build`, `lint` y `test` sin errores, con la
    tira terminada en claro y oscuro usando los tokens semánticos del proyecto.

## Definition of Done

Un `director` abre una conversación y ve, de arriba abajo y sin tocar nada: quién es, sus etiquetas,
un resumen de dos líneas que puede expandir, y el hilo. Un `coordinator` abre la misma conversación
y ve lo mismo salvo el resumen, en cuyo lugar lee por qué no puede verlo — y si intenta generarlo
por API, recibe un 403. Un `admin` sin subrol sigue viéndolo todo, como hasta hoy.

## Dependencias

- `HU-OMNI-03` — `Cliente.resumenIA`, `toResumenResponse`, `generateConversationSummary`,
  `ContactSummaryCard`, `GET /clientes/:id/history` → **cerrada**.
- `HU-OMNI-04` — etiquetas hidratadas en `IConversationResponse`, `TagChip`, `TagSelector` → **cerrada**.
- `HU-CRM-02` / `ADR-0006` — `puedeVerDatosSensibles`, `authorizeSubrol`, enmascarado y el criterio
  de "vedado no es vacío" → **cerrada**. Esta historia **enmienda** el ADR para sumarle el resumen.
- `AUTH-02` — `AdminSubrol` como metadata; su CRUD sigue pendiente y condiciona el criterio 8 → **cerrada**.
- `HU-IA-03` — la bandeja comparte cabecera y franjas con el aviso de handoff → **implementado** en
  `feat/HU-IA-01`, rama sobre la que se construye esta HU.
