# ADR 0006 — El `subrol` gobierna el acceso a los datos sensibles del contacto

**Estado:** aceptado · **Fecha:** 2026-07-31 · **Contexto:** HU-CRM-02 (registrar información
relevante del cliente)

## Contexto

HU-CRM-02 exige que la información personal del contacto —correo, documento, notas y los atributos
marcados como sensibles— sea **"visible solo para roles autorizados"**.

El sistema tiene exactamente **dos roles de login**: `superadmin` y `admin` (AUTH-02). El
`superadmin` no toca datos de tenant por diseño, así que **todos** los usuarios que ven la bandeja
de una empresa son `admin`. Con ese mapa de roles, "solo para roles autorizados" no significa nada:
o lo ven todos, o no lo ve nadie.

La única dimensión disponible para distinguirlos es el `subrol` opcional (`director` | `manager` |
`coordinator` | `secretary`), que AUTH-02 introdujo explícitamente como **metadata sin efecto en
permisos**. Su criterio 4 dice, literal: *"Los subroles no cambian la autorización: `authorize`,
`RequireRole` y los middlewares conservan su lógica; ningún guard filtra por `subrol`."*

Es decir: cumplir la Definición de Hecho de HU-CRM-02 obliga a contradecir a AUTH-02, o a dejar el
requisito sin implementar.

## Decisión

**El `subrol` pasa a gobernar la autorización, exclusivamente sobre los datos sensibles del
contacto.** AUTH-02 sigue vigente para todo lo demás.

1. `SUBROLES_DATOS_SENSIBLES = ['director', 'manager']` en
   `middlewares/authorize-subrol.middleware.ts`, junto a `puedeVerDatosSensibles(user)` y al
   middleware de ruta `authorizeSubrol(subroles)`.
2. **Un `admin` sin `subrol` conserva acceso total.** Hoy ningún usuario tiene `subrol` asignado —
   AUTH-02 dejó fuera de alcance el CRUD para asignarlo — así que exigirlo dejaría a todos los
   tenants fuera de sus propios datos el día del despliegue.
3. El gate se aplica **con dos granularidades distintas**, según lo que sea sensible:
   - **Por campo, en el service** (`PATCH /api/clientes/:id`): un `coordinator` recibe `403` si
     manda `correo`, `documento` o un atributo sensible, pero **sí** puede editar `nombre`,
     `nivelInteres`, `objecionPrincipal`, `rolContacto` y los atributos no sensibles. Cerrar el
     endpoint entero le quitaría trabajo legítimo. El rechazo es **todo-o-nada**: no se guarda ni
     la parte permitida del mismo body.
   - **Por ruta** (`POST`/`GET /api/clientes/:id/notas`): la nota es sensible **entera**. Es prosa
     libre donde acaba cualquier cosa y no hay forma de enmascararla selectivamente.
4. En lectura, quien no está autorizado recibe el valor **enmascarado**, nunca vacío
   (`d••••@dominio.com`, `••••1234`, `••••••`), más el flag `puedeVerSensibles` en la respuesta. La
   diferencia entre "no hay correo" y "no puedes ver el correo" tiene que ser visible, o el asesor
   volverá a pedirle al cliente un dato que ya está registrado.
5. El control de acceso es **independiente** del cifrado en reposo (`DATA_ENC_KEY`): el cifrado
   responde "¿qué pasa si alguien se lleva la colección?" y el gate responde "¿quién puede mirarlo
   desde dentro?". El cifrado se desactivó después (ver Consecuencias); este gate no se enteró, y
   ahí está la gracia de que fueran mecanismos separados.

## Alternativas consideradas

- **Dejar el gate en `authorize(['admin'])`** (todos los admin ven todo). Respeta AUTH-02 sin
  tocar nada, pero incumple la Definición de Hecho de la historia: no habría ningún "rol
  autorizado" que distinguir. Descartada.
- **Crear roles de login nuevos** (`asesor`, `coordinador`…). Es exactamente lo que AUTH-02 acababa
  de eliminar; revertirlo por un feature obligaría a rehacer guards, nav, tokens y tests de toda la
  app. Descartada por desproporcionada.
- **Un permiso granular por usuario** (`permisos: ['contacto.sensibles']`). Más flexible y
  probablemente el destino a largo plazo, pero introduce un motor de permisos entero —modelo, CRUD,
  UI, migración— para resolver un caso. Descartada por ahora; esta ADR no la cierra.

## Consecuencias

- **AUTH-02 queda parcialmente superado**: su criterio 4 ya no es cierto de forma absoluta. Sigue
  siéndolo fuera de los datos sensibles del contacto — ningún otro guard, ruta o ítem de navegación
  filtra por `subrol`.
- **Asignar subroles sigue sin tener UI.** En la práctica el gate solo se activa cuando alguien
  siembra un `subrol` a mano en base de datos. Mientras tanto todos los `admin` se comportan como
  hasta ahora, lo que hace el despliegue no disruptivo — y también significa que el requisito solo
  se cumple del todo cuando exista ese CRUD (pendiente desde AUTH-02).
- **`coordinator` y `secretary` no pueden leer ni escribir notas.** Es una pérdida real de
  funcionalidad para esos perfiles, asumida a conciencia y registrada como criterio explícito en la
  spec para que sea revisable.
- La UI duplica el helper (`src/lib/roles.ts`) para **ocultar** lo que el backend **decide**. La
  duplicación es deliberada: si divergen, manda el servidor y lo peor que pasa es que la UI ofrezca
  una acción que devuelve `403`.
- **El cifrado en reposo quedó desactivado (2026-08-03).** `DATA_ENC_KEY` es opcional y sin ella
  cualquier guardado de un dato sensible respondía `500`, así que los campos pasaron a persistirse
  en claro (`utils/field-crypto.util`, nota en `docs/data-model.md`). **Este gate no cambia**: era
  el mecanismo independiente y sigue siendo el único que decide quién ve el dato. Lo que se pierde
  es la defensa ante un volcado de la base o un backup extraviado; reactivarlo es un cambio de un
  solo archivo y el camino de lectura ya entiende los valores `enc:v1:` heredados.

## Enmienda (HU-IA-04, 2026-08-25)

El **resumen por IA de la conversación** (`Cliente.resumenIA`) se suma al conjunto que gobierna el
`subrol`. La decisión de esta ADR no cambia: se amplía dentro del mismo dominio —los datos
personales del contacto— y con el mismo argumento.

**Motivo.** El resumen lo escribe el modelo sobre el transcript **completo**, así que puede citar en
claro el correo o el documento que `toContactCard` enmascara dos tarjetas más arriba. Un
`coordinator` veía `d••••@empresa.com` en la ficha y podía leer *"el cliente dejó su correo
diego@empresa.com"* en el resumen de al lado. Es exactamente la forma de dato que §3 ya cerró para
las notas —*"prosa libre donde acaba cualquier cosa y no hay forma de enmascararla
selectivamente"*—, aplicada a un texto que además nadie escribió a mano.

**Granularidad**, siguiendo el criterio de §3:

- **Por campo, en el service.** `toResumenResponse(c, puedeVerSensibles = false)` devuelve `null` sin
  permiso, y tanto `GET /clientes/:id/history` como `GET /conversations/:id/overview` se lo pasan. El
  gate vive en el mapper y no en cada ruta a propósito: cerrar solo la ruta nueva habría dejado
  abierta la vieja.
- **Por ruta, en la generación.** `POST /conversations/:id/summary` gana
  `authorizeSubrol(SUBROLES_DATOS_SENSIBLES)`: no hay respuesta parcial que devolver, y cada llamada
  paga entre 7 y 26 s de modelo. Quien no puede leer el resumen tampoco puede pagarlo.

**Lo que NO se cierra.** `GET /conversations/:id/overview` sigue abierto a cualquier `admin`. La
vista de la conversación contiene también la cabecera y las etiquetas, que sí corresponden a
`coordinator` y `secretary`; cerrar la ruta entera les quitaría su trabajo diario, que es la misma
pérdida que esta ADR ya lamentó con las notas. El resumen sale `null` y el bloque `permisos` de la
respuesta explica por qué, para que la UI muestre el motivo en vez de un hueco (§4).

**Lo que sigue igual.** Un `admin` sin `subrol` conserva acceso total (§2), y el CRUD para asignar
subroles sigue pendiente desde AUTH-02: en producción este gate no se activa hasta que exista. Los
tests lo siembran a mano.

**Alcance no ampliado.** Las acciones operativas de la bandeja —responder, etiquetar, el toggle de
Sofi, reasignar, convertir en lead— **no** pasan a depender del `subrol`. Se consideró y se descartó
por el mismo motivo del párrafo anterior.
