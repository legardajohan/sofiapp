import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Lead } from '../lead/lead.model.js';
import { construirFiltroContacto, previewSegmento } from './campaign.segment.service.js';
import type { ISegmentoFiltros } from './campaign.types.js';

const tenantId = new Types.ObjectId();

interface ContactoSeed {
  nombre: string;
  telefono: string;
  rolContacto?: string;
  atributos?: Array<{ key: string; label: string; valor: string }>;
  marketingOptOut?: boolean;
  /** Si se indica, se crea además un lead con ese semáforo. */
  semaforoLead?: string;
}

async function sembrar(tenantId: Types.ObjectId, seed: ContactoSeed): Promise<Types.ObjectId> {
  const cliente = await createScoped(Cliente, tenantId, {
    metaUserId: `meta-${seed.telefono}`,
    telefono: seed.telefono,
    nombre: seed.nombre,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    rolContacto: seed.rolContacto,
    marketingOptOut: seed.marketingOptOut ?? false,
    atributos: (seed.atributos ?? []).map((a) => ({ ...a, sensible: false })),
  });

  if (seed.semaforoLead) {
    await createScoped(Lead, tenantId, {
      nombre: seed.nombre,
      telefono: seed.telefono,
      clienteId: cliente._id,
      origen: {
        tipo: 'conversacion',
        conversacionId: cliente._id,
        convertidoPor: new Types.ObjectId(),
        convertidoAt: new Date(),
      },
      responsableId: new Types.ObjectId(),
      estado: 'nuevo',
      semaforo: seed.semaforoLead,
    });
  }

  return cliente._id;
}

async function nombresDelSegmento(filtros: ISegmentoFiltros): Promise<string[]> {
  const { muestra } = await previewSegmento(tenantId, filtros);
  return muestra.map((c) => c.nombre ?? '').sort();
}

describe('HU-MARK-01 — constructor de segmentos', () => {
  beforeEach(async () => {
    await Cliente.deleteMany({});
    await Lead.deleteMany({});
    await Cliente.syncIndexes();

    // Un instituto en miniatura: dos estudiantes de 11, uno de 10, una institución, y una baja.
    await sembrar(tenantId, {
      nombre: 'Ana',
      telefono: '573001110001',
      rolContacto: 'estudiante',
      atributos: [{ key: 'grado', label: 'Grado', valor: '11' }],
      semaforoLead: 'verde',
    });
    await sembrar(tenantId, {
      nombre: 'Bruno',
      telefono: '573001110002',
      rolContacto: 'estudiante',
      atributos: [
        { key: 'grado', label: 'Grado', valor: '11' },
        { key: 'colegio', label: 'Colegio', valor: 'San Jose' },
      ],
      semaforoLead: 'rojo',
    });
    await sembrar(tenantId, {
      nombre: 'Carla',
      telefono: '573001110003',
      rolContacto: 'estudiante',
      atributos: [{ key: 'grado', label: 'Grado', valor: '10' }],
    });
    await sembrar(tenantId, {
      nombre: 'Colegio Norte',
      telefono: '573001110004',
      rolContacto: 'institucion',
      atributos: [{ key: 'grado', label: 'Grado', valor: '11' }],
      semaforoLead: 'verde',
    });
    await sembrar(tenantId, {
      nombre: 'Dado de baja',
      telefono: '573001110005',
      rolContacto: 'estudiante',
      atributos: [{ key: 'grado', label: 'Grado', valor: '11' }],
      marketingOptOut: true,
    });
  });

  it('filtra por «grado», que es un atributo personalizado y no una columna del modelo', async () => {
    expect(await nombresDelSegmento({ atributos: [{ key: 'grado', valores: ['11'] }] })).toEqual([
      'Ana',
      'Bruno',
      'Colegio Norte',
    ]);

    expect(await nombresDelSegmento({ atributos: [{ key: 'grado', valores: ['10'] }] })).toEqual([
      'Carla',
    ]);
  });

  it('filtra por rol de contacto (institución / estudiante), que es catálogo del tenant', async () => {
    expect(await nombresDelSegmento({ rolContacto: ['institucion'] })).toEqual(['Colegio Norte']);
    expect(await nombresDelSegmento({ rolContacto: ['estudiante'] })).toEqual([
      'Ana',
      'Bruno',
      'Carla',
    ]);
  });

  it('filtra por semáforo COMERCIAL, resolviendo el salto Cliente ← Lead', async () => {
    expect(await nombresDelSegmento({ semaforoLead: ['verde'] })).toEqual(['Ana', 'Colegio Norte']);
    expect(await nombresDelSegmento({ semaforoLead: ['rojo'] })).toEqual(['Bruno']);
  });

  it('un contacto sin lead queda fuera cuando se filtra por semáforo', async () => {
    // Carla existe y es estudiante, pero nunca se convirtió en oportunidad.
    const conSemaforo = await nombresDelSegmento({ semaforoLead: ['verde', 'rojo', 'azul', 'naranja'] });
    expect(conSemaforo).not.toContain('Carla');
  });

  it('combina los tres ejes en AND', async () => {
    const nombres = await nombresDelSegmento({
      atributos: [{ key: 'grado', valores: ['11'] }],
      rolContacto: ['estudiante'],
      semaforoLead: ['verde'],
    });

    // Bruno es de 11 y estudiante, pero está en rojo. Colegio Norte es verde, pero no es estudiante.
    expect(nombres).toEqual(['Ana']);
  });

  it('dos filtros de atributo exigen DOS `$elemMatch`: «grado 11 Y colegio X», no un atributo que sea ambos', async () => {
    const filtro = construirFiltroContacto({
      atributos: [
        { key: 'grado', valores: ['11'] },
        { key: 'colegio', valores: ['San Jose'] },
      ],
    });

    expect(filtro.$and).toHaveLength(2);

    const nombres = await nombresDelSegmento({
      atributos: [
        { key: 'grado', valores: ['11'] },
        { key: 'colegio', valores: ['San Jose'] },
      ],
    });
    expect(nombres).toEqual(['Bruno']);
  });

  it('una clave que no existe en el tenant da segmento VACÍO, no un error ni la base entera', async () => {
    const porAtributo = await previewSegmento(tenantId, {
      atributos: [{ key: 'grado', valores: ['99'] }],
    });
    expect(porAtributo.total).toBe(0);

    const porRol = await previewSegmento(tenantId, { rolContacto: ['inexistente'] });
    expect(porRol.total).toBe(0);

    // El caso peligroso: un semáforo que nadie lleva NO puede degenerar en "toda la base".
    const porSemaforo = await previewSegmento(tenantId, { semaforoLead: ['no-existe'] });
    expect(porSemaforo.total).toBe(0);
  });

  it('excluye SIEMPRE a quien pidió la baja, aunque cumpla todos los filtros', async () => {
    const nombres = await nombresDelSegmento({ atributos: [{ key: 'grado', valores: ['11'] }] });
    expect(nombres).not.toContain('Dado de baja');

    // Y tampoco con el segmento más amplio posible: no es un filtro opcional.
    const todos = await nombresDelSegmento({});
    expect(todos).not.toContain('Dado de baja');
  });

  it('un contacto anterior al campo (sin `marketingOptOut`) SÍ entra: ausente ≠ dado de baja', async () => {
    // Escritura directa para simular un documento anterior a HU-MARK-01, sin el campo.
    await Cliente.collection.insertOne({
      tenantId,
      metaUserId: 'meta-legacy',
      telefono: '573001119999',
      nombre: 'Anterior al campo',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      tagIds: [],
      atributos: [],
      noLeidos: 0,
      iaHabilitada: true,
      customFields: {},
    });

    const todos = await nombresDelSegmento({});
    expect(todos).toContain('Anterior al campo');
  });

  it('un segmento sin filtros es «toda la base menos las bajas», no un error', async () => {
    const { total } = await previewSegmento(tenantId, {});
    expect(total).toBe(4);
  });
});
