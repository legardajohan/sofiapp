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
5. El control de acceso **convive con** el cifrado en reposo (`DATA_ENC_KEY`), no lo sustituye: el
   cifrado responde "¿qué pasa si alguien se lleva la colección?" y el gate responde "¿quién puede
   mirarlo desde dentro?".

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
