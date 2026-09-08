# Dominio — SofiApp

## 1. Glosario

| Término | Definición |
|---|---|
| **Tenant / Empresa** | Entidad comercial que alquila SofiApp. Raíz del aislamiento multi-tenant. |
| **Usuario del panel** | Persona con login. Rol: `superadmin` o `admin`. Un `admin` puede llevar un **subrol interno** opcional (metadata, sin efecto en permisos): Director, Gerente, Coordinador, Secretaria (`AUTH-02`). |
| **Cliente / Prospecto** | Contacto. Entidad de datos (`Cliente`), nunca inicia sesión. Es a la vez el contacto y la conversación. |
| **Lead / Oportunidad** | Intento de venta concreto (`Lead`, HU-CRM-01), creado al convertir una conversación. Único **por teléfono** dentro del tenant, mientras el `Cliente` es único por `metaUserId`: un mismo contacto puede generar varios leads en el tiempo (recompra, segundo producto, ciclo reabierto). |
| **Canal** | Origen de la comunicación: `whatsapp | instagram | messenger | formulario | web`. |
| **WABA** | WhatsApp Business Account; cada tenant conecta la suya (modelo BSP). |
| **Slot filling** | Extracción por IA de datos del prospecto desde la conversación. |
| **Nivel de interés** | Señal inferida por IA: `frio | tibio | caliente`. |
| **Objeción** | Motivo de duda inferido por IA: `precio | tiempo | confianza | otra`. |
| **Catálogo** | Conjunto de productos/servicios que ofrece el tenant (genérico). |
| **Campaña** | Difusión masiva segmentada a prospectos (remarketing). |
| **Flujo** | Grafo de conversación automatizada (constructor visual, Fase 3). |
| **HSM** | Plantilla de mensaje aprobada por Meta para envíos proactivos. |
| **Nota de contacto** | Asiento de seguimiento que un usuario escribe sobre un contacto (`ContactNote`, HU-CRM-02). Se agrega, no se edita ni se borra: es historial. Su texto se cifra y solo la leen los subroles autorizados. |
| **Dato sensible** | Dato personal del contacto que se cifra en reposo y solo se muestra en claro a los subroles autorizados: correo, documento, notas y los atributos personalizados marcados `sensible` (HU-CRM-02, ADR 0006). Al resto le llega enmascarado. |
| **Atributo personalizado** | Par etiqueta/valor libre sobre un contacto (`Cliente.atributos`), con una marca `sensible` por campo. Sustituye a `customFields`. |

## 2. Entidades del dominio

`Tenant`, `Plan`, `User`, `MetaIntegration`, `Cliente`, `Message`, `Tag`, `Lead`, `ContactNote`,
`CatalogItem`, `Campaign`, `AuditEvent`, `Flow` (Fase 3). Esquemas en `data-model.md`.

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
- `pagado` se establece como **cambio manual de atributo** por un `admin` (no hay verificación de
  comprobante).
- Cada transición es **idempotente** y emite un evento al bus interno para recalcular métricas.

### Reglas de transición

- Toda transición se valida en un servicio puro `changeEstadoComercial(clienteId, tenantId, nuevoEstado)`.
- Transiciones permitidas: ver diagrama. Una transición no permitida lanza `AppError(400)`.
- `perdido` es alcanzable desde cualquier estado activo.

### Etapas del lead: transiciones libres y etapas de salida (HU-PIPE-01)

El diagrama de arriba describe `Cliente.estadoComercial`. La **etapa del lead** (`Lead.estado`) es
otra cosa desde HU-CRM-03: un catálogo **por tenant** (`estados`), no un enum, y por tanto no puede
tener un grafo de transiciones fijo — el `orden` que cada empresa le da a sus etapas es una
narrativa, no una lista de permisos.

Sus reglas son deliberadamente más simples:

- **Entre etapas activas, cualquier movimiento es válido**, incluido retroceder. Corregir un
  arrastre equivocado es una necesidad real; bloquearlo obligaría a tocar la base de datos a mano.
- **Mover a una etapa archivada (`activo: false`) es `400`.** El tablero solo pinta las activas: la
  tarjeta desaparecería sin que nadie pudiera explicar dónde fue a parar. Leer sí las admite —un
  lead puede llevar grabada una etapa que ya no se ofrece—, así que **escribir es más estricto que
  leer**.
- **`Estado.esSalida` marca las etapas terminales.** De fábrica lo son dos, y la distinción entre
  ellas es la que hace accionable un embudo:
  - **`perdido`** — la oportunidad se enfrió: dejó de responder, se agotó el plazo. Se reintenta en
    la siguiente campaña.
  - **`declinado`** — dijo que no. No se reintenta.

  El campo es **descriptivo, no restrictivo**: señala qué columnas cierran el recorrido, pero no
  impide sacar un lead de ellas. Reabrir una oportunidad es una decisión legítima del asesor.

## 4. Captura por IA — datos genéricos vs. personalizados

- **Core (todos los tenants):** `nombre`, `rolContacto` (`decisor | usuario | desconocido`),
  `interesItemId` (producto/servicio del catálogo), `nivelInteres`, `objecionPrincipal`.
- **Personalizados (por tenant):** `customFields` (mapa libre). Ejemplo Pre-ICFES: `colegio`,
  `grado`, `acudienteContacto` viven aquí, no como columnas fijas.

> El motor de IA recibe del tenant la definición de qué `customFields` debe intentar capturar
> (configuración por tenant), además del core fijo.

## 5. Semaforización (HU-OMNI-04)

**Semaforización** es el vocabulario compartido con el que el CRM expresa, de un vistazo, en qué
punto está una conversación. Se materializa como cuatro **etiquetas de sistema** que existen en
todos los tenants, con un identificador estable (`Tag.semaforo`):

| `semaforo` | Nombre sembrado | Color | Significado |
|---|---|---|---|
| `verde` | Avanza | `#16A34A` | Interesado, la conversación progresa |
| `naranja` | Requiere atención | `#EA580C` | Estancada o con una objeción pendiente |
| `rojo` | En riesgo | `#DC2626` | Bloqueada, a punto de perderse |
| `azul` | Informativo | `#2563EB` | Consulta general, sin intención comercial aún |

Reglas:

- El administrador **puede** renombrarlas y recolorearlas: cada empresa habla su propio idioma.
- El administrador **también puede eliminarlas**. La semaforización es un vocabulario que se
  ofrece, no una estructura que se impone: una empresa que no trabaja así no debería cargar con
  cuatro etiquetas que nunca usa. La UI pide confirmación antes de borrar una, porque su efecto
  alcanza módulos que no se ven desde la pantalla de etiquetas.
- Por tanto, **una etiqueta de semáforo puede no existir**. El resto de módulos (CRM-04 métricas,
  IA-05 clasificación automática, MARK-01 segmentación de campañas) las resuelven **por `semaforo`,
  nunca por nombre** — el nombre es mutable —, y deben tolerar que el slug no esté en lugar de
  asumir que las cuatro existen siempre.
- Se siembran **una sola vez** por tenant: al crearlo, o por backfill al arrancar el servidor si es
  anterior a HU-OMNI-04. La marca `Tenant.semaforoTagsSeeded` registra que ya ocurrió, para que el
  backfill no resucite una etiqueta que el administrador borró a propósito. Volver a sembrar un
  tenant ya sembrado no hace nada.

Junto a ellas conviven las etiquetas libres que cada empresa cree (sin `semaforo`). El
comportamiento es el mismo; la única diferencia es que las de semáforo llevan un slug estable y
piden confirmación al borrarse.

## 6. Invariantes de dominio

1. Un `Cliente` pertenece a exactamente un `Tenant`.
2. Un `Message` pertenece a un `Cliente` y a su mismo `Tenant`.
3. Un `phone_number_id` mapea a exactamente un `Tenant` (vía `MetaIntegration`, único global).
4. Un email de usuario de panel es único **globalmente** (`{ email }` único); el login resuelve el
   tenant del usuario hallado (ADR 0003).
5. El Superadmin no pertenece a ningún tenant (`tenantId = null`).
6. Un `Tag` pertenece a exactamente un `Tenant`, y una conversación solo puede llevar etiquetas
   de su propio tenant (validado antes de escribir en `setConversationTags`).
7. Un `Lead` pertenece a exactamente un `Tenant`, y su `clienteId` es del mismo tenant (validado
   antes de escribir en `createLeadFromConversation`). Su `telefono` es único **por tenant**, nunca
   globalmente: dos empresas pueden trabajar el mismo número sin verse. Borrarlo (`deleteLead`) es
   definitivo y exige un motivo del enum cerrado; libera el teléfono y deja rastro en `AuditEvent`.
   Un lead que se pierde no se borra: pasa a `estado: 'perdido'`.
8. Una `ContactNote` pertenece a exactamente un `Tenant` y su `clienteId` es del mismo tenant
   (validado antes de escribir en `createNota`). Solo la leen los subroles autorizados. No se edita
   ni se borra: es un asiento del historial (HU-CRM-02).
9. Un dato sensible del contacto (`correoEnc`, `documentoEnc`, `atributos[].valor` con
   `sensible: true`) **nunca** sale hacia quien no puede verlo, ni por la API ni por
   `audit_events`, donde se guarda como `"[oculto]"`. Editarlo exige subrol autorizado; leerlo sin
   él devuelve el valor enmascarado, nunca vacío (HU-CRM-02, ADR 0006). El cifrado en reposo está
   desactivado: en la base el valor está en claro (ver `docs/data-model.md`).
