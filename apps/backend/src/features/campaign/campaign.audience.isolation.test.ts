import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Lead } from '../lead/lead.model.js';
import { facetasSegmento, listarAudiencia, previewSegmento } from './campaign.segment.service.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();
// La MISMA etiqueta (mismo id) en los dos tenants: es el caso que un conteo mal acotado mezclaría.
const etiqueta = new Types.ObjectId();

async function sembrar(tenantId: Types.ObjectId, nombre: string): Promise<Types.ObjectId> {
  const cliente = await createScoped(Cliente, tenantId, {
    metaUserId: `meta-${tenantId.toString()}`,
    // Mismo teléfono en los dos tenants: la deduplicación por teléfono no puede cruzar empresas.
    telefono: '573001110001',
    nombre,
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    marketingOptOut: false,
    tagIds: [etiqueta],
  });
  await createScoped(Lead, tenantId, {
    nombre,
    telefono: '573001110001',
    clienteId: cliente._id,
    origen: {
      tipo: 'conversacion',
      conversacionId: cliente._id,
      convertidoPor: new Types.ObjectId(),
      convertidoAt: new Date(),
    },
    responsableId: new Types.ObjectId(),
    estado: 'nuevo',
  });
  return cliente._id;
}

describe('Constructor de audiencias — aislamiento multi-tenant', () => {
  let contactoDeA: Types.ObjectId;

  beforeEach(async () => {
    await Promise.all([Cliente.deleteMany({}), Lead.deleteMany({})]);
    contactoDeA = await sembrar(tenantA, 'Contacto de A');
    await sembrar(tenantB, 'Contacto de B');
  });

  it('las facetas del tenantB no cuentan contactos del tenantA', async () => {
    const enB = await facetasSegmento(tenantB);
    expect(enB.etapas).toEqual([{ key: 'nuevo', contactos: 1 }]);
    expect(enB.etiquetas).toEqual([{ tagId: etiqueta.toString(), contactos: 1 }]);
  });

  it('el listado de la audiencia del tenantB solo trae contactos del tenantB, también buscando', async () => {
    const filtros = { etapas: ['nuevo'], tagIds: [etiqueta.toString()], combinacion: 'o' as const };

    const enB = await listarAudiencia(tenantB, filtros, { page: 1, limit: 20 });
    expect(enB.data.map((c) => c.nombre)).toEqual(['Contacto de B']);

    const buscando = await listarAudiencia(tenantB, filtros, {
      busqueda: 'Contacto de A',
      page: 1,
      limit: 20,
    });
    expect(buscando.total).toBe(0);
  });

  it('excluir un id del tenantA desde el tenantB no altera el segmento de nadie', async () => {
    const enB = await previewSegmento(tenantB, {
      etapas: ['nuevo'],
      excluirClienteIds: [contactoDeA.toString()],
    });
    expect(enB.total).toBe(1);
    expect(enB.resumen.excluidosAMano).toBe(0);

    const enA = await previewSegmento(tenantA, { etapas: ['nuevo'] });
    expect(enA.total).toBe(1);
  });

  it('el mismo teléfono en dos tenants no cuenta como duplicado', async () => {
    const enA = await previewSegmento(tenantA, {});
    expect(enA.resumen.duplicados).toBe(0);
    expect(enA.total).toBe(1);
  });
});
