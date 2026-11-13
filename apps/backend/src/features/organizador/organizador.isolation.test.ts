import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Types } from 'mongoose';

vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

const { ContactNote } = await import('../contact-note/contact-note.model.js');
const svc = await import('./organizador.service.js');
const { crearContacto, crearTenant, crearUsuario } = await import('../pendiente/pendiente.fixtures.js');
const { crearRecordatorio, crearEtiqueta, HACE_UNA_HORA } = await import('./organizador.fixtures.js');

/**
 * CA-15 — aislamiento multi-tenant y por usuario del Organizador. Con dos empresas A y B (y dos
 * usuarios en A), nada de B se lee ni se modifica desde A, y lo personal (activos, preferencia) de
 * un usuario no lo ve otro del mismo tenant.
 */
describe('HU-PDF-02 — aislamiento del Organizador', () => {
  let tenantA: Types.ObjectId;
  let tenantB: Types.ObjectId;
  let anaA: string;
  let betoA: string;
  let autorB: string;
  let contactoA: string;
  let notaB: string;
  let versionB: string;

  beforeEach(async () => {
    tenantA = await crearTenant('EmpresaA');
    tenantB = await crearTenant('EmpresaB');
    anaA = await crearUsuario(tenantA, 'Ana');
    betoA = await crearUsuario(tenantA, 'Beto');
    autorB = await crearUsuario(tenantB, 'Autor B');
    contactoA = await crearContacto(tenantA, { nombre: 'Contacto A' });
    const contactoB = await crearContacto(tenantB, { nombre: 'Contacto B' });

    await crearRecordatorio(tenantA, contactoA, anaA, 'Pendiente de A', {
      recordatorioAt: HACE_UNA_HORA(),
    });
    const at = HACE_UNA_HORA();
    versionB = at.toISOString();
    notaB = await crearRecordatorio(tenantB, contactoB, autorB, 'Pendiente de B', {
      recordatorioAt: at,
    });
    await svc.posponer(tenantB, autorB, notaB, {
      motivo: 'Motivo de B',
      nuevoDia: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      nuevaHora: '10:00',
      tz: 'America/Bogota',
      tagIds: [],
      version: versionB,
    });
    const doc = await ContactNote.findById(notaB).lean();
    versionB = doc!.recordatorioAt!.toISOString();
    await svc.crearMotivo(tenantB, autorB, 'Motivo exclusivo de B');
    await svc.setPreferencia(tenantB, autorB, false);
  });

  it('listado, conteos, activos y feed de A no traen nada de B', async () => {
    const lista = await svc.listOrganizador(tenantA, { page: 1, limit: 50 });
    expect(lista.data.map((p) => p.descripcion)).toEqual(['Pendiente de A']);
    const conteos = await svc.conteosOrganizador(tenantA, {});
    expect(conteos.pospuesto).toBe(0);
    const actividad = await svc.listActividad(tenantA, { page: 1, limit: 50 });
    expect(actividad.data.some((e) => e.motivo === 'Motivo de B')).toBe(false);
    expect((await svc.listActivos(tenantA, autorB)).total).toBe(0);
  });

  it('historial, cerrar y posponer un pendiente de B desde A → 404 y B intacto', async () => {
    await expect(svc.historialPendiente(tenantA, notaB)).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      svc.cerrarConMotivo(tenantA, anaA, notaB, {
        motivoKeys: ['venta'],
        motivoIds: [],
        tagIds: [],
        version: versionB,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      svc.posponer(tenantA, anaA, notaB, {
        motivo: 'Intento ajeno',
        nuevoDia: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
        nuevaHora: '10:00',
        tz: 'America/Bogota',
        tagIds: [],
        version: versionB,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    const intacta = await ContactNote.findById(notaB).lean();
    expect(intacta?.estadoPendiente).toBe('abierto');
    expect(intacta?.vecesPospuesto).toBe(1);
    expect(intacta?.recordatorioAt?.toISOString()).toBe(versionB);
  });

  it('motivos y etiquetas de B no se pueden usar desde A', async () => {
    expect((await svc.listMotivos(tenantA)).personalizados).toEqual([]);
    const motivoB = (await svc.listMotivos(tenantB)).personalizados[0]!;
    const tagB = await crearEtiqueta(tenantB, 'Etiqueta B');
    const at = HACE_UNA_HORA();
    const notaA = await crearRecordatorio(tenantA, contactoA, anaA, 'Otra de A', { recordatorioAt: at });

    await expect(
      svc.cerrarConMotivo(tenantA, anaA, notaA, {
        motivoKeys: [],
        motivoIds: [motivoB.id],
        tagIds: [],
        version: at.toISOString(),
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      svc.cerrarConMotivo(tenantA, anaA, notaA, {
        motivoKeys: ['venta'],
        motivoIds: [],
        tagIds: [tagB],
        version: at.toISOString(),
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect((await ContactNote.findById(notaA).lean())?.estadoPendiente).toBe('abierto');
  });

  it('activos y preferencia son del usuario del token', async () => {
    expect((await svc.listActivos(tenantA, anaA)).total).toBe(1);
    expect((await svc.listActivos(tenantA, betoA)).total).toBe(0);
    await svc.setPreferencia(tenantA, anaA, false);
    expect(await svc.getPreferencia(tenantA, betoA)).toEqual({ activo: true });
    // La preferencia de B (apagada) no se filtra hacia A con el mismo userId.
    expect(await svc.getPreferencia(tenantA, autorB)).toEqual({ activo: true });
    expect(await svc.getPreferencia(tenantB, autorB)).toEqual({ activo: false });
  });
});
