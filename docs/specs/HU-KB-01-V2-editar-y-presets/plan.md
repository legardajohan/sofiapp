# HU-KB-01-V2 — Plan técnico (CÓMO)

> Cómo se construye lo definido en `spec.md`. Se respeta el patrón de 6 archivos del backend,
> controllers delgados, `tenantId` del token y acceso a Mongo **solo** por el repositorio scoped.
> Se reutiliza todo lo de HU-KB-01: el job `kb-index`, `deleteManyScoped(KbChunk, …)` y el guard de
> versión obsoleta del processor (`doc.version !== version` → skip).

## Archivos a tocar

```
apps/backend/src/
  features/kb/
    kb.types.ts             # (TOCA) UpdateKbDocumentDTO; isPreset/proposito/contenido en respuesta
    kb-document.model.ts     # (TOCA) campos isPreset + proposito
    kb.validation.ts         # (TOCA) límite 3000 en create; nuevo updateDocumentSchema
    kb.service.ts            # (TOCA) mapper + updateDocument() + seedPresetDocuments()
    kb.controller.ts         # (TOCA) updateDocumentController (delgado)
    kb.routes.ts             # (TOCA) PATCH /documents/:id
  features/tenant/
    tenant.service.ts        # (TOCA) invoca seedPresetDocuments tras crear el tenant (no bloqueante)

apps/frontend/src/
  api/knowledge-base.ts                                   # (TOCA) updateKbDocument()
  features/knowledge-base/
    types/domain.ts                                       # (TOCA) contenido/isPreset/proposito en IKbDocument
    types/api.ts                                          # (TOCA) UpdateKbDocumentPayload
    types/index.ts                                        # (TOCA) re-export del nuevo tipo
    components/KnowledgeUploadEditor.tsx                  # (TOCA) formulario dual + límite 3000
    components/KnowledgeDocumentTable.tsx                 # (TOCA) iconos lucide + badge Predefinido
    pages/KnowledgeBasePage.tsx                           # (TOCA) estado editingDocument, cablea props
```

No se crean archivos nuevos: la feature es una ampliación de la slice `kb` existente.

## Contratos

### kb.types.ts
```ts
export interface UpdateKbDocumentDTO {
  contenido: string;
}

// IKbDocument (dominio) e IKbDocumentResponse ganan:
//   isPreset: boolean;
//   proposito?: string;
// IKbDocumentResponse además expone:
//   contenido: string;   // el listado ya alcanza para precargar el editor de edición
// La respuesta del update REUTILIZA IKbDocumentResponse (no se crea tipo nuevo).
```

### kb-document.model.ts
```ts
// Nuevos campos en el schema (el resto queda igual):
isPreset: { type: Boolean, default: false },
proposito: { type: String, required: false },
// Los índices no cambian: se mantiene { tenantId, titulo } unique y { tenantId, createdAt: -1 }.
```

### kb.validation.ts
```ts
const contenido = z.string().trim()
  .max(3000, 'El contenido no puede superar los 3,000 caracteres.'); // create y update comparten tope

export const updateDocumentSchema = z.object({
  params: z.object({ id: z.string().regex(/^[0-9a-f]{24}$/i, 'ID inválido.') }), // mismo regex que delete
  body: z.object({ contenido }),
});
// createDocumentSchema: bajar el max de contenido de 100_000 a 3000 (mismo mensaje).
```

### kb.service.ts
```ts
// mapKbDocumentToResponse: agregar contenido, isPreset, proposito al objeto retornado.

export async function updateDocument(
  tenantId: TenantId,
  id: string,
  contenido: string,
): Promise<IKbDocumentResponse> {
  const existing = await findByIdScoped(KbDocument, tenantId, id).lean();
  if (!existing) throw new AppError('No se encontró el documento.', 404);

  const doc = await findOneAndUpdateScoped(
    KbDocument, tenantId, { _id: id },
    { $set: { contenido, estadoIndexacion: 'pendiente', chunkCount: 0 },
      $inc: { version: 1 }, $unset: { error: 1 } },
    { new: true },
  );
  await deleteManyScoped(KbChunk, tenantId, { documentId: id });

  if (contenido.trim().length > 0) {
    await kbIndexQueue.add(KB_INDEX_JOB_NAME, {
      tenantId: tenantId.toString(), documentId: doc!._id.toString(), version: doc!.version,
    });
  }
  return mapKbDocumentToResponse(doc!);
}

const PRESET_DOCUMENTS: ReadonlyArray<{ titulo: string; proposito: string }> = [
  { titulo: 'Información de la empresa', proposito: 'Nombre, misión, visión' },
  { titulo: 'Productos y servicios',    proposito: 'Catálogo de lo que ofrece' },
  { titulo: 'Horarios y ubicación',     proposito: 'Datos de contacto' },
  { titulo: 'Políticas y términos',     proposito: 'Reglas, garantías, devoluciones' },
  { titulo: 'Preguntas frecuentes',     proposito: 'FAQ comunes' },
];

export async function seedPresetDocuments(tenantId: TenantId): Promise<void> {
  for (const preset of PRESET_DOCUMENTS) {
    await createScoped(KbDocument, tenantId, {
      titulo: preset.titulo, proposito: preset.proposito, contenido: '',
      isPreset: true, version: 1, estadoIndexacion: 'pendiente', chunkCount: 0,
    });
  }
  // No llama a Gemini ni encola jobs: el contenido nace vacío.
}
```

### kb.controller.ts
```ts
export const updateDocumentController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const doc = await updateDocument(tenantId, req.params.id, req.body.contenido);
  res.status(200).json(doc);
};
```

### kb.routes.ts
```ts
router.patch(
  '/documents/:id',
  authenticateJWT, requireTenant, authorize(['admin']),
  validate(updateDocumentSchema), asyncHandler(updateDocumentController),
);
```

### tenant.service.ts
```ts
// Tras confirmar la transacción (tenant + admin ya creados), FUERA de la sesión
// (createScoped no acepta session):
try {
  await seedPresetDocuments(createdTenant._id);
} catch (err) {
  logger.error({ err, tenantId: createdTenant._id }, 'seedPresetDocuments falló');
  // no se propaga: la creación del tenant no se revierte
}
return mapTenantToResponse(createdTenant);
```

### Frontend — api/knowledge-base.ts
```ts
export async function updateKbDocument(
  id: string, payload: UpdateKbDocumentPayload,
): Promise<IKbDocument> {
  const { data } = await apiClient.patch<IKbDocument>(`/kb/documents/${id}`, payload);
  return data;
}
```

### Frontend — tipos
```ts
// types/domain.ts → IKbDocument gana: contenido: string; isPreset: boolean; proposito?: string;
// types/api.ts    → export interface UpdateKbDocumentPayload { contenido: string }
// types/index.ts  → re-export de UpdateKbDocumentPayload
```

### Frontend — componentes (comportamiento)
```txt
KnowledgeUploadEditor(props: { document?: IKbDocument; onDone?: () => void })
  - Sin document  → modo crear (igual que hoy): createKbDocument, botón "Cargar e indexar".
  - Con document  → modo editar: precarga contenido; botón "Guardar cambios";
                    mutationFn = (p) => updateKbDocument(document.id, p).
  - useEffect([document?.id]): reset de contenido, successMsg, errorMsg y mutation.reset().
  - placeholder = (document?.proposito && contenido==='') ? document.proposito : genérico.
  - textarea maxLength={3000}, contador "… / 3 000 caracteres".
  - onSuccess: invalidateQueries(['kb','documents']); onDone?.().

KnowledgeDocumentTable(props: { onEdit: (doc: IKbDocument) => void })
  - Columna Acciones: <button aria-label="Editar"><Pencil/></button> → onEdit(doc);
                      <button aria-label="Eliminar"><Trash2/></button> → confirm + deleteMutation.
  - disabled/loading durante mutaciones (igual que hoy).
  - Fila con doc.isPreset → <Badge variant="secondary">Predefinido</Badge>.

KnowledgeBasePage()
  - const [editingDocument, setEditingDocument] = useState<IKbDocument | null>(null);
  - <KnowledgeUploadEditor document={editingDocument ?? undefined}
      onDone={() => setEditingDocument(null)} />
  - <KnowledgeDocumentTable onEdit={(doc) => { setEditingDocument(doc); /* scroll/focus al form */ }} />
```

## Notas
- **Guard de versión ya existe:** el processor `kb-index` salta si `doc.version !== version`; el
  `$inc` de `version` en `updateDocument` deja segura cualquier concurrencia de re-indexado.
- **Título no editable:** `updateDocumentSchema` solo lleva `contenido`, evitando colisiones con el
  índice único `{tenantId, titulo}`. Presets y personalizados se comportan igual.
- **Exposición de `contenido`:** decisión de diseño aprobada — el listado incluye `contenido` (tope
  3.000 chars → payload pequeño), evitando un endpoint `GET /:id`.
- **Seeding no bloqueante:** `seedPresetDocuments` corre fuera de la transacción de `createTenant`
  (el helper `createScoped` no acepta session) y su fallo solo se registra.
- **Diseño visual:** durante la implementación se aplica la skill `frontend-design` para el
  formulario dual, iconos y badge, evitando look "templated". Iconos vía `lucide-react` (ya es
  dependencia); coexiste con los SVG inline actuales del editor.

## Verificación
- `pnpm --filter @sofiapp/api typecheck`
- `pnpm --filter @sofiapp/api test`  (incluye test de aislamiento del update)
- `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint`
