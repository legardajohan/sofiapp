# Multi-Tenancy — Reglas Obligatorias

> **Severidad máxima.** Una fuga de datos entre tenants es el peor fallo posible del sistema.
> Cada regla de este documento es no negociable. El revisor (humano o Claude Code) rechaza
> cualquier PR que las viole.

## 1. Modelo

**Shared database / shared schema con columna discriminadora `tenantId`.** Todas las colecciones
(excepto el tenant raíz `Tenant` y el `User` global del Superadmin) llevan `tenantId` obligatorio
y referenciado. El aislamiento es **lógico** (por query), concentrado en una sola capa.

## 2. De dónde nace el `tenantId`

El `tenantId` viaja **dentro del JWT** firmado, emitido en el login. El usuario no puede
modificarlo sin invalidar la firma.

```ts
// auth.service.ts
const payload = { sub: user._id, tenantId: user.tenantId, rol: user.rol };
return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
```

El middleware `authenticateJWT` carga `req.user` (incluye `tenantId`); el controller lo toma
**solo del token** y lo pasa como argumento explícito al service, que lo pasa al repositorio.

```ts
const tenantId = req.user!.tenantId.toString();   // ✅ del token, NUNCA del body
```

## 3. El tenant-safe repository (corazón del aislamiento)

Todo el aislamiento se concentra en `repositories/base.repository.ts`. Cada función **inyecta
`tenantId` al final**, sobrescribiendo cualquier valor que venga del llamador.

```ts
// repositories/base.repository.ts
import { Model, Document, FilterQuery, UpdateQuery, Types } from 'mongoose';
type TenantId = string | Types.ObjectId;

export function findScoped<T>(m: Model<T>, tenantId: TenantId, filter: FilterQuery<T> = {}) {
  return m.find({ ...filter, tenantId } as FilterQuery<T>);
}
export function findOneScoped<T>(m: Model<T>, tenantId: TenantId, filter: FilterQuery<T> = {}) {
  return m.findOne({ ...filter, tenantId } as FilterQuery<T>);
}
export function findByIdScoped<T>(m: Model<T>, tenantId: TenantId, id: string | Types.ObjectId) {
  return m.findOne({ _id: id, tenantId } as FilterQuery<T>);   // _id Y tenantId
}
export async function createScoped<T extends Document>(m: Model<T>, tenantId: TenantId, data: Record<string, any>): Promise<T> {
  const doc = new m({ ...data, tenantId });                     // tenantId forzado al final
  return doc.save() as unknown as Promise<T>;
}
export function findOneAndUpdateScoped<T>(m: Model<T>, tenantId: TenantId, filter: FilterQuery<T>, update: UpdateQuery<T>, options: Record<string, any> = {}) {
  return m.findOneAndUpdate({ ...filter, tenantId } as FilterQuery<T>, update, options);
}
export function findOneAndDeleteScoped<T>(m: Model<T>, tenantId: TenantId, filter: FilterQuery<T>) {
  return m.findOneAndDelete({ ...filter, tenantId } as FilterQuery<T>);
}
export function deleteOneScoped<T>(m: Model<T>, tenantId: TenantId, filter: FilterQuery<T>) {
  return m.deleteOne({ ...filter, tenantId } as FilterQuery<T>);
}
```

## 4. Reglas

1. **Nunca consultar sin tenant.** Prohibido `Model.find/findOne/findById` directo. Usa siempre
   las funciones `*Scoped`.
2. **Nunca crear sin forzar tenant.** Prohibido `Model.create({...})`. Usa `createScoped`.
3. **Nunca actualizar/borrar sin tenant en el filtro.** Usa `findOneAndUpdateScoped` /
   `findOneAndDeleteScoped` / `deleteOneScoped`.
4. **El tenant siempre del token.** Nunca de `req.body/params/query`.
5. **Todo modelo persistente lleva `tenantId`** (`required: true`, indexado).
6. **`authenticateJWT → requireTenant`** en toda ruta tenant-aware, en ese orden.

## 5. Excepciones permitidas (y ÚNICAS)

Estas lecturas ocurren **deliberadamente fuera** del repositorio scoped, documentadas en el
propio código:

1. **`login`** — `User.findOne({ email, tenantId? })`. En pre-autenticación el tenant aún no se
   conoce desde un token. Ver nota en §7 sobre email único por tenant.
2. **Webhook de Meta** — resuelve el tenant por `phone_number_id` consultando
   `MetaIntegration.findOne({ phoneNumberId })` (índice único global). El `phone_number_id`
   cumple aquí el rol que el JWT cumple en el resto. Detalle en
   `integrations/meta-whatsapp.md`.
3. **Superadmin** — opera **cross-tenant** por diseño. Sus rutas saltan `requireTenant` y usan
   funciones de repositorio NO scoped, restringidas por `authorize(['superadmin'])`. Las
   agregaciones globales se documentan como tales.
4. **Barrido de recordatorios de inactividad (HU-FLOW-02)** — `flow.reminder.service.ts:buscarCandidatos`
   consulta `Cliente.find({...})` sin `tenantId` en el filtro: el barrido periódico (job `sweep` de
   la cola `flow-runtime`) es cross-tenant por naturaleza, una sola pasada para toda la plataforma.
   Es el mismo patrón que la resolución de tenant del webhook: `buscarCandidatos` **solo devuelve
   identificadores** (`{ tenantId, clienteId, ventana24hExpiraEn }`), nunca datos de un tenant
   expuestos a otro. A partir de ahí, cada candidato se procesa con su propio `tenantId` y todo
   vuelve a pasar por `*Scoped` (`enviarRecordatorio`, `Tenant.findById` por su propio `_id`). El
   índice que sostiene esta consulta, `Cliente: { ventana24hExpiraEn: 1, iaHabilitada: 1 }`, es el
   único del proyecto que no empieza por `tenantId` — documentado junto al índice en
   `cliente.model.ts`. Test de aislamiento: `flow.reminder.isolation.test.ts`.

## 6. El Superadmin (User global)

- El Superadmin es un `User` con `tenantId = null` (global).
- Sus rutas (`/api/admin/*`) usan el pipeline `authenticateJWT → authorize(['superadmin'])`
  **sin** `requireTenant`.
- Puede **crear tenants**, **activar/suspender planes manualmente** y ver métricas agregadas de
  todos los tenants.
- Ningún otro rol puede acceder a rutas cross-tenant.

## 7. Modelos y notas

```ts
tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true }
```

- **Email único global para usuarios de panel:** índice `{ email: 1 } unique` en `users` (cubre a
  todos los usuarios de panel, incluido el superadmin con `tenantId = null`). El login es solo
  `email + password` y el `tenantId` se resuelve del usuario hallado (excepción documentada de
  pre-auth). El índice `{ tenantId: 1, email: 1 }` se conserva **no único**, solo para lookups
  scoped. Decisión aceptada en `docs/adr/0003-login-tenant-resolution.md`.

## 8. Tests del invariante (obligatorios)

Prioridad #1 de la suite. Como mínimo:

```ts
// El tenant A no puede leer datos del tenant B
test('findByIdScoped no devuelve documentos de otro tenant', async () => {
  const docB = await createScoped(ClienteModel, tenantB, { telefono: '300...' });
  const result = await findByIdScoped(ClienteModel, tenantA, docB._id).exec();
  expect(result).toBeNull();
});

// createScoped ignora un tenantId inyectado en el body
test('createScoped fuerza el tenant del token sobre el del body', async () => {
  const doc = await createScoped(ClienteModel, tenantA, { tenantId: tenantB, telefono: '301...' });
  expect(doc.tenantId.toString()).toBe(tenantA.toString());
});
```

Cada feature nuevo añade un test que prueba que sus endpoints no filtran datos cross-tenant.

## 9. Checklist de PR (multi-tenancy)

```
[ ] Toda query usa funciones *Scoped del base.repository (sin Model.find/create directos)
[ ] tenantId se obtiene del token (req.user!.tenantId), nunca del body/params
[ ] Modelos nuevos llevan tenantId required + indexado
[ ] No hay rutas tenant-aware sin requireTenant tras authenticateJWT
[ ] Rutas cross-tenant (Superadmin) restringidas con authorize(['superadmin'])
[ ] Test de aislamiento añadido para el nuevo feature
```
