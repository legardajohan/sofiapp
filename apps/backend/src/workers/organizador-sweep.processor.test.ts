import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

const { publishRealtime } = vi.hoisted(() => ({ publishRealtime: vi.fn() }));
vi.mock('../realtime/realtime.publisher.js', () => ({
  publishRealtime,
  subscribeRealtime: vi.fn(),
}));

const { ContactNote } = await import('../features/contact-note/contact-note.model.js');
const { PendienteEvento } = await import('../features/organizador/organizador.model.js');
const { posponer, cerrarConMotivo, listActivos } = await import(
  '../features/organizador/organizador.service.js'
);
const { processOrganizadorSweep } = await import('./organizador-sweep.processor.js');
const { crearContacto, crearNota, crearTenant, crearUsuario } = await import(
  '../features/pendiente/pendiente.fixtures.js'
);
const { crearRecordatorio, EN_UNA_HORA, HACE_UNA_HORA } = await import(
  '../features/organizador/organizador.fixtures.js'
);

describe('HU-PDF-02 — barrido del Organizador', () => {
  let tenant: Types.ObjectId;
  let ana: string;
  let contacto: string;

  beforeEach(async () => {
    publishRealtime.mockClear();
    tenant = await crearTenant('Academia');
    ana = await crearUsuario(tenant, 'Ana');
    contacto = await crearContacto(tenant, { nombre: 'Luis' });
  });

  it('avisa una sola vez por instante, solo al autor, y deja un evento `vencido`', async () => {
    const id = await crearRecordatorio(tenant, contacto, ana, 'Llamar', {
      recordatorioAt: HACE_UNA_HORA(),
    });
    await crearRecordatorio(tenant, contacto, ana, 'Futuro', { recordatorioAt: EN_UNA_HORA() });

    expect((await processOrganizadorSweep()).avisados).toBe(1);
    expect((await processOrganizadorSweep()).avisados).toBe(0);

    expect(publishRealtime).toHaveBeenCalledTimes(1);
    expect(publishRealtime).toHaveBeenCalledWith({
      type: 'pendiente:vencido',
      tenantId: String(tenant),
      targetUserId: ana,
      notaId: id,
    });
    expect(await PendienteEvento.countDocuments({ tipo: 'vencido' })).toBe(1);
  });

  it('CA-14 — dos barridos concurrentes producen un único `vencido`', async () => {
    await crearRecordatorio(tenant, contacto, ana, 'Llamar', { recordatorioAt: HACE_UNA_HORA() });
    const [a, b] = await Promise.all([processOrganizadorSweep(), processOrganizadorSweep()]);
    expect(a.avisados + b.avisados).toBe(1);
    expect(await PendienteEvento.countDocuments({ tipo: 'vencido' })).toBe(1);
    expect(publishRealtime).toHaveBeenCalledTimes(1);
  });

  it('CA-07 — un cerrado no se vuelve a avisar', async () => {
    const at = HACE_UNA_HORA();
    const id = await crearRecordatorio(tenant, contacto, ana, 'Llamar', { recordatorioAt: at });
    await cerrarConMotivo(tenant, ana, id, {
      motivoKeys: ['venta'],
      motivoIds: [],
      tagIds: [],
      version: at.toISOString(),
    });
    publishRealtime.mockClear();
    expect((await processOrganizadorSweep()).avisados).toBe(0);
    expect(publishRealtime).not.toHaveBeenCalled();
  });

  it('CA-09 — tras posponer, la nueva hora vuelve a avisar', async () => {
    const at = HACE_UNA_HORA();
    const id = await crearRecordatorio(tenant, contacto, ana, 'Llamar', { recordatorioAt: at });
    await processOrganizadorSweep();

    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const pospuesto = await posponer(tenant, ana, id, {
      motivo: 'No contestó',
      nuevoDia: manana,
      nuevaHora: '09:00',
      tz: 'America/Bogota',
      tagIds: [],
      version: at.toISOString(),
    });
    expect((await processOrganizadorSweep()).avisados).toBe(0);

    const llegada = new Date(new Date(pospuesto.recordatorioAt!).getTime() + 1000);
    expect((await processOrganizadorSweep(llegada)).avisados).toBe(1);
    expect(await PendienteEvento.countDocuments({ tipo: 'vencido' })).toBe(2);
  });

  it('HU-PDF-02 A1 — con «10 minutos antes» avisa antes de la hora y sin que esté vencido', async () => {
    const en5min = new Date(Date.now() + 5 * 60_000);
    await crearRecordatorio(tenant, contacto, ana, 'Llamar', { recordatorioAt: en5min, avisoAntesMin: 10 });
    await crearRecordatorio(tenant, contacto, ana, 'Sin anticipación', { recordatorioAt: en5min });

    expect((await processOrganizadorSweep()).avisados).toBe(1);
    const activos = await listActivos(tenant, ana);
    expect(activos.items.map((i) => i.descripcion)).toEqual(['Llamar']);
    // Aún no llegó la hora del pendiente: avisa, pero no está vencido.
    expect(activos.items[0]?.estado).toBe('pendiente');
    expect(activos.items[0]?.avisoAntesMin).toBe(10);
  });

  it('CA-16 — rellena el instante de un pendiente legado con la zona de la empresa', async () => {
    const id = await crearNota(tenant, contacto, ana, 'Legado', {
      programadoDia: '2026-12-01',
      programadoHora: '10:00',
    });
    const doc = await ContactNote.findById(id).lean();
    expect(doc?.recordatorioAt ?? null).toBeNull();

    expect((await processOrganizadorSweep()).rellenados).toBe(1);
    const relleno = await ContactNote.findById(new Types.ObjectId(id)).lean();
    // Zona por defecto del tenant: America/Bogota.
    expect(relleno?.recordatorioAt?.toISOString()).toBe('2026-12-01T15:00:00.000Z');
  });
});
