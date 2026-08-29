# HU-OMNI-05 — Plan técnico (CÓMO)

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `apps/backend/src/features/conversation/conversation.service.ts` | `buildFiltro`: agregar cláusula incondicional de exclusión de clientes demo |
| `apps/backend/src/features/conversation/conversation.filters.test.ts` | nuevo caso: excluye `metaUserId: 'demo-*'`, conserva clientes normales |

No hay archivos nuevos: es un cambio de una línea en una función ya existente, más su test.

## Contrato

### `buildFiltro` (conversation.service.ts:55-78)

Antes del `return f;`, agregar:

```ts
// Los clientes sembrados por el seed de desarrollo (seed-inbox-demo.ts) usan metaUserId
// con prefijo 'demo-'. Nunca deben aparecer en la bandeja real.
f.metaUserId = { $not: /^demo-/ };
```

- Se agrega **de forma incondicional**, fuera de los `if` de `filtro`/`asignadoA`/`estado`/
  `etiqueta`: no depende de ningún parámetro de entrada, cumpliendo el criterio 1 del spec
  ("nunca... no existe query param que la desactive").
- `metaUserId` no se usa en ningún otro punto de `buildFiltro`, así que no hay colisión de
  claves con el resto de la función.
- El objeto resultante sigue siendo un `FilterQuery<IClienteDocument>` plano; `listConversations`
  ya lo pasa sin cambios a `findScoped(Cliente, tenantId, filtroMongo)` y
  `countScoped(Cliente, tenantId, filtroMongo)` (conversation.service.ts:105-173) — ambas
  llamadas heredan la exclusión automáticamente, así que `listConversations` no requiere edición.

### `conversation.filters.test.ts`

Sigue el patrón ya usado en el archivo (sin mocks, Mongo real vía `Cliente.create`, helpers
`crearAdmin`/`crearCliente`, `describe` con el HU en el título):

```ts
describe('conversation.service — exclusión de conversaciones demo (HU-OMNI-05)', () => {
  it('excluye clientes con metaUserId demo- y conserva los normales', async () => {
    const admin = await crearAdmin('Ana');
    const real = await crearCliente({ metaUserId: `wa-${new Types.ObjectId().toString()}` });
    await crearCliente({ metaUserId: 'demo-573001112233' });

    const result = await listConversations(admin.tenantId.toString(), query({}));

    expect(result.data.map((d) => d.id)).toEqual([real._id.toString()]);
  });
});
```

(Ajustar nombres exactos de helpers/tipos al leer el archivo real al implementar; el esqueleto
de arriba refleja el patrón confirmado en la exploración, no el código literal a copiar.)

## Notas

- No se toca `apps/backend/src/repositories/base.repository.ts`: `findScoped`/`countScoped` ya
  pasan cualquier clave del filtro tal cual (`{ ...filter, tenantId }`), sin whitelisting.
- No se crea índice nuevo. `Cliente` ya tiene `{ tenantId: 1, metaUserId: 1 }` único
  (`cliente.model.ts:68`); un `$not: /^demo-/` anclado con prefijo escapa razonablemente bien
  sobre ese índice compuesto (usa `tenantId` como prefijo, luego range-scan sobre `metaUserId`).
- Se descarta deliberadamente un campo `esDemo: Boolean` dedicado (mencionado como alternativa
  en el spec): la convención `demo-` en `metaUserId` ya es la usada por `limpiarDemo` en el
  propio seed, y el volumen de datos no justifica el índice/campo adicional hoy.
- Borrar los datos demo ya sembrados en una base existente no es parte de este cambio; se hace
  aparte con `pnpm --filter @sofiapp/api seed:inbox -- --tenant=<id> --reset`.

## Verificación

```
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
```
