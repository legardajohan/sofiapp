import { describe, it, expect, beforeEach } from 'vitest';
import type { Types } from 'mongoose';
import { seedEstados } from '../../seed/seed-estados.js';
import { ContactNote } from '../contact-note/contact-note.model.js';
import {
  cerrarPendiente,
  generarReportePendientes,
  listPendientes,
  reabrirPendiente,
} from './pendiente.service.js';
import {
  convertirEnLead,
  crearContacto,
  crearNota,
  crearTenant,
  crearUsuario,
} from './pendiente.fixtures.js';
import { leerPdf, textoDePdf } from './pendiente.test-utils.js';

describe('HU-PDF-01 — aislamiento multi-tenant de pendientes', () => {
  let tenantA: Types.ObjectId;
  let tenantB: Types.ObjectId;
  let autorA: string;
  let autorB: string;
  let notaB: string;
  let cerradaB: string;
  const programadoDia = '2026-10-15';

  beforeEach(async () => {
    tenantA = await crearTenant('EmpresaA');
    tenantB = await crearTenant('EmpresaB');
    await seedEstados(tenantA);
    await seedEstados(tenantB);
    autorA = await crearUsuario(tenantA, 'Autora A');
    autorB = await crearUsuario(tenantB, 'Autor B');

    const contactoA = await crearContacto(tenantA, { nombre: 'Contacto A' });
    await convertirEnLead(tenantA, contactoA, autorA, { nombre: 'Lead A', estado: 'nuevo' });
    await crearNota(tenantA, contactoA, autorA, 'Pendiente de A', { programadoDia });

    const contactoB = await crearContacto(tenantB, { nombre: 'Contacto B' });
    await convertirEnLead(tenantB, contactoB, autorB, { nombre: 'Lead B', estado: 'nuevo' });
    notaB = await crearNota(tenantB, contactoB, autorB, 'Pendiente de B', { programadoDia });
    cerradaB = await crearNota(tenantB, contactoB, autorB, 'Cerrado de B', {
      programadoDia,
      estado: 'cerrado',
    });
  });

  it('el listado de A no contiene notas, contactos, leads ni autores de B', async () => {
    const res = await listPendientes(tenantA, 'abierto', 1, 50);
    expect(res.total).toBe(1);
    const serializado = JSON.stringify(res);
    expect(serializado).toContain('Pendiente de A');
    expect(serializado).not.toContain('Pendiente de B');
    expect(serializado).not.toContain('Lead B');
    expect(serializado).not.toContain('Autor B');
  });

  it('CA19: el historial de A no lista cerrados de B', async () => {
    const res = await listPendientes(tenantA, 'cerrado', 1, 50);
    expect(res.total).toBe(0);
  });

  it('CA19: cerrar o reabrir desde A un pendiente de B → 404 y B no cambia', async () => {
    await expect(cerrarPendiente(tenantA, autorA, notaB)).rejects.toMatchObject({ statusCode: 404 });
    await expect(reabrirPendiente(tenantA, autorA, cerradaB)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect((await ContactNote.findById(notaB).lean())?.estadoPendiente).toBe('abierto');
    expect((await ContactNote.findById(cerradaB).lean())?.estadoPendiente).toBe('cerrado');
  });

  it('el PDF de A no contiene datos de B y lleva el nombre de A', async () => {
    const { documento } = await generarReportePendientes(String(tenantA), autorA, {
      desde: '2026-10-01',
      hasta: '2026-10-31',
      tz: 'America/Bogota',
    });
    const texto = textoDePdf(await leerPdf(documento));
    expect(texto).toContain('EmpresaA');
    expect(texto).toContain('Pendiente de A');
    expect(texto).not.toContain('EmpresaB');
    expect(texto).not.toContain('de B');
    expect(texto).not.toContain('Lead B');
  });

  it('un tenant sin pendientes en el rango recibe 404 aunque otro tenant sí tenga', async () => {
    const tenantC = await crearTenant('EmpresaC');
    const autorC = await crearUsuario(tenantC, 'Autor C');
    await expect(
      generarReportePendientes(String(tenantC), autorC, {
        desde: '2026-10-01',
        hasta: '2026-10-31',
        tz: 'America/Bogota',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
