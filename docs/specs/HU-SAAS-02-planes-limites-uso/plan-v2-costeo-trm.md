# HU-SAAS-02 · Ampliación v2 — Plan técnico (CÓMO)

> Extiende el `plan.md` de la v1. Respeta el patrón de 6 archivos por feature, Screaming
> Architecture, `strict`/sin `any`, controllers delgados y el aislamiento multi-tenant.

## Mapa de features (Screaming Architecture)

```
apps/backend/src/
├── features/plan/                      ← AMPLIAR
│   ├── plan.types.ts                   # + administradores, perfilesPermitidos, utilidadPct, fotografiaFinanciera, numeroVersion
│   ├── plan.model.ts                   # + campos anteriores (dinero en Decimal128)
│   ├── plan.validation.ts              # + administradores (int, min 1), perfilesPermitidos, utilidadPct
│   ├── plan.service.ts                 # + valida tope global, calcula/guarda fotografía, versión
│   ├── plan.controller.ts              # + separa DTO superadmin vs DTO cliente
│   └── plan.routes.ts                  # + GET público-cliente (vista sin desglose) si aplica
├── features/platform-settings/         ← CREAR (config GLOBAL singleton, superadmin)
│   ├── platform-settings.types.ts
│   ├── platform-settings.model.ts      # colección platform_settings (1 doc)
│   ├── platform-settings.validation.ts
│   ├── platform-settings.service.ts    # getSettings (crea default), updateSettings
│   ├── platform-settings.controller.ts
│   └── platform-settings.routes.ts     # GET/PATCH /api/admin/platform-settings
├── features/exchange-rate/             ← CREAR (TRM, GLOBAL, superadmin)
│   ├── exchange-rate.types.ts          # estados, tipos de fuente, IExchangeRate
│   ├── exchange-rate.model.ts          # colección exchange_rates (Decimal128)
│   ├── exchange-rate.validation.ts     # tasa manual, protección
│   ├── exchange-rate.service.ts        # getVigente, registerOficial, registerManual, revertToOficial, listHistorial
│   ├── exchange-rate.controller.ts
│   └── exchange-rate.routes.ts         # /api/admin/exchange-rate*
├── integrations/trm/                   ← CREAR (proveedor externo; convención integrations/llm|meta)
│   ├── trm-provider.interface.ts       # ITrmProvider (molde ILlmProvider)
│   ├── stub-trm.provider.ts            # implementación mock inyectable (v2)
│   └── (Fase G) banco-republica.provider.ts · superfinanciera.provider.ts   # HTTP real
├── features/cost-catalog/              ← CREAR (catálogo de costos, GLOBAL, superadmin)
│   ├── cost-catalog.types.ts
│   ├── cost-catalog.model.ts           # colección cost_items (Decimal128)
│   ├── cost-catalog.validation.ts
│   ├── cost-catalog.service.ts
│   ├── cost-catalog.controller.ts
│   └── cost-catalog.routes.ts          # /api/admin/cost-items*
├── features/admin-profile/             ← CREAR (etiquetas de administrador)
│   ├── admin-profile.types.ts
│   ├── admin-profile.model.ts          # tenant-scoped (etiquetas propias) + seed de perfiles base
│   ├── admin-profile.validation.ts
│   ├── admin-profile.service.ts        # SIEMPRE *Scoped; tenantId del token
│   ├── admin-profile.controller.ts
│   └── admin-profile.routes.ts         # /api/admin-profiles (tenant-aware, requireTenant)
├── services/pricing/                   ← CREAR (motor de costeo, sin estado, testeable puro)
│   ├── pricing.service.ts              # calcularCosteo(plan, settings, tasa, costItems) → IFotografiaFinanciera
│   └── money.util.ts                   # helpers Decimal (suma, mul, conversión, redondeo comercial)
└── seed/
    ├── seed-plans.ts                   ← AMPLIAR: administradores 3/10/20 (sugeridos)
    └── seed-admin-profiles.ts          ← CREAR: perfiles base globales (Vendedor, Asesor comercial, …)
```

Nota de convención: los campos **de dominio** van en español (`administradores`, `proteccionCambiariaPct`,
`tasaCopPorUsd`, `esOficial`, `fechaVigencia`…). Los **enums técnicos** (estados de tasa, tipos de
fuente) se mantienen en el vocabulario del documento de negocio (CURRENT/STALE/MANUAL/UNAVAILABLE,
SUPERFINANCIERA/BANCO_REPUBLICA/MANUAL) por ser identificadores estables de integración.

## Estrategia decimal (transversal)

- **Persistencia:** todo importe monetario en Mongo como `Schema.Types.Decimal128`.
- **Cálculo:** librería `decimal.js` (nueva dependencia backend). `money.util.ts` centraliza
  `toDecimal`, `sumar`, `multiplicar`, `convertirUsdACop`, `convertirCopAUsd`, `redondearComercial`
  (redondeo **solo** en subtotales/totales; los costos de tokens sub-centavo **no** se redondean
  antes de sumar).
- **Frontera HTTP:** los DTOs de respuesta serializan Decimal128 a `string` (no `number`) para no
  perder precisión en el JSON; el frontend solo **formatea** (nunca hace aritmética con esos strings).
- **Validación de entrada (Zod):** los importes en las requests (cost-catalog, tasa manual) se
  validan como **string decimal** — `z.string().regex(/^\d+(\.\d+)?$/)` → parseo con `decimal.js`.
  **Prohibido** `z.coerce.number()` para dinero (es justo el binary float que la spec prohíbe).
- Ver ADR sugerido `docs/adr/0005-decimal-money.md` (crear como parte de la Fase D).

## Contratos por fase

### Fase A — Administradores configurables (CA-16, CA-18-parcial)

```ts
// plan.types.ts
export interface IPlanLimites {
  usuarios: number;
  administradores: number;   // NUEVO — puestos/asientos incluidos, min 1
  mensajesMes: number;
  leads: number;
  campanasMes: number;
}
```
```ts
// plan.validation.ts (dentro de limitesSchema)
administradores: z.coerce.number().int().min(1),   // sin .max fijo: el tope es global y dinámico
```
- **Tope global (no hardcodeado):** en `plan.service.createPlan/updatePlan`, tras validar Zod,
  `const { maxAdministradoresPorPlan } = await getSettings();` y si
  `dto.limites.administradores > maxAdministradoresPorPlan` → `AppError('Supera el máximo técnico
  de administradores por plan (N).', 422)`. Un solo punto, un solo origen del número.
- **Seed sugerido:** Básico 3 / Estándar 10 / Pro 20 (solo en `$setOnInsert`; editable después; no
  atado al nombre).

```ts
// platform-settings.model.ts (singleton; colección platform_settings)
{
  clave: { type: String, default: 'global', unique: true },   // asegura 1 documento
  maxAdministradoresPorPlan: { type: Number, min: 1, default: 100 },
  proteccionCambiariaPct:    { type: Number, min: 0, max: 20, default: 0 },  // Fase D
  utilidadPorDefectoPct:     { type: Number, min: 0, default: 30 },          // Fase D (sugerido)
  // timestamps
}
```
```ts
// platform-settings.service.ts
getSettings(): Promise<IPlatformSettings>          // lee el singleton; lo crea con defaults si no existe
updateSettings(dto: UpdatePlatformSettingsDTO): Promise<IPlatformSettings>   // superadmin
```
Rutas: `GET/PATCH /api/admin/platform-settings` — `authenticateJWT → authorize(['superadmin'])` (sin `requireTenant`).

**Enforcement de `administradores` (nueva métrica de cuota):**
```ts
// usage.types.ts
export type QuotaMetric = 'usuarios' | 'administradores' | 'mensajesMes' | 'leads' | 'campanasMes';
```
```ts
// usage.service.ts — getMetricUsed añade la rama:
//   administradores → User.countDocuments({ tenantId, activo: true, rol: { $in: ROLES_CON_PUESTO } })
//   donde ROLES_CON_PUESTO = ['admin','coordinador','asesor']  (el superadmin es global, no ocupa asiento)
```
- **Enforcement:** `assertWithinQuota(tenantId, 'administradores')` **antes** de crear un usuario que
  ocupa puesto: hoy en `tenant.service.createTenant` (el `adminUser` inicial) y en el **futuro CRUD
  de usuarios** (guard listo). `usuarios` conserva su enforcement de v1 sin cambios.
- `getTenantUsage` incluye la métrica `administradores` (usado/límite/restante/porcentaje).
- El límite proviene de `plan.limites.administradores`; sin plan → no-op (igual que el resto).

### Fase B — Perfiles/etiquetas (CA-18)

**Perfiles base (globales).** Vendedor, Asesor comercial, Coordinador, Director, Gerente son un
**catálogo base global** (constante versionada `PERFILES_BASE`, expuesta vía `GET /api/admin-profiles/base`).
El plan (global, superadmin) solo puede referenciar **estas** keys base.

**Etiquetas propias (tenant-scoped).** El admin de empresa crea sus etiquetas según su negocio:
```ts
// admin-profile.types.ts
export interface IAdminProfile {           // tenant-scoped (SOLO etiquetas propias del tenant)
  tenantId: ObjectId;                       // required, index (regla data-model)
  nombre: string;                           // "Vendedor de electrodomésticos"…
  activo: boolean;
}
```
`POST/GET/PATCH/DELETE /api/admin-profiles` — tenant-aware (`requireTenant`, `tenantId` del token,
`*Scoped`). Estas etiquetas **siempre están disponibles para su tenant** y **no** las gobierna el
plan global.

**En `plan`:** `perfilesPermitidos: string[]` = subconjunto de las keys de `PERFILES_BASE` (Zod las
valida contra ese enum; array posiblemente vacío). Las etiquetas propias del tenant **no** entran
aquí (no se puede referenciar un dato de un tenant desde un catálogo global). El conjunto de perfiles
usable por un tenant = `perfilesPermitidos` del plan **∪** sus etiquetas propias activas.
- **No** se acota contra `administradores`: la cantidad de perfiles es independiente del número de
  administradores (test lo verifica: cambiar `perfilesPermitidos` no toca `limites.administradores`,
  y varios administradores pueden compartir perfil).

### Fase C — ExchangeRate + provider inyectable (CA-19-stub, CA-20, CA-21)

```ts
// exchange-rate.types.ts
export type EstadoTasa = 'CURRENT' | 'STALE' | 'MANUAL' | 'UNAVAILABLE';
export type TipoFuenteTasa = 'SUPERFINANCIERA' | 'BANCO_REPUBLICA' | 'MANUAL';

export interface IExchangeRate {
  monedaBase: 'USD';
  monedaCotizada: 'COP';
  tasaCopPorUsd: string;            // Decimal128 → string en el DTO
  fuente: string;                  // descripción textual
  tipoFuente: TipoFuenteTasa;
  fechaVigencia: Date;             // día de vigencia oficial
  consultadaEn: Date;              // fetchedAt
  creadaPor?: string;              // userId del superadmin (manual)
  esOficial: boolean;
  esOverrideManual: boolean;
  motivoOverride?: string;
  overrideExpiraEn?: Date;
  estado: EstadoTasa;
  // timestamps
}
```
```ts
// src/integrations/trm/trm-provider.interface.ts   (molde ILlmProvider — vive en integrations/, no en el feature)
export interface ITrmProvider {
  readonly tipoFuente: TipoFuenteTasa;
  fetchTrmVigente(): Promise<{ tasaCopPorUsd: string; fechaVigencia: Date; fuente: string }>;
}
// src/integrations/trm/stub-trm.provider.ts: mock inyectable (v2).
// Fase G: banco-republica.provider.ts / superfinanciera.provider.ts (HTTP real).
// El exchange-rate.service recibe el ITrmProvider por inyección (testeable, sin red en v2).
```
```ts
// exchange-rate.service.ts
getVigente(): Promise<IExchangeRateResponse>
//   Devuelve la última tasa aplicable: si hay override MANUAL no expirado → esa (estado MANUAL).
//   Si no, la última OFICIAL; calcula estado CURRENT (vigencia = hoy) o STALE (vigencia < hoy).
//   Si no hay ninguna → estado UNAVAILABLE (nunca 0; el costeo lo maneja explícitamente).
registerOficial(provider: ITrmProvider): Promise<IExchangeRateResponse>
//   provider.fetchTrmVigente(); valida (>0, finita, fecha válida); persiste esOficial=true.
//   Si el provider falla/timeout y ya existe oficial previa → NO reemplaza; deja STALE y reporta.
registerManual(dto, usuarioId): Promise<IExchangeRateResponse>
//   crea doc esOverrideManual=true, tipoFuente=MANUAL, motivo+creadaPor+overrideExpiraEn?; NO borra oficiales.
revertToOficial(): Promise<IExchangeRateResponse>       // desactiva override manual; vuelve a la última oficial
listHistorial(limit?): Promise<IExchangeRateResponse[]> // auditoría (oficiales + manuales), desc por consultadaEn
```
- Rutas superadmin (`/api/admin/exchange-rate`): `GET /vigente`, `POST /refresh` (usa el provider
  inyectado; en v2 el stub), `POST /manual`, `POST /revertir`, `GET /historial`.
- **Timeout/validación:** `registerOficial` envuelve el `fetch` del provider con timeout y valida la
  respuesta; ante fallo, aplica CA-20 (conserva la última oficial, marca estado, no rompe planes).

### Fase D — Catálogo de costos + costeo decimal (CA-17, CA-22, CA-23, CA-26)

```ts
// cost-catalog.types.ts
export type Moneda = 'COP' | 'USD';
export interface ICostItem {
  concepto: string;                 // "Costo por administrador", "Tokens IA", "Infraestructura"…
  currency: Moneda;
  unitCostOriginal?: string;        // Decimal128 → string (costo por unidad)
  fixedCostOriginal?: string;       // Decimal128 → string (costo fijo)
  unit?: string;                    // 'administrador' | 'mensaje' | 'mes' | 'token'…
  effectiveFrom: Date;
  active: boolean;
  fuente?: string;                  // explicación interna
}
```
```ts
// services/pricing/pricing.service.ts  (puro, sin acceso a red/DB; recibe todo por parámetro)
interface CosteoInput {
  administradores: number;
  costoUnitarioAdmin: { currency: Moneda; valor: string };
  costItems: ICostItem[];                 // demás costos operativos
  trmOficial: string;                     // COP/USD
  proteccionCambiariaPct: number;         // 0..20
  utilidadPct: number;
}
calcularCosteo(input: CosteoInput): IFotografiaFinanciera
//   tasaEfectiva = TRM × (1 + protección/100)
//   subtotalAdministradores = administradores × costoUnitarioAdmin (convertido si USD, con tasaEfectiva)
//   costoOperativoCop = Σ(costos COP) + Σ(costos USD × tasaEfectiva) + subtotalAdministradores
//   precioSugeridoCop = costoOperativoCop × (1 + utilidad/100)
//   precioSugeridoUsd = precioSugeridoCop / TRM **oficial**  (no la efectiva → no inflar el USD)
//   Conserva, por costo USD: { valorOriginal, moneda, tasaUsada, valorConvertido }.
```
- Todo con `decimal.js`; redondeo comercial **solo** en subtotales/total.
- `proteccionCambiariaPct` vive en `PlatformSettings` (Fase A ya lo dejó en el modelo, default 0).

### Fase E — Fotografía financiera + no-retroactividad (CA-24)

```ts
// plan.types.ts
export interface IFotografiaFinanciera {
  trmOficial: string; fechaVigenciaTrm: Date; proteccionCambiariaPct: number; tasaEfectiva: string;
  costosUnitarios: Array<{ concepto: string; currency: Moneda; valorOriginal: string; tasaUsada?: string; valorConvertidoCop?: string }>;
  costoOperativoCop: string; utilidadPct: number;
  precioSugeridoCop: string; precioSugeridoUsd: string;
  precioFinalCop: string; precioFinalUsd: string;
}
// En IPlan: numeroVersion: number; fotografiaFinanciera?: IFotografiaFinanciera;
```
- **Fotografía del plan (referencia del superadmin).** Guardar plan (crear o **nueva versión**) toma
  la TRM vigente + settings + costos y persiste la fotografía en el plan. La actualización diaria de
  TRM **no** recalcula planes ya guardados. "Nueva versión":
  `POST /api/admin/plans/:id/nueva-version` incrementa `numeroVersion` y recalcula la fotografía con
  la tasa vigente en ese momento (acción **explícita** del superadmin).
- **Precio contratado (vive en el TENANT — decisión de diseño).** Al asignar/contratar un plan
  (`assignPlanToTenant`), se **congela** una copia en el tenant:
  ```ts
  // tenant model: + fotografiaFinancieraContratada?: IFotografiaFinanciera; + planContratadoVersion?: number; + fechaContratacion?: Date
  ```
  `assignPlanToTenant(tenantId, planId)` calcula (o copia) la fotografía con la TRM vigente y la
  guarda en el tenant. **CA-24:** cambios posteriores de TRM o nuevas versiones del plan **no** tocan
  a los tenants ya contratados; su precio se lee de `tenant.fotografiaFinancieraContratada`, no del
  plan. Reconctratar / migrar de versión es una **acción explícita** que regenera el snapshot.

### Fase F — UI superadmin + ocultamiento (CA-25)

- Backend: **dos DTOs de plan**. `mapPlanToResponseSuperadmin` (incluye fotografía/desglose) y
  `mapPlanToResponseCliente` (solo nombre, `administradores` como "Hasta N", límites,
  funcionalidades, `precioFinalCop`/`precioFinalUsd`, estado). La ruta de cliente **nunca** serializa
  el desglose (defensa en backend, no solo UI).
- Frontend `admin-plans/`: columna "Administradores incluidos", costo/precio COP y USD, utilidad,
  margen, fecha de la tasa; tarjeta "Tasa de cambio USD/COP" (TRM oficial, vigencia, fuente, última
  consulta, estado, protección, tasa efectiva) con acciones Actualizar/Protección/Manual/Revertir/
  Historial. `authorize`/guards de rol `superadmin`; la tarjeta y el desglose **no** se montan para
  otros roles.

## Rutas nuevas (resumen)

```
# Globales (superadmin, SIN requireTenant)
GET/PATCH  /api/admin/platform-settings
GET        /api/admin/exchange-rate/vigente
POST       /api/admin/exchange-rate/refresh        # usa ITrmProvider (stub en v2)
POST       /api/admin/exchange-rate/manual
POST       /api/admin/exchange-rate/revertir
GET        /api/admin/exchange-rate/historial
GET/POST/PATCH/DELETE  /api/admin/cost-items
POST       /api/admin/plans/:id/nueva-version
# Asignación de plan (superadmin) — AMPLIAR: congela la fotografía en el tenant
PATCH      /api/admin/tenants/:id/plan              # assignPlanToTenant → snapshot en tenant.fotografiaFinancieraContratada

# Tenant-aware (requireTenant, tenantId del token)
GET        /api/admin-profiles/base                 # catálogo base global (solo lectura)
GET/POST/PATCH/DELETE  /api/admin-profiles          # etiquetas propias del tenant
```

## Fuera de alcance en esta v2 (Fase G — cablear después)

- `BancoRepublicaProvider` / `SuperfinancieraProvider` (HTTP real) implementando `ITrmProvider`.
- Job BullMQ `trm-refresh` diario (America/Bogota) con dedupe por día; se registra en `worker.ts`.
- Recalcular vistas previas al refrescar (no las fotografías guardadas).

## Docs a actualizar (parte de la implementación)

- `docs/data-model.md`: `plans.limites.administradores`, `plans.perfilesPermitidos`,
  `plans.fotografiaFinanciera`, `platform_settings`, `exchange_rates`, `cost_items`,
  `admin_profiles` (tenant-scoped).
- `docs/api-contract.md`: registrar las rutas nuevas.
- `docs/integrations/` : nota de `ITrmProvider` (molde `ILlmProvider`) y fuentes oficiales.
- `docs/adr/0005-decimal-money.md`: decisión de Decimal128 + `decimal.js`.

## Verificación

- `pnpm --filter backend typecheck` · `pnpm --filter backend test`
- `pnpm --filter frontend build && pnpm --filter frontend lint`
- Checklist PR `docs/multi-tenancy.md §9` (etiquetas tenant-scoped incluidas).
