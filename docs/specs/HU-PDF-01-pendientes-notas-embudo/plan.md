# HU-PDF-01 — Plan técnico

> El CÓMO de `spec.md`. Respeta el `CLAUDE.md` raíz (aislamiento multi-tenant, `tenantId` del
> token, controllers delgados, Zod en el borde, `strict` sin `any`) y el patrón de feature de
> `apps/backend/CLAUDE.md`.

## Archivos a crear / tocar

```
apps/backend/
├── package.json                                   ← + pdfkit, + @types/pdfkit (dev)
└── src/
    ├── app.ts                                     ← montar /api/pendientes
    └── features/
        ├── contact-note/
        │   ├── contact-note.types.ts              ← pendiente en IContactNote / INotaResponse
        │   ├── contact-note.model.ts              ← campo pendiente + índice parcial
        │   ├── contact-note.validation.ts         ← pendiente en create; update/delete schemas
        │   ├── contact-note.service.ts            ← createNota(…, pendiente), updateNota, deleteNota
        │   ├── contact-note.controller.ts         ← update/delete controllers
        │   ├── contact-note.routes.ts             ← PATCH /:notaId, DELETE /:notaId
        │   ├── contact-note.service.test.ts       ← NUEVO
        │   └── contact-note.isolation.test.ts     ← NUEVO
        └── pendiente/                             ← NUEVO (slice de lectura, sin modelo propio)
            ├── pendiente.types.ts
            ├── pendiente.validation.ts
            ├── pendiente.service.ts
            ├── pendiente.pdf.ts                   ← render pdfkit puro, sin Mongo
            ├── pendiente.controller.ts
            ├── pendiente.routes.ts
            ├── pendiente.service.test.ts
            ├── pendiente.routes.test.ts
            ├── pendiente.pdf.test.ts
            └── pendiente.isolation.test.ts

apps/frontend/src/features/
├── contacts/
│   ├── types.ts                                   ← pendiente en NotaDTO
│   ├── api.ts                                     ← createNota(texto, pendiente), updateNota, deleteNota
│   ├── hooks/useNotas.ts                          ← useUpdateNota, useDeleteNota; invalidan ['pendientes']
│   └── components/
│       ├── ContactNotesCard.tsx                   ← Switch + distintivo + menú por nota
│       ├── NotaItem.tsx                           ← NUEVO: una nota (lectura / edición inline / menú)
│       └── ContactNotesCard.test.tsx              ← casos del switch y edición
└── pipeline/
    ├── types.ts                                   ← PendienteDTO, PendientesPage
    ├── api.ts                                     ← fetchPendientes, downloadPendientesPdf
    ├── hooks/usePendientes.ts                     ← NUEVO (useInfiniteQuery)
    ├── hooks/useDescargarPendientesPdf.ts         ← NUEVO (mutation + guardado del blob)
    ├── lib/rango-pdf.ts                           ← NUEVO: validación de rango + nombre de archivo
    └── components/
        ├── PipelineBoard.tsx                      ← monta <PendientesColumn /> antes de las etapas
        ├── PendientesColumn.tsx                   ← NUEVO
        ├── PendienteCard.tsx                      ← NUEVO
        ├── PendientesPdfPopover.tsx               ← NUEVO
        ├── PendientesColumn.test.tsx              ← NUEVO
        └── PendientesPdfPopover.test.tsx          ← NUEVO

docs/
├── data-model.md                                  ← contact_notes.pendiente + índice parcial
├── api-contract.md                                ← endpoints nuevos y 404 de rango vacío
└── adr/0013-pdf-pendientes-sincrono-pdfkit.md     ← NUEVO
```

## Contratos — backend

### `contact-note` (cambios)

```ts
// contact-note.types.ts
export interface IContactNote {
  tenantId: Types.ObjectId;
  clienteId: Types.ObjectId;
  autorId: Types.ObjectId;
  textoEnc: string;
  /** HU-PDF-01: la nota es además un pendiente del embudo. */
  pendiente: boolean;
}
export interface INotaResponse { id; texto; autor; createdAt; pendiente: boolean; updatedAt: string }
```

```ts
// contact-note.model.ts
pendiente: { type: Boolean, default: false },
// Consulta de la columna y del PDF: pendientes del tenant por fecha ascendente.
// Parcial: las notas normales (la mayoría) no pagan el índice.
ContactNoteSchema.index(
  { tenantId: 1, createdAt: 1, _id: 1 },
  { partialFilterExpression: { pendiente: true } },
);
```

Los documentos existentes no tienen el campo: el filtro de lectura es `{ pendiente: true }`, así que
quedan fuera sin migración, y `toNotaResponse` mapea `nota.pendiente ?? false`.

```ts
// contact-note.validation.ts
const notaParams = z.object({ clienteId: objectId, notaId: objectId });
createNotaSchema.body = { texto, pendiente: z.boolean().default(false) }
export const updateNotaSchema = z.object({
  body: z.object({ texto: textoSchema.optional(), pendiente: z.boolean().optional() })
    .refine((b) => b.texto !== undefined || b.pendiente !== undefined,
            { message: 'Indica el texto o el estado de pendiente.' }),
  params: notaParams, query: empty,
});
export const deleteNotaSchema = z.object({ body: empty, params: notaParams, query: empty });
```

```ts
// contact-note.service.ts
createNota(tenantId, autorId, clienteId, texto, pendiente): Promise<INotaResponse>
updateNota(tenantId, actorId, clienteId, notaId, cambios: UpdateNotaBody): Promise<INotaResponse>
deleteNota(tenantId, actorId, clienteId, notaId): Promise<void>
```

- `updateNota`: `findOneAndUpdateScoped(ContactNote, tenantId, { _id, clienteId }, { $set }, { new: true })`.
  Filtrar también por `clienteId` impide mover/tocar una nota por una URL con otro contacto.
  `null` → `AppError('Nota no encontrada.', 404)` (indistinguible de «es de otro tenant»).
- `deleteNota`: `findOneAndDeleteScoped(...)` con el mismo filtro y el mismo 404.
- Auditoría (`recordAuditEvent`): `contact-note.update` con `antes/despues: { pendiente }` y
  `textoEditado: boolean`; `contact-note.delete` con `antes: { clienteId, pendiente }`. **Nunca** el texto.

| Método | Ruta | Middlewares | Respuesta |
|---|---|---|---|
| POST | `/api/clientes/:clienteId/notas` | igual que hoy | 201 `INotaResponse` |
| PATCH | `/api/clientes/:clienteId/notas/:notaId` | `authenticateJWT → requireTenant → authorize(['admin']) → authorizeSubrol(SUBROLES_DATOS_SENSIBLES) → validate(updateNotaSchema) → asyncHandler` | 200 `INotaResponse` |
| DELETE | `/api/clientes/:clienteId/notas/:notaId` | ídem con `deleteNotaSchema` | 204 |

### `pendiente` (nuevo)

```ts
// pendiente.types.ts
export const PENDIENTES_LIMIT_DEFECTO = 20;
export const PENDIENTES_LIMIT_MAXIMO = 50;
export const PENDIENTES_RANGO_MAX_DIAS = 366;
export const PENDIENTES_PDF_MAX = 5000; // tope duro de filas del PDF

export interface IPendienteLeadResponse {
  nombre: string | null;          // lead.nombre ?? cliente.nombre
  telefono: string;               // lead.telefono ?? cliente.telefono
  correo: string | null;          // lead.correo ?? fromStoredValue(cliente.correoEnc)
  canalOrigen: CanalOrigen;       // cliente.canalOrigen
  /** `null` = el contacto no se ha convertido en lead → la UI dice «Sin convertir». */
  etapa: { key: string; label: string; color: string } | null;
  leadId: string | null;
}
export interface IPendienteResponse {
  id: string;                     // = notaId (el pendiente ES la nota)
  clienteId: string;              // para el enlace a la bandeja
  descripcion: string;            // texto de la nota (RN3)
  autor: { id: string; nombre: string | null };
  createdAt: string;
  lead: IPendienteLeadResponse;
}
```

```ts
// pendiente.validation.ts
listPendientesSchema.query = { page: coerce int ≥1 = 1, limit: coerce int 1..50 = 20 }
pdfPendientesSchema.query = {
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),   // día civil, no instante
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tz: z.string().refine(esZonaIana).default('America/Bogota'),
} + refine(hasta >= desde, path ['hasta'], 'La fecha final no puede ser anterior a la inicial.')
  + refine(días ≤ PENDIENTES_RANGO_MAX_DIAS)
```

`desde`/`hasta` viajan como **días civiles** (`YYYY-MM-DD`) más la zona IANA del navegador: así el
nombre del archivo y el encabezado usan exactamente las fechas que el usuario eligió, y el service
convierte a instantes `[00:00 desde, 24:00 hasta)` en esa zona (helper puro `rangoDiasAInstantes`
con `Intl`, sin dependencia nueva).

```ts
// pendiente.service.ts
listPendientes(tenantId, page, limit): Promise<IPaginated<IPendienteResponse>>
listPendientesEnRango(tenantId, inicio: Date, fin: Date): Promise<IPendienteResponse[]>
generarPdfPendientes(tenantId, generadoPor: string, query: PdfPendientesQuery):
  Promise<{ stream: Readable; filename: string }>
```

- Lectura: `findScoped(ContactNote, tenantId, { pendiente: true, [createdAt rango] })
  .sort({ createdAt: 1, _id: 1 })` — usa el índice parcial.
- `hidratarPendientes(tenantId, notas)` — **en lote, una consulta por colección** (mismo criterio
  que `hidratarLeadsParaListado`): `findScoped(Cliente, { _id: $in })`,
  `findScoped(Lead, { clienteId: $in })` (índice `{tenantId, clienteId}`), `listEstados(tenantId)`,
  `findUsersByIds(tenantId, autores)`. Una etapa archivada sigue resolviéndose por `key` (se usan
  todas, no solo las activas); una `key` desconocida → `{ key, label: key, color: neutro }`.
- PDF: `countScoped` primero; `0` → `AppError('No hay pendientes en el rango seleccionado.', 404)`;
  `> PENDIENTES_PDF_MAX` → `AppError('El rango tiene demasiados pendientes; acórtalo.', 422)`.
  Nombre del tenant con `findByIdScoped`-equivalente sobre `Tenant` (lectura del propio tenant del
  token) y nombre del generador con `findUsersByIds`.
- `filename = \`Pendientes_${desde}_a_${hasta}.pdf\``.

```ts
// pendiente.pdf.ts — puro: recibe datos ya hidratados, devuelve un PDFDocument (Readable)
export interface IReportePendientes {
  empresa: string; rango: { desde: string; hasta: string }; generadoAt: Date; tz: string;
  generadoPor: string; pendientes: IPendienteResponse[];
}
export function renderReportePendientes(datos: IReportePendientes): PDFKit.PDFDocument
```

- `new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: 'Reporte de pendientes' } })`.
- Encabezado en la primera página; cada pendiente es un bloque (fecha/hora · lead · teléfono ·
  correo · canal · etapa · descripción · autor) con `moveDown`, salto de página si no cabe.
- Al final: «Total de pendientes: N»; luego `bufferedPageRange()` y en cada página «Página X de Y».
- Fechas formateadas con `Intl.DateTimeFormat('es-CO', { timeZone: tz, … })`.
- Fuentes estándar de pdfkit (Helvetica): cubre español (latin-1). Sin fuentes externas.

| Método | Ruta | Middlewares | Respuesta |
|---|---|---|---|
| GET | `/api/pendientes` | `authenticateJWT → requireTenant → authorize(['admin']) → authorizeSubrol(SUBROLES_DATOS_SENSIBLES) → validate(listPendientesSchema) → asyncHandler` | 200 `IPaginated<IPendienteResponse>` |
| GET | `/api/pendientes/pdf` | ídem con `pdfPendientesSchema` | 200 `application/pdf` (stream) · 400 · 403 · 404 · 422 |

Controller del PDF (delgado): llama al service y hace
`res.setHeader('Content-Type','application/pdf')`,
`res.setHeader('Content-Disposition', \`attachment; filename="${filename}"\`)`,
`stream.pipe(res)`. Los errores esperables salen **antes** de empezar el stream, así que el
`errorHandler` sigue respondiendo JSON.

`app.ts`: `app.use('/api/pendientes', pendienteRoutes);` junto a `/api/pipeline`.

**Jobs BullMQ:** ninguno. El PDF es síncrono en el proceso web; justificación en ADR 0013.

## Contratos — frontend

```ts
// contacts/types.ts
export interface NotaDTO { id; texto; autor; createdAt; updatedAt: string; pendiente: boolean }
// pipeline/types.ts
export interface PendienteDTO { id; clienteId; descripcion; autor; createdAt; lead: { nombre; telefono;
  correo; canalOrigen; etapa: { key; label; color } | null; leadId } }
export type PendientesPage = Paginated<PendienteDTO>;
```

- `api.ts` (todo por el `apiClient` único): `fetchPendientes(page)`,
  `downloadPendientesPdf({ desde, hasta, tz })` con `responseType: 'blob'`. En error, si el cuerpo
  es un `Blob` JSON se parsea para obtener `message` (necesario para el 404 de CA5).
- `usePendientes()` → `useInfiniteQuery({ queryKey: ['pendientes'], getNextPageParam por total })`,
  `retry` sin reintentar 403 (mismo patrón que `useNotas`).
- `useDescargarPendientesPdf()` → `useMutation`; en éxito crea `URL.createObjectURL(blob)`, dispara
  un `<a download={filename}>` y revoca la URL. El `filename` se calcula en el cliente con
  `lib/rango-pdf.ts` (idéntico al del servidor) para no depender de leer `Content-Disposition` a
  través de CORS.
- Mutaciones de notas (`create/update/delete`) invalidan `['contact-notas', clienteId]` **y**
  `['pendientes']`.

### Componentes (shadcn primero)

- **`ContactNotesCard`** — debajo del `Textarea`, fila con `Switch` (shadcn) + `Label`
  «Marcar como pendiente»; se resetea a apagado en `onSuccess`. Lista delegada a `NotaItem`.
- **`NotaItem`** — texto, autor, fecha; `Badge` «Pendiente» si aplica; `DropdownMenu` (botón
  `MoreHorizontal`, `aria-label="Acciones de la nota"`): Editar · Marcar como pendiente / Quitar
  pendiente · Eliminar. Editar cambia a `Textarea` inline con Guardar/Cancelar (Esc cancela,
  Ctrl/⌘+Enter guarda). Eliminar abre `AlertDialog` («Eliminar nota» / «Esta nota y su pendiente
  dejarán de mostrarse. No se puede deshacer.»).
- **`PendientesColumn`** — misma altura y ancho que `PipelineColumn` para que el tablero no se
  dente, pero se lee como **vista de seguimiento, no etapa**: fondo `bg-muted/40`, borde
  discontinuo, icono `ClipboardList`, título «Pendientes» + contador `tabular-nums`. No es drop
  target (no usa `useDroppable`). Cabecera con el disparador del PDF (`FileDown`, «Descargar PDF»).
  Estados: skeleton, error con «Reintentar», vacío («Sin pendientes. Activa «Marcar como pendiente»
  al guardar una nota en la ficha del contacto.»), «Cargar más». Si el listado da 403 →
  `return null`.
- **`PendienteCard`** — `button` semántico de ancho completo: descripción `line-clamp-3`; nombre en
  `font-medium`; teléfono y correo en `text-muted-foreground`; `Badge` de canal y `Badge` de etapa
  con el `color` del catálogo (o variante neutra «Sin convertir»); pie con autor y
  `<time dateTime title>` usando `fechaHora`/`fechaCompleta` de `contacts/lib/fecha.ts`. Clic /
  Enter → `navigate('/inbox?conversacion=<clienteId>&volverA=' + encodeURIComponent(rutaActual))`.
- **`PendientesPdfPopover`** — `Popover` + `Calendar` (`mode="range"`, `locale es`), resumen del
  rango elegido en texto, mensaje de validación (`role="alert"`) si falta una fecha o fin < inicio,
  botón «Descargar PDF» deshabilitado hasta que el rango es válido, `Loader2` mientras descarga;
  toast `sonner` con el `message` del 404 («No hay pendientes en el rango seleccionado») o del
  422/400. Solo se renderiza dentro de `PendientesColumn` (CA7).

### Criterios de diseño aplicados (emil-design-eng + frontend-design)

- **Movimiento con propósito:** las tarjetas y la columna no tienen animación de entrada (se ven
  decenas de veces al día). Solo: `pressable` existente (`motion-safe:active:scale-[0.98]`,
  150 ms ease-out) en tarjetas y botones; Popover con `transform-origin:
  var(--radix-popover-content-transform-origin)`, ≤200 ms ease-out; `Switch` con su transición de
  shadcn. Nunca `transition: all`; hover tras `@media (hover:hover)`.
- **Estructura = información:** el borde discontinuo y el fondo atenuado comunican «esto no es una
  etapa»; el color de etapa solo aparece en su `Badge`, no en la tarjeta entera.
- **Copy en voz activa y sentence case:** «Marcar como pendiente», «Descargar PDF», «Quitar
  pendiente». Errores directos, sin disculpas. Sin etiquetas en mayúsculas, sin flechas «→».
- **Calidad base:** foco visible, `aria-label` en iconos, `aria-live` en carga, contraste en light y
  dark con tokens semánticos (`bg-card`, `text-muted-foreground`, `border-border`,
  `text-destructive`), usable con teclado (tarjeta = `button`, menú y popover de Radix).
- La skill `impeccable:impeccable` no está instalada en este entorno; si se instala antes de
  `/sdd-implement`, invocarla junto con las otras dos (regla 7 del `CLAUDE.md`).

## Notas

- **Por qué atributo y no colección `pendientes`:** una colección aparte obligaría a sincronizar
  texto, borrado y activación (RN3/RN4) con riesgo de huérfanos; el atributo lo hace imposible.
- **Por qué `pendiente.service` no reutiliza `hidratarLeadsParaListado`:** esa proyección parte de
  leads y aquí se parte de contactos que pueden no tener lead; sí se reutilizan `listEstados`,
  `findUsersByIds` y `fromStoredValue`.
- **Sin `aggregate`:** igual que el embudo, `findScoped` + hidratación en lote; nada de `$lookup`.
- **Tenant del PDF:** el nombre de empresa se lee del tenant del token; nunca de la query.
- El `errorHandler` responde JSON; el frontend debe leer el `Blob` de error para mostrar el mensaje.
- Actualizar `docs/data-model.md` y `docs/api-contract.md`; crear ADR 0013 (síncrono vs BullMQ,
  pdfkit vs Puppeteer/jsPDF, tope de filas).

## Verificación

```bash
pnpm --filter @sofiapp/api add pdfkit && pnpm --filter @sofiapp/api add -D @types/pdfkit
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test
pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint
pnpm --filter @sofiapp/web test
```

Manual: crear nota con y sin pendiente en la bandeja → revisar columna; editar/quitar/eliminar;
descargar PDF de un rango con datos y otro vacío; revisar light/dark (capturas en `.playwright-mcp/`,
borradas al terminar).

---

## Ampliación A1 — Programación, cierre e historial

### Datos (`contact_notes`)

| Campo | Tipo | Regla |
|---|---|---|
| `programadoDia` | `string \| null` | Día civil `YYYY-MM-DD`. Solo con `pendiente`. Sin elegir → `diaEnZona(now, tz)` (RN10). |
| `programadoHora` | `string \| null` | `HH:mm` de reloj; `null` = todo el día. |
| `estadoPendiente` | `'abierto' \| 'cerrado' \| null` | Nace `abierto` al encender el pendiente; `null` en notas normales. |
| `cerradoAt` / `cerradoPorId` | `Date` / `ObjectId` \| `null` | Solo en cerrados; se limpian al reabrir o al quitar el pendiente. |

Día civil y no instante: «el 15» es el mismo día para quien agenda y para quien lee, y el rango del
PDF se resuelve comparando cadenas (`$gte desde, $lte hasta`) sin husos. Índices parciales
(`pendiente: true`), los dos con `tenantId` delante:

- `{ tenantId, estadoPendiente, programadoDia, programadoHora, createdAt, _id }` — abiertos en orden
  de agenda y rango del PDF. (Sustituye a `{ tenantId, createdAt, _id }`.)
- `{ tenantId, estadoPendiente, cerradoAt: -1, _id: -1 }` — historial.

### API

| Método | Ruta | Cambio |
|---|---|---|
| POST | `/api/clientes/:clienteId/notas` | + `programadoDia?`, `programadoHora?`, `tz` (default `America/Bogota`). Programar sin `pendiente` → `400`. |
| PATCH | `/api/clientes/:clienteId/notas/:notaId` | + `programadoDia?`, `programadoHora?` (`null` quita la hora), `tz`. Reprogramar una nota no pendiente → `422`. `pendiente:false` borra programación y cierre. |
| GET | `/api/pendientes?estado=abierto\|cerrado` | `abierto` (default) en orden de agenda; `cerrado` por `cerradoAt` desc. |
| POST | `/api/pendientes/:id/cerrar` | `200` con el pendiente cerrado; `409` si ya lo estaba; `404` si no existe en el tenant. |
| POST | `/api/pendientes/:id/reabrir` | `200` abierto con su programación; `409` si ya estaba abierto. |
| GET | `/api/pendientes/pdf` | Filtra por `programadoDia` y trae abiertos y cerrados (RN14). |

Las transiciones ponen la condición de estado **en el filtro de la escritura**
(`findOneAndUpdateScoped({ _id, pendiente: true, estadoPendiente: de })`): dos clics simultáneos no
cierran dos veces. Si no casa, una segunda lectura distingue 404 de 409. Auditoría
`contact-note.pendiente-cerrar|reabrir`, sin texto.

### PDF

Cada bloque abre con «Programado: dd/mm/aaaa · hh:mm» (o «Todo el día») y, a la derecha, el estado
(«Abierto» o «Cerrado el … por …», en verde). Pie: «Total de pendientes: N (A abiertos, C cerrados)».

### Frontend

- `src/lib/agenda.ts` (nuevo, puro): `aDiaCivil`, `deDiaCivil`, `zonaDelNavegador`, `estaVencido`,
  `etiquetaDia`, `etiquetaProgramacion`. `rango-pdf.ts` reexporta los dos primeros.
- `contacts/components/ProgramacionPendiente.tsx` (nuevo): botón de fecha con `Popover` + `Calendar`
  (arranca en «Hoy») e `Input type="time"` con «Quitar la hora». Lo usan el alta y la edición.
- `ContactNotesCard`: la programación aparece bajo el interruptor (fundido de 150 ms, solo
  `motion-safe`). `NotaItem`: distintivo con la agenda (rojo «vencido» si pasó), «Pendiente cerrado»
  en verde; «Editar o reprogramar» edita texto, día y hora.
- `pipeline/hooks/usePendientes.ts`: `usePendientes(estado, habilitado)` con clave
  `['pendientes', estado]`; `useCerrarPendiente` (toast con «Deshacer») y `useReabrirPendiente`.
- `PendientesColumn`: `Tabs` «Abiertos | Historial» con contador; el historial no se pide hasta
  abrir su pestaña. `PendienteCard`: agenda arriba (con «Vencido»), botón «Cerrar pendiente» por
  encima del botón que abre la ficha; en historial, «Cerrado …», «por …» y «Reabrir».
