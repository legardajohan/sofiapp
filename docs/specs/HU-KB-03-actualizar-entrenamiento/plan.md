# HU-KB-03 — Plan técnico (CÓMO)

## Archivos a tocar (ninguno nuevo — es un cambio quirúrgico sobre features existentes)

```
apps/backend/src/
├── features/tenant/
│   ├── tenant.model.ts          # + campo kbVersion: { type: Number, default: 1 }
│   └── tenant.types.ts          # + kbVersion?: number en ITenant
├── features/kb/
│   ├── kb.service.ts            # updateDocument/deleteDocument bumpean Tenant.kbVersion
│   └── kb.service.test.ts       # tests del bump (condicional en update, incondicional en delete)
├── services/ai/
│   ├── ai.service.ts            # chat() combina template.version + Tenant.kbVersion en la cache key
│   └── ai.service.test.ts       # tests de invalidación por bump + tenant sin kbVersion
docs/
└── data-model.md                # tenants: documentar kbVersion
```

No se crean archivos nuevos ni se monta nada en `app.ts`: no hay feature nuevo, es una extensión
de dos features ya montados.

## Contratos

### `tenant.model.ts`
```ts
kbVersion: { type: Number, default: 1 },
```
Se añade junto a `semaforoTagsSeeded` en el schema, mismo patrón de contador simple sin
sub-schema. `default: 1` cubre los tenants creados **después** de este cambio; para los
existentes en Mongo el campo no existe en el documento almacenado — ver nota de `.lean()` abajo.

### `tenant.types.ts`
```ts
export interface ITenant {
  // ...campos existentes
  /** Contador de cambios de contenido en la KB del tenant; invalida la caché exacta de IA. */
  kbVersion?: number;
}
```
Opcional en el tipo porque documentos antiguos leídos con `.lean()` pueden no traerlo.

### `kb.service.ts` — bump del contador

Import `Tenant` desde `../tenant/tenant.model.js` (precedente: `tag.service.ts` ya importa
`Tenant` desde otro feature para leer `semaforoTagsSeeded` — no rompe Screaming Architecture,
es el patrón ya aceptado para el modelo raíz `Tenant`).

```ts
async function bumpKbVersion(tenantId: TenantId): Promise<void> {
  await Tenant.updateOne({ _id: tenantId }, { $inc: { kbVersion: 1 } });
}
```

En `updateDocument`, tras el `deleteManyScoped(KbChunk, ...)` actual:
```ts
const hadContent = existing.contenido.trim().length > 0;
const hasContentNow = contenido.trim().length > 0;
if (hadContent || hasContentNow) {
  await bumpKbVersion(tenantId);
}
```
(Cubre: edición de texto real, vaciado de un documento con contenido, y primer llenado de un
preset vacío. NO cubre el caso borde vacío→vacío.)

En `deleteDocument`, incondicional tras el borrado:
```ts
await bumpKbVersion(tenantId);
```

`createDocument` **no** se toca en esta HU (fuera de alcance: el spec cubre editar/eliminar, no
crear; el flujo de creación es HU-KB-01). Se deja anotado como decisión, no como omisión.

### `ai.service.ts` — cache key con `kbVersion`

```ts
import { Tenant } from '../../features/tenant/tenant.model.js';
// ...
async chat(params: AiChatParams): Promise<AiResult<string>> {
  const start = Date.now();
  const template = await this.resolveTemplate(params.tenantId, 'chat');
  const kbVersion = await this.getTenantKbVersion(params.tenantId);
  const cacheVersion = `${template.version}:${kbVersion}`;
  const cacheInput = JSON.stringify({ historial: params.historial, tono: params.tono, instrucciones: params.instrucciones });
  const cacheKey = buildCacheKey(params.tenantId.toString(), 'chat', cacheInput, cacheVersion);
  // ... resto sin cambios
}

private async getTenantKbVersion(tenantId: Types.ObjectId): Promise<number> {
  const tenant = await Tenant.findById(tenantId, { kbVersion: 1 }).lean<{ kbVersion?: number }>();
  return tenant?.kbVersion ?? 1;
}
```

`classify()` y `summarize()` no se tocan: no dependen de contenido de la KB (criterio 7 del spec).

**Nota `.lean()`:** los defaults de Mongoose (`default: 1`) solo aplican al **crear** un
documento nuevo o al hidratar un `Document` completo; `.lean()` devuelve el JSON crudo de Mongo,
así que un tenant creado antes de este cambio no trae `kbVersion` en absoluto. De ahí el
`?? 1` explícito en `getTenantKbVersion` — no confiar en el default del schema para lecturas
`.lean()`.

### `docs/data-model.md` — documentar el campo

Añadir a la ficha `tenants` (después de `camposCaptura`):
```js
kbVersion: Number,              // default 1. Contador de cambios de contenido en la KB; invalida
                                 // la caché exacta de respuestas de IA (HU-KB-03)
```

## Notas

- El bump usa `Tenant.updateOne({ _id: tenantId }, { $inc })` directo (no `*Scoped`): `Tenant` es
  la entidad raíz consultada por su propio `_id`, no por `tenantId` — mismo patrón que
  `seed-semaforo-tags.ts` y `tenant.service.ts`. No aplica la regla de `findScoped`/`createScoped`
  (esa regla es para colecciones **hijas** de un tenant, no para el propio documento `Tenant`).
- `$inc` es atómico a nivel de MongoDB: dos ediciones concurrentes del mismo tenant no pierden
  incrementos (no hay read-modify-write en memoria).
- Se prefiere versionado de clave sobre `DEL` activo de Redis porque:
  1. Es el patrón ya establecido con `template.version` — coherencia de diseño.
  2. No requiere `SCAN`/`KEYS` sobre el namespace `ai:{tenant}:chat:*` (evitar `KEYS` en
     producción es una buena práctica de Redis; `SCAN` con cursor sería más código para el mismo
     resultado que ya da el versionado).
  3. Las entradas viejas expiran solas por `AI_CACHE_TTL_CHAT_S` sin trabajo adicional.

## Verificación

- `pnpm --filter backend typecheck`.
- `pnpm --filter backend test` — incluye `kb.service.test.ts` y `ai.service.test.ts` con los
  casos nuevos de `tasks.md`.
