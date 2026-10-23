# HU-FLOW-04 — Ajustes de UX del editor de flujos y disparador (trigger) (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Parte de `develop`, sobre `HU-FLOW-01-V2/V3`, `HU-FLOW-02` y `HU-FLOW-03`.

**Estado:** creado

## Objetivo

1. Que un flow decida **cuándo arranca** (hoy cualquier mensaje entra al flow activo).
2. Que el editor explique por sí mismo qué hace cada nodo y cómo se relacionan (tooltips).
3. Corregir dos defectos visuales: el primer nodo sale gigante y el canvas queda en blanco en dark.

## Cómo funciona un flow (referencia para el usuario)

Un flow es un guion automático de conversación por WhatsApp. Ejemplo "Ventas CRM":
saludo (*Mensaje*) → *Intención* clasifica el texto (precio / horario / comprar / hablar con alguien) →
precio responde con la *Base de conocimiento*, horario con un *Mensaje*, comprar pasa por una *Condición*
("contiene tarjeta" → texto de pago) → *Captura* pide el correo → *Acción* crea el lead. *Transferir a
humano* apaga la IA y cede la conversación al asesor.

**Qué lo activa hoy:** cualquier mensaje entrante de un cliente con IA habilitada, si el tenant tiene un
flow `activo`; sin flow activo contesta Sofi (RAG). **Qué lo activará:** el `trigger` del flow, evaluado
solo al *iniciar* (cliente sin flow en curso o flow terminado). Un flow en curso no re-evalúa el trigger.
Si el trigger no se cumple, responde Sofi como hoy.

**"Si dice *asesor*, delegar":** ya es posible con un nodo *Condición* (`ultimo_mensaje` *contiene*
"asesor") cuya rama va a un nodo *Transferir a humano* (opcionalmente precedido por *Acción*
`asignar_asesor`). Esta spec añade el tooltip del conector que lo explica. La notificación al asesor
(`handoff.notificarAsesorId`) hoy no se usa en el runtime y queda fuera de alcance.

## Alcance

Incluye:
- Campo `trigger` en `Flow`: `siempre` (default) · `palabra_clave` · `primer_mensaje` · `horario`.
- Evaluación del trigger en el runtime/worker de mensajes entrantes.
- UI para configurar el trigger en el editor.
- Tooltip por tipo de nodo en "Agregar nodo".
- Tooltip en los conectores que explica la relación (con ejemplo de condición).
- Tamaño inicial razonable del primer nodo.
- Dark mode correcto del canvas (nodos, controles de zoom, fondo, etiquetas).

Fuera de alcance:
- Varios flows activos por tenant (se mantiene 1 activo).
- Nodo `api`, MiniMap, métricas por rama, tour/ayuda interactiva.
- Notificar al asesor en el handoff.

## Criterios de aceptación

1. Un flow sin `trigger` se comporta exactamente como hoy (equivale a `siempre`).
2. Trigger `palabra_clave`: un mensaje que contiene alguna palabra (sin distinguir mayúsculas ni tildes)
   inicia el flow; si no la contiene, responde Sofi.
3. Trigger `primer_mensaje`: inicia solo si el cliente no tiene mensajes previos.
4. Trigger `horario`: inicia solo dentro de los días y horas indicados, en la zona horaria configurada.
5. Un flow en curso continúa sin volver a evaluar el trigger.
6. Zod rechaza triggers inválidos (palabras vacías, horas mal formadas, `desde >= hasta`, zona inválida).
7. El editor permite ver y editar el trigger; se persiste y se recarga.
8. Cada opción de "Agregar nodo" muestra un tooltip con qué hace (hover y foco de teclado).
9. Hover/foco en un conector muestra un tooltip con la relación (p. ej. «Si el mensaje contiene "asesor" →
   Transferir a humano»).
10. El primer nodo de un canvas nuevo se ve a ≤ 100 % de zoom, no ocupando el viewport.
11. En dark, nodos, `Controls` (zoom), `Background` y etiquetas usan tokens oscuros; light sin regresión.
12. **Aislamiento multi-tenant:** un test demuestra que el flow/trigger del tenant A no se evalúa ni
    dispara para mensajes del tenant B, y que `tenantId` nunca viene del body.
13. `pnpm --filter @sofiapp/api typecheck` y `test` en verde; `pnpm --filter @sofiapp/web build && lint`
    en verde.

## Dependencias

- `HU-FLOW-01-V2`, `V3`, `HU-FLOW-02`, `HU-FLOW-03` (modelo `Flow`/`FlowState`, motor, runtime, nodo `ia`).
- `DSN-03` (UI kit shadcn, `tooltip`) y `INF-03` (tokens semánticos light/dark).
- `docs/multi-tenancy.md`, `docs/data-model.md` (`flows`), `docs/integrations/meta-whatsapp.md`.
