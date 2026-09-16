# ADR 0008 — Almacenamiento de media de conversación tras un puerto con dos adaptadores

**Estado:** aceptado · **Fecha:** 2026-09-16 · **Contexto:** HU-OMNI-06 (mensajería multimedia
enriquecida)

## Contexto

Hasta HU-OMNI-06 SofiApp **no guardaba un solo byte de archivo**. Un mensaje entrante de WhatsApp
que fuera imagen, audio o documento se persistía con el `tipo` correcto y nada más: el asesor veía
`[image]` en cursiva y Sofi contestaba "solo entiendo texto". `Message.attachmentUrl` existía en el
schema desde HT-WA-01, pero su único escritor era el seed de demo.

`docs/architecture.md` ya designaba **DO Spaces** para la media de chat, pero esa decisión no tenía
contrato: ninguna variable de entorno documentada, ninguna dependencia instalada, ningún adaptador.
Y el entorno de desarrollo no tiene equivalente — `docker-compose.yml` levanta Redis y nada más—,
así que atarse a Spaces directamente obligaría a cada desarrollador a tener credenciales de un
bucket real para arrancar el proyecto o correr los tests.

Hay además una restricción que condiciona todo el diseño: **los Media ID de Meta caducan**. La
Graph API devuelve una URL de descarga que vive unos cinco minutos. Referenciar la media de Meta en
vez de copiarla significaría que el hilo se queda vacío al día siguiente.

## Decisión

**La media se copia a un almacenamiento propio, detrás del puerto `IMediaStorage`, con dos
adaptadores seleccionados por la variable `MEDIA_DRIVER`.**

- `integrations/storage/storage.types.ts` define `IMediaStorage` (`guardar`, `leer`, `urlFirmada`,
  `eliminar`). Es un puerto a un tercero, así que vive en `integrations/`, junto a `meta/` y `llm/`,
  no en `features/`.
- **`local`** (por defecto) escribe en `MEDIA_LOCAL_DIR`. Desarrollo y tests funcionan sin
  credenciales y sin una pieza más en `docker-compose`.
- **`spaces`** usa `@aws-sdk/client-s3` contra DO Spaces. `env.ts` exige las cinco `SPACES_*` con un
  `superRefine` **solo** cuando el driver es `spaces`: el proceso aborta al arrancar si falta alguna,
  mismo criterio que `JWT_SECRET`.
- **`urlFirmada` devuelve `null` cuando el adaptador no sabe firmar.** El controller pregunta por la
  capacidad, no por el driver: con `null` sirve el stream, con URL responde `302`. Añadir un tercer
  adaptador no obliga a tocar el controller.
- **Todo objeto se escribe con `ACL: 'private'` explícito.** La clave lleva el `tenantId` dentro, así
  que un bucket público sería una fuga entre empresas que basta con adivinar una ruta para explotar.
- La clave es `<tenantId>/<messageId>/<uuid>.<ext>` y **ningún trozo viene del cliente**. El nombre
  original del archivo se guarda en el `Message`, nunca en la ruta: es texto escrito por un
  desconocido que acabaría concatenado a un `path`.
- El modelo persiste la **clave**, nunca una URL. Una URL guardada caduca o filtra el bucket; la del
  DTO se deriva y se firma en cada lectura.

## Alternativas consideradas

- **Referenciar la URL de Meta.** Descartada: caduca en cinco minutos. El hilo quedaría roto al día
  siguiente, que es justo cuando el asesor vuelve a mirarlo.
- **GridFS / binarios en MongoDB.** Cero infraestructura nueva y el mismo comportamiento en
  desarrollo y producción, pero infla el clúster de Atlas y sus backups con vídeos de 16 MB, y Mongo
  no es un CDN. Contradice además `architecture.md`, que ya designaba Spaces.
- **Solo el adaptador de Spaces, sin disco local.** Menos código, pero exige credenciales de un
  bucket real para levantar el entorno local y para cualquier test de integración. El coste del
  segundo adaptador (unas 80 líneas) es menor que el de ese peaje diario.
- **S3 de AWS.** Habla el mismo protocolo, pero el despliegue ya está en DigitalOcean y Spaces evita
  una cuenta y una factura más.
- **Generar miniaturas al ingerir.** Exigiría `sharp` (binario nativo) o `ffmpeg`. Se sustituye por
  `aspect-ratio` en CSS y el `preload="metadata"` del `<video>`. El campo `miniaturaKey` queda
  declarado para que añadirlas después sea aditivo.

## Consecuencias

- (+) El entorno de desarrollo sigue arrancando con `docker-compose` + Mongo Atlas, sin credenciales
  de bucket ni servicio nuevo.
- (+) Los tests corren contra disco real —no un mock— con `MEDIA_LOCAL_DIR` en un temporal, así que
  la guarda de path traversal se prueba de verdad.
- (+) Aislamiento preservado: el objeto se resuelve **siempre** a través de un `findByIdScoped` sobre
  `Message`; el almacenamiento no se toca hasta después de esa comprobación.
- (−) **El adaptador local no implementa `Range`**, así que en desarrollo no se puede buscar dentro
  de un vídeo. En producción sí, porque Spaces lo soporta sobre la URL prefirmada.
- (−) **No hay cuota de almacenamiento por tenant.** `HU-SAAS-02` mide `mensajesMes` y `campanasMes`,
  nada de MB: una empresa puede llenar el bucket sin límite ni coste imputado. Deuda declarada, no
  descuido (candidatos: `almacenamientoMb` en el plan y retención de media a N días).
- (−) Dos adaptadores es una ruta de código que solo se ejercita en producción. Mitigado porque
  `spaces` se reduce a cuatro llamadas del SDK y la lógica que importa —claves, validación,
  aislamiento— es común.
- Afecta a: `apps/backend/src/integrations/storage/*`, `config/env.ts`,
  `features/media/*`, `features/message/message.model.ts`, `workers/media-ingest.processor.ts`,
  `docs/architecture.md`, `docs/data-model.md`, `docs/integrations/meta-whatsapp.md`.
