# HU-REP-05-V2 — Resumen único en la bandeja, límites de la KB y filtro por fechas en "Fuentes y contexto" (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`;
> la ejecución en `tasks.md`. Tres ajustes independientes que van en la **misma rama
> `feat/HU-REP-05`** por decisión del usuario: no se crea rama nueva. La spec de HU-REP-05 (dashboards)
> no se toca.

**Estado:** implementado

## Historia

> Como **administrador del tenant** quiero:
> 1. ver el resumen de la conversación en un solo sitio, la ficha del contacto;
> 2. escribir más en los formularios de la base de conocimiento;
> 3. acotar por fechas la auditoría de respuestas de la IA.

## Objetivo

1. **Bandeja omnicanal.** Quitar la franja de resumen que hay sobre el hilo, con su botón "Generar
   resumen". El resumen queda únicamente en la tarjeta del panel "Ficha del contacto". Esto revierte
   la decisión de HU-IA-04 de subir el resumen al hilo: el usuario lo ve duplicado.
2. **Base de conocimiento, "Documentos" y "Preguntas frecuentes".** Ampliar los topes de caracteres
   según la regla del pedido (ver D2), de forma coherente en frontend y backend.
3. **Base de conocimiento, "Fuentes y contexto".** Añadir un filtro por rango de fechas, opcional en
   ambos extremos, sobre la fecha de creación de cada respuesta. El filtro se aplica en el servidor y
   se combina con el filtro por método y con la paginación.

**Definition of Done:**
- La bandeja muestra el resumen una sola vez.
- Cada campo de la tabla D2 acepta su nuevo tope en el formulario y en el API.
- En "Fuentes y contexto", filtrar del 1 al 3 de un mes devuelve exactamente las respuestas creadas
  entre las 00:00 del día 1 y las 23:59:59.999 del día 3 **en la hora del visor**.

## Alcance

**Incluye:**
- **Parte 1, solo frontend:**
  - borrar `ConversationSummaryStrip` y su test;
  - limpiar en `InboxPage` y en `useInboxStore` lo que solo usaba esa franja;
  - quitar la invalidación de `conversation-overview` en `useGenerateSummary`.
- **Parte 2, frontend y backend:**
  - topes por tipo de campo y por campo en los schemas del modal guiado;
  - título del documento;
  - tope global de contenido y de `estructura` (D3);
  - pregunta de FAQ y probador de FAQ;
  - tests de presupuesto y docs (`data-model.md`, `api-contract.md`).
- **Parte 3, frontend y backend:**
  - parámetros `desde`/`hasta` en `GET /api/ai/responses`;
  - componente `DateRangeFilter` compartido;
  - estado del filtro en `AiContextPage`;
  - tests de rutas, servicio y aislamiento;
  - docs (`api-contract.md`).

**Fuera de alcance:**
- **El backend del overview de la conversación** (`GET /api/conversations/:id/overview`): sigue
  devolviendo `resumen` y `permisos.verResumen/generarResumen`. Es un contrato documentado (D1) y el
  móvil (Fase 4) puede usarlo. Tampoco se toca el endpoint de generar resumen.
- **Topes que no entran en la regla:**
  - `texto-largo` (1.500), `otras_politicas` (800) y la respuesta de FAQ (2.000);
  - los `HH:mm` del horario (5): son una hora, no texto libre;
  - el número de ítems de listas y repetibles (`maxItems`), y los tramos por día (`MAX_INTERVALOS`).
- **Migraciones:** Mongo no fija la longitud de los `String`. Ningún modelo de Mongoose declara
  `maxlength` en estos campos, y los datos ya guardados son más cortos que los topes nuevos.
- **`PeriodFilter` de los reportes:** no se refactoriza para usar `DateRangeFilter`. Queda como
  posible limpieza posterior.
- **Permisos y roles:** sin cambios. "Fuentes y contexto" sigue siendo solo `admin`.

## Decisiones

### D1 — Parte 1: se quita la franja, se conserva toda la lógica compartida
- **Se borra** solo lo que únicamente servía a la franja:
  - el componente `ConversationSummaryStrip` y su esqueleto, con su test;
  - el estado `resumenExpandido`/`toggleResumen` de `useInboxStore`;
  - en `InboxPage`, `useGenerateSummary` y el bloque JSX.
- **Se conserva** lo que comparte la ficha:
  - `useGenerateSummary`, que usa `ContactPanel`;
  - `generateSummary` en `api.ts`;
  - `ContactSummaryCard`;
  - el endpoint.
- **También se conserva `useConversationOverview`:** de él sale `semaforoIA`, que pinta
  `IntentStrip`.
- **`useGenerateSummary` deja de invalidar `conversation-overview`.** Esa invalidación existía para
  refrescar la franja, y ya nada en la UI lee `overview.resumen`. Quitarla ahorra una petición por
  cada resumen generado.
- **Los tipos `ConversationOverviewDTO.resumen` y `PermisosConversacionDTO`** siguen espejando el
  contrato del backend, que no cambia. No son código muerto, son el contrato.
- **Layout:** la columna central es un flex vertical (etiquetas → `IntentStrip` → hilo → banner →
  composer). Quitar una franja no deja hueco, porque el hilo es el elemento `flex-1`. Se verifica
  visualmente con conversación con y sin etiquetas y con y sin `semaforoIA`.

### D2 — Parte 2: tabla de topes (regla: 300 → 700, 600 → 900, < 300 → ×2, resto igual)
El tope de un campo es su `maxLength` propio o, si no lo tiene, el de su tipo en `LIMITE_POR_KIND`.
Subir el tipo sube todos los campos que lo heredan.

**Topes por tipo** (`LIMITE_POR_KIND`):

| Tipo | Campos que lo heredan | Antes | Nuevo |
|---|---|---|---|
| `texto-corto` | Nombre comercial, Razón social, Nombre del grupo | 120 | **240** |
| `texto-medio` | Misión, Visión, ¿A quién le sirve?, Cómo se cotiza, Promociones o descuentos, Tiempos de entrega, Cómo llegar, Días especiales | 300 | **700** |
| `lista` (por ítem) | Valores, Zonas donde atiende, Qué lo hace distinto, Certificaciones o afiliaciones | 120 | **240** |
| `triestado` (detalle) | ¿Hace parte de un grupo…?, ¿Aceptan devoluciones?, ¿Hacen cambios?, ¿Ofrecen garantía?, ¿Se atiende con reserva…?, ¿Admiten mascotas?, ¿Hay consumo o pedido mínimo? | 300 | **700** |
| `repetible` (valor por defecto de la columna) | ninguno hoy: todas las columnas fijan el suyo | 120 | **240** |
| `texto-largo` | ¿A qué se dedica?, Términos y condiciones, Información adicional | 1.500 | 1.500 (sin cambio) |
| `horario` | `HH:mm` | 5 | 5 (sin cambio, no es texto) |

**Topes propios de cada campo:**

| Formulario | Campo | Antes | Nuevo |
|---|---|---|---|
| Documentos (todos) | Título del documento | 200 | **400** |
| Empresa | Año de fundación | 30 | **60** |
| Productos | ¿Qué vende o qué servicios presta? | 600 | **900** |
| Productos | Catálogo → Nombre | 60 | **120** |
| Productos | Catálogo → Qué es o qué incluye | 120 | **240** |
| Productos | Formas de pago (por ítem) | 60 | **120** |
| Productos | Cómo se entrega (por ítem) | 60 | **120** |
| Horarios | Dirección | 200 | **400** |
| Horarios | Otras sedes → Nombre de la sede | 60 | **120** |
| Horarios | Otras sedes → Dirección | 120 | **240** |
| Horarios | Otras sedes → Teléfono | 40 | **80** |
| Horarios | WhatsApp | 60 | **120** |
| Horarios | Teléfono | 60 | **120** |
| Horarios | Correo electrónico | 80 | **160** |
| Horarios | Redes sociales (por ítem) | 80 | **160** |
| Horarios | Descripción de cada tramo horario | 80 | **160** |
| Políticas | Otras políticas | 800 | 800 (sin cambio) |
| Preguntas frecuentes | Pregunta (formulario y probador) | 300 | **700** |
| Preguntas frecuentes | Respuesta | 2.000 | 2.000 (sin cambio) |

- **Teléfonos y correos:** la regla se aplica tal cual, aunque un teléfono de 120 caracteres sea
  holgura de sobra. No cambia ninguna validación de formato.
- **El detalle del triestado** hoy toma su tope del valor por defecto de `PolicyTriState` (300), que
  coincide con el tipo por casualidad. Pasa a recibir `detalleMaxLength={limiteDeCampo(campo)}`,
  para que el tipo sea la única fuente del tope.
- **Contadores:** `FieldCounter` lee el `maxLength` que recibe, así que los contadores existentes
  reflejan los topes nuevos sin más cambios. El aviso ámbar sigue en el 90 %.

### D3 — Tope global por documento: 10.000 → 15.000 (decisión del usuario)
- **El problema:** el invariante de HU-KB-07/08–11 es que "con todo al tope, el texto serializado
  cabe en `CONTENIDO_MAX`". Con los topes de D2 deja de cumplirse. Peor caso medido con el
  serializador real:

  | Formulario | Hoy | Con D2 |
  |---|---|---|
  | Empresa | 8.627 | 14.217 |
  | Productos | 6.610 | 11.110 |
  | Horarios | 7.521 | 12.761 |
  | Políticas | 5.908 | 8.308 |

- **Se sube `CONTENIDO_MAX` a 15.000**, en frontend y backend:
  - en create y update;
  - también en el textarea del modo texto libre;
  - mensaje `'El contenido no puede superar los 15,000 caracteres.'`.
- **`ESTRUCTURA_MAX_BYTES` sube de 40.000 a 60.000**, para mantener la proporción de ~4× sobre el
  tope de texto.
- **Coste:** un documento al tope produce ~18 fragmentos en vez de ~12 (`KB_CHUNK_SIZE`=1000,
  paso 850). `KB_RETRIEVAL_K` no cambia. Sin migración.

### D4 — Parte 3: filtro por instantes calculados en el navegador
- **Campo:** `createdAt` de `AiUsageLog`. El modelo **solo tiene `createdAt`**
  (`timestamps: { updatedAt: false }`), así que no hay ambigüedad con una fecha de actualización.
  Ya existe el índice `{ tenantId: 1, createdAt: -1 }`, que sirve al filtro y al orden.
- **Contrato:** `GET /api/ai/responses?desde=<ISO>&hasta=<ISO>`. Ambos son **instantes**
  ISO 8601 y ambos son opcionales:
  - `desde` es inclusivo (`$gte`);
  - `hasta` es **exclusivo** (`$lt`);
  - si vienen los dos, `hasta > desde`; si no, `400`.
- **Zona horaria:** el navegador convierte los días elegidos en instantes con su propia zona:
  - "desde 2026-10-01" → `new Date(2026, 9, 1)`, la medianoche local;
  - "hasta 2026-10-03" → `new Date(2026, 9, 4)`, la medianoche local del **día siguiente**.

  Así "hasta" incluye el día completo, también en días con cambio de horario. El backend no hace
  aritmética de zonas.
- **Por qué no `YYYY-MM-DD` + `?tz=` como HU-REP-04:** allí el backend tiene que **agrupar por día
  local**, y por eso necesita la zona. Aquí solo hay que cortar una lista por dos instantes, y
  mandar los instantes deja la consulta como un rango simple sobre el índice, sin `$expr`.
- **Validación en la UI:**
  - Se puede usar solo "desde" o solo "hasta".
  - Si "desde" es posterior a "hasta", se muestra el error en línea (`role="alert"`) y el rango
    **no se envía** hasta que se corrija. Mientras tanto se listan todas las respuestas, con ese
    aviso, como hace `PeriodFilter`.
  - Los inputs llevan `min`/`max` cruzados y `max = hoy`.
- **Paginación:** cualquier cambio de fecha, incluido limpiar, vuelve a la página 1, igual que hoy
  al cambiar el método.
- **Retención:** los registros tienen TTL de 90 días. Un rango anterior a esa fecha devuelve vacío,
  y la UI dice "Ninguna respuesta en esas fechas".

### D5 — Componente de fechas: `Input type="date"` en un `DateRangeFilter` compartido
- El selector de fechas que ya usan los reportes (`PeriodFilter`) es `Input type="date"` de
  shadcn con `Label`. `DateTimePicker` de campañas elige **día y hora** para programar, y no aplica.
- Se crea `components/filters/DateRangeFilter.tsx`:
  - campos "Desde" y "Hasta", con el mismo marcado que el modo personalizado de `PeriodFilter`;
  - botón "Limpiar fechas" (`Button variant="ghost" size="sm"` con `X`), visible solo con alguna
    fecha puesta;
  - el error de rango invertido.
- Va **junto al `Select` de método**, en la cabecera de la tabla, a la izquierda del método.

## Criterios de aceptación

### Parte 1 — Bandeja
1. **CA-1:** el hilo no muestra la franja de resumen ni su botón "Generar resumen", con o sin
   resumen y con o sin permiso.
2. **CA-2:** la tarjeta de resumen de "Ficha del contacto" se ve y funciona igual que antes. Al
   generar, se actualiza la ficha.
3. **CA-3:** no queda código que solo usara la franja:
   - `ConversationSummaryStrip*`, `resumenExpandido` y `toggleResumen` no aparecen en `src`;
   - `InboxPage` no importa `useGenerateSummary`.
   `useConversationOverview` e `IntentStrip` siguen funcionando.
4. **CA-4:** el layout del chat no deja huecos. El hilo ocupa el espacio que dejaba la franja, con y
   sin etiquetas y con y sin `IntentStrip`, en light y dark.

### Parte 2 — Topes
5. **CA-5:** cada campo de la tabla D2 acepta exactamente su tope nuevo en el input (`maxlength`) y,
   donde tiene contador, el contador muestra `n / nuevo`.
6. **CA-6:** el API acepta el tope nuevo y rechaza tope + 1 con `400`:
   - título 400/401;
   - contenido 15.000/15.001;
   - pregunta de FAQ 700/701, también en `POST /api/kb/faqs/test`.
7. **CA-7:** los tests de presupuesto de los cuatro formularios pasan con `CONTENIDO_MAX = 15.000`,
   con todo al tope. Además, el JSON de `estructura` al tope cabe en `ESTRUCTURA_MAX_BYTES`
   (60.000).
8. **CA-8:** los campos fuera de la regla (D2, "sin cambio") conservan su tope.

### Parte 3 — Filtro por fechas
9. **CA-9:** "Fuentes y contexto" muestra los campos "Desde" y "Hasta" junto al filtro de método,
   y el botón "Limpiar fechas".
10. **CA-10:** el filtro funciona con solo "desde", con solo "hasta" y con ambos. "Hasta" incluye
    el día completo en la zona del navegador. Un registro a las 23:59 local del día "hasta" aparece;
    uno a las 00:00 del día siguiente, no.
11. **CA-11:**
    - Con "desde" > "hasta" se ve el error y no se envía el rango.
    - El API responde `400` si recibe `hasta <= desde` o una fecha no válida.
12. **CA-12:** el filtro se combina con el de método. Cambiar o limpiar las fechas vuelve a la
    página 1. `total` y la paginación reflejan el conjunto filtrado.

### Transversales
13. **CA-13 — Aislamiento multi-tenant:**
    - `GET /api/ai/responses` con rango solo devuelve registros del tenant del token, aunque haya
      registros de otro tenant dentro del mismo rango.
    - Un `tenantId` en la query se ignora.
    - El filtro pasa por `findScoped`/`countScoped`.
14. **CA-14 — Calidad:** todo en verde:
    - `pnpm --filter @sofiapp/api typecheck`;
    - `pnpm --filter @sofiapp/api test`;
    - `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint`;
    - `pnpm --filter @sofiapp/web test`.

    `KnowledgeBasePage.test.tsx` ya fallaba antes (se cuelga por desbordamiento de pila; ver
    HU-REP-05). Si sigue fallando, se documenta, pero su aserción de `maxlength` igual se actualiza.

## Dependencias

- Rama `feat/HU-REP-05` (HU-REP-05 implementada, sin commit). Se trabaja encima, sin rama nueva.
- HU-IA-04: el resumen y el overview. Este cambio revierte su decisión de mostrar el resumen sobre
  el hilo.
- HU-KB-07 a HU-KB-12: el sistema de campos y los topes. D3 actualiza la Decisión 2 de HU-KB-07.
- HU-KB-02: la validación de FAQs.
- HU-KB-04: la auditoría de respuestas de la IA.
- Regla 7 del `CLAUDE.md` raíz: skills de diseño antes de tocar componentes. En este entorno solo
  está disponible `frontend-design`.
