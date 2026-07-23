# Especificaciones Generales — SofiApp

> Documento maestro de producto. Describe **qué** es SofiApp, su alcance, roles, módulos y
> fases. Es la referencia general del proyecto. Las decisiones técnicas viven en
> `architecture.md`, `data-model.md` y `multi-tenancy.md`.

## 1. Visión

SofiApp es un **CRM SaaS multi-inquilino** que cualquier **entidad comercial** puede alquilar
para captar prospectos, conversar con ellos de forma automatizada con IA a través de canales de
mensajería (WhatsApp, Instagram, Facebook Messenger), y cerrarlos en venta. Opera como
**proveedor de tecnología (BSP)** frente a Meta: cada empresa conecta su propia cuenta de
WhatsApp Business API.

**Generalización clave:** SofiApp NO está atado al nicho Pre-ICFES. El dominio se modela de
forma genérica (prospectos, productos/servicios, estados comerciales). Los datos específicos de
un vertical (p. ej. "colegio" o "grado" en un instituto) se capturan como **campos
personalizados por tenant**, no como columnas fijas del esquema.

## 2. Modelo de negocio (multi-tenant SaaS)

- Un único despliegue sirve a múltiples empresas (tenants).
- Aislamiento de datos por discriminador `tenantId` (base compartida, esquema compartido).
- Dominio único (p. ej. `sofiapp.com`). El tenant del usuario se resuelve en el login a partir
  del JWT; **no** hay subdominios por empresa.
- **Activación de planes 100% manual** por el Superadministrador (sin pasarela de cobro de
  suscripción en el MVP).

## 3. Roles y permisos

SofiApp distingue **usuarios del panel** (con login) del **cliente final**, que es una entidad
de datos y nunca accede a la plataforma.

| Rol | Función | Accede al panel | Notas |
|---|---|---|---|
| **Superadministrador** | Dueño de la plataforma. Crea y suspende empresas (tenants), **activa planes manualmente**, ve métricas globales cross-tenant. | Sí | `User` **global sin `tenantId`**; sus rutas saltan `requireTenant`. |
| **Administrador** | Único rol dentro de una empresa. Primer usuario al activar el tenant; gestiona usuarios, conecta WhatsApp, configura catálogo, atiende la bandeja omnicanal, edita prospectos y cambia su estado. Todo `admin` ve exactamente las mismas pantallas y endpoints. | Sí | Puede llevar un **subrol interno** opcional (metadata, sin efecto en permisos): `director \| manager \| coordinator \| secretary` (Director, Gerente, Coordinador, Secretaria) — ver `AUTH-02`. |
| **Cliente final / Prospecto** | Lead. Interactúa por WhatsApp/IG/Messenger/web. | **No** | Se modela como documento `Cliente`; nunca inicia sesión. |

> **Cambio respecto al backlog original:** el rol *Verificador de Pagos* se **elimina**. No hay
> verificación de comprobantes; marcar a un cliente como pagado es un simple cambio de atributo
> que hace un `admin` (ver §5, Módulo de estados).
>
> **Simplificación de roles (`AUTH-02`):** los roles *Coordinador* y *Asesor* del backlog
> original se **fusionan en `admin`** — todo usuario de un tenant es `admin` y ve las mismas
> pantallas; la distinción de función/jerarquía se expresa con el `subrol` (metadata, no afecta
> autorización). El campo `asesorId` en `Cliente`/conversaciones se conserva con ese nombre, pero
> ahora referencia al usuario `admin` asignado a la conversación.

## 4. Captura de datos por IA (alto valor)

El motor de IA (Gemini 1.5 Flash) hace **slot filling** sobre la conversación y separa:

- **Datos declarados** por el prospecto → extracción directa. Core genérico: nombre, rol del
  contacto (decisor/usuario), producto/servicio de interés. Vertical-específicos → campos
  personalizados del tenant.
- **Señales inferidas** por la IA → clasificación:
  - **Nivel de interés** (`frio | tibio | caliente`) para optimizar gasto en campañas.
  - **Objeción principal** (`precio | tiempo | confianza | otra`) para que el asesor cierre con
    el argumento correcto.

## 5. Módulos funcionales (alcance MVP, ya ajustado)

| Módulo | Estado | Descripción |
|---|---|---|
| **INF — Infraestructura y Multi-Tenancy** | MVP | Monorepo, modelo de Tenant, middleware de resolución, esquemas con `tenantId`, deploy, CI/CD. |
| **AUTH — Autenticación y RBAC** | MVP | JWT con alcance de tenant, motor RBAC (2 roles: `superadmin`/`admin`, con subroles internos de `admin` como metadata), gestión de usuarios internos. |
| **SAAS — Panel Superadmin** | MVP | CRUD de empresas, **activación manual de planes**, métricas globales cross-tenant. |
| **M01 — Bandeja Omnicanal (Meta)** | MVP | Webhook multi-tenant, Embedded Signup por empresa, envío outbound, normalización IG/FB, UI de bandeja. |
| **M02 — Gestión de prospectos por ESTADOS** | MVP | CRUD tenant-scoped, transición de `estadoComercial`, dashboard de conversión. **Sin tablero Kanban / sin drag&drop.** |
| **M04 — Motor de IA (Gemini)** | MVP | Slot filling, lead scoring (frío/tibio/caliente), detección de objeción, actualización dinámica, worker BullMQ. |
| **M08 — Catálogo (productos/servicios)** | MVP | CRUD genérico de ítems del catálogo (antes "cursos"), asociación al prospecto. |
| **M07 — Campañas de Remarketing** | Fase 3 | Filtrado dinámico de prospectos, encolamiento masivo (BullMQ + rate limit Meta), wizard, historial. |
| **M06 — Constructor Visual de Flujos** | **Fase 3 (recomendado)** | Canvas React Flow + runtime server-side. Mayor riesgo técnico; se difiere para no comprometer el MVP. |

> **Nota sobre fases:** la columna "Estado" usa la numeración de fases de §7. "MVP" agrupa las
> Fases 0–2 (INF, AUTH, SAAS, M01, M02, M08, M04); M07 y M06 son post-MVP (Fase 3) y el móvil es
> Fase 4. La numeración es por **dependencia**, no por fecha.

### Módulos eliminados respecto al material original
- **Kanban (M02 original):** reemplazado por gestión basada en estados del cliente.
- **Verificación de Pagos (M03):** eliminado. Solo un atributo `estadoComercial = pagado`.
- **Caché Semántica Redis (M05):** omitida en el MVP (Redis se mantiene solo como broker de colas).

## 6. Estados del prospecto (`estadoComercial`)

Conjunto por defecto, **configurable por tenant** en una fase posterior:

```
nuevo → en_gestion → pago_pendiente → pagado
                  ↘ perdido
```

- `nuevo`: lead recién entrado por cualquier canal.
- `en_gestion`: un `admin` (asesor asignado) en conversación/asesoría.
- `pago_pendiente`: acordada la compra, esperando confirmación.
- `pagado`: cierre ganado (cambio manual de atributo por un `admin`).
- `perdido`: descartado.

Cada transición emite un evento asíncrono para recalcular métricas de conversión.

## 7. Fases sugeridas (Sr. Architect)

> Las estimaciones de cronograma del backlog original quedan **fuera de alcance** (ajustadas por
> el cliente). Se proponen fases por dependencia, no por fecha.

- **Fase 0 — Cimientos:** INF + AUTH + SAAS. Sin esto nada es multi-tenant ni seguro.
- **Fase 1 — Núcleo CRM:** M01 (omnicanal) + M02 (estados) + M08 (catálogo).
- **Fase 2 — Inteligencia:** M04 (IA: slot filling, scoring, objeciones).
- **Fase 3 — Crecimiento:** M07 (campañas) y luego M06 (flujos visuales).
- **Fase 4 — Móvil:** React Native (Expo) para los `admin` que atienden la bandeja (función de
  asesor).

## 8. Riesgos principales

1. **Fuga de datos cross-tenant** (severidad máxima): mitigado por el repositorio tenant-safe y
   tests de aislamiento obligatorios. Ver `multi-tenancy.md`.
2. **Políticas de Meta** sobre difusiones masivas: una infracción puede suspender la WABA de una
   empresa. Probar con números sandbox; respetar rate limits.
3. **Runtime del constructor de flujos (M06):** el componente más complejo; por eso se difiere a
   Fase 3.
4. **Datos sensibles / menores:** si un tenant maneja datos de menores, aplican obligaciones de
   tratamiento de datos (en Colombia, Ley 1581 de Habeas Data). Pendiente de confirmación del
   cliente; el modelo deja espacio para consentimiento y retención.
