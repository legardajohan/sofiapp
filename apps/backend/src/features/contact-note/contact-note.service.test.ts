import { describe, it, expect, beforeEach } from 'vitest';
import type { Types } from 'mongoose';
import { AuditEvent } from '../audit/audit.model.js';
import { listPendientes } from '../pendiente/pendiente.service.js';
import {
  crearContacto,
  crearNota,
  crearTenant,
  crearUsuario,
} from '../pendiente/pendiente.fixtures.js';
import { diaEnZona } from '../pendiente/pendiente.fechas.js';
import { ContactNote } from './contact-note.model.js';
import { createNota, deleteNota, listNotas, updateNota } from './contact-note.service.js';

describe('HU-PDF-01 — notas con pendiente', () => {
  let tenant: Types.ObjectId;
  let autor: string;
  let contacto: string;

  beforeEach(async () => {
    tenant = await crearTenant('Academia');
    autor = await crearUsuario(tenant, 'Ana');
    contacto = await crearContacto(tenant, { nombre: 'Luis' });
  });

  it('CA1: crear con pendiente la deja en Notas y en Pendientes', async () => {
    const nota = await createNota(tenant, autor, contacto, 'Llamar el lunes', { pendiente: true });
    expect(nota.pendiente).toBe(true);
    expect((await listNotas(tenant, contacto, 1, 20)).data.map((n) => n.id)).toEqual([nota.id]);
    expect((await listPendientes(tenant, 'abierto', 1, 20)).data.map((p) => p.id)).toEqual([nota.id]);
  });

  it('CA2: crear sin pendiente la deja solo en Notas', async () => {
    const nota = await createNota(tenant, autor, contacto, 'Solo nota');
    expect(nota.pendiente).toBe(false);
    expect((await listNotas(tenant, contacto, 1, 20)).total).toBe(1);
    expect((await listPendientes(tenant, 'abierto', 1, 20)).total).toBe(0);
  });

  it('CA8: editar el texto actualiza la descripción del pendiente', async () => {
    const nota = await createNota(tenant, autor, contacto, 'Texto viejo', { pendiente: true });
    const editada = await updateNota(tenant, autor, contacto, nota.id, { texto: 'Texto nuevo' });
    expect(editada.texto).toBe('Texto nuevo');
    expect(editada.pendiente).toBe(true);
    expect((await listPendientes(tenant, 'abierto', 1, 20)).data[0]?.descripcion).toBe('Texto nuevo');
  });

  it('CA8: apagar el pendiente lo saca de la columna sin borrar la nota', async () => {
    const nota = await createNota(tenant, autor, contacto, 'Algo', { pendiente: true });
    const editada = await updateNota(tenant, autor, contacto, nota.id, { pendiente: false });
    expect(editada.pendiente).toBe(false);
    expect((await listPendientes(tenant, 'abierto', 1, 20)).total).toBe(0);
    expect((await listNotas(tenant, contacto, 1, 20)).total).toBe(1);
  });

  it('CA8: eliminar la nota elimina el pendiente', async () => {
    const nota = await createNota(tenant, autor, contacto, 'Algo', { pendiente: true });
    await deleteNota(tenant, autor, contacto, nota.id);
    expect((await listPendientes(tenant, 'abierto', 1, 20)).total).toBe(0);
    expect((await listNotas(tenant, contacto, 1, 20)).total).toBe(0);
  });

  it('CA9: la auditoría registra crear, editar y borrar sin el texto', async () => {
    const nota = await createNota(tenant, autor, contacto, 'SECRETO-CREAR', { pendiente: true });
    await updateNota(tenant, autor, contacto, nota.id, { texto: 'SECRETO-EDITAR' });
    await deleteNota(tenant, autor, contacto, nota.id);

    const eventos = await AuditEvent.find({ tenantId: tenant }).lean();
    expect(eventos.map((e) => e.accion).sort()).toEqual([
      'contact-note.create',
      'contact-note.delete',
      'contact-note.update',
    ]);
    const serializado = JSON.stringify(eventos);
    expect(serializado).not.toContain('SECRETO');
    const update = eventos.find((e) => e.accion === 'contact-note.update');
    expect(update?.despues).toMatchObject({ pendiente: true, textoEditado: true });
  });

  it('las notas anteriores a la historia (sin campo) cuentan como no pendientes', async () => {
    const id = await crearNota(tenant, contacto, autor, 'Vieja');
    await ContactNote.collection.updateOne(
      { _id: (await ContactNote.findById(id))!._id },
      { $unset: { pendiente: '' } },
    );
    const [nota] = (await listNotas(tenant, contacto, 1, 20)).data;
    expect(nota?.pendiente).toBe(false);
    expect((await listPendientes(tenant, 'abierto', 1, 20)).total).toBe(0);
  });

  it('CA13: crear un pendiente programado guarda día y hora', async () => {
    const nota = await createNota(tenant, autor, contacto, 'Llamar', {
      pendiente: true,
      programadoDia: '2026-12-01',
      programadoHora: '16:45',
    });
    expect(nota).toMatchObject({
      pendiente: true,
      programadoDia: '2026-12-01',
      programadoHora: '16:45',
      estadoPendiente: 'abierto',
    });
  });

  it('CA13 / RN10: sin día elegido, el pendiente es de hoy en la zona de quien escribe; sin hora, de todo el día', async () => {
    const nota = await createNota(tenant, autor, contacto, 'Hoy', {
      pendiente: true,
      tz: 'America/Bogota',
    });
    expect(nota.programadoDia).toBe(diaEnZona(new Date(), 'America/Bogota'));
    expect(nota.programadoHora).toBeNull();
  });

  it('una nota normal no lleva programación', async () => {
    const nota = await createNota(tenant, autor, contacto, 'Normal');
    expect(nota).toMatchObject({ programadoDia: null, programadoHora: null, estadoPendiente: null });
  });

  it('CA14: reprogramar cambia día y hora, y `null` quita la hora', async () => {
    const nota = await createNota(tenant, autor, contacto, 'Mover', {
      pendiente: true,
      programadoDia: '2026-12-01',
      programadoHora: '09:00',
    });
    const movida = await updateNota(tenant, autor, contacto, nota.id, { programadoDia: '2026-12-03' });
    expect(movida).toMatchObject({ programadoDia: '2026-12-03', programadoHora: '09:00' });
    const sinHora = await updateNota(tenant, autor, contacto, nota.id, { programadoHora: null });
    expect(sinHora.programadoHora).toBeNull();
  });

  it('CA14: reprogramar una nota que no es pendiente → 422', async () => {
    const nota = await createNota(tenant, autor, contacto, 'Normal');
    await expect(
      updateNota(tenant, autor, contacto, nota.id, { programadoDia: '2026-12-03' }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('RN9: quitar el interruptor borra programación y cierre; volver a encenderlo lo reabre para hoy', async () => {
    const nota = await createNota(tenant, autor, contacto, 'Ida y vuelta', {
      pendiente: true,
      programadoDia: '2026-12-01',
      programadoHora: '09:00',
    });
    const apagada = await updateNota(tenant, autor, contacto, nota.id, { pendiente: false });
    expect(apagada).toMatchObject({ programadoDia: null, programadoHora: null, estadoPendiente: null });

    const encendida = await updateNota(tenant, autor, contacto, nota.id, {
      pendiente: true,
      tz: 'America/Bogota',
    });
    expect(encendida).toMatchObject({
      estadoPendiente: 'abierto',
      programadoDia: diaEnZona(new Date(), 'America/Bogota'),
      programadoHora: null,
    });
  });
});
