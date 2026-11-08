# ADR 0015 — Catálogo de campos del contacto y validación de flujos en tres niveles

**Estado:** aceptado · **Fecha:** 2026-11-07 · **Contexto:** HU-FLOW-05 (captura estructurada y editor de flujos)

## Contexto

Lo que un cliente respondía en un flujo se quedaba solo en `FlowState.variables`; ningún código lo
llevaba a la ficha. Y los atributos personalizados de la ficha (`Cliente.atributos`) tenían una `key`
que era un slug del texto que tecleaba cada asesor en cada contacto: «Colegio» en uno e
«Institución» en otro eran dos atributos distintos, así que ni los flujos ni la segmentación de
campañas (`filtros.atributos[].key`) podían juntarlos.

Además, el editor de flujos rechazaba con `400` cualquier grafo con nodos sueltos o a medias, también
en borrador: quien perdía la conexión a mitad de trabajo no podía guardar lo avanzado.

## Decisión

1. **Catálogo por empresa de campos personalizados** (`contact_fields`): clave, etiqueta, tipo,
   sensible, orden, activo. Lo comparten la ficha y el nodo `captura`. La clave se deriva del nombre
   al crear y **no cambia** al renombrar; borrar **archiva**. `Cliente.atributos[].key` debe existir
   en el catálogo; etiqueta y `sensible` salen de él. Las claves de los campos fijos del contacto son
   reservadas.
2. **`captura` decide dónde guarda**: variable del flujo (como antes), campo fijo del contacto
   (`nombre`, `correo`, `documento`, `rolContacto`) o campo personalizado. Con destino de ficha el
   servicio fija `campo` y `tipoDato`, de modo que una condición siempre lee `var:nombre`.
   `saltarSiExiste` y `sobrescribir` son configurables por nodo.
3. **El motor sigue siendo puro.** La ficha entra como una foto (`EntradaMotor.contacto`) leída una
   vez por mensaje, y la escritura sale como un efecto (`guardar_dato`) que ejecuta el runtime como
   actor «sistema», con auditoría enmascarada. No pasa por `updateCliente`: este reemplaza el arreglo
   de atributos y exige el permiso de un humano; el flujo **fusiona por `key`**.
4. **Validación del grafo en tres niveles.** *Forma* (bloquea guardar), *conexión* y *contenido*
   (advertencias que se guardan, pero **impiden activar**). Un flujo con advertencias nunca queda
   activo. Editar un flujo ya activo dejándolo con errores exige confirmación explícita
   (`409 FLOW_ACTIVO_CON_ERRORES` → modal → `confirmarDesactivar`): se guarda **inactivo** y la
   empresa vuelve a ser atendida por Sofi hasta corregirlo.
5. **Una sola fuente de reglas**: `analizarGrafo` en `@sofiapp/shared`, usada por el backend (guardar
   y activar) y por el editor (rojo/verde en vivo). Un test fija que su veredicto de contenido
   coincide con el esquema estricto de Zod, que queda como red de seguridad al activar.
6. **Corrección del motor** descubierta en la auditoría: `correrMotor` solo ejecutaba los efectos de
   la última ronda, así que lo emitido antes de un nodo que consulta a la IA (`kb → ia`,
   `accion → ia`) se perdía. Ahora acumula los de todas las rondas.

## Alternativas

- **Dos copias de `analizarGrafo`** (una por app) con un test de paridad: descartada, se desfasan.
- **Seguir con claves libres** y normalizarlas al leer: no resuelve que cada empresa tenga un
  vocabulario propio ni da dónde marcar `sensible` una sola vez.
- **Rechazar el guardado con errores** (el comportamiento anterior): descartada; perder el trabajo
  por un corte de red es peor que guardar un borrador que no se puede activar.
- **Desactivar en silencio** al guardar un flujo activo con errores: descartada; apagar la atención
  automática de una empresa nunca debe ocurrir sin que alguien lo confirme.

## Consecuencias

- `@sofiapp/shared` pasa a ser una dependencia de **ejecución** del backend y del frontend (antes
  solo tipos): hay que compilarla (`pnpm --filter @sofiapp/shared build`) antes de `typecheck`,
  tests y despliegue. `turbo` ya lo hace con `dependsOn: ["^build"]`.
- `PATCH /api/clientes/:id` rechaza atributos fuera del catálogo; los heredados se registran solos
  (backfill al arrancar y al editar la ficha).
- Los flujos guardados siguen cargando igual: `destino` ausente = `variable`, `nombre` es opcional.
- El editor conserva un borrador local (`localStorage`) como red de seguridad ante cortes de red;
  nunca se activa ni se envía solo.
