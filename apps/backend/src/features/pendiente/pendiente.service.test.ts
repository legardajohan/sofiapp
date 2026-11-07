import { describe, it, expect, beforeEach } from 'vitest';
import type { Types } from 'mongoose';
import { seedEstados } from '../../seed/seed-estados.js';
import { AuditEvent } from '../audit/audit.model.js';
import { ContactNote } from '../contact-note/contact-note.model.js';
import {
  cerrarPendiente,
  generarReportePendientes,
  listPendientes,
  reabrirPendiente,
} from './pendiente.service.js';
import { diaEnZona, diasEnRango, esDiaValido, rangoDiasAInstantes } from './pendiente.fechas.js';
import {
  convertirEnLead,
  crearContacto,
  crearNota,
  crearTenant,
  crearUsuario,
} from './pendiente.fixtures.js';
import { leerPdf, textoDePdf } from './pendiente.test-utils.js';


describe('HU-PDF-01 — pendiente.fechas', () => {
  it('valida días civiles reales', () => {
    expect(esDiaValido('2026-02-28')).toBe(true);
    expect(esDiaValido('2026-02-30')).toBe(false);
    expect(esDiaValido('2026-2-3')).toBe(false);
  });

  it('cuenta días con ambos extremos incluidos', () => {
    expect(diasEnRango('2026-10-01', '2026-10-01')).toBe(1);
    expect(diasEnRango('2026-10-01', '2026-10-31')).toBe(31);
    expect(diasEnRango('2026-10-02', '2026-10-01')).toBe(0);
  });

  it('convierte el rango a instantes en la zona del usuario', () => {
    const { inicio, fin } = rangoDiasAInstantes('2026-10-01', '2026-10-01', 'America/Bogota');
    // Bogotá es UTC-5 todo el año.
    expect(inicio.toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(fin.toISOString()).toBe('2026-10-02T05:00:00.000Z');
  });

  it('RN10: el día civil depende de la zona', () => {
    const instante = new Date('2026-10-02T03:00:00Z');
    expect(diaEnZona(instante, 'America/Bogota')).toBe('2026-10-01');
    expect(diaEnZona(instante, 'Europe/Madrid')).toBe('2026-10-02');
  });
});

describe('HU-PDF-01 — listPendientes', () => {
  let tenant: Types.ObjectId;
  let autor: string;

  beforeEach(async () => {
    await ContactNote.syncIndexes();
    tenant = await crearTenant('Academia Alfa');
    await seedEstados(tenant);
    autor = await crearUsuario(tenant, 'Ana Gómez');
  });

  it('CA2: una nota sin pendiente no aparece', async () => {
    const contacto = await crearContacto(tenant, { nombre: 'Luis' });
    await crearNota(tenant, contacto, autor, 'Solo una nota', { pendiente: false });

    const res = await listPendientes(tenant, 'abierto', 1, 20);
    expect(res.total).toBe(0);
    expect(res.data).toEqual([]);
  });

  it('CA15 / RN11: ordena por día programado, luego hora (todo el día primero), luego creación', async () => {
    const contacto = await crearContacto(tenant, { nombre: 'Luis' });
    await crearNota(tenant, contacto, autor, 'día 2 · 15:00', { programadoDia: '2026-10-02', programadoHora: '15:00' });
    await crearNota(tenant, contacto, autor, 'día 1 · 09:00', { programadoDia: '2026-10-01', programadoHora: '09:00' });
    await crearNota(tenant, contacto, autor, 'día 2 · todo el día', { programadoDia: '2026-10-02' });
    await crearNota(tenant, contacto, autor, 'día 2 · 08:30', { programadoDia: '2026-10-02', programadoHora: '08:30' });

    const p1 = await listPendientes(tenant, 'abierto', 1, 2);
    const p2 = await listPendientes(tenant, 'abierto', 2, 2);
    expect(p1.total).toBe(4);
    expect([...p1.data, ...p2.data].map((p) => p.descripcion)).toEqual([
      'día 1 · 09:00',
      'día 2 · todo el día',
      'día 2 · 08:30',
      'día 2 · 15:00',
    ]);
  });

  it('CA1: con lead, la tarjeta trae los datos del lead, su etapa, su programación y el autor', async () => {
    const contacto = await crearContacto(tenant, { nombre: 'Contacto', canalOrigen: 'instagram' });
    await convertirEnLead(tenant, contacto, autor, {
      nombre: 'María Lead',
      estado: 'nuevo',
      correo: 'maria@lead.com',
    });
    await crearNota(tenant, contacto, autor, 'Llamar el lunes', {
      programadoDia: '2026-10-05',
      programadoHora: '10:00',
    });

    const [p] = (await listPendientes(tenant, 'abierto', 1, 20)).data;
    expect(p).toMatchObject({
      descripcion: 'Llamar el lunes',
      clienteId: contacto,
      programadoDia: '2026-10-05',
      programadoHora: '10:00',
      estado: 'abierto',
      cerradoAt: null,
      cerradoPor: null,
      autor: { nombre: 'Ana Gómez' },
      lead: {
        nombre: 'María Lead',
        correo: 'maria@lead.com',
        canalOrigen: 'instagram',
        etapa: { key: 'nuevo' },
      },
    });
  });

  it('sin lead: datos del contacto y etapa null («Sin convertir»)', async () => {
    const contacto = await crearContacto(tenant, { nombre: 'Pedro', correo: 'pedro@c.com' });
    await crearNota(tenant, contacto, autor, 'Enviar brochure');

    const [p] = (await listPendientes(tenant, 'abierto', 1, 20)).data;
    expect(p?.lead.leadId).toBeNull();
    expect(p?.lead.nombre).toBe('Pedro');
    expect(p?.lead.correo).toBe('pedro@c.com');
    expect(p?.lead.etapa).toBeNull();
  });
});

describe('HU-PDF-01 A1 — cerrar, historial y reabrir', () => {
  let tenant: Types.ObjectId;
  let autor: string;
  let cerrador: string;
  let contacto: string;

  beforeEach(async () => {
    tenant = await crearTenant('Academia Alfa');
    autor = await crearUsuario(tenant, 'Ana');
    cerrador = await crearUsuario(tenant, 'Beto');
    contacto = await crearContacto(tenant, { nombre: 'Luis' });
  });

  it('CA16: cerrar lo saca de abiertos, lo archiva con quién y cuándo, y se audita', async () => {
    const id = await crearNota(tenant, contacto, autor, 'Llamar', { programadoDia: '2026-10-05' });

    const cerrado = await cerrarPendiente(tenant, cerrador, id);
    expect(cerrado.estado).toBe('cerrado');
    expect(cerrado.cerradoAt).not.toBeNull();
    expect(cerrado.cerradoPor).toEqual({ id: cerrador, nombre: 'Beto' });

    expect((await listPendientes(tenant, 'abierto', 1, 20)).total).toBe(0);
    const historial = await listPendientes(tenant, 'cerrado', 1, 20);
    expect(historial.data.map((p) => p.id)).toEqual([id]);

    const evento = await AuditEvent.findOne({ accion: 'contact-note.pendiente-cerrar' }).lean();
    expect(evento?.despues).toMatchObject({ estadoPendiente: 'cerrado' });
    expect(JSON.stringify(evento)).not.toContain('Llamar');
  });

  it('RN12: cerrar uno ya cerrado → 409; uno que no existe → 404', async () => {
    const id = await crearNota(tenant, contacto, autor, 'Algo', { estado: 'cerrado' });
    await expect(cerrarPendiente(tenant, cerrador, id)).rejects.toMatchObject({ statusCode: 409 });

    const nota = await crearNota(tenant, contacto, autor, 'No es pendiente', { pendiente: false });
    await expect(cerrarPendiente(tenant, cerrador, nota)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('CA17: el historial va del más recién cerrado al más antiguo', async () => {
    const viejo = await crearNota(tenant, contacto, autor, 'viejo', {
      estado: 'cerrado',
      cerradoAt: new Date('2026-10-01T12:00:00Z'),
    });
    const nuevo = await crearNota(tenant, contacto, autor, 'nuevo', {
      estado: 'cerrado',
      cerradoAt: new Date('2026-10-03T12:00:00Z'),
    });
    const historial = await listPendientes(tenant, 'cerrado', 1, 20);
    expect(historial.data.map((p) => p.id)).toEqual([nuevo, viejo]);
  });

  it('CA17: reabrir lo devuelve a abiertos con su programación intacta; reabrir uno abierto → 409', async () => {
    const id = await crearNota(tenant, contacto, autor, 'Volver', {
      programadoDia: '2026-10-07',
      programadoHora: '11:15',
    });
    await cerrarPendiente(tenant, cerrador, id);

    const reabierto = await reabrirPendiente(tenant, cerrador, id);
    expect(reabierto).toMatchObject({
      estado: 'abierto',
      cerradoAt: null,
      cerradoPor: null,
      programadoDia: '2026-10-07',
      programadoHora: '11:15',
    });
    expect((await listPendientes(tenant, 'cerrado', 1, 20)).total).toBe(0);
    await expect(reabrirPendiente(tenant, cerrador, id)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('HU-PDF-01 A1 — PDF por día programado', () => {
  let tenant: Types.ObjectId;
  let autor: string;
  let contacto: string;
  const rango = { desde: '2026-10-01', hasta: '2026-10-31', tz: 'America/Bogota' };

  beforeEach(async () => {
    tenant = await crearTenant('Academia Alfa');
    await seedEstados(tenant);
    autor = await crearUsuario(tenant, 'Ana Gómez');
    contacto = await crearContacto(tenant, { nombre: 'Luis' });
  });

  it('CA18: filtra por día programado, no por creación, e incluye abiertos y cerrados', async () => {
    // Creado fuera del rango pero programado dentro → entra.
    await crearNota(tenant, contacto, autor, 'dentro', {
      createdAt: new Date('2026-09-20T12:00:00Z'),
      programadoDia: '2026-10-10',
    });
    await crearNota(tenant, contacto, autor, 'cerrado dentro', {
      programadoDia: '2026-10-31',
      estado: 'cerrado',
    });
    // Creado dentro del rango pero programado fuera → no entra.
    await crearNota(tenant, contacto, autor, 'fuera', {
      createdAt: new Date('2026-10-15T12:00:00Z'),
      programadoDia: '2026-11-01',
    });

    const { documento, filename } = await generarReportePendientes(String(tenant), autor, rango);
    const pdf = await leerPdf(documento);
    expect(filename).toBe('Pendientes_2026-10-01_a_2026-10-31.pdf');
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const texto = textoDePdf(pdf);
    expect(texto).toContain('dentro');
    expect(texto).toContain('cerrado dentro');
    expect(texto).not.toContain('fuera');
    expect(texto).toContain('Total de pendientes: 2 (1 abiertos, 1 cerrados)');
  });

  it('CA5: un rango sin pendientes programados lanza 404 con el mensaje de la historia', async () => {
    await crearNota(tenant, contacto, autor, 'otro mes', { programadoDia: '2026-08-10' });

    await expect(generarReportePendientes(String(tenant), autor, rango)).rejects.toMatchObject({
      statusCode: 404,
      message: 'No hay pendientes en el rango seleccionado.',
    });
  });
});
