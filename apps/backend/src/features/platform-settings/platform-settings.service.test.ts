import { describe, it, expect } from 'vitest';
import { PlatformSettings } from './platform-settings.model.js';
import { getSettings, getSettingsResponse, updateSettings } from './platform-settings.service.js';

describe('platform-settings.service — Fase A', () => {
  it('getSettings crea el singleton con defaults si no existe', async () => {
    const settings = await getSettings();
    expect(settings.maxAdministradoresPorPlan).toBe(100);
    expect(settings.proteccionCambiariaPct).toBe(0);
    expect(settings.utilidadPorDefectoPct).toBe(30);
    expect(await PlatformSettings.countDocuments()).toBe(1);
  });

  it('getSettings es idempotente (no crea documentos duplicados)', async () => {
    await getSettings();
    await getSettings();
    expect(await PlatformSettings.countDocuments()).toBe(1);
  });

  it('updateSettings persiste cambios parciales y conserva el resto', async () => {
    const updated = await updateSettings({ maxAdministradoresPorPlan: 25 });
    expect(updated.maxAdministradoresPorPlan).toBe(25);

    const again = await getSettingsResponse();
    expect(again.maxAdministradoresPorPlan).toBe(25);
    expect(again.proteccionCambiariaPct).toBe(0); // intacto
    expect(await PlatformSettings.countDocuments()).toBe(1);
  });
});
