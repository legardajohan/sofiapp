import { describe, it, expect } from 'vitest';
import { ExchangeRate } from './exchange-rate.model.js';
import {
  getVigente,
  getVigenteFresco,
  registerOficial,
  registerManual,
  revertToOficial,
  listHistorial,
} from './exchange-rate.service.js';
import type { ITrmProvider } from '../../integrations/trm/trm-provider.interface.js';

function providerOk(tasa: string, fecha: Date): ITrmProvider {
  return {
    tipoFuente: 'BANCO_REPUBLICA',
    fetchTrmVigente: async () => ({
      tasaCopPorUsd: tasa,
      fechaVigencia: fecha,
      fuente: 'Banco de la República (test)',
    }),
  };
}

const providerTimeout: ITrmProvider = {
  tipoFuente: 'BANCO_REPUBLICA',
  fetchTrmVigente: async () => {
    throw new Error('timeout');
  },
};

const providerInvalido: ITrmProvider = {
  tipoFuente: 'BANCO_REPUBLICA',
  fetchTrmVigente: async () => ({ tasaCopPorUsd: '0', fechaVigencia: new Date(), fuente: 'x' }),
};

const daysAgo = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

describe('exchange-rate.service — Fase C', () => {
  it('sin ninguna tasa registrada → UNAVAILABLE (nunca 0)', async () => {
    const res = await getVigente();
    expect(res.estado).toBe('UNAVAILABLE');
    expect(res.tasa).toBeNull();
  });

  it('registerOficial (stub OK) guarda tasa + fuente + fechaVigencia + consultadaEn (CA-19)', async () => {
    const res = await registerOficial(providerOk('3305.38', new Date()));
    expect(res.estado).toBe('CURRENT');
    expect(res.tasa?.tasaCopPorUsd).toBe('3305.38');
    expect(res.tasa?.tipoFuente).toBe('BANCO_REPUBLICA');
    expect(res.tasa?.esOficial).toBe(true);
    expect(res.tasa?.fechaVigencia).toBeDefined();
    expect(res.tasa?.consultadaEn).toBeDefined();
    expect(await ExchangeRate.countDocuments()).toBe(1);
  });

  it('una oficial con vigencia anterior a hoy se reporta STALE (no se reemplaza por 0)', async () => {
    const res = await registerOficial(providerOk('3200.00', daysAgo(3)));
    expect(res.estado).toBe('STALE');
    expect(res.tasa?.tasaCopPorUsd).toBe('3200.00');
  });

  it('respuesta inválida no persiste basura y conserva la última válida (CA-20)', async () => {
    await registerOficial(providerOk('3305.38', new Date()));
    const before = await ExchangeRate.countDocuments();

    const res = await registerOficial(providerInvalido);
    expect(await ExchangeRate.countDocuments()).toBe(before); // no se creó basura
    expect(res.estado).toBe('CURRENT');
    expect(res.tasa?.tasaCopPorUsd).toBe('3305.38');
  });

  it('timeout de la fuente conserva la última oficial, sin romper ni poner 0 (CA-20)', async () => {
    await registerOficial(providerOk('3305.38', new Date()));
    const before = await ExchangeRate.countDocuments();

    const res = await registerOficial(providerTimeout);
    expect(await ExchangeRate.countDocuments()).toBe(before);
    expect(res.estado).toBe('CURRENT');
    expect(res.tasa?.tasaCopPorUsd).toBe('3305.38');
  });

  it('registerManual usa la tasa temporal, registra motivo + usuario y NO borra oficiales (CA-21)', async () => {
    await registerOficial(providerOk('3300.00', new Date()));
    const res = await registerManual(
      { valorCopPorUsd: '3500.50', fechaVigencia: new Date(), motivo: 'Fuente oficial caída' },
      'user-123',
    );

    expect(res.estado).toBe('MANUAL');
    expect(res.tasa?.tasaCopPorUsd).toBe('3500.50');
    expect(res.tasa?.tipoFuente).toBe('MANUAL');
    expect(res.tasa?.creadaPor).toBe('user-123');
    expect(res.tasa?.motivoOverride).toBe('Fuente oficial caída');

    const hist = await listHistorial();
    expect(hist.some((r) => r.esOficial)).toBe(true); // la oficial sigue en el historial
    expect(hist.some((r) => r.esOverrideManual)).toBe(true);
  });

  it('revertToOficial vuelve a la oficial y conserva el manual en el historial (auditoría)', async () => {
    await registerOficial(providerOk('3300.00', new Date()));
    await registerManual({ valorCopPorUsd: '3500.50', fechaVigencia: new Date(), motivo: 'x' }, 'u1');

    const reverted = await revertToOficial();
    expect(reverted.estado).toBe('CURRENT');
    expect(reverted.tasa?.tasaCopPorUsd).toBe('3300.00');

    const hist = await listHistorial();
    expect(hist.some((r) => r.esOverrideManual)).toBe(true); // el manual queda para auditoría
  });

  it('registerOficial deduplica por día (no crea dos oficiales con la misma vigencia)', async () => {
    await registerOficial(providerOk('4000', new Date()));
    await registerOficial(providerOk('4001', new Date())); // mismo día
    expect(await ExchangeRate.countDocuments({ esOficial: true })).toBe(1);
  });

  describe('getVigenteFresco — auto-refresh best-effort', () => {
    it('consulta la fuente cuando no hay tasa y luego NO vuelve a consultar si ya es CURRENT', async () => {
      let llamadas = 0;
      const counting: ITrmProvider = {
        tipoFuente: 'BANCO_REPUBLICA',
        fetchTrmVigente: async () => {
          llamadas += 1;
          return { tasaCopPorUsd: '4000', fechaVigencia: new Date(), fuente: 'test' };
        },
      };

      const primera = await getVigenteFresco(counting);
      expect(primera.estado).toBe('CURRENT');
      expect(primera.tasa?.tasaCopPorUsd).toBe('4000');
      expect(llamadas).toBe(1);

      const segunda = await getVigenteFresco(counting); // ya hay tasa de hoy → no reconsulta
      expect(segunda.estado).toBe('CURRENT');
      expect(llamadas).toBe(1);
    });

    it('si la fuente falla y no hay tasa previa → UNAVAILABLE (no rompe)', async () => {
      const res = await getVigenteFresco(providerTimeout);
      expect(res.estado).toBe('UNAVAILABLE');
      expect(res.tasa).toBeNull();
    });
  });
});
