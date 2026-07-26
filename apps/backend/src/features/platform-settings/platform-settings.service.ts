import { AppError } from '../../utils/AppError.js';
import { PlatformSettings } from './platform-settings.model.js';
import type {
  IPlatformSettingsDocument,
  IPlatformSettingsResponse,
  UpdatePlatformSettingsDTO,
} from './platform-settings.types.js';

// `PlatformSettings` es config GLOBAL (singleton, sin `tenantId`): NO usa el repositorio *Scoped.
// Excepción de superadmin, análoga al catálogo de `Plan`.

const SINGLETON_KEY = 'global';

function mapToResponse(doc: IPlatformSettingsDocument): IPlatformSettingsResponse {
  return {
    maxAdministradoresPorPlan: doc.maxAdministradoresPorPlan,
    proteccionCambiariaPct: doc.proteccionCambiariaPct,
    utilidadPorDefectoPct: doc.utilidadPorDefectoPct,
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt.toISOString(),
  };
}

/**
 * Lee el singleton de configuración; lo crea con defaults si aún no existe.
 * `upsert` + `setDefaultsOnInsert` lo hace atómico (evita duplicados por carrera).
 */
export async function getSettings(): Promise<IPlatformSettingsDocument> {
  const doc = await PlatformSettings.findOneAndUpdate(
    { clave: SINGLETON_KEY },
    { $setOnInsert: { clave: SINGLETON_KEY } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  if (!doc) throw new AppError('No se pudo inicializar la configuración de plataforma.', 500);
  return doc;
}

export async function getSettingsResponse(): Promise<IPlatformSettingsResponse> {
  return mapToResponse(await getSettings());
}

export async function updateSettings(
  dto: UpdatePlatformSettingsDTO,
): Promise<IPlatformSettingsResponse> {
  const doc = await PlatformSettings.findOneAndUpdate(
    { clave: SINGLETON_KEY },
    { $set: dto, $setOnInsert: { clave: SINGLETON_KEY } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  if (!doc) throw new AppError('No se pudo actualizar la configuración de plataforma.', 500);
  return mapToResponse(doc);
}
