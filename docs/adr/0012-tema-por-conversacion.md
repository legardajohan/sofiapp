# ADR 0012 — El tema de cada conversación lo clasifica la IA contra los productos de la KB

**Estado:** aceptado · **Fecha:** 2026-10-09 · **Contexto:** HU-REP-03 (productos más consultados)

## Contexto

HU-REP-03 pide un ranking de los productos que más consultan los clientes. Ese dato no existía:
ninguna entidad guardaba de qué producto habla una conversación. `datosExtraidos.interes`
(HU-IA-06) es texto libre en palabras del cliente ("el sabatino", "curso pre-icfes de los sábados"),
así que agrupar por él partiría un mismo producto en decenas de filas. El catálogo propio
(`CatalogItem`, M08) no está construido.

Lo que sí existe en todos los tenants es la tarjeta obligatoria «Productos y servicios» de la base de
conocimiento (HU-KB-09): un `repetible` de hasta 12 filas `{ nombre, descripcion }`.

## Decisión

1. **Granularidad: la conversación**, no el mensaje. Una llamada por conversación tiene el contexto
   completo y cuesta un orden de magnitud menos que clasificar cada "sí" o "gracias". El ranking
   cuenta conversaciones, igual que HU-REP-01/02.
2. **Vocabulario cerrado desde la KB.** La IA elige un producto de la tarjeta «Productos y
   servicios» del tenant o `otros`. Gemini lo garantiza con un `enum` dinámico en el
   `responseSchema`, y el servicio lo vuelve a comprobar. La identidad del producto es su **nombre
   normalizado** (minúsculas, sin acentos ni espacios repetidos), porque las filas no tienen id.
3. **Acoplamiento documentado con la estructura de la KB.** El backend guardaba `estructura` sin
   interpretarla (HU-KB-07). Desde aquí la lee en **un único punto**,
   `features/kb/kb-productos.reader.ts`, apoyado en ids que HU-KB-09 congeló (`productos`,
   `catalogo`, `nombre`, `descripcion`). Un test fija ese contrato, y el lector nunca lanza: una
   forma inesperada es una lista vacía.
4. **Persistencia en `Cliente.temaIA`**, sin colección nueva. Los cambios de tema se auditan como
   `cliente.tema` (actor `null`), solo cuando la clave cambia.
5. **Freno de coste.** El clasificador corre al final del auto-reply y en un backfill, ambos por el
   mismo guard: no llama al modelo con `TEMA_AUTO=off`, sin productos en la KB, en demo o con menos
   de `TEMA_MIN_TURNOS_CLIENTE` mensajes del cliente; con un tema vigente, solo reclasifica tras
   `TEMA_RECLASIFICAR_CADA` mensajes nuevos (`TEMA_RECLASIFICAR_ESTABLE` si salió igual dos veces
   seguidas) o si cambió la lista de productos. Bajo `TEMA_MIN_CONFIANZA`, el tema es `otros`.
6. **Atribución al tema actual.** El reporte agrupa las consultas del periodo por el tema que el
   hilo tiene **hoy**, igual que HU-REP-01 atribuye al asesor actual.

## Alternativas

- **Clasificar por mensaje:** más preciso en hilos que cambian de producto, pero multiplica el coste
  y mete ruido de mensajes sin contenido.
- **Texto libre (`datosExtraidos.interes`) agrupado con embeddings:** sin vocabulario que la empresa
  reconozca; los nombres de los grupos serían inventados.
- **Construir antes `CatalogItem` (M08):** catálogo con id estable, pero obligaría a la empresa a
  cargar sus productos dos veces y retrasa la historia. Queda como evolución natural: cuando exista,
  el clasificador puede cambiar de fuente sin tocar el reporte.

## Consecuencias

- Renombrar un producto en la KB deja lo ya clasificado bajo el nombre anterior; el reporte lo
  muestra con `enCatalogo: false` hasta que la reclasificación lo alcance (la versión de la lista
  cambia y la siguiente ráfaga reclasifica).
- Sin la tarjeta llena no hay vocabulario: nada se clasifica y el dashboard lo dice.
- Las conversaciones que la IA no atiende solo se clasifican con el backfill
  (`pnpm --filter @sofiapp/api backfill:temas`). Hasta entonces cuentan como `sinClasificar`.
- Coste esperado: 1–2 llamadas de ~1.000 tokens por conversación. `TEMA_AUTO=off` lo apaga sin
  desplegar.
- La plantilla `topic` es un método nuevo: la inserta el seed de arranque. Cuando cambie su versión
  hará falta un `migrate-topic-template.ts`, como con `classify` y `extract`.
