# HT-WA-04 — Plantillas con imagen de encabezado y validación de Meta (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Habilitador técnico: cierra lo que `HT-WA-02` y `HU-MARK-03` dejaron fuera —
> **crear** plantillas con imagen desde SofiApp y que su estado en Meta se refleje solo.

**Estado:** creado

## Objetivo

Que un administrador pueda crear plantillas de WhatsApp de **texto + imagen de encabezado**, enviarlas
a validación de Meta sin salir de SofiApp, ver cómo cambia su estado (Pendiente → Aprobada /
Rechazada con motivo) en vivo, y usarlas en campañas y en envíos desde la conversación **con la
imagen por defecto o con otra imagen**, sin aprobar una plantilla nueva por cada imagen.

## Contexto de dominio (importante)

**Qué aprueba Meta y qué no.** Meta revisa la **estructura** de la plantilla (formato del
encabezado, texto del cuerpo, ejemplos). La imagen que se manda al crearla es solo una **muestra**
para la revisión (`header_handle`); la imagen que recibe el cliente se pasa **en cada envío** como
parámetro del `HEADER`. Por eso cambiar la imagen de una campaña no exige re-aprobación — y por eso
también la imagen de reemplazo no pasa por revisión: si incumple las políticas de Meta, el coste lo
paga la calidad del número (puede pausar la plantilla). La UI lo advierte.

**Qué ya existe (no se reimplementa).**
- `HT-WA-02`: catálogo `WhatsAppTemplate` (espejo de Meta), sincronización manual, alta de
  plantillas de solo texto, `buildTemplatePayload` y `sendOutbound`.
- `HU-MARK-03`: imagen **por campaña** guardada en nuestro almacenamiento (`Campaign.contenido.imagen`),
  subida a Meta al arrancar con caché del `media id` y renovación a los 25 días, y soporte de cabecera
  `IMAGE` en `buildTemplatePayload`. Dejó fuera expresamente **crear** plantillas con imagen.
- `HU-OMNI-06` / ADR 0008: puerto de almacenamiento de media (`IMediaStorage`, disco local / DO
  Spaces) con claves prefijadas por tenant.

**Dos imágenes distintas, dos ciclos de vida.**
| | Imagen por defecto | Imagen de reemplazo |
|---|---|---|
| Dónde se fija | Al crear la plantilla | En una campaña o en un envío |
| Dónde vive | Nuestro almacenamiento, ligada a la plantilla | Nuestro almacenamiento, ligada a la campaña / mensaje |
| La ve Meta en la revisión | Sí (como muestra, vía `header_handle`) | No |
| Se usa en el envío cuando | La campaña / envío no trae reemplazo | Siempre que exista |

**El webhook de estado llega por otra puerta.** Los eventos `message_template_status_update` son
del **WABA**, no de un número: no traen `metadata.phone_number_id`. El tenant se resuelve por el id
del WABA (`entry[].id`). Es una extensión de la excepción ya documentada del webhook de Meta (regla 2
del `CLAUDE.md` raíz), no una puerta nueva al tenant desde el cliente.

## Alcance

Incluye:
- Alta de plantilla con selector de **tipo de encabezado**: solo texto (comportamiento de
  `HT-WA-02`) o texto + imagen; pie de página opcional.
- Validación de la imagen (JPEG/PNG por contenido real, ≤ 5 MB) antes de cualquier llamada a Meta.
- Subida de la imagen de muestra con la **Resumable Upload API** de Meta (`header_handle`) y
  persistencia de la imagen como **imagen por defecto** en el almacenamiento del tenant.
- Creación en Meta con `HEADER(IMAGE)` + `BODY` (+ `FOOTER`) con ejemplos de variables.
- Estado de aprobación automático: webhook `message_template_status_update` (vía BullMQ) +
  sincronización por plantilla (`POST /templates/:id/sync`) + barrido periódico de respaldo de las
  plantillas `PENDING`. Motivo de rechazo persistido y visible.
- `GET /templates/:id` con la URL firmada de la imagen por defecto para la vista previa.
- Resolución de la imagen al enviar: **reemplazo** si existe, si no **imagen por defecto**; si no
  hay ninguna, el envío se rechaza.
- Caché del `media id` de Meta de la imagen por defecto (por número), renovado antes de caducar.
- `POST /campaigns/media` (imagen de reemplazo para campañas) y `POST /messages/template` aceptando
  una imagen de reemplazo opcional.
- Wizard de envío inmediato y programador de campañas: bloque **«Imagen del mensaje»** (imagen por
  defecto, *Cambiar imagen*, *Restaurar imagen por defecto*); el wizard inmediato deja de excluir
  las plantillas con imagen.
- Bandeja: acción **«Enviar plantilla»** (hoy la ventana cerrada solo muestra un aviso sin salida),
  con el mismo bloque de imagen y vista previa.
- Listado con insignia de estado, indicador «Con imagen» y motivo de rechazo; actualización en
  vivo por Socket.IO.
- Mensajes de error comprensibles para los fallos conocidos de Meta (nombre duplicado, imagen
  inválida, límite de plantillas).

Fuera de alcance (otros features):
- Encabezados de **vídeo** o **documento** y encabezado de **texto** con variables.
- **Crear** botones (respuesta rápida, URL, llamada). El modelo los persiste si llegan de Meta.
- Editar una plantilla ya creada (Meta exige re-aprobación; se crea otra).
- Borrar plantillas en Meta.
- Limpieza programada de imágenes subidas que nunca llegaron a usarse (se documenta como riesgo).
- Mostrar en el hilo de la bandeja las imágenes de **campañas** (sigue fuera, como en `HU-MARK-03`);
  sí se muestran las de envíos hechos desde la propia conversación.

## Criterios de aceptación

**Alta de la plantilla**

1. El formulario de alta pide elegir el tipo de encabezado: **Solo texto** o **Texto + imagen**. Con
   *Solo texto* el alta se comporta exactamente como en `HT-WA-02` (mismo contrato y mismos tests).
2. La opción *Texto + imagen* solo está disponible para las categorías **Marketing** y **Utility**.
   En la UI aparece deshabilitada con el motivo para *Authentication*; el backend rechaza con `400`
   un alta con imagen en esa categoría aunque la UI se salte.
3. `POST /api/templates/media` valida la imagen **antes** de llamar a Meta: tipo real JPEG o PNG
   (comprobado por contenido, no solo por extensión o `Content-Type`) y ≤ 5 MB. Si no cumple
   responde `400` (formato) o `413` (tamaño) con un mensaje que dice qué falló y qué se acepta. La
   validación de cliente (arrastrar y soltar) aplica las mismas reglas y muestra el mismo mensaje.
4. Una imagen válida se guarda en el almacenamiento bajo el prefijo del tenant
   (`<tenantId>/templates/…`) y se sube a Meta con la Resumable Upload API; la respuesta trae la
   referencia de la imagen, el `header_handle` y una URL firmada para la vista previa. La UI muestra
   el progreso de la subida.
5. `POST /api/templates` con encabezado de imagen crea la plantilla en Meta con `HEADER(IMAGE)` y su
   `header_handle`, `BODY` con los ejemplos de variables y, si se indicó, `FOOTER`; la persiste en
   `PENDING` con la imagen como **imagen por defecto**. Una referencia de imagen que no pertenezca al
   tenant (otro prefijo) o que no exista → `400`, sin llamar a Meta. Si Meta rechaza la creación no
   queda documento local.
6. Los errores conocidos de Meta al crear se traducen a mensajes comprensibles: nombre ya usado en
   ese idioma (`409`), imagen rechazada por Meta (`400`), límite de plantillas del WABA alcanzado
   (`422`). Un error desconocido conserva el genérico de `HT-WA-02`.

**Estado de aprobación**

7. Un evento `message_template_status_update` firmado actualiza la plantilla correspondiente
   (resuelta por `wabaId` → tenant, y `metaTemplateId` dentro de ese tenant) a `APPROVED`,
   `REJECTED`, `PAUSED` o `DISABLED`; en `REJECTED` guarda el **motivo** y lo limpia si vuelve a
   aprobarse. El webhook responde `200` de inmediato y el trabajo va a BullMQ. Un evento de un WABA
   desconocido o de una plantilla inexistente se registra y se descarta sin error.
8. El procesamiento de eventos de mensajes existente no cambia: un lote con cambios de `messages` y
   de `message_template_status_update` procesa ambos, y un cambio sin `metadata` ya no interrumpe
   el resto del lote.
9. `POST /api/templates/:id/sync` refresca desde Meta el estado y el motivo de rechazo de **una**
   plantilla del tenant; un barrido periódico hace lo mismo con las plantillas que siguen `PENDING`
   (respaldo por si el webhook no llega). El sync masivo de `HT-WA-02` también trae el motivo.
10. Cada cambio de estado se publica en vivo al tenant (Socket.IO); el listado se actualiza sin
    recargar y avisa con un toast al aprobarse o rechazarse una plantilla.
11. El listado muestra por plantilla: insignia de estado, indicador **«Con imagen»** y, si está
    rechazada, el motivo en texto visible (no solo en un tooltip).

**Envío con imagen**

12. Solo las plantillas `APPROVED` se pueden usar en envíos (regla de `HT-WA-02`, sin cambios): los
    selectores de campaña y de conversación solo las ofrecen y el backend responde `422` si no.
13. Regla de resolución de la imagen al enviar: **imagen de reemplazo** si la campaña / el envío la
    trae; si no, **imagen por defecto** de la plantilla. Si la plantilla lleva imagen y no hay
    ninguna de las dos (p. ej. creada fuera de SofiApp y sincronizada) → `422` con un mensaje que
    pide adjuntar una imagen, antes de crear destinatarios o llamar a Meta.
14. `POST /api/campaigns/media` aplica las mismas validaciones que el criterio 3 y devuelve una
    referencia que `POST /api/campaigns` acepta; `POST /api/campaigns/schedule` y
    `PATCH /api/campaigns/:id/schedule` siguen aceptando su imagen multipart y ahora permiten
    omitirla cuando la plantilla tiene imagen por defecto.
15. `POST /api/messages/template` acepta una imagen de reemplazo opcional (multipart) con las mismas
    validaciones; sin ella usa la imagen por defecto. El cuerpo JSON de `HT-WA-02` sigue siendo
    válido sin cambios.
16. Cambiar la imagen en una campaña **no** modifica la plantilla ni otras campañas: la imagen por
    defecto, su caché de `media id` y las imágenes de otras campañas quedan intactas (test que lo
    demuestra con dos campañas sobre la misma plantilla).
17. La imagen por defecto se sube a `/{phoneNumberId}/media` una sola vez y su `media id` se
    reutiliza en todos los envíos; se vuelve a subir si caducó (≥ 25 días) o si el número del
    tenant cambió. Una campaña con imagen de reemplazo mantiene su propia caché (`HU-MARK-03`).
18. El destinatario recibe la plantilla con la imagen resuelta en el `HEADER` y las variables del
    `BODY` sustituidas (payload verificado en test; entrega real verificada en el DoD).

**Interfaz**

19. Vista previa estilo WhatsApp (imagen sobre el texto, variables de ejemplo sustituidas) en el
    alta, en el wizard, en el programador y en el envío desde la conversación; muestra **la imagen
    que realmente se enviará** (por defecto o reemplazo) y se actualiza al cambiarla.
20. Bloque «Imagen del mensaje» en wizard, programador y conversación: muestra la imagen por
    defecto, *Cambiar imagen* (arrastrar y soltar o elegir, con validación y progreso) y *Restaurar
    imagen por defecto*; avisa de que la imagen de reemplazo no pasa por revisión de Meta. Sin
    imagen por defecto, el bloque pide una imagen y no deja continuar sin ella.
21. La bandeja ofrece **«Enviar plantilla»** desde el aviso de ventana cerrada y desde el
    compositor; el mensaje enviado aparece en el hilo con su imagen.
22. Todo componente nuevo o tocado queda terminado en light y dark con los tokens semánticos, usa
    los primitivos de shadcn/ui, es usable con teclado y en ancho de móvil, y respeta
    `prefers-reduced-motion`.

**Compatibilidad y calidad**

23. Las plantillas de solo texto de `HT-WA-02` y las campañas de `HU-MARK-03` siguen funcionando sin
    cambios (sus tests existentes en verde, sin modificarlos salvo para añadir casos).
24. **Aislamiento multi-tenant:** plantillas, imágenes por defecto, imágenes de reemplazo y eventos
    de estado no cruzan tenants. Tests que lo demuestran: el tenant B no puede leer, sincronizar ni
    usar la plantilla ni la imagen del tenant A (404 / 400); una referencia de imagen con el prefijo
    de otro tenant se rechaza; un evento de estado del WABA de A solo modifica plantillas de A
    aunque B tenga una plantilla con el mismo `name` y `language`.
25. `pnpm --filter @sofiapp/api typecheck` y `pnpm --filter @sofiapp/api test` en verde;
    `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde, y los tests de
    frontend de los componentes tocados en verde.

## Definition of Done

Un administrador crea una plantilla con texto e imagen, Meta la aprueba y el estado cambia solo en
SofiApp. Luego lanza dos campañas con esa plantilla —una con la imagen por defecto y otra con una
imagen distinta— y contactos fuera de la ventana de 24 h reciben cada una con **su** imagen y las
variables correctas, sin una nueva aprobación. Verificado con tests automatizados y con una prueba
manual en número real o sandbox.

## Dependencias

- `HT-WA-01` / `HT-WA-01-V2` (liberados) — credenciales, `MetaIntegration`, webhook firmado.
- `HT-WA-02` (implementado) — catálogo, alta, envío por plantilla y `sendOutbound`.
- `HT-WA-03` (Embedded Signup) — WABA suscrito a la app.
- `HU-MARK-03` (implementado) — imagen de campaña y cabecera `IMAGE` en el envío.
- `HU-OMNI-06` / ADR 0008 — almacenamiento de media.
- **Configuración externa:** `META_APP_ID` definido (hoy opcional en `env.ts`; pasa a obligatorio en
  runtime), token con permiso `whatsapp_business_management`, y el campo
  `message_template_status_update` suscrito en el webhook de la app (paso manual en el panel de
  Meta, documentado en `docs/integrations/meta-whatsapp.md`).

## Habilita

Plantillas con imagen (e imagen distinta por envío) para `HU-FLOW-02`, `HU-MARK-01` y `HU-MARK-03`.
