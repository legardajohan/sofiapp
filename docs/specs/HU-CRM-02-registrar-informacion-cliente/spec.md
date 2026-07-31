# HU-CRM-02 — Registrar información relevante del cliente (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Abre la ficha del contacto a la escritura humana: hasta hoy solo escribían sobre
> un `Cliente` el webhook de WhatsApp y la IA, y ningún dato personal viajaba cifrado.

**Estado:** implementado

## Objetivo

Permitir que un **Administrador**, desde la conversación de la bandeja, **registre y edite** la
información relevante del contacto —correo, documento, nivel de interés, objeción, rol de contacto,
atributos personalizados— y **deje notas** de seguimiento. Los datos personales quedan **cifrados en
reposo** (AES-256-GCM) y **solo se muestran en claro a los subroles autorizados**; el resto los ve
enmascarados. Todo cambio deja rastro en `AuditEvent` sin que la propia bitácora filtre lo que el
cifrado protege.

Con esto el módulo **M02 — Gestión de prospectos** deja de depender de lo que la IA logre extraer:
el asesor puede corregirla y completarla a mano.

## Contexto de dominio (importante)

Tres cosas que hay que tener presentes antes de leer los criterios:

- **En SofiApp no existe una colección `Contact`.** Un contacto **es** un `Cliente`, y ese mismo
  `Cliente` es la conversación (`docs/domain.md`; misma advertencia en la spec de HU-CRM-01). Los
  endpoints que nombra la historia —`PATCH /contacts/:id` y `POST /contacts/:id/notes`— se
  materializan como **`PATCH /api/clientes/:id`** y **`POST /api/clientes/:clienteId/notas`**: el
  vocabulario de dominio va en español y los recursos en plural, según `apps/backend/CLAUDE.md` y
  `docs/api-contract.md` §1.

- **Este feature estrena autorización por `subrol`, y eso contradice a AUTH-02.** El criterio 4 de
  `docs/specs/AUTH-02-admin-subroles/spec.md` dice literalmente que *"los subroles no cambian la
  autorización … ningún guard filtra por `subrol`"*. La Definición de Hecho de esta historia
  ("visible solo para roles autorizados") no se puede cumplir con los dos únicos roles de login
  (`superadmin` | `admin`), porque todos los usuarios de un tenant son `admin`. La excepción se
  acota a los campos sensibles del contacto y se registra en un ADR nuevo
  (`docs/adr/0006-subrol-datos-sensibles.md`); AUTH-02 sigue vigente para todo lo demás.

- **`HU-CRM-02` estaba reservado para otra cosa.** La spec de HU-CRM-01 anota en su *Fuera de
  alcance*: "Listado y filtros de leads, página `/leads` → `HU-CRM-02`". Esa referencia queda
  obsoleta y debe corregirse a `HU-CRM-03`, para que el backlog no apunte a dos historias distintas
  con el mismo id.

  **Nota de implementación:** la rama se sacó de `origin/develop`, que **no tiene HU-CRM-01** — no
  existen ahí ni el feature `lead` ni su carpeta de spec (viven en `feat/HU-CRM-01`, sin mergear).
  HU-CRM-02 no depende funcionalmente de HU-CRM-01, así que se implementó igual; la corrección de
  esa línea habrá que hacerla al integrar aquella rama. Al mergear, los dos puntos de fricción
  serán `IContactCardResponse` (HU-CRM-01 le añade `leadId`, este feature `correo`/`documento`/
  `atributos`/`puedeVerSensibles`) y `AuditAccion`/`AuditEntidad`, que ambas ramas extienden.

## Alcance

Incluye:

- **Backend**
  - `PATCH /api/clientes/:id` — edición de la ficha del contacto por un humano. Es el primer
    endpoint de escritura manual sobre `Cliente`.
  - Feature `contact-note` completo (patrón de 6 archivos) sobre una colección propia
    `contact_notes`: `POST` y `GET /api/clientes/:clienteId/notas`.
  - Campos nuevos en `Cliente`: `correoEnc`, `documentoEnc` y `atributos[]` (atributos
    personalizados con metadato `sensible` por campo).
  - Cifrado de campo con AES-256-GCM y clave propia (`DATA_ENC_KEY`), con un marcador de versión
    que permite leer los documentos ya guardados en texto plano sin migración.
  - Enmascarado en la respuesta para quien no está autorizado, y `403` al intentar **escribir** un
    campo sensible sin permiso.
  - Registro en `AuditEvent` de `cliente.update` y `contact-note.create`, con los valores sensibles
    reemplazados por un marcador.
- **Frontend**
  - Diálogo de edición de la ficha del contacto, abierto desde `ContactPanel`, con los atributos
    personalizados editables (añadir / quitar / marcar sensible).
  - Tarjeta de notas dentro de la ficha: lista paginada con autor y fecha, más el campo para
    agregar una nota nueva.
  - Los valores sin permiso se pintan enmascarados con candado y explicación, nunca vacíos.
- **Documentación**
  - `docs/data-model.md`: campos nuevos de `clientes`, colección `contact_notes`, acciones nuevas
    de `audit_events`.
  - `docs/domain.md`: glosario (*Nota de contacto*, *Dato sensible*), entidades e invariantes.
  - `docs/api-contract.md`: los tres endpoints.
  - `docs/adr/0006-subrol-datos-sensibles.md`: la excepción a AUTH-02.

Fuera de alcance (otros features / fases):

- **Editar o borrar una nota ya creada**, y adjuntar archivos a una nota. Una nota es un asiento
  del historial: se agrega, no se reescribe.
- **Rotación de la clave de cifrado** y re-cifrado masivo del histórico. El marcador `enc:v1:`
  deja el terreno preparado (`v2` convive con `v1`), pero el proceso de rotación no se implementa.
- **Buscar o filtrar por campos cifrados.** Es imposible por diseño, no una omisión: un valor
  cifrado con IV aleatorio no es indexable ni comparable. Si algún día hace falta buscar por
  correo, exigirá un índice ciego (HMAC determinista) y su propio feature.
- **Editar `estadoComercial`** desde este endpoint: tiene su propia máquina de transiciones
  (`docs/domain.md` §3) y merece su servicio, no un parche genérico.
- **CRUD para asignar el `subrol`** a un usuario. Sigue siendo lo que AUTH-02 dejó pendiente: hoy
  el `subrol` solo se siembra en base de datos.
- Página `/contactos` o listado de contactos fuera de la bandeja.

## Criterios de aceptación

1. `PATCH /api/clientes/:id` edita, en el tenant del token, los campos `nombre`, `correo`,
   `documento`, `nivelInteres`, `objecionPrincipal`, `rolContacto` y `atributos`, y responde `200`
   con la ficha actualizada (`IContactCardResponse`). La semántica de parche es explícita: un campo
   **ausente** no se toca; un campo enviado como **`null`** se borra. Sin esa distinción no habría
   forma de vaciar un correo mal escrito.
2. El endpoint **rechaza** con `400` cualquier intento de tocar `telefono`, `metaUserId`,
   `estadoComercial`, `tagIds`, `asesorId`, `tenantId` o `customFields`. El schema Zod es
   `.strict()`: la clave desconocida falla **en el borde**, antes del controller, y no se ignora en
   silencio. Cada uno de esos campos tiene dueño en otro sitio —la identidad de WhatsApp, la
   máquina de estados, HU-OMNI-04, HU-OMNI-02— y dejar que este parche los pise sería abrir una
   puerta trasera a esas reglas.
3. `POST /api/clientes/:clienteId/notas` crea una nota con `texto` (1–2000) → `201`, guardando
   `autorId` **del token** y la fecha. `GET /api/clientes/:clienteId/notas` las devuelve paginadas
   (`?page&limit`, formato de `docs/api-contract.md` §5), **más reciente primero**, con el autor ya
   resuelto a `{ id, nombre }` — la tarjeta muestra "Ana Gómez", no un `ObjectId`. La hidratación
   del autor es **en lote** (`findUsersByIds`, el mismo patrón de HU-OMNI-02 y HU-CRM-01): una
   consulta por página, no una por nota.
4. **Cifrado en reposo.** `correo`, `documento`, el `texto` de cada nota y el `valor` de todo
   atributo marcado `sensible` se persisten cifrados con AES-256-GCM bajo una clave propia
   (`DATA_ENC_KEY`, distinta de la de los tokens de Meta para que rotar una no obligue a rotar la
   otra). Es verificable leyendo las colecciones en crudo: **ningún documento contiene el texto
   claro**. Los valores llevan el prefijo de versión `enc:v1:`, que es lo que permite distinguir un
   dato cifrado de uno legado en plano y leer ambos sin migración.
5. **Gate por subrol en lectura.** Solo un `admin` con `subrol` `director` o `manager` —**o sin
   `subrol`**, por retrocompatibilidad: los usuarios que existen hoy no tienen ninguno y no pueden
   perder acceso de golpe— recibe los valores sensibles en claro. Para `coordinator` y `secretary`
   la respuesta trae `correo` y `documento` enmascarados (`d••••@dominio.com`, `••••1234`) y los
   atributos sensibles con el valor sustituido. La respuesta incluye `puedeVerSensibles: boolean`
   para que la UI sepa qué está mirando sin tener que deducirlo.
6. **Gate por subrol en escritura, por campo y no por endpoint.** Un `coordinator` que envía
   `correo`, `documento` o un atributo `sensible` recibe `403` y **no se escribe nada** —ni siquiera
   los campos no sensibles del mismo body, para que el parche sea todo-o-nada. Pero ese mismo
   `coordinator` **sí** puede editar `nombre`, `nivelInteres`, `objecionPrincipal`, `rolContacto` y
   atributos no sensibles: cerrar el endpoint entero le quitaría trabajo legítimo.
7. **Las notas son sensibles enteras.** `coordinator` y `secretary` reciben `403` tanto al leerlas
   como al crearlas; el gate va a nivel de ruta (`authorizeSubrol`), no de campo. Es una
   consecuencia de producto asumida a conciencia: una nota de seguimiento es texto libre donde
   acaba cualquier cosa (condiciones de pago, datos de un tercero, un motivo personal), y no hay
   forma de enmascarar selectivamente prosa.
8. **La auditoría no filtra lo que el cifrado protege.** El `AuditEvent` de `cliente.update` guarda
   en `antes`/`despues` el valor real de los campos **no** sensibles, y para los sensibles solo el
   **nombre del campo** con el marcador `'[cifrado]'`. Guardar el antes/después en claro dejaría
   una copia legible de todo lo cifrado en una colección sin control de acceso por subrol — el
   agujero exacto que este feature viene a cerrar. `contact-note.create` registra el id de la nota y
   el `clienteId`, nunca su texto.
9. **`datosExtraidos.correo` deja de estar en claro.** El correo que la IA extrae (HU-OMNI-03) se
   persiste cifrado con el mismo helper y se enmascara con la misma regla que el correo manual.
   Cerrar este hueco es parte del criterio 4, no un extra: tener el mismo dato personal en texto
   plano al lado de su gemelo cifrado haría decorativo el cifrado. La lectura es
   retrocompatible —un valor sin el prefijo `enc:v1:` se devuelve tal cual—, así que las
   extracciones ya guardadas siguen funcionando sin script de migración.
10. **UI:** la ficha del contacto (`ContactPanel`) ofrece "Editar datos", que abre un diálogo con
    todos los campos editables y un editor de atributos personalizados (añadir, quitar, renombrar,
    marcar como sensible). Resuelto en **claro y oscuro** con los tokens semánticos, con estados de
    carga, error, deshabilitado y foco visible, y con el botón de guardar inhabilitado mientras no
    haya cambios válidos.
11. **UI:** un usuario sin permiso ve el valor **enmascarado con un candado y un tooltip que
    explica por qué**, y los campos sensibles del diálogo aparecen deshabilitados con la misma
    explicación. Nunca ve un campo vacío que parezca un dato que falta: la diferencia entre "no hay
    correo" y "no puedes ver el correo" tiene que ser evidente, o el asesor volverá a pedir un dato
    que ya está registrado.
12. **UI:** la tarjeta de notas muestra autor y fecha relativa por nota, un estado vacío que invita
    a escribir la primera, y el campo de escritura se limpia solo tras guardar. Para quien no tiene
    permiso, la tarjeta no aparece en absoluto (no un error de carga: el `403` se distingue del
    fallo real).
13. **Aislamiento multi-tenant:** un `Cliente` del tenant A no se parchea desde el tenant B
    (`404`, y el documento queda intacto); una nota del tenant A no se lee **ni se crea** desde el
    tenant B; un `clienteId` del tenant A usado desde el B para crear una nota falla **sin
    escribir**. Como en HU-CRM-01, un id ajeno y uno inexistente son **indistinguibles a
    propósito**: nunca se responde `403` por pertenencia a otro tenant, porque eso confirmaría la
    existencia del recurso ajeno. **Test de aislamiento en verde** para los cuatro casos.
14. `pnpm --filter @sofiapp/api typecheck` y `pnpm --filter @sofiapp/api test` en verde;
    `pnpm --filter @sofiapp/web build`, `lint` y `test` sin errores.

## Nota sobre `atributos[]` vs `customFields` (decisión de datos)

`Cliente` ya tiene `customFields: Record<string, unknown>`, pensado en INF-02 para los datos
verticales del tenant. **No se reutiliza**, y la razón es estructural: un `Record<string, unknown>`
plano no puede llevar el metadato `sensible` por campo sin anidar objetos, y anidarlos rompe su
propio tipo declarado. `atributos: IAtributoPersonalizado[]` lo lleva de fábrica y además conserva
el **orden** en que el asesor los creó, que un objeto no garantiza.

`customFields` **no se elimina ni se migra**: hoy vale `{}` en el 100% de los documentos (verificado
en modelo, seeds y fixtures), así que no hay dato que mover. Queda documentado en `data-model.md`
como superado por `atributos`; retirarlo del schema es una limpieza aparte, no de este feature.

## Nota sobre el alcance del cifrado (qué NO promete)

El cifrado es **a nivel de campo, en la aplicación**: protege el contenido de un volcado de la base
de datos, de un backup extraviado o de un acceso directo a Atlas. **No** protege contra un atacante
con acceso al proceso Node (tendría la clave en memoria) ni sustituye al control de acceso, que es
lo que hacen los criterios 5, 6 y 7. Son dos capas distintas y ambas hacen falta: el cifrado
responde "¿qué pasa si alguien se lleva la colección?" y el gate por subrol responde "¿quién puede
mirarlo desde dentro?".

## Dependencias

- `INF-02` — repositorio tenant-safe (`*Scoped`) y `requireTenant`; toda escritura nueva pasa por
  ahí sin excepción.
- `AUTH-01` / `AUTH-02` — `tenantId`, `rol` y `subrol` viajando en el JWT. De AUTH-02 sale el tipo
  `AdminSubrol` sobre el que se construye el gate, y su criterio 4 es el que este feature acota.
- `HU-OMNI-01` — bandeja y features `conversation` / `cliente` / `message`; de ahí sale el
  `clienteId` y la pantalla donde se monta todo.
- `HU-OMNI-02` — `AuditEvent` y el patrón de hidratación en lote (`findUsersByIds`), reutilizados
  tal cual para el autor de la nota.
- `HU-OMNI-03` — ficha del contacto (`ContactPanel`, `ContactCard`) que este feature vuelve
  editable, y `datosExtraidos` cuyo `correo` pasa a cifrarse.
- `HT-WA-01` — `utils/crypto.util.ts` (AES-256-GCM ya en producción para el token de Meta), del que
  se extraen las primitivas que reutiliza el cifrado de campo.
- `DSN-03` — UI kit shadcn: `dialog`, `input`, `label`, `textarea`, `select`, `switch`, `button`,
  `badge`, `tooltip`, `skeleton`, `separator`. Ninguno hace falta instalar.
