# HU-SAAS-02 · Ampliación v2 — Tasks (checklist ejecutable por fases)

> Ejecutar **en orden de fases**. Cada fase es un slice cerrable (typecheck + tests en verde)
> antes de pasar a la siguiente. Respetar patrón de 6 archivos, `strict`/sin `any`, controllers
> delgados, `AppError`/`asyncHandler`, y el aislamiento multi-tenant (etiquetas de admin scoped).

## Fase A — Administradores configurables + tope global + enforcement  · (CA-16; habilita CA-17/CA-18)

> CA-17 (subtotal de costo) se completa en Fase D; aquí solo la **cantidad configurable** y su
> **enforcement** como cuota. CA-18 (perfiles independientes) se completa en Fase B.

> **Estado Fase A: IMPLEMENTADA** (typecheck + 123 tests backend + build/lint/tests frontend en verde).

### A1. `features/platform-settings/` (config GLOBAL singleton, superadmin)
- [x] `platform-settings.types.ts`: `IPlatformSettings`, `IPlatformSettingsDocument`, `UpdatePlatformSettingsDTO`, `IPlatformSettingsResponse`.
- [x] `platform-settings.model.ts`: colección `platform_settings`; `clave` único (default `'global'`); `maxAdministradoresPorPlan` (min 1, default 100); `proteccionCambiariaPct` (0–20, default 0); `utilidadPorDefectoPct` (min 0, default 30); `{ timestamps }`.
- [x] `platform-settings.validation.ts`: `updatePlatformSettingsSchema` (`body` parcial, todos opcionales con sus rangos).
- [x] `platform-settings.service.ts`: `getSettings()` (singleton atómico con `upsert`+`setDefaultsOnInsert`), `getSettingsResponse()`, `updateSettings(dto)`.
- [x] `platform-settings.controller.ts`: `getPlatformSettingsController`, `updatePlatformSettingsController` (delgados).
- [x] `platform-settings.routes.ts`: `GET/PATCH /api/admin/platform-settings` → `authenticateJWT, authorize(['superadmin']), validate(...), asyncHandler(...)` (SIN `requireTenant`).
- [x] Montar en `app.ts`.

### A2. `features/plan/` — campo `administradores`
- [x] `plan.types.ts`: añadir `administradores: number` a `IPlanLimites` (+ propagar a DTOs y `IPlanResponse`).
- [x] `plan.model.ts`: `LimitesSchema.administradores` `{ type: Number, required: true, min: 1 }`.
- [x] `plan.validation.ts`: en `limitesSchema`, `administradores: z.coerce.number().int().min(1)` (**sin** `.max` fijo).
- [x] `plan.service.ts`: en `createPlan`/`updatePlan`, `assertAdministradoresWithinPlatformMax` lee `getSettings()` y si `administradores > maxAdministradoresPorPlan` → `AppError(422)`. **Único** punto del tope.
- [x] `mapPlanToResponse`: incluir `administradores`.

### A2b. Enforcement — nueva métrica de cuota `administradores`
- [x] `usage.types.ts`: añadir `'administradores'` a `QuotaMetric`.
- [x] `usage.service.ts::getMetricUsed`: rama `administradores` → `countScoped(User, tenantId, { activo: true, rol: { $in: ROLES_CON_PUESTO } })` (constante `ROLES_CON_PUESTO = ['admin','coordinador','asesor']`; el `superadmin` no ocupa asiento).
- [x] `tenant.service.createTenant`: al crear el `adminUser` inicial, `await assertWithinQuota(tenantId, 'administradores')` (además del `usuarios` de v1).
- [x] `getTenantUsage`: incluir la métrica `administradores` en la respuesta.
- [x] Guard reutilizable listo para el futuro CRUD de usuarios (mismo `assertWithinQuota`).

### A3. Seed sugerido
- [x] `seed-plans.ts`: Básico `administradores: 3`, Estándar `10`, Pro `20` (solo `$setOnInsert`; editable; no atado al nombre).

### A4. Frontend (admin-plans)
- [x] `admin-plans/types/domain.ts` + `PlanForm.tsx`: campo "Administradores incluidos" (número, min 1).
- [x] `PlanTable.tsx`: columna "Administradores".
- [x] `admin-tenants` panel de consumo: métrica `administradores` (tipo `QuotaMetric` + `TenantUsagePanel`).
- [ ] Vista de cliente: texto "Hasta N administradores incluidos" (sin costos) → **diferido a Fase F** (aún no existe pantalla de planes para el cliente; se hace con el DTO de cliente).

### A5. Tests Fase A
- [x] Crear plan con `administradores = 3` / `10` / `20` → OK (cantidad variable). *(plan.service.test)*
- [x] `administradores = 0` o `< 1` → error de validación (Zod `safeParse`). *(plan.service.test)*
- [x] `administradores > maxAdministradoresPorPlan` → `AppError(422)` (tope global aplicado). *(plan.service.test)*
- [x] Cambiar `maxAdministradoresPorPlan` en settings altera el límite efectivo (`updateSettings` → 422/OK). *(platform-settings + plan.service test)*
- [x] `assertWithinQuota('administradores')`: al alcanzar `limites.administradores` → `AppError(429)`; por debajo, no lanza. *(usage.service.test)*
- [x] `getMetricUsed('administradores')` cuenta solo roles con puesto (excluye `superadmin`). *(usage.service.test)*
- [x] Tenant **sin plan** → `assertWithinQuota('administradores')` es no-op. *(usage.service.test)*

## Fase B — Perfiles/etiquetas de administrador  · (CA-18)

> **Estado Fase B: IMPLEMENTADA** (typecheck + 134 tests backend + build/lint frontend en verde).

### B1. Perfiles base (catálogo GLOBAL)
- [x] Constante versionada `PERFILES_BASE` + `PERFILES_BASE_CATALOGO` (Vendedor, Asesor comercial, Coordinador, Director, Gerente) en `admin-profile.constants.ts`.
- [x] `GET /api/admin-profiles/base` expone el catálogo base (`authorize(['superadmin','admin'])`, sin `requireTenant`).

### B2. `features/admin-profile/` — etiquetas propias (tenant-scoped)
- [x] Types/model/validation/service/controller/routes. `tenantId` **required + index**; `nombre`, `activo` (**sin** `esBase`: aquí viven **solo** las propias del tenant). Índice único `{ tenantId, nombre }`.
- [x] Service **siempre** vía `*Scoped` (`findScoped`/`createScoped`/`findOneAndUpdateScoped`/`findOneAndDeleteScoped`); `tenantId` del token.
- [x] Rutas `/api/admin-profiles` tenant-aware (`authenticateJWT → requireTenant → authorize(['admin']) → validate → asyncHandler`); montadas en `app.ts`.

### B3. Plan — `perfilesPermitidos`
- [x] `plan.types/model`: `perfilesPermitidos: PerfilBase[]` (model `[String]` con `enum: PERFILES_BASE`, default `[]`); mapper con `?? []`.
- [x] `plan.validation`: `z.array(z.enum(PERFILES_BASE))` en create/update (puede ir vacío). Las etiquetas propias del tenant **no** entran aquí.
- [x] **No** acota contra `administradores`. El conjunto usable por un tenant = `perfilesPermitidos` **∪** sus etiquetas propias activas (combinación en tiempo de uso).

### B4. Tests Fase B
- [x] Cambiar `perfilesPermitidos` **no** modifica `limites.administradores`. *(plan.service.test)*
- [x] Varios administradores pueden compartir perfil (perfiles ≠ cantidad de admins; cubierto por A2b + B3).
- [x] `perfilesPermitidos` con una key fuera de `PERFILES_BASE` → error de validación (Zod `safeParse`). *(plan.service.test)*
- [x] Aislamiento: etiqueta propia de `tenantA` no visible/editable/eliminable con `tenantB`; dos tenants pueden reusar nombre. *(admin-profile.isolation.test)*
- [ ] Frontend (gestión de etiquetas del admin + selector de perfiles en `PlanForm`) → **diferido a Fase F** (UI).

## Fase C — Tasa de cambio (ExchangeRate) + provider inyectable  · (CA-19-stub, CA-20, CA-21)

> **Estado Fase C: IMPLEMENTADA** (typecheck + 141 tests backend en verde).

### C1. `features/exchange-rate/`
- [x] `exchange-rate.types.ts`: `EstadoTasa`, `TipoFuenteTasa`, `IExchangeRate(+Document/Response)`, `IExchangeRateVigente` (estado calculado + `tasa|null`).
- [x] `exchange-rate.model.ts`: colección `exchange_rates`; `tasaCopPorUsd` **Decimal128**; `esOficial`, `esOverrideManual`, `activoOverride` (revertir sin borrar), `fechaVigencia`, `consultadaEn`, `creadaPor?`, `motivoOverride?`, `overrideExpiraEn?`. El `estado` se **calcula** al consultar (no se persiste fijo).
- [x] `src/integrations/trm/trm-provider.interface.ts` (`ITrmProvider`, `TrmProviderFuente`) + `stub-trm.provider.ts` (`createStubTrmProvider`, `defaultTrmProvider`). El `exchange-rate.service` recibe el provider **por inyección** (sin ciclo integrations↔feature).
- [x] `exchange-rate.service.ts`: `getVigente` (MANUAL→CURRENT/STALE→UNAVAILABLE, día America/Bogota UTC-5), `registerOficial(provider)`, `registerManual(dto, usuarioId)`, `revertToOficial`, `listHistorial`.
- [x] `exchange-rate.validation.ts`: `manualRateSchema` — `valorCopPorUsd` como **string decimal** (`regex` + `>0`, no `coerce.number`), `fechaVigencia`, `motivo`, `expiraEn?`.
- [x] Controller + rutas `/api/admin/exchange-rate/{vigente,refresh,manual,revertir,historial}` (superadmin, sin `requireTenant`); montadas en `app.ts`.

### C2. Tests Fase C (con stub, sin red)
- [x] Consulta exitosa (stub) → guarda tasa + fuente + `fechaVigencia` + `consultadaEn` (CA-19). *(exchange-rate.service.test)*
- [x] Respuesta **inválida** del provider (`0`) → no persiste basura; conserva la última válida. *(idem)*
- [x] **Timeout** del provider → conserva la última oficial, **no** 0 (CA-20); no rompe. *(idem)*
- [x] Vigencia anterior a hoy → estado **STALE** (usable, no 0). *(idem)*
- [x] Sin ninguna tasa previa → estado **UNAVAILABLE** (nunca 0). *(idem)*
- [x] `registerManual` → usa la tasa temporal y registra `motivo` + `creadaPor` (CA-21); no borra oficiales. *(idem)*
- [x] `revertToOficial` → vuelve a la última oficial; el manual queda en el historial (auditoría). *(idem)*
- [ ] Tarjeta TRM en el frontend → **diferida a Fase F** (UI).

## Fase D — Catálogo de costos multimoneda + costeo decimal  · (CA-17, CA-22, CA-23, CA-26)

> **Estado Fase D: IMPLEMENTADA** (typecheck + 152 tests backend en verde).

### D1. Dependencia decimal
- [x] `decimal.js` añadido a `apps/backend`. ADR `docs/adr/0005-decimal-money.md`.
- [x] `services/pricing/money.util.ts`: `Moneda`, `toDecimal`, `sumar`, `multiplicar`, `convertirUsdACop`, `convertirCopAUsd`, `tasaEfectiva`, `redondearComercial`.

### D2. `features/cost-catalog/`
- [x] Types/model/validation/service/controller/routes. Dinero en **Decimal128**; `currency`, `unitCostOriginal?`, `fixedCostOriginal?`, `unit?`, `effectiveFrom`, `active`, `fuente?`. Rutas `/api/admin/cost-items` (superadmin, global). Validación de importes como **string decimal**.
- [x] El "Costo por administrador" se modela como un `CostItem` (`unit='administrador'`); el costeo lo recibe como `costoUnitarioAdmin`.

### D3. Motor de costeo
- [x] `services/pricing/pricing.service.ts::calcularCosteo(input)` **puro**: `tasaEfectiva`, `subtotalAdministradoresCop`, `costoOperativoCop`, `precioSugeridoCop`, `precioSugeridoUsd` (con **TRM oficial**), conservando por costo `{ valorOriginal, currency, tasaUsada, valorConvertidoCop }`.
- [x] `proteccionCambiariaPct` es parámetro de entrada (la orquestación de Fase E lo leerá de `PlatformSettings`).

### D4. Tests Fase D
- [x] Subtotal administradores = `cantidad × costo unitario vigente` (CA-17; 10 × 8.000 = 80.000). *(pricing.service.test)*
- [x] Conversión USD→COP con la tasa del backend (CA-22) y COP→USD (`money.util`). *(idem)*
- [x] Se conserva valor original + moneda + tasa usada por costo (CA-23). *(idem)*
- [x] **Precisión decimal**: sub-centavo (0.004 + 0.004 → 0.01) no se redondea antes de sumar. *(idem)*
- [x] Protección cambiaria: costo USD usa `tasaEfectiva`; el precio USD usa la **oficial** (CA-26; 10.5 ≠ 10). *(idem)*
- [x] Catálogo: crea/lista/filtra/actualiza/elimina; Decimal128 preserva la escala. *(cost-catalog.service.test)*
- [ ] Frontend (gestión del catálogo + vista previa de costeo) → **diferido a Fase F** (UI).

## Fase E — Fotografía financiera + no-retroactividad  · (CA-24)

> **Estado Fase E: IMPLEMENTADA** (typecheck + 156 tests backend + build/lint frontend en verde).

- [x] `plan.types/model`: `numeroVersion` (default 1) y `fotografiaFinanciera?` (subschema reutilizable `FotografiaFinancieraSchema`, dinero como string; incluye `subtotalAdministradoresCop`).
- [x] `services/pricing/plan-costing.service.ts::construirFotografiaFinanciera` orquesta TRM vigente + settings + catálogo; **best-effort** (null si TRM UNAVAILABLE → no bloquea la creación/contratación).
- [x] `createPlan` calcula y guarda la fotografía de referencia.
- [x] `POST /api/admin/plans/:id/nueva-version` (+ controller/validation): incrementa `numeroVersion` y recalcula la fotografía con la tasa vigente (acción explícita).
- [x] **Snapshot en el tenant:** `tenant.model/types` + `fotografiaFinancieraContratada?`, `planContratadoVersion?`, `fechaContratacion?` (reusa el subschema del plan).
- [x] `assignPlanToTenant`: **congela** la fotografía con la TRM vigente en el tenant; el precio del cliente se lee del tenant, no del plan.
- [x] Tests: cambiar la TRM **no** modifica el precio de un tenant contratado (CA-24); una **nueva versión** del plan **no** altera a tenants existentes; el plan sí se recalcula; `createPlan` sin TRM no bloquea (sin fotografía). *(plan-costing.integration.test)*
- [ ] Vista de precio contratado/desglose en el frontend → **diferida a Fase F** (UI).

## Fase F — UI superadmin + ocultamiento a cliente  · (CA-25)

- [ ] Backend: `mapPlanToResponseSuperadmin` (con desglose) vs `mapPlanToResponseCliente` (sin TRM/protección/costos/margen). La ruta de cliente **no** serializa el desglose.
- [ ] Frontend `admin-plans/`: tabla ampliada (admins, costo COP/USD, precio COP/USD, utilidad, margen, fecha de tasa) + tarjeta "Tasa de cambio USD/COP" con acciones (Actualizar/Protección/Manual/Revertir/Historial). Guards de rol `superadmin`.
- [ ] Vista de cliente: solo nombre, "Hasta N administradores", funcionalidades, límites, precio final COP/USD, estado.
- [ ] Tests frontend: un rol no `superadmin` **no** ve TRM/protección/desglose (ocultamiento); auditoría de actualizaciones registrada/visible en historial.

## Fase G — (POSTERIOR, fuera de v2) Integración TRM real + cron

- [ ] `BancoRepublicaProvider` / `SuperfinancieraProvider` (HTTP real) implementando `ITrmProvider`.
- [ ] Job BullMQ `trm-refresh` diario (America/Bogota) con dedupe por día; registrar en `worker.ts`.
- [ ] Recalcular **vistas previas** (no las fotografías guardadas) tras un refresh.

## Verificación final (v2)

- [ ] `pnpm --filter backend typecheck` sin errores.
- [ ] `pnpm --filter backend test` en verde (todas las pruebas de las fases A–F).
- [ ] `pnpm --filter frontend build && pnpm --filter frontend lint` sin errores.
- [ ] `docs/data-model.md`, `docs/api-contract.md`, ADR decimal actualizados.
- [ ] Checklist PR `docs/multi-tenancy.md §9` (incluye etiquetas de admin tenant-scoped).
- [ ] `spec-v2-costeo-trm.md` → `**Estado:** implementado` al cerrar.

## Trazabilidad CA → Fase

| CA | Fase | CA | Fase |
|---|---|---|---|
| CA-16 | A | CA-22 | D |
| CA-17 | A(base)+D(costo) | CA-23 | D |
| CA-18 | A/B | CA-24 | E |
| CA-19 | C (stub) / G (real) | CA-25 | F |
| CA-20 | C | CA-26 | D |
| CA-21 | C | | |
