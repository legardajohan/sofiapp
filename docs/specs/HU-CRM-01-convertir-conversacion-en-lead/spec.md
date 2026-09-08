# HU-CRM-01 — Convertir conversación en lead (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Abre el seguimiento comercial explícito: separa "con quién hablo" (el contacto) de
> "qué negocio estoy persiguiendo" (el lead), y deja trazabilidad de dónde salió cada oportunidad.

**Estado:** implementado

## Objetivo

Permitir que un **Administrador**, desde una conversación de la bandeja, cree un **lead** con el
nombre y el teléfono ya pre-cargados, para iniciar el seguimiento comercial. El lead queda vinculado
al contacto y a la conversación de la que nació, y no se puede duplicar por teléfono dentro del mismo
tenant. Con esto el módulo **M02 — Gestión de prospectos por ESTADOS** (`docs/product.md` §5) gana su
punto de entrada desde el canal.

## Contexto de dominio (importante)

En SofiApp **no existe una colección `Conversation` ni `Contact`**: una conversación **es** un
`Cliente`, y ese mismo `Cliente` es el contacto (ver `docs/domain.md` y las specs de HU-OMNI-03 y
HU-OMNI-04). `docs/data-model.md` titula esa colección `## clientes (prospectos / leads)`. Por tanto:

- "Vincular el lead al contacto y a la conversación origen" se materializa sobre **el mismo
  `clienteId`**: `Lead.clienteId` (el contacto) y `Lead.origen.conversacionId` (la conversación de la
  que nació). Hoy ambos valores coinciden; se guardan por separado porque responden preguntas
  distintas y porque el día que una conversación deje de ser un `Cliente`, el origen no se pierde.
- El `:id` que viaja en las rutas de `conversations` es un **`clienteId`**, igual que en HU-OMNI-01
  a HU-OMNI-04.

**Cuidado con el nombre `leads`.** Ya está tomado como métrica de cuota de plan:
`Plan.limites.leads` y `QuotaMetric = 'leads'` (`usage.types.ts`), que hoy se calcula con
`countScoped(Cliente, …)`. Esa métrica **sigue contando `Cliente`**, no la colección nueva. Este
feature no toca cuotas.

## Alcance

Incluye:

- **Backend**
  - Feature `lead` completo (patrón de 6 archivos): `POST /api/leads`, `GET /api/leads/:id` y
    `DELETE /api/leads/:id?motivo=…`. Todo por tenant.
  - Colección `leads` con `clienteId`, `origen` (trazabilidad) y `responsableId`.
  - Prevención de duplicados por teléfono dentro del tenant, respaldada por índice único.
  - `leadId` en la proyección de la conversación y en la ficha del contacto, hidratado **en lote**:
    es lo que permite saber si una conversación ya se convirtió (ver criterio 10).
  - Borrado del lead con **motivo obligatorio** de un enum cerrado (ver criterio 12).
  - Registro en `AuditEvent` de la conversión y del borrado.
  - Extensión de `AppError` para poder devolver datos accionables junto al mensaje (ver criterio 4).
- **Frontend**
  - Acción "Convertir en lead" en la cabecera de la conversación activa.
  - Diálogo de conversión pre-rellenado con los `datosExtraidos` de HU-OMNI-03 (nombre, correo y
    teléfono) cuando existen, cayendo campo a campo a la conversación cuando no.
  - Tarjeta del lead en la ficha del contacto, que consume `GET /api/leads/:id`, con el borrado
    como acción **secundaria** tras un menú de desbordamiento (ver criterio 13).
- **Documentación**
  - `docs/data-model.md`: colección `leads`.
  - `docs/domain.md`: glosario (Lead / Oportunidad), lista de entidades e invariante de aislamiento.
  - `docs/api-contract.md`: los tres endpoints y la variante de error con datos adjuntos.

Fuera de alcance (otros features / fases):

- Listado y filtros de leads, página `/leads` → `HU-CRM-03`.
- Edición del lead y transición de su `estado` → `HU-CRM-04`.
- Métricas y reportes de conversión → `CRM-05`.
- Conversión desde formulario web o importación masiva (aquí solo nace desde una conversación).
- Valor estimado y moneda del lead (arrastraría ADR 0005, `Decimal128` y TRM).
- Cuota de plan sobre la colección `leads`.
- Etapas de pipeline y tablero Kanban: excluidos por decisión de producto (`docs/product.md` §5).
  **Superado:** las etapas configurables llegaron en HU-CRM-03 y el tablero con drag&drop en
  HU-PIPE-01, que revirtió aquella exclusión (ver `docs/adr/0007-tablero-kanban-pipeline.md`).

## Criterios de aceptación

1. `POST /api/leads` crea un lead en el tenant del token con `nombre` (1–120), `telefono`, `correo?`
   y `clienteId`. `estado` nace en `nuevo` y `responsableId` por defecto es el usuario del token.
   Responde `201` con el `ILeadResponse`.
2. El lead guarda la trazabilidad de su origen: `origen.tipo = 'conversacion'`,
   `origen.conversacionId` (el `clienteId` de la conversación), `origen.convertidoPor` (userId del
   token) y `origen.convertidoAt`. **Es la Definición de Hecho de la historia.**
3. El `clienteId` del body se valida **contra el tenant antes de escribir**: si no corresponde a una
   conversación del tenant del token, la operación falla con `AppError(404)` y **no crea nada**. Un
   `clienteId` de otro tenant y uno inexistente son indistinguibles a propósito — esa
   indistinguibilidad *es* la garantía de aislamiento (`docs/multi-tenancy.md`); nunca se responde
   `403`, que confirmaría la existencia del recurso ajeno.
4. Un segundo lead con el mismo teléfono en el mismo tenant falla con `AppError(409)`, y la respuesta
   **incluye el `id` del lead que ya existe** para que la UI pueda enlazarlo. La unicidad la garantiza
   el índice `{ tenantId, telefono }` único, no solo la comprobación previa: dos peticiones
   simultáneas no pueden colarse ambas.
5. Dos tenants distintos **sí** pueden tener un lead con el mismo teléfono: la unicidad es por tenant,
   nunca global.
6. `GET /api/leads/:id` devuelve el lead del tenant con las referencias **resueltas, no como ids
   sueltos**: `contacto { id, nombre, telefono }`, `responsable { id, nombre }` y
   `origen.convertidoPor { id, nombre }` — la tarjeta muestra "Convertido por Ana", no un ObjectId.
   Un id de otro tenant → `AppError(404)`.
7. La conversión registra un `AuditEvent` (`accion: 'lead.create'`, `entidad: 'lead'`) sin bloquear
   la creación: si la auditoría falla, el lead se crea igual y el fallo queda en el log.
8. **UI:** la cabecera de la conversación ofrece "Convertir en lead"; el diálogo llega pre-rellenado
   con los `datosExtraidos` de HU-OMNI-03 — nombre completo, correo y teléfono — y cae **campo a
   campo** al nombre y al número de la conversación en lo que la extracción no encontró (o si nunca
   se extrajo). Los tres campos siguen siendo editables: el pre-relleno es un punto de partida, no un
   valor impuesto. Mientras la ficha responde, el formulario espera con los campos deshabilitados en
   vez de sembrar valores que van a cambiar bajo el cursor. Legible en **claro y oscuro**, con
   estados de carga, error y deshabilitado resueltos.
9. **UI:** ante el `409` el diálogo **no se cierra** y el aviso ofrece "Ver lead existente", que abre
   la ficha del lead ya creado. El asesor nunca se queda sin saber por qué no se creó nada.
10. **UI:** una conversación ya convertida no vuelve a ofrecer la acción como si fuera nueva. Lo hace
    posible el `leadId` que viaja ya resuelto en la conversación y en la ficha: la cabecera muestra el
    estado del lead en lugar del botón, y la ficha del contacto pinta su tarjeta. Sin ese campo el
    asesor solo descubriría el duplicado al recibir el `409`, que es el criterio 9 haciendo de red de
    seguridad, no de prevención.
11. **Aislamiento multi-tenant:** un lead del tenant A no se lee **ni se borra** desde el tenant B
    (`AppError(404)`, y el lead sigue ahí); crear un lead con un `clienteId` del tenant A desde el
    tenant B falla **sin escribir**; el mismo teléfono coexiste en dos tenants. **Test de aislamiento
    en verde** para los cuatro casos.
12. `DELETE /api/leads/:id` exige un `motivo` de un enum cerrado — `duplicado`, `spam`, `prueba`,
    `sin_respuesta`, `no_interesado` — en la query; sin él o con otro valor → `400` y **no borra
    nada**. El borrado es **duro**: libera el teléfono y la conversación vuelve a poder convertirse.
    Deja `AuditEvent` `lead.delete` con el lead completo en `antes` y el motivo en `despues`, que es
    lo único que sobrevive al documento.
13. **UI:** eliminar **no es una acción principal**. Vive tras el menú de desbordamiento (`…`) de la
    tarjeta del lead, y al elegirla se abre un `AlertDialog` donde el motivo es parte de la
    confirmación: sin motivo elegido no hay botón que pulsar. Tras borrar, la ficha deja de pintar la
    tarjeta y la cabecera vuelve a ofrecer "Convertir en lead".
14. `pnpm --filter @sofiapp/api typecheck` y `test` en verde;
    `pnpm --filter @sofiapp/web build`, `lint` y `test` sin errores.

## Nota sobre `Lead` vs `Cliente` (decisión de producto)

Se crea una colección nueva en vez de reutilizar `Cliente.estadoComercial`, que es lo que hoy hace de
pipeline. El motivo es que son cardinalidades distintas:

- Un `Cliente` es **único por `metaUserId`**: es la persona que escribe por un canal. No se puede
  duplicar ni archivar sin perder la conversación.
- Un `Lead` es **único por teléfono** y representa un intento de venta. Un mismo contacto puede
  generar varios leads a lo largo del tiempo (recompra, un segundo producto, un ciclo perdido y
  reabierto). Meter eso en `estadoComercial` obligaría a sobrescribir el historial comercial en cada
  ciclo.

Dos acotaciones para que la decisión no se desborde:

- El `Lead` **no** introduce `etapa` ni pipeline propio: reutiliza la unión `EstadoComercial` ya
  existente (`nuevo | en_gestion | pago_pendiente | pagado | perdido`). **Superado por HU-CRM-03**
  (catálogo por tenant) **y HU-PIPE-01** (tablero). Kanban y drag&drop seguían
  fuera de alcance por `docs/product.md` §5.
- `Cliente.estadoComercial` **no** se deja de usar ni se sincroniza automáticamente con
  `Lead.estado` en este feature. Cualquier acoplamiento entre ambos es materia de `HU-CRM-04`.

## Dependencias

- `INF-02` — repositorio tenant-safe (`*Scoped`) y `requireTenant`.
- `AUTH-01` / `AUTH-02` — `tenantId` y `rol` en el token; `authorize(['admin'])`.
- `HU-OMNI-01` — bandeja de WhatsApp y features `conversation` / `cliente` / `message`; de aquí sale
  el `clienteId` y el pre-relleno de nombre y teléfono.
- `HU-OMNI-02` — `AuditEvent` y el patrón de hidratación en lote de responsables (`findUsersByIds`),
  que este feature reutiliza para resolver el `responsableId`.
- `HU-OMNI-03` — ficha del contacto (`ContactPanel`) donde se monta la tarjeta del lead, y
  `datosExtraidos` de donde sale el correo del pre-relleno.
- `DSN-03` — UI kit shadcn (`dialog`, `input`, `label`, `button`, `card`, `badge`, `sonner`).
