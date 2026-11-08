import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { ContactField } from '../contact-field/contact-field.model.js';
import { Flow, FlowState } from './flow.model.js';
import { createFlow, updateFlow } from './flow.service.js';
import type { INodo } from './flow.types.js';

const { sendOutboundMock, extractMock } = vi.hoisted(() => ({
  sendOutboundMock: vi.fn().mockResolvedValue({}),
  extractMock: vi.fn(),
}));
vi.mock('../message/message.service.js', () => ({ sendOutbound: sendOutboundMock }));
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: vi.fn(), extract: extractMock }),
}));
vi.mock('../../config/queues.js', () => ({
  FLOW_RESUME_JOB: 'resume',
  FLOW_REMINDER_JOB: 'reminder',
  flowRuntimeQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

import { Cliente } from '../cliente/cliente.model.js';
import { ejecutarFlujo } from './flow.runtime.service.js';

const tenantA = new Types.ObjectId();
const tenantB = new Types.ObjectId();
const posicion = { x: 0, y: 0 };

function captura(config: Record<string, unknown>, id = 'c1'): INodo {
  return {
    id,
    posicion,
    tipo: 'captura',
    config: {
      tipo: 'captura',
      campo: 'lo-que-sea',
      descripcion: 'Dato',
      tipoDato: 'numero',
      pregunta: '¿Cuál?',
      reintentos: 1,
      ...config,
    } as INodo['config'],
  };
}
const fin: INodo = { id: 'fin', posicion, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'Gracias' } };
const grafo = (nodo: INodo): { nodos: INodo[]; aristas: { id: string; from: string; to: string }[]; entrada: string } => ({
  nodos: [nodo, fin],
  aristas: [{ id: 'a1', from: nodo.id, to: 'fin' }],
  entrada: nodo.id,
});

async function crearCampo(
  tenant: Types.ObjectId,
  key: string,
  extra: Partial<{ tipoDato: string; activo: boolean }> = {},
): Promise<void> {
  await ContactField.create({
    tenantId: tenant,
    key,
    label: key,
    labelNormalizado: key,
    tipoDato: extra.tipoDato ?? 'texto',
    sensible: false,
    activo: extra.activo ?? true,
    orden: 0,
  });
}

beforeEach(async () => {
  await Flow.deleteMany({});
  await FlowState.deleteMany({});
  await Cliente.deleteMany({});
  await ContactField.deleteMany({});
  await Flow.syncIndexes();
  sendOutboundMock.mockClear();
  extractMock.mockReset();
});

describe('flow.service — canonizar la captura con destino (HU-FLOW-05, criterios 8-9)', () => {
  it('destino contacto: fija `campo` al campo fijo y `tipoDato` a texto, ignorando lo que venga', async () => {
    const res = await createFlow(tenantA, {
      nombre: 'F',
      ...grafo(captura({ campo: 'name', tipoDato: 'numero', destino: { tipo: 'contacto', campo: 'nombre' } })),
    });
    expect(res.nodos[0]?.config).toMatchObject({
      campo: 'nombre',
      tipoDato: 'texto',
      saltarSiExiste: true,
      sobrescribir: false,
    });
  });

  it('destino atributo: `campo` = la key y `tipoDato` lo fija el catálogo', async () => {
    await crearCampo(tenantA, 'edad', { tipoDato: 'numero' });
    const res = await createFlow(tenantA, {
      nombre: 'F',
      ...grafo(captura({ campo: 'otra-cosa', tipoDato: 'texto', destino: { tipo: 'atributo', key: 'edad' } })),
    });
    expect(res.nodos[0]?.config).toMatchObject({ campo: 'edad', tipoDato: 'numero' });
  });

  it('respeta saltarSiExiste:false y sobrescribir:true cuando se piden', async () => {
    const res = await createFlow(tenantA, {
      nombre: 'F',
      ...grafo(captura({ destino: { tipo: 'contacto', campo: 'correo' }, saltarSiExiste: false, sobrescribir: true })),
    });
    expect(res.nodos[0]?.config).toMatchObject({ saltarSiExiste: false, sobrescribir: true });
  });

  it('una key inexistente → 400 indicando el nodo y la clave', async () => {
    await expect(
      createFlow(tenantA, { nombre: 'F', ...grafo(captura({ destino: { tipo: 'atributo', key: 'no-existe' } })) }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('no-existe'),
      details: { codigo: 'FLOW_CAMPO_INVALIDO', nodoId: 'c1' },
    });
  });

  it('una key archivada → 400', async () => {
    await crearCampo(tenantA, 'colegio', { activo: false });
    await expect(
      createFlow(tenantA, { nombre: 'F', ...grafo(captura({ destino: { tipo: 'atributo', key: 'colegio' } })) }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('un borrador con destino atributo y la key aún vacía se guarda (y se reporta como incompleto)', async () => {
    const res = await createFlow(tenantA, {
      nombre: 'F',
      ...grafo(captura({ destino: { tipo: 'atributo', key: '' } })),
    });
    expect(res.advertencias.map((e) => e.codigo)).toContain('CONTENIDO_INCOMPLETO');
  });

  it('flujo legado: una captura SIN destino queda exactamente como estaba', async () => {
    const res = await createFlow(tenantA, { nombre: 'F', ...grafo(captura({ campo: 'grado', tipoDato: 'texto' })) });
    expect(res.nodos[0]?.config).toEqual(
      expect.objectContaining({ campo: 'grado', tipoDato: 'texto' }),
    );
    expect(res.nodos[0]?.config).not.toHaveProperty('saltarSiExiste');
    expect(res.nodos[0]?.config).not.toHaveProperty('destino');
  });

  it('también se canoniza al actualizar un flujo', async () => {
    await crearCampo(tenantA, 'edad', { tipoDato: 'numero' });
    const creado = await createFlow(tenantA, { nombre: 'F', ...grafo(captura({ campo: 'grado', tipoDato: 'texto' })) });
    const res = await updateFlow(tenantA, creado.id, {
      nombre: 'F',
      ...grafo(captura({ destino: { tipo: 'atributo', key: 'edad' } })),
    });
    expect(res.nodos[0]?.config).toMatchObject({ campo: 'edad', tipoDato: 'numero' });
  });
});

describe('aislamiento multi-tenant — flujo y catálogo (HU-FLOW-05, criterio 36)', () => {
  it('un flujo del tenant B no puede guardar un destino con una key que solo existe en A → 400', async () => {
    await crearCampo(tenantA, 'colegio');
    await expect(
      createFlow(tenantB, { nombre: 'F', ...grafo(captura({ destino: { tipo: 'atributo', key: 'colegio' } })) }),
    ).rejects.toMatchObject({ statusCode: 400 });
    // En A, la misma key sí es válida.
    await expect(
      createFlow(tenantA, { nombre: 'F', ...grafo(captura({ destino: { tipo: 'atributo', key: 'colegio' } })) }),
    ).resolves.toBeDefined();
  });
});

describe('ejecutarFlujo de punta a punta — captura que guarda en la ficha (HU-FLOW-05)', () => {
  async function flowActivo(nodo: INodo): Promise<void> {
    await createScoped(Flow, tenantA, { nombre: 'RT', ...grafo(nodo), version: 1, estado: 'publicado', activo: true });
  }
  async function cliente(campos: Record<string, unknown> = {}): Promise<string> {
    const c = await createScoped(Cliente, tenantA, {
      metaUserId: `wa_${new Types.ObjectId().toString()}`,
      telefono: '573000000000',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      tagIds: [],
      iaHabilitada: true,
      ...campos,
    });
    return String(c._id);
  }
  const textos = (): string[] => sendOutboundMock.mock.calls.map((c) => (c[2] as { texto: string }).texto);

  it('pregunta, extrae y deja el nombre en la ficha; la variable también lo tiene', async () => {
    await flowActivo(
      captura({ campo: 'nombre', tipoDato: 'texto', pregunta: '¿Cómo se llama?', destino: { tipo: 'contacto', campo: 'nombre' } }),
    );
    const id = await cliente();
    extractMock.mockResolvedValue({ data: { nombre: 'Ana' } });

    await ejecutarFlujo(tenantA.toString(), id, 'hola');
    expect(textos()).toEqual(['¿Cómo se llama?']);
    await ejecutarFlujo(tenantA.toString(), id, 'soy Ana');

    expect((await Cliente.findById(id).lean())?.nombre).toBe('Ana');
    expect(textos()).toEqual(['¿Cómo se llama?', 'Gracias']);
    const estado = await FlowState.findOne({ clienteId: id }).lean();
    expect(estado?.variables).toMatchObject({ nombre: 'Ana' });
  });

  it('si el contacto ya tiene el nombre NO pregunta: sigue directo al siguiente nodo', async () => {
    await flowActivo(
      captura({ campo: 'nombre', tipoDato: 'texto', pregunta: '¿Cómo se llama?', destino: { tipo: 'contacto', campo: 'nombre' } }),
    );
    const id = await cliente({ nombre: 'Juan' });

    await ejecutarFlujo(tenantA.toString(), id, 'hola');

    expect(textos()).toEqual(['Gracias']);
    expect(extractMock).not.toHaveBeenCalled();
    expect((await Cliente.findById(id).lean())?.nombre).toBe('Juan');
  });

  it('sobrescribir:false no pisa el nombre existente aunque se pregunte; la variable sí queda con lo dicho', async () => {
    await flowActivo(
      captura({
        campo: 'nombre',
        tipoDato: 'texto',
        pregunta: '¿Cómo se llama?',
        destino: { tipo: 'contacto', campo: 'nombre' },
        saltarSiExiste: false,
      }),
    );
    const id = await cliente({ nombre: 'Juan' });
    extractMock.mockResolvedValue({ data: { nombre: 'Ana' } });

    await ejecutarFlujo(tenantA.toString(), id, 'hola');
    await ejecutarFlujo(tenantA.toString(), id, 'soy Ana');

    expect((await Cliente.findById(id).lean())?.nombre).toBe('Juan');
    expect((await FlowState.findOne({ clienteId: id }).lean())?.variables).toMatchObject({ nombre: 'Ana' });
  });

  it('un campo personalizado se guarda en atributos y el correo inválido no rompe el flujo', async () => {
    await crearCampo(tenantA, 'colegio');
    await flowActivo(
      captura({ campo: 'colegio', tipoDato: 'texto', pregunta: '¿Colegio?', destino: { tipo: 'atributo', key: 'colegio' } }),
    );
    const id = await cliente();
    extractMock.mockResolvedValue({ data: { colegio: 'Libertad' } });

    await ejecutarFlujo(tenantA.toString(), id, 'hola');
    await ejecutarFlujo(tenantA.toString(), id, 'el Libertad');

    expect((await Cliente.findById(id).lean())?.atributos).toEqual([
      expect.objectContaining({ key: 'colegio', valor: 'Libertad' }),
    ]);
  });

  it('con destino rolContacto, la IA recibe SOLO las claves activas del catálogo del tenant', async () => {
    await flowActivo(
      captura({
        campo: 'rolContacto',
        tipoDato: 'texto',
        descripcion: 'Rol del contacto',
        pregunta: '¿Quién es?',
        destino: { tipo: 'contacto', campo: 'rolContacto' },
      }),
    );
    const id = await cliente();
    extractMock.mockResolvedValue({ data: { rolContacto: 'decisor' } });

    await ejecutarFlujo(tenantA.toString(), id, 'hola');
    await ejecutarFlujo(tenantA.toString(), id, 'yo decido');

    const spec = (extractMock.mock.calls[0]?.[0] as { camposObjetivo: { descripcion: string }[] }).camposObjetivo[0];
    expect(spec?.descripcion).toContain('exactamente una de estas claves');
    expect(spec?.descripcion).toContain('decisor');
    expect((await Cliente.findById(id).lean())?.rolContacto).toBe('decisor');
  });

  it('un valor que no corresponde a ninguna opción de rol no se escribe y el flujo sigue', async () => {
    await flowActivo(
      captura({
        campo: 'rolContacto',
        tipoDato: 'texto',
        pregunta: '¿Quién es?',
        destino: { tipo: 'contacto', campo: 'rolContacto' },
      }),
    );
    const id = await cliente();
    extractMock.mockResolvedValue({ data: { rolContacto: 'presidente-de-la-luna' } });

    await ejecutarFlujo(tenantA.toString(), id, 'hola');
    await ejecutarFlujo(tenantA.toString(), id, 'soy el presidente');

    expect((await Cliente.findById(id).lean())?.rolContacto).toBeUndefined();
    expect(textos().at(-1)).toBe('Gracias'); // el flujo no se rompió
  });
});
