# Dominio — SofiApp

## 1. Glosario

| Término | Definición |
|---|---|
| **Tenant / Empresa** | Entidad comercial que alquila SofiApp. Raíz del aislamiento multi-tenant. |
| **Usuario del panel** | Persona con login (Superadmin, Admin, Coordinador, Asesor). |
| **Cliente / Prospecto** | Lead. Entidad de datos (`Cliente`), nunca inicia sesión. |
| **Canal** | Origen de la comunicación: `whatsapp | instagram | messenger | formulario | web`. |
| **WABA** | WhatsApp Business Account; cada tenant conecta la suya (modelo BSP). |
| **Slot filling** | Extracción por IA de datos del prospecto desde la conversación. |
| **Nivel de interés** | Señal inferida por IA: `frio | tibio | caliente`. |
| **Objeción** | Motivo de duda inferido por IA: `precio | tiempo | confianza | otra`. |
| **Catálogo** | Conjunto de productos/servicios que ofrece el tenant (genérico). |
| **Campaña** | Difusión masiva segmentada a prospectos (remarketing). |
| **Flujo** | Grafo de conversación automatizada (constructor visual, Fase 3). |
| **HSM** | Plantilla de mensaje aprobada por Meta para envíos proactivos. |

## 2. Entidades del dominio

`Tenant`, `Plan`, `User`, `MetaIntegration`, `Cliente`, `Message`, `CatalogItem`, `Campaign`,
`Flow` (Fase 3). Esquemas en `data-model.md`.

## 3. Estados del prospecto (`estadoComercial`)

```
        ┌──────────────────────────────────────────────────────┐
        ▼                                                      │
   ┌─────────┐    ┌────────────┐    ┌─────────────────┐    ┌─────────┐
   │  nuevo  │──▶ │ en_gestion │──▶ │ pago_pendiente  │──▶ │ pagado  │
   └─────────┘    └────────────┘    └─────────────────┘    └─────────┘
        │                │                   │
        └────────────────┴───────────────────┴──────────▶ ┌──────────┐
                                                           │ perdido  │
                                                           └──────────┘
```

- Default genérico, **configurable por tenant** en una fase posterior.
- `pagado` se establece como **cambio manual de atributo** por un Asesor/Coordinador (no hay
  verificación de comprobante).
- Cada transición es **idempotente** y emite un evento al bus interno para recalcular métricas.

### Reglas de transición

- Toda transición se valida en un servicio puro `changeEstadoComercial(clienteId, tenantId, nuevoEstado)`.
- Transiciones permitidas: ver diagrama. Una transición no permitida lanza `AppError(400)`.
- `perdido` es alcanzable desde cualquier estado activo.

## 4. Captura por IA — datos genéricos vs. personalizados

- **Core (todos los tenants):** `nombre`, `rolContacto` (`decisor | usuario | desconocido`),
  `interesItemId` (producto/servicio del catálogo), `nivelInteres`, `objecionPrincipal`.
- **Personalizados (por tenant):** `customFields` (mapa libre). Ejemplo Pre-ICFES: `colegio`,
  `grado`, `acudienteContacto` viven aquí, no como columnas fijas.

> El motor de IA recibe del tenant la definición de qué `customFields` debe intentar capturar
> (configuración por tenant), además del core fijo.

## 5. Invariantes de dominio

1. Un `Cliente` pertenece a exactamente un `Tenant`.
2. Un `Message` pertenece a un `Cliente` y a su mismo `Tenant`.
3. Un `phone_number_id` mapea a exactamente un `Tenant` (vía `MetaIntegration`, único global).
4. Un email de usuario de panel es único **globalmente** (`{ email }` único); el login resuelve el
   tenant del usuario hallado (ADR 0003).
5. El Superadmin no pertenece a ningún tenant (`tenantId = null`).
