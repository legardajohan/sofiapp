# HU-FLOW-02 — Mensajes automáticos y recordatorio antes de las 24 h (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Añade el eje del **tiempo** al motor de flujos: hasta ahora todo pasaba como
> reacción a un mensaje entrante.

**Estado:** implementado

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

### Actualización tras `HU-FLOW-01-V3` (verificado por exploración de código antes de replanear)

Esta spec se escribió antes de V3. Cuatro hechos del código actual la afinan:

1. **El nodo `espera` ya está terminado en todo menos en la ejecución.** Está en `TIPOS_NODO`
   (`flow.types.ts:13`), tiene su rama Zod (`flow.validation.ts:96`), y el editor ya lo ofrece en
   la paleta con su icono, su `configPorDefecto`, su `resumenConfig` y su `EsperaForm`
   (`NodeInspector.tsx:368-380`) — que hoy muestra el aviso literal *"los nodos de espera se
   guardan, pero el flujo todavía no los ejecuta"*. El frontend de esta spec se reduce por tanto a
   retirar ese aviso y a la pantalla de configuración del recordatorio (criterio 11).
2. **El motor no tiene cómo pedir una espera.** `flow.engine.ts:178-180` devuelve
   `esperandoRespuesta: true` y se queda en el nodo, sin decirle nada al runtime. Hace falta un
   `Efecto` nuevo, `programar_espera`, para no romper la separación "el motor devuelve datos, el
   runtime los ejecuta" metiendo un campo suelto en `SalidaMotor` (criterio 2).
3. **`FlowState` no tiene con qué invalidar un job pendiente**: no existe `esperaToken` ni `jobId`
   en `IFlowState` (`flow.types.ts:114-125`) ni en el schema. Es la pieza del criterio 3.
4. **La versión de `bullmq` es `^5.34.0`**, que sí expone `upsertJobScheduler`. El fallback
   (`repeat: { every }` con `jobId` fijo) queda como nota histórica, no hace falta.

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
- Configuración del recordatorio por tenant (antelación, plantilla, activado/desactivado), con sus
  dos endpoints de lectura y escritura para el `admin` del tenant.
- Pantalla de configuración del recordatorio, y ajuste del panel del nodo `espera` en el editor.

Fuera de alcance (otros features):
- Catálogo y envío de plantillas HSM → `HT-WA-02` (esta spec lo consume).
- Campañas masivas y su rate limiting → épica M07.
- Secuencias de nurturing de varios días con su propia cadencia.
- Recordatorios sobre canales que no sean WhatsApp.

## Criterios de aceptación

1. Existe la cola `flow-runtime` con un worker real en `worker.ts`. El nombre estaba reservado en
   `docs/architecture.md` y `apps/backend/CLAUDE.md`, pero no había ni cola ni worker.
2. Un nodo `espera` con `minutos: N` encola un job diferido y el flujo se reanuda en el nodo
   siguiente al vencer el plazo, sin intervención del cliente. El motor pide la espera con un
   `Efecto` (`programar_espera`), no ejecutándola él mismo: `flow.engine.ts` sigue siendo una
   función pura de datos a datos y quien encola es el runtime.
3. Si el cliente responde **mientras** el flujo está en un nodo `espera`, la respuesta manda: el
   flujo avanza por el camino de la respuesta y el job diferido pendiente queda anulado (no produce
   un segundo avance). Anulado significa **descartado al despertar** por token desparejado, no
   borrado de la cola: entre "el cliente responde" y "el job arranca" hay una carrera real, y
   comprobar el token dentro de la ejecución la elimina.
4. Un inbound que llega estando el flujo parado en un nodo `espera` **no** encola una segunda
   espera. Sin esta guarda, cada mensaje del cliente durante la pausa volvería a emitir
   `programar_espera`.
5. Un barrido periódico detecta las conversaciones cuya `ventana24hExpiraEn` cae dentro de la
   franja de antelación configurada y que no han recibido ya su recordatorio, y encola un job por
   conversación.
6. El recordatorio **no se envía** si en la conversación hubo actividad después del último inbound
   que abrió la ventana, si `iaHabilitada` es `false` (un asesor la tomó), o si el
   `estadoComercial` es `pagado` o `perdido`.
7. **Idempotencia:** una misma conversación recibe como máximo un recordatorio por ventana. Dos
   barridos solapados no producen dos envíos.
8. **Definition of Done de la historia:** una conversación inactiva recibe el recordatorio correcto
   antes de que expire su ventana de 24 h. Existe un test que lo demuestra manipulando el reloj.
9. Si la ventana **ya expiró** cuando el recordatorio sale, se envía como plantilla HSM aprobada.
   La elección la hace `sendOutbound` (`HT-WA-02`); esta spec no reimplementa la regla de ventana.
10. Si el recordatorio debe salir como plantilla y el tenant no tiene ninguna configurada o
    aprobada, el envío se omite y queda registrado, sin reintentos infinitos ni error del job.
11. Los envíos automáticos consumen la cuota `mensajesMes` del plan igual que cualquier otro
    outbound; con la cuota agotada el job termina sin enviar y lo registra.
12. **Configuración en la UI.** Los mensajes automáticos ya se configuran con los nodos `espera` y
    `mensaje` del editor desde `HU-FLOW-01-V3`; lo que falta y esta spec entrega es:
    a. El panel del nodo `espera` deja de advertir que el flujo no lo ejecuta y muestra en su lugar
       una previsión legible del plazo.
    b. Una pantalla de configuración del recordatorio **por tenant** (activo, antelación, texto y
       plantilla), con vista previa de lo que se enviaría antes de activarlo.
    Terminado en light y dark con los tokens semánticos y componentes del UI kit.
13. **Aislamiento multi-tenant:** el barrido recorre varios tenants, pero cada job resultante opera
    con el `tenantId` de su conversación y toda lectura/escritura pasa por el repositorio
    tenant-safe. La configuración del recordatorio se lee y escribe con el `tenantId` del token,
    nunca de params. Existe un test con dos tenants que demuestra que el recordatorio de uno nunca
    se envía con las credenciales, la plantilla ni la cuota del otro.
14. `pnpm --filter backend typecheck` en verde, `pnpm --filter backend test` en verde y
    `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.

## Dependencias

- `HU-FLOW-01` — el motor, el modelo `Flow`/`FlowState` y el nodo `espera`.
- `HT-WA-02` — `sendOutbound` y el catálogo de plantillas HSM. **Dependencia dura:** sin plantillas
  no se puede cumplir el criterio 9.
- `HT-WA-01-V2` — el canal operativo.
- `HU-SAAS-02` (implementado) — la cuota `mensajesMes`.

## Nota de trazabilidad

Avanza el módulo **M06 — Constructor Visual de Flujos** de `docs/product.md` §5 (Fase 3) junto con
`HU-FLOW-01`; lo cierra `HU-FLOW-03` (nodo `ia`), que va después y en su propia rama. Se conserva el
ID `HU-FLOW-02` del backlog del cliente.

## Orden de trabajo

`feat/HU-FLOW-02` sale de `feat/HU-FLOW-01-V3-ajustes-editor` y, una vez integrada,
`feat/HU-FLOW-03` sale de ella. No hay dependencia funcional entre ambas, pero las dos tocan
`flow.types.ts`, `flow.validation.ts`, `flow.engine.ts` y `NodeInspector.tsx`: en paralelo
resolverían el mismo conflicto dos veces.
