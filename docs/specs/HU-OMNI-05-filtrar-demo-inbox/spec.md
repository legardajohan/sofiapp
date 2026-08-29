# HU-OMNI-05 — Filtrar conversaciones demo de la bandeja omnicanal (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Es un ajuste puntual sobre `HU-OMNI-01` (bandeja base): la bandeja real no debe
> mostrar nunca los datos que el seed de desarrollo siembra para pruebas locales.

**Estado:** implementado

## Objetivo

Que `GET /api/conversations` (`listConversations`) **nunca** devuelva clientes creados por el
seed de desarrollo (`apps/backend/src/seed/seed-inbox-demo.ts`), para que la bandeja omnicanal
solo liste conversaciones reales llegadas por el webhook de Meta.

## Contexto de dominio

El seed marca sus clientes de prueba con el prefijo `demo-` en `metaUserId`
(`DEMO_PREFIX = 'demo-'`, `seed-inbox-demo.ts:41`). Esa misma convención ya la usa la propia
función de limpieza del seed (`limpiarDemo`, `{ metaUserId: { $regex: '^demo-' } }`) para borrar
esos registros — es el identificador establecido en el proyecto para "esto es dato demo", no un
campo nuevo a introducir.

`listConversations` construye su filtro de Mongo en la función interna `buildFiltro`
(`apps/backend/src/features/conversation/conversation.service.ts:55-78`), que hoy combina
`filtro` (mios/sin_asignar/sofi), `asignadoA`, `estado` y `etiqueta`, pero no excluye lo demo.

## Alcance

Incluye:

- Excluir en `buildFiltro` cualquier `Cliente` cuyo `metaUserId` empiece por `demo-`, de forma
  **incondicional** (no depende de ningún query param) y combinada con los demás filtros ya
  existentes.
- Un test unitario que verifique la exclusión y que los clientes normales se conservan.

Fuera de alcance (no se hace en este feature):

- Borrar los datos demo ya sembrados en una base existente — eso ya lo cubre
  `pnpm --filter @sofiapp/api seed:inbox -- --tenant=<id> --reset`.
- Añadir un campo dedicado (p. ej. `esDemo: Boolean`) para marcar registros de prueba. Se sigue
  usando el prefijo de `metaUserId` porque es la convención ya establecida por el seed y no hay
  volumen de datos que justifique un campo e índice nuevos; si el volumen crece, revisar.
- Cambios de UI: el frontend no necesita tocarse, ya consume `GET /api/conversations` tal cual.

## Criterios de aceptación

1. `listConversations` no devuelve, en ninguna combinación de `filtro`/`asignadoA`/`estado`/
   `etiqueta`, un `Cliente` cuyo `metaUserId` empiece por `demo-`. La exclusión es incondicional:
   no existe ningún query param que la desactive.
2. La exclusión se combina correctamente con los filtros existentes de `buildFiltro` sin alterar
   su comportamiento actual (un cliente real que cumple `filtro`/`asignadoA`/`estado`/`etiqueta`
   sigue apareciendo igual que antes).
3. El conteo total (`countScoped`) usado para la paginación refleja también la exclusión — no hay
   páginas con huecos ni un total que cuente registros demo que luego no aparecen en `data`.
4. **Aislamiento multi-tenant:** el filtro sigue construyéndose como `FilterQuery` y pasando por
   `findScoped`/`countScoped` (`apps/backend/src/repositories/base.repository.ts`); prohibido
   `Cliente.find()`/`Cliente.countDocuments()` directos. `tenantId` sigue naciendo de
   `req.user!.tenantId`, nunca del filtro.
5. `pnpm --filter @sofiapp/api typecheck` en verde. TypeScript `strict`, sin `any`.
6. `pnpm --filter @sofiapp/api test` en verde, incluyendo un nuevo caso en
   `conversation.filters.test.ts` que crea un cliente `metaUserId: 'demo-...'` y uno normal, y
   verifica que `listConversations` solo devuelve el normal.

## Dependencias

- `HU-OMNI-01` — bandeja de WhatsApp (`listConversations`, `buildFiltro`), ya implementada.
- `HU-OMNI-02` — filtros combinables de bandeja (`asignadoA`, `estado`), que `buildFiltro` ya
  soporta y con los que la nueva cláusula debe convivir.
- Seed `apps/backend/src/seed/seed-inbox-demo.ts` — fuente de la convención `DEMO_PREFIX`.
