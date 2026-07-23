# HU-SAAS-02 · Ampliación v2 — Administradores configurables, costeo multimoneda y TRM (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué de la **ampliación v2** de HU-SAAS-02.
> El CÓMO va en `plan-v2-costeo-trm.md`; la ejecución en `tasks-v2-costeo-trm.md`.
> La v1 (catálogo de planes + motor de cuotas) ya está **implementada** (ver `spec.md`); esta v2
> **no la reemplaza**: la extiende con administradores configurables por plan, perfiles/etiquetas,
> catálogo de costos multimoneda, tasa de cambio oficial USD/COP (TRM) y la fotografía financiera
> del plan.

**Estado:** creado

## Objetivo

1. Que el **superadministrador** defina, por plan y sin tope rígido, la **cantidad de
   administradores/puestos incluidos** (mín. 1), con un **máximo técnico global configurable**
   (no hardcodeado, no repetido por el código).
2. Que cada plan declare qué **perfiles/etiquetas** de administrador se permiten, de forma
   **independiente** de la cantidad de administradores; y que el **administrador de cada empresa**
   pueda crear sus propias etiquetas según su modelo de negocio.
3. Modelar un **catálogo de costos multimoneda** (COP/USD) que conserva valor y moneda original, y
   una **tasa de cambio oficial (TRM)** consultable desde el backend, con **override manual**
   auditado y **respaldo** cuando la fuente oficial no responde.
4. Calcular en el **backend**, con **precisión decimal**, el **costo operativo** y el **precio
   sugerido** de cada plan (COP y USD), aplicando una **protección cambiaria** opcional, y guardar
   una **fotografía financiera** por versión del plan para **no alterar retroactivamente** los
   precios ya contratados.
5. Exponer todo el desglose interno **solo al superadministrador**; el cliente/administrador de
   empresa nunca ve TRM, protección, costos unitarios, subtotales ni márgenes.

## Decisiones de diseño (acordadas antes de planear)

- **Modelo de administradores:** campo **nuevo y dedicado** `limites.administradores: number`
  (mín. 1), separado del actual `limites.usuarios`. `usuarios` sigue siendo el total de usuarios;
  `administradores` son los puestos/asientos comerciales incluidos. Convención **en español**,
  igual que el resto de `limites` (`docs/data-model.md`).
- **Enforcement de administradores:** `administradores` es una **nueva métrica de cuota** (se
  añade a `QuotaMetric`). Se **cuenta** por los usuarios que **ocupan un puesto** del tenant (roles
  `admin`/`coordinador`/`asesor`; el `superadmin` es global y no consume asiento) y se **bloquea**
  (`assertWithinQuota('administradores')`, 429) al crear un usuario cuando se alcanza el límite del
  plan. `usuarios` se mantiene como total general (sin cambiar su enforcement de v1).
- **Máximo técnico global:** singleton de configuración de plataforma
  `PlatformSettings.maxAdministradoresPorPlan` (editable por superadmin). Es un límite **técnico**,
  independiente del límite **comercial** de cada plan, y vive en **un solo lugar**.
- **Perfiles permitidos:** `plan.perfilesPermitidos` lista **solo perfiles base globales** que el
  superadmin habilita en ese plan. Las **etiquetas propias del tenant** (creadas por el admin de
  empresa) están **siempre disponibles** para ese tenant y **no** las gobierna el plan global (evita
  que un catálogo global referencie datos de un tenant concreto).
- **Precio contratado (no-retroactividad):** al **asignar/contratar** un plan, el **tenant guarda su
  propia fotografía financiera** (precio + tasa + fecha de vigencia). Ni una actualización de TRM ni
  una nueva versión del plan alteran a los tenants ya contratados; su precio vive en el tenant, no
  en el plan.
- **TRM — profundidad de esta v2:** *modelo + manual primero*. Se crea la entidad `ExchangeRate`,
  el override manual auditado, el cálculo y un **proveedor de fuente oficial inyectable**
  (`ITrmProvider`, patrón `ILlmProvider`) con implementación **stub/mock**. La **integración HTTP
  real** contra Banco de la República / Superintendencia Financiera y el **cron diario** quedan
  para una **fase posterior** (Fase G), fuera del alcance de esta v2 pero con el contrato listo.

## Alcance

**Incluye (por fases — ver `tasks-v2`):**

- **Fase A — Administradores configurables.** `limites.administradores` (mín. 1) en modelo, Zod,
  tipos, DTOs y respuesta; validación contra `PlatformSettings.maxAdministradoresPorPlan`;
  **nueva métrica de cuota** `administradores` en el motor (`usage.service`) y **enforcement** al
  crear usuarios con puesto (`assertWithinQuota('administradores')`); seed de valores **sugeridos**
  (Básico 3 / Estándar 10 / Pro 20, editables antes de guardar y no ligados al nombre). Frontend:
  campo en `PlanForm`, columna en `PlanTable`, texto de cliente "Hasta N administradores incluidos".
- **Fase B — Perfiles/etiquetas.** Perfiles iniciales (Vendedor, Asesor comercial, Coordinador,
  Director, Gerente) + etiquetas **propias del tenant** (creables por el admin de empresa). Plan
  declara `perfilesPermitidos: string[]`. La cantidad de perfiles **no** limita la cantidad de
  administradores.
- **Fase C — Tasa de cambio (`ExchangeRate`).** Modelo con estados (CURRENT/STALE/MANUAL/
  UNAVAILABLE) y tipos de fuente (SUPERFINANCIERA/BANCO_REPUBLICA/MANUAL); servicio de
  consulta/registro/override/reversión/historial; `ITrmProvider` inyectable con stub. Respaldo
  manual auditado que **no borra** el historial oficial.
- **Fase D — Catálogo de costos multimoneda + costeo decimal.** `CostItem`
  (`currency`, `unitCostOriginal`, `fixedCostOriginal`, `unit`, `effectiveFrom`, `active`,
  `fuente`) + costo por administrador; `PlatformSettings.proteccionCambiariaPct` (0–20 %, default 0);
  motor de costeo con **Decimal** (Decimal128 en Mongo + librería decimal en el cálculo) que
  conserva valor original, moneda, tasa usada y valor convertido.
- **Fase E — Fotografía financiera + no-retroactividad.** Snapshot financiero por versión del plan;
  cambiar un plan publicado exige **nueva versión / acción explícita**; una actualización de TRM
  **no** modifica silenciosamente precios contratados.
- **Fase F — UI superadmin + ocultamiento a cliente.** Tarjeta "Tasa de cambio USD/COP", tabla de
  planes ampliada (costo/precio COP y USD, utilidad, margen, fecha de tasa), y **vista de cliente**
  que oculta todo el desglose interno.

**Fuera de alcance de esta v2 (Fase G y siguientes):**

- Integración HTTP **real** con las fuentes oficiales (Banco de la República / Superfinanciera) y
  el **cron diario** (America/Bogota) con dedupe por día. Aquí se entrega el contrato `ITrmProvider`
  y el stub; el fetch real se cablea después.
- Facturación / cobros / pasarela de pago.
- Versionado histórico completo de planes con línea de tiempo navegable (aquí se guarda la
  fotografía por versión y el `numeroVersion`, suficiente para no-retroactividad).

## Criterios de aceptación (nuevos)

> Continúan la numeración del documento de negocio (CA-16…CA-26).

- **CA-16.** Como superadmin, al crear/editar un plan puedo definir la cantidad de administradores
  incluida **sin estar limitado a cinco** (ni a ningún tope fijo hardcodeado); solo aplica el
  máximo técnico global si está configurado.
- **CA-17.** Con 10 administradores configurados, el **subtotal de administradores** del desglose
  interno es `10 × costo unitario vigente` (calculado en backend, con precisión decimal).
- **CA-18.** Los perfiles seleccionados en un plan **no alteran** el límite total de
  administradores; varios administradores pueden compartir perfil.
- **CA-19.** (v2: con stub) Al registrar la TRM del día, el sistema **guarda** la tasa junto con su
  **fuente**, **fecha de vigencia** y **fecha/hora de consulta**. *(La consulta automática real es
  Fase G.)*
- **CA-20.** Si la fuente oficial no responde y ya existe una tasa válida, el sistema **conserva la
  última tasa oficial vigente** y muestra su estado (STALE) **sin reemplazarla por cero** ni
  bloquear la creación de planes.
- **CA-21.** Al registrar una **tasa manual**, el cálculo la usa temporalmente y se registra
  **motivo** y **usuario** responsable; el historial oficial **no** se sobrescribe.
- **CA-22.** Un costo denominado en **USD** se convierte a COP usando la tasa **registrada por el
  backend** (nunca enviada por el navegador).
- **CA-23.** Al guardar un cálculo con un costo USD se **conserva** el valor original, la moneda y
  la **tasa utilizada**.
- **CA-24.** Al cambiar la TRM, un plan **ya contratado** conserva su **precio histórico**: la
  fotografía financiera se **guarda en el tenant al asignar el plan**, de modo que ni un cambio de
  TRM ni una nueva versión del plan lo recalculan.
- **CA-25.** Como administrador de empresa/cliente **no** veo TRM interna, protección cambiaria ni
  desglose de costos.
- **CA-26.** Con protección cambiaria configurada, el costo USD usa la **tasa efectiva**
  (`TRM × (1 + protección/100)`) y la interfaz **interna** muestra por separado TRM oficial,
  protección y tasa efectiva; el precio equivalente en USD se muestra con la **TRM oficial** (no la
  efectiva).

## Reglas no negociables aplicables

- **Aislamiento multi-tenant.** `PlatformSettings`, `Plan`, `ExchangeRate` y `CostItem` son
  catálogos/config **globales** (superadmin, sin `tenantId`, sin `requireTenant`). Las etiquetas de
  administrador **propias del tenant** (Fase B) **sí** son tenant-scoped y pasan **siempre** por el
  repositorio `*Scoped`, con `tenantId` del token.
- **Cálculo en el backend.** TRM, conversión y costeo se resuelven en el backend; el frontend solo
  **muestra**. El navegador nunca es fuente de verdad de la tasa.
- **Sin hardcodes.** Ningún "5" de administradores ni ninguna TRM literal en front, Zod, servicios,
  modelos, controladores, pruebas o constantes locales. El único tope de administradores es
  `PlatformSettings.maxAdministradoresPorPlan` (un solo lugar).
- **Precisión decimal.** Nada de `number` binario como fuente definitiva de dinero: Decimal128 en
  persistencia + librería decimal en cálculo. No redondear costos de tokens individualmente; solo
  subtotales/totales según reglas comerciales.
- **Ocultamiento.** El desglose interno (costos unitarios, subtotales, utilidad, margen, TRM,
  protección) se expone **solo** a `superadmin`; el DTO de cliente lo excluye en el backend (la UI
  no es la única defensa).

## Dependencias

- HU-SAAS-02 v1 (planes + cuotas + `/api/admin/plans`, `/api/admin/tenants/:id/plan|usage`) —
  **implementada**.
- INF-02 (`base.repository` `*Scoped`, `requireTenant`, `AppError`, `asyncHandler`) — completo.
- Patrón `ILlmProvider` (`docs/integrations/llm-provider.md`) — se reutiliza como molde para
  `ITrmProvider`.
- BullMQ/worker (`worker.ts`) — solo relevante para la **Fase G** (cron), fuera de esta v2.

## Verificación (al cerrar la v2)

- `pnpm --filter backend typecheck` y `pnpm --filter backend test` en verde (incluye pruebas de
  administradores variables, tope global, costo por admin, TRM stub, respuesta inválida/timeout,
  última tasa vigente, tasa manual, reversión, conversiones USD↔COP, precisión decimal, protección,
  persistencia de la fotografía, no-retroactividad, ocultamiento a cliente, auditoría).
- `pnpm --filter frontend build && pnpm --filter frontend lint` en verde (incluye test de
  ocultamiento de la información cambiaria para roles no superadmin).
- Checklist PR de `docs/multi-tenancy.md §9`.
