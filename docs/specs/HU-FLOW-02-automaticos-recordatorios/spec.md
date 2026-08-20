# HU-FLOW-02 — Mensajes automáticos y recordatorio antes de las 24 h (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Añade el eje del **tiempo** al motor de flujos: hasta ahora todo pasaba como
> reacción a un mensaje entrante.

**Estado:** creado

## Objetivo

Que un flujo pueda enviar mensajes en pasos programados (no solo al recibir una respuesta) y que
una conversación inactiva reciba un recordatorio **antes** de que se cierre la ventana de servicio
de 24 h — con plantilla HSM si la ventana ya expiró.

## Contexto de dominio (importante)

**La ventana de 24 h ya tiene dueño.** `Cliente.ventana24hExpiraEn` se recalcula en cada inbound
(`cliente.service.ts:44,65`) y `HT-WA-02` concentra la decisión libre-vs-plantilla en
`sendOutbound`. Esta spec **no vuelve a implementar esa regla**: pide un envío y deja que
`sendOutbound` elija el modo. Duplicarla sería tener dos verdades sobre cuándo se puede escribir.

**El motor sigue siendo puro.** `HU-FLOW-01` dejó `flow.engine.ts` como una función de datos a
datos, y el nodo `espera` ya existe en el vocabulario. Lo que falta es quién despierta al flujo
cuando pasa el tiempo: esta spec crea el worker `flow-runtime`, cuyo nombre lleva reservado desde
`docs/architecture.md` sin que exista ni la cola ni el proceso.

**Dos disparadores distintos, un mismo camino de salida:**

| Disparador | Origen | Qué reanuda |
|---|---|---|
| Nodo `espera` | El propio flujo llegó a un nodo de pausa | El flujo, en el nodo siguiente |
| Recordatorio de inactividad | Un barrido periódico, sin que el flujo lo pidiera | Un envío puntual; el flujo no se mueve |

## Alcance

Incluye:
- Cola `flow-runtime` real, con su worker.
- Ejecución de nodos `espera` como jobs diferidos.
- Barrido periódico que detecta conversaciones a punto de perder la ventana y encola el
  recordatorio.
- Configuración del recordatorio por tenant (antelación, plantilla, activado/desactivado).
- Configuración de los mensajes automáticos y del recordatorio dentro del editor de flujos.

Fuera de alcance (otros features):
- Catálogo y envío de plantillas HSM → `HT-WA-02` (esta spec lo consume).
- Campañas masivas y su rate limiting → épica M07.
- Secuencias de nurturing de varios días con su propia cadencia.
- Recordatorios sobre canales que no sean WhatsApp.

## Criterios de aceptación

1. Existe la cola `flow-runtime` con un worker real en `worker.ts`. El nombre estaba reservado en
   `docs/architecture.md` y `apps/backend/CLAUDE.md`, pero no había ni cola ni worker.
2. Un nodo `espera` con `minutos: N` encola un job diferido y el flujo se reanuda en el nodo
   siguiente al vencer el plazo, sin intervención del cliente.
3. Si el cliente responde **mientras** el flujo está en un nodo `espera`, la respuesta manda: el
   flujo avanza por el camino de la respuesta y el job diferido pendiente queda anulado (no produce
   un segundo avance).
4. Un barrido periódico detecta las conversaciones cuya `ventana24hExpiraEn` cae dentro de la
   franja de antelación configurada y que no han recibido ya su recordatorio, y encola un job por
   conversación.
5. El recordatorio **no se envía** si en la conversación hubo actividad después del último inbound
   que abrió la ventana, si `iaHabilitada` es `false` (un asesor la tomó), o si el
   `estadoComercial` es `pagado` o `perdido`.
6. **Idempotencia:** una misma conversación recibe como máximo un recordatorio por ventana. Dos
   barridos solapados no producen dos envíos.
7. **Definition of Done de la historia:** una conversación inactiva recibe el recordatorio correcto
   antes de que expire su ventana de 24 h. Existe un test que lo demuestra manipulando el reloj.
8. Si la ventana **ya expiró** cuando el recordatorio sale, se envía como plantilla HSM aprobada.
   La elección la hace `sendOutbound` (`HT-WA-02`); esta spec no reimplementa la regla de ventana.
9. Si el recordatorio debe salir como plantilla y el tenant no tiene ninguna configurada o aprobada,
   el envío se omite y queda registrado, sin reintentos infinitos ni error del job.
10. Los envíos automáticos consumen la cuota `mensajesMes` del plan igual que cualquier otro
    outbound; con la cuota agotada el job termina sin enviar y lo registra.
11. El editor de flujos permite configurar los mensajes automáticos (nodo `espera` + nodo
    `mensaje`) y, por tenant, el recordatorio: antelación, plantilla y si está activo. Terminado en
    light y dark con los tokens semánticos.
12. **Aislamiento multi-tenant:** el barrido recorre varios tenants, pero cada job resultante opera
    con el `tenantId` de su conversación y toda lectura/escritura pasa por el repositorio
    tenant-safe. Existe un test con dos tenants que demuestra que el recordatorio de uno nunca se
    envía con las credenciales, la plantilla ni la cuota del otro.
13. `pnpm --filter backend typecheck` en verde, `pnpm --filter backend test` en verde y
    `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.

## Dependencias

- `HU-FLOW-01` — el motor, el modelo `Flow`/`FlowState` y el nodo `espera`.
- `HT-WA-02` — `sendOutbound` y el catálogo de plantillas HSM. **Dependencia dura:** sin plantillas
  no se puede cumplir el criterio 8.
- `HT-WA-01-V2` — el canal operativo.
- `HU-SAAS-02` (implementado) — la cuota `mensajesMes`.

## Nota de trazabilidad

Completa el módulo **M06 — Constructor Visual de Flujos** de `docs/product.md` §5 (Fase 3) junto con
`HU-FLOW-01`. Se conserva el ID `HU-FLOW-02` del backlog del cliente.
