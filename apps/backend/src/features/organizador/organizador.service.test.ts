import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import type { CerrarBody } from './organizador.validation.js';

vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));

const { ContactNote } = await import('../contact-note/contact-note.model.js');
const { Cliente } = await import('../cliente/cliente.model.js');
const { createNota, updateNota } = await import('../contact-note/contact-note.service.js');
const { PendienteEvento, MotivoCierre } = await import('./organizador.model.js');
const svc = await import('./organizador.service.js');
const { crearContacto, crearTenant, crearUsuario } = await import('../pendiente/pendiente.fixtures.js');
const { crearRecordatorio, crearEtiqueta, EN_UNA_HORA, HACE_UNA_HORA } = await import(
  './organizador.fixtures.js'
);

const MANANA = (): string => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function cierreBase(version: string | null): CerrarBody {
  return { motivoKeys: [], motivoIds: [], tagIds: [], version };
}

describe('HU-PDF-02 — servicio del Organizador', () => {
  let tenant: Types.ObjectId;
  let ana: string;
  let beto: string;
  let contacto: string;

  beforeEach(async () => {
    tenant = await crearTenant('Academia');
    ana = await crearUsuario(tenant, 'Ana');
    beto = await crearUsuario(tenant, 'Beto');
    contacto = await crearContacto(tenant, { nombre: 'Luis' });
  });

  describe('CA-02 — preferencia', () => {
    it('sin documento está activada; se guarda y es por usuario', async () => {
      expect(await svc.getPreferencia(tenant, ana)).toEqual({ activo: true });
      expect(await svc.setPreferencia(tenant, ana, false)).toEqual({ activo: false });
      expect(await svc.getPreferencia(tenant, ana)).toEqual({ activo: false });
      expect(await svc.getPreferencia(tenant, beto)).toEqual({ activo: true });
      await svc.setPreferencia(tenant, ana, true);
      expect(await svc.getPreferencia(tenant, ana)).toEqual({ activo: true });
    });
  });

  describe('CA-03 / CA-12 — sincronía con las notas', () => {
    it('una nota pendiente con hora calcula su recordatorio; sin hora, a las 08:00', async () => {
      const conHora = await createNota(tenant, ana, contacto, 'Llamar', {
        pendiente: true,
        programadoDia: '2026-12-01',
        programadoHora: '10:30',
        tz: 'America/Bogota',
      });
      const sinHora = await createNota(tenant, ana, contacto, 'Enviar info', {
        pendiente: true,
        programadoDia: '2026-12-01',
        tz: 'America/Bogota',
      });
      const a = await ContactNote.findById(conHora.id).lean();
      const b = await ContactNote.findById(sinHora.id).lean();
      expect(a?.recordatorioAt?.toISOString()).toBe('2026-12-01T15:30:00.000Z');
      expect(b?.recordatorioAt?.toISOString()).toBe('2026-12-01T13:00:00.000Z');
      expect(await PendienteEvento.countDocuments({ notaId: a?._id, tipo: 'programado' })).toBe(1);
    });

    it('HU-PDF-02 A1 — «Recordarme 10 minutos antes» adelanta el aviso y sobrevive al posponer', async () => {
      const nota = await createNota(tenant, ana, contacto, 'Llamar', {
        pendiente: true,
        programadoDia: '2026-12-01',
        programadoHora: '10:30',
        avisoAntesMin: 10,
        tz: 'America/Bogota',
      });
      expect(nota.avisoAntesMin).toBe(10);
      const doc = await ContactNote.findById(nota.id).lean();
      expect(doc?.recordatorioAt?.toISOString()).toBe('2026-12-01T15:30:00.000Z');
      expect(doc?.avisoAt?.toISOString()).toBe('2026-12-01T15:20:00.000Z');

      // Cambiar solo la anticipación rearma el aviso en el mismo documento.
      await updateNota(tenant, ana, contacto, nota.id, { avisoAntesMin: 5, tz: 'America/Bogota' });
      const cambiada = await ContactNote.findById(nota.id).lean();
      expect(cambiada?.avisoAt?.toISOString()).toBe('2026-12-01T15:25:00.000Z');
      expect(cambiada?.recordatorioAt?.toISOString()).toBe('2026-12-01T15:30:00.000Z');

      const pospuesto = await svc.posponer(tenant, ana, nota.id, {
        motivo: 'Pidió otra hora',
        nuevoDia: MANANA(),
        nuevaHora: '09:00',
        tz: 'America/Bogota',
        tagIds: [],
        version: cambiada!.recordatorioAt!.toISOString(),
      });
      expect(
        new Date(pospuesto.recordatorioAt!).getTime() - new Date(pospuesto.avisoAt!).getTime(),
      ).toBe(5 * 60_000);
    });

    it('una nota sin pendiente no genera recordatorio', async () => {
      const nota = await createNota(tenant, ana, contacto, 'Nota normal');
      const doc = await ContactNote.findById(nota.id).lean();
      expect(doc?.recordatorioAt ?? null).toBeNull();
      expect(await PendienteEvento.countDocuments({ notaId: doc?._id })).toBe(0);
    });

    it('reprogramar la nota actualiza el mismo recordatorio, rearma el aviso y no duplica', async () => {
      const nota = await createNota(tenant, ana, contacto, 'Llamar', {
        pendiente: true,
        programadoDia: '2026-12-01',
        programadoHora: '10:00',
        tz: 'America/Bogota',
      });
      await ContactNote.updateOne({ _id: nota.id }, { $set: { notificadoPara: new Date() } });

      await updateNota(tenant, ana, contacto, nota.id, {
        programadoHora: '11:00',
        tz: 'America/Bogota',
      });

      const docs = await ContactNote.find({ clienteId: new Types.ObjectId(contacto) }).lean();
      expect(docs).toHaveLength(1);
      expect(docs[0]?.recordatorioAt?.toISOString()).toBe('2026-12-01T16:00:00.000Z');
      expect(docs[0]?.notificadoPara ?? null).toBeNull();
      expect(
        await PendienteEvento.countDocuments({ notaId: docs[0]?._id, tipo: 'reprogramado' }),
      ).toBe(1);
    });

    it('quitar el pendiente limpia el recordatorio y lo saca del Organizador', async () => {
      const nota = await createNota(tenant, ana, contacto, 'Llamar', {
        pendiente: true,
        programadoDia: '2026-12-01',
        tz: 'America/Bogota',
      });
      await updateNota(tenant, ana, contacto, nota.id, { pendiente: false });
      const doc = await ContactNote.findById(nota.id).lean();
      expect(doc?.recordatorioAt ?? null).toBeNull();
      const lista = await svc.listOrganizador(tenant, { page: 1, limit: 20 });
      expect(lista.total).toBe(0);
    });
  });

  describe('CA-03 / CA-04 — activos', () => {
    it('solo los vencidos abiertos del autor', async () => {
      const vencidaAna = await crearRecordatorio(tenant, contacto, ana, 'Vencida', {
        recordatorioAt: HACE_UNA_HORA(),
      });
      await crearRecordatorio(tenant, contacto, ana, 'Futura', { recordatorioAt: EN_UNA_HORA() });
      await crearRecordatorio(tenant, contacto, beto, 'De Beto', { recordatorioAt: HACE_UNA_HORA() });
      await crearRecordatorio(tenant, contacto, ana, 'Cerrada', {
        recordatorioAt: HACE_UNA_HORA(),
        estado: 'cerrado',
      });

      const activos = await svc.listActivos(tenant, ana);
      expect(activos.total).toBe(1);
      expect(activos.items[0]?.id).toBe(vencidaAna);
      expect(activos.items[0]?.estado).toBe('vencido');
      expect(activos.items[0]?.descripcion).toBe('Vencida');
      expect(activos.items[0]?.cliente.nombre).toBe('Luis');
    });

    it('el listado filtra por estado y los conteos cuadran', async () => {
      await crearRecordatorio(tenant, contacto, ana, 'V', { recordatorioAt: HACE_UNA_HORA() });
      await crearRecordatorio(tenant, contacto, ana, 'P', { recordatorioAt: EN_UNA_HORA() });
      await crearRecordatorio(tenant, contacto, ana, 'PP', {
        recordatorioAt: EN_UNA_HORA(),
        vecesPospuesto: 1,
      });
      await crearRecordatorio(tenant, contacto, beto, 'C', {
        recordatorioAt: HACE_UNA_HORA(),
        estado: 'cerrado',
      });

      expect(await svc.conteosOrganizador(tenant, {})).toEqual({
        pendiente: 1,
        vencido: 1,
        pospuesto: 1,
        cerrado: 1,
      });
      const pospuestos = await svc.listOrganizador(tenant, { estado: 'pospuesto', page: 1, limit: 20 });
      expect(pospuestos.data.map((p) => p.descripcion)).toEqual(['PP']);
      const deBeto = await svc.listOrganizador(tenant, { responsableId: beto, page: 1, limit: 20 });
      expect(deBeto.data.map((p) => p.descripcion)).toEqual(['C']);
    });
  });

  describe('CA-05 / CA-06 / CA-07 — cerrar', () => {
    it('cierra con motivos predefinidos, otros y comentario; registra el evento', async () => {
      const at = HACE_UNA_HORA();
      const id = await crearRecordatorio(tenant, contacto, ana, 'Llamar', { recordatorioAt: at });

      const res = await svc.cerrarConMotivo(tenant, beto, id, {
        ...cierreBase(at.toISOString()),
        motivoKeys: ['contactado', 'venta'],
        otro: { texto: 'Pagó en efectivo' },
        comentario: 'Todo ok',
      });

      expect(res.estado).toBe('cerrado');
      expect(res.cerradoPor?.id).toBe(beto);
      const doc = await ContactNote.findById(id).lean();
      expect(doc?.estadoPendiente).toBe('cerrado');
      expect(doc?.cerradoAt).toBeInstanceOf(Date);

      const ev = await PendienteEvento.findOne({ notaId: doc?._id, tipo: 'cerrado' }).lean();
      expect(ev?.motivos.map((m) => m.nombre)).toEqual([
        'Cliente contactado exitosamente',
        'Venta concretada',
      ]);
      expect(ev?.otroMotivo).toBe('Pagó en efectivo');
      expect(ev?.comentario).toBe('Todo ok');
      expect(String(ev?.actorId)).toBe(beto);
      // «Otros motivos» no entra al catálogo.
      expect(await MotivoCierre.countDocuments({})).toBe(0);
      expect((await svc.listActivos(tenant, ana)).total).toBe(0);
    });

    it('motivos personalizados: se crean una vez y se reutilizan; duplicado → 409', async () => {
      const motivo = await svc.crearMotivo(tenant, ana, 'Agendó visita');
      await expect(svc.crearMotivo(tenant, beto, 'agendó VISITA')).rejects.toMatchObject({
        statusCode: 409,
      });
      await expect(svc.crearMotivo(tenant, beto, 'Venta concretada')).rejects.toMatchObject({
        statusCode: 409,
      });
      expect((await svc.listMotivos(tenant)).personalizados).toEqual([motivo]);

      const at = HACE_UNA_HORA();
      const id = await crearRecordatorio(tenant, contacto, ana, 'Llamar', { recordatorioAt: at });
      await svc.cerrarConMotivo(tenant, ana, id, {
        ...cierreBase(at.toISOString()),
        motivoIds: [motivo.id],
      });
      const ev = await PendienteEvento.findOne({ tipo: 'cerrado' }).lean();
      expect(ev?.motivos[0]).toMatchObject({ key: null, nombre: 'Agendó visita' });
    });

    it('un motivo personalizado inexistente → 404 y no cierra', async () => {
      const at = HACE_UNA_HORA();
      const id = await crearRecordatorio(tenant, contacto, ana, 'Llamar', { recordatorioAt: at });
      await expect(
        svc.cerrarConMotivo(tenant, ana, id, {
          ...cierreBase(at.toISOString()),
          motivoIds: [new Types.ObjectId().toString()],
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect((await ContactNote.findById(id).lean())?.estadoPendiente).toBe('abierto');
    });

    it('CA-14 — doble cierre o versión vieja → 409', async () => {
      const at = HACE_UNA_HORA();
      const id = await crearRecordatorio(tenant, contacto, ana, 'Llamar', { recordatorioAt: at });
      const body: CerrarBody = { ...cierreBase(at.toISOString()), motivoKeys: ['venta'] };
      const [a, b] = await Promise.allSettled([
        svc.cerrarConMotivo(tenant, ana, id, body),
        svc.cerrarConMotivo(tenant, ana, id, body),
      ]);
      const estados = [a, b].map((r) => r.status).sort();
      expect(estados).toEqual(['fulfilled', 'rejected']);
      const rechazo = [a, b].find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rechazo.reason).toMatchObject({ statusCode: 409 });
      expect(await PendienteEvento.countDocuments({ tipo: 'cerrado' })).toBe(1);

      const otro = await crearRecordatorio(tenant, contacto, ana, 'Otro', { recordatorioAt: at });
      await expect(
        svc.cerrarConMotivo(tenant, ana, otro, {
          ...cierreBase(new Date(at.getTime() - 1000).toISOString()),
          motivoKeys: ['venta'],
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('CA-08 / CA-09 / CA-11 — posponer', () => {
    it('una fecha pasada → 400', async () => {
      const at = HACE_UNA_HORA();
      const id = await crearRecordatorio(tenant, contacto, ana, 'Llamar', { recordatorioAt: at });
      await expect(
        svc.posponer(tenant, ana, id, {
          motivo: 'No contestó',
          nuevoDia: '2020-01-01',
          nuevaHora: '10:00',
          tz: 'America/Bogota',
          tagIds: [],
          version: at.toISOString(),
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('pospone dos veces, vuelve a vencer y el historial lo cuenta todo', async () => {
      const at = HACE_UNA_HORA();
      const id = await crearRecordatorio(tenant, contacto, ana, 'Llamar', {
        recordatorioAt: at,
        notificadoPara: at,
      });

      const p1 = await svc.posponer(tenant, ana, id, {
        motivo: 'No contestó',
        nuevoDia: MANANA(),
        nuevaHora: '09:00',
        tz: 'America/Bogota',
        tagIds: [],
        version: at.toISOString(),
      });
      expect(p1.estado).toBe('pospuesto');
      expect(p1.vecesPospuesto).toBe(1);
      const doc1 = await ContactNote.findById(id).lean();
      expect(doc1?.programadoDia).toBe(MANANA());
      expect(doc1?.programadoHora).toBe('09:00');
      expect(doc1?.notificadoPara ?? null).toBeNull();
      expect((await svc.listActivos(tenant, ana)).total).toBe(0);

      const p2 = await svc.posponer(tenant, beto, id, {
        motivo: 'Pidió más tiempo',
        nuevoDia: MANANA(),
        nuevaHora: '15:00',
        tz: 'America/Bogota',
        tagIds: [],
        version: p1.version,
      });
      expect(p2.vecesPospuesto).toBe(2);

      // Llega la nueva hora: vuelve a VENCIDO (CA-09).
      const futuro = new Date(new Date(p2.recordatorioAt!).getTime() + 1000);
      expect((await svc.listActivos(tenant, ana, futuro)).items[0]?.estado).toBe('vencido');

      const historial = await svc.historialPendiente(tenant, id);
      const pospuestos = historial.filter((e) => e.tipo === 'pospuesto');
      expect(pospuestos).toHaveLength(2);
      expect(pospuestos[0]).toMatchObject({
        motivo: 'No contestó',
        actor: { id: ana, nombre: 'Ana' },
        antes: { hora: '10:00' },
        despues: { dia: MANANA(), hora: '09:00' },
      });
      expect(pospuestos[1]).toMatchObject({
        motivo: 'Pidió más tiempo',
        actor: { id: beto },
        antes: { hora: '09:00' },
        despues: { hora: '15:00' },
      });
    });
  });

  describe('CA-10 — etiquetas', () => {
    it('se añaden al contacto sin quitar las existentes ni duplicar', async () => {
      const previa = await crearEtiqueta(tenant, 'VIP');
      const nueva = await crearEtiqueta(tenant, 'Interesado');
      await Cliente.updateOne({ _id: contacto }, { $set: { tagIds: [new Types.ObjectId(previa)] } });

      const at = HACE_UNA_HORA();
      const id = await crearRecordatorio(tenant, contacto, ana, 'Llamar', { recordatorioAt: at });
      await svc.cerrarConMotivo(tenant, ana, id, {
        ...cierreBase(at.toISOString()),
        motivoKeys: ['venta'],
        tagIds: [previa, nueva],
      });

      const cliente = await Cliente.findById(contacto).lean();
      expect((cliente?.tagIds ?? []).map(String).sort()).toEqual([previa, nueva].sort());
      const [ev] = await svc.historialPendiente(tenant, id).then((h) => h.filter((e) => e.tipo === 'cerrado'));
      expect(ev?.tags.map((t) => t.nombre).sort()).toEqual(['Interesado', 'VIP']);
    });

    it('una etiqueta inexistente en el tenant → 422 y no se cierra', async () => {
      const at = HACE_UNA_HORA();
      const id = await crearRecordatorio(tenant, contacto, ana, 'Llamar', { recordatorioAt: at });
      await expect(
        svc.cerrarConMotivo(tenant, ana, id, {
          ...cierreBase(at.toISOString()),
          motivoKeys: ['venta'],
          tagIds: [new Types.ObjectId().toString()],
        }),
      ).rejects.toMatchObject({ statusCode: 422 });
      expect((await ContactNote.findById(id).lean())?.estadoPendiente).toBe('abierto');
    });
  });
});
