import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Types } from 'mongoose';

const { mockClassifyTopic } = vi.hoisted(() => ({ mockClassifyTopic: vi.fn() }));

// El singleton abre Redis al instanciarse; además aquí interesa controlar qué devuelve el modelo.
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ classifyTopic: mockClassifyTopic }),
}));

import { env } from '../../config/env.js';
import { createScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import type { IClienteDocument, ITemaIA } from '../cliente/cliente.types.js';
import { Message } from '../message/message.model.js';
import { KbDocument } from '../kb/kb-document.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import type { ChatTurn } from '../../integrations/llm/llm-provider.types.js';
import { clasificarTemaSiHaceFalta, debeClasificar } from './ai-topic.service.js';

const PRODUCTOS = [
  { nombre: 'Curso intensivo', descripcion: 'Seis semanas' },
  { nombre: 'Curso sabatino', descripcion: 'Sábados' },
];

async function sembrarKb(tenantId: Types.ObjectId, items: Array<Record<string, string>> = PRODUCTOS): Promise<void> {
  await KbDocument.deleteMany({ tenantId });
  await createScoped(KbDocument, tenantId, {
    titulo: 'Productos y servicios',
    contenido: 'x',
    estructura: { schemaVersion: 1, schemaId: 'productos', campos: { catalogo: { tipo: 'repetible', items } }, adicional: '' },
  });
}

async function crearCliente(tenantId: Types.ObjectId, opts: { demo?: boolean } = {}): Promise<string> {
  const c = await createScoped(Cliente, tenantId, {
    metaUserId: `${opts.demo ? 'demo-' : 'wa_'}${new Types.ObjectId().toString()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
  });
  return String((c as unknown as IClienteDocument)._id);
}

async function mensajesDelCliente(tenantId: Types.ObjectId, clienteId: string, n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await createScoped(Message, tenantId, {
      clienteId: new Types.ObjectId(clienteId),
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'text',
      texto: `mensaje ${i}`,
    });
  }
}

const HISTORIAL: ChatTurn[] = [{ role: 'user', content: '¿cuánto vale el intensivo?' }];

const responde = (tema: string, confianza = 0.9): void => {
  mockClassifyTopic.mockResolvedValue({ data: { tema, confianza } });
};

async function temaDe(clienteId: string): Promise<ITemaIA | undefined> {
  return (await Cliente.findById(clienteId).lean())?.temaIA;
}

const eventosTema = (): Promise<number> => AuditEvent.countDocuments({ accion: 'cliente.tema' });

const tema = (over: Partial<ITemaIA> = {}): ITemaIA => ({
  clave: 'curso intensivo',
  nombre: 'Curso intensivo',
  confianza: 0.9,
  at: new Date(),
  mensajesCliente: 2,
  repeticiones: 1,
  catalogoVersion: 'v1',
  modelo: 'gemini',
  ...over,
});

describe('HU-REP-03 — debeClasificar (freno de coste)', () => {
  it('sin tema previo → sí', () => {
    expect(debeClasificar(undefined, 2, 'v1')).toBe(true);
  });

  it('lista de productos cambiada → sí, aunque no haya mensajes nuevos', () => {
    expect(debeClasificar(tema(), 2, 'v2')).toBe(true);
  });

  it(`reclasifica a los ${env.TEMA_RECLASIFICAR_CADA} mensajes nuevos, no antes`, () => {
    const t = tema({ mensajesCliente: 2 });
    expect(debeClasificar(t, 2 + env.TEMA_RECLASIFICAR_CADA - 1, 'v1')).toBe(false);
    expect(debeClasificar(t, 2 + env.TEMA_RECLASIFICAR_CADA, 'v1')).toBe(true);
  });

  it(`con el tema estable (repeticiones >= 2) espera ${env.TEMA_RECLASIFICAR_ESTABLE}`, () => {
    const t = tema({ mensajesCliente: 2, repeticiones: 2 });
    expect(debeClasificar(t, 2 + env.TEMA_RECLASIFICAR_CADA, 'v1')).toBe(false);
    expect(debeClasificar(t, 2 + env.TEMA_RECLASIFICAR_ESTABLE - 1, 'v1')).toBe(false);
    expect(debeClasificar(t, 2 + env.TEMA_RECLASIFICAR_ESTABLE, 'v1')).toBe(true);
  });
});

describe('HU-REP-03 — clasificarTemaSiHaceFalta', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    tenantId = new Types.ObjectId();
    mockClassifyTopic.mockReset();
    await Cliente.deleteMany({});
    await Message.deleteMany({});
    await AuditEvent.deleteMany({});
    await sembrarKb(tenantId);
  });

  describe('restricción a la lista de la KB (criterio 2)', () => {
    it('ofrece al modelo solo los productos de la KB y guarda el elegido', async () => {
      responde('Curso intensivo', 0.92);
      const clienteId = await crearCliente(tenantId);
      await mensajesDelCliente(tenantId, clienteId, 2);

      expect(await clasificarTemaSiHaceFalta(tenantId.toString(), clienteId, HISTORIAL)).toBe('clasificada');

      const llamada = mockClassifyTopic.mock.calls[0]![0] as { opciones: unknown; historial: unknown; catalogoVersion: string };
      expect(llamada.opciones).toEqual(PRODUCTOS);
      expect(llamada.historial).toEqual(HISTORIAL);
      expect(await temaDe(clienteId)).toMatchObject({
        clave: 'curso intensivo',
        nombre: 'Curso intensivo',
        confianza: 0.92,
        mensajesCliente: 2,
        repeticiones: 1,
        catalogoVersion: llamada.catalogoVersion,
      });
    });

    it.each([
      ['un nombre fuera de la lista', 'Curso de inglés', 0.95],
      ['otros', 'otros', 0.95],
      ['confianza bajo el umbral', 'Curso intensivo', env.TEMA_MIN_CONFIANZA - 0.1],
    ])('%s → otros (clave null)', async (_caso, nombre, confianza) => {
      responde(nombre, confianza);
      const clienteId = await crearCliente(tenantId);
      await mensajesDelCliente(tenantId, clienteId, 2);

      await clasificarTemaSiHaceFalta(tenantId.toString(), clienteId, HISTORIAL);

      expect(await temaDe(clienteId)).toMatchObject({ clave: null, nombre: null });
    });

    it('sin historial, lo arma desde los mensajes del hilo', async () => {
      responde('Curso sabatino');
      const clienteId = await crearCliente(tenantId);
      await mensajesDelCliente(tenantId, clienteId, 2);

      await clasificarTemaSiHaceFalta(tenantId.toString(), clienteId);

      const { historial } = mockClassifyTopic.mock.calls[0]![0] as { historial: ChatTurn[] };
      expect(historial).toEqual([
        { role: 'user', content: 'mensaje 0' },
        { role: 'user', content: 'mensaje 1' },
      ]);
    });
  });

  describe('guard (criterio 3)', () => {
    afterEach(() => {
      env.TEMA_AUTO = 'on';
    });

    it('TEMA_AUTO=off → no llama al modelo', async () => {
      env.TEMA_AUTO = 'off';
      const clienteId = await crearCliente(tenantId);
      await mensajesDelCliente(tenantId, clienteId, 5);

      expect(await clasificarTemaSiHaceFalta(tenantId.toString(), clienteId, HISTORIAL)).toBe('saltada');
      expect(mockClassifyTopic).not.toHaveBeenCalled();
    });

    it('sin productos en la KB → no llama al modelo', async () => {
      await sembrarKb(tenantId, []);
      const clienteId = await crearCliente(tenantId);
      await mensajesDelCliente(tenantId, clienteId, 5);

      expect(await clasificarTemaSiHaceFalta(tenantId.toString(), clienteId, HISTORIAL)).toBe('saltada');
      expect(mockClassifyTopic).not.toHaveBeenCalled();
    });

    it('conversación demo → no llama al modelo', async () => {
      const clienteId = await crearCliente(tenantId, { demo: true });
      await mensajesDelCliente(tenantId, clienteId, 5);

      expect(await clasificarTemaSiHaceFalta(tenantId.toString(), clienteId, HISTORIAL)).toBe('saltada');
      expect(mockClassifyTopic).not.toHaveBeenCalled();
    });

    it('conversación inexistente → saltada', async () => {
      expect(await clasificarTemaSiHaceFalta(tenantId.toString(), new Types.ObjectId().toString())).toBe('saltada');
      expect(mockClassifyTopic).not.toHaveBeenCalled();
    });

    it('pocos mensajes del cliente → no llama al modelo', async () => {
      const clienteId = await crearCliente(tenantId);
      await mensajesDelCliente(tenantId, clienteId, env.TEMA_MIN_TURNOS_CLIENTE - 1);

      expect(await clasificarTemaSiHaceFalta(tenantId.toString(), clienteId, HISTORIAL)).toBe('saltada');
      expect(mockClassifyTopic).not.toHaveBeenCalled();
    });
  });

  describe('freno de coste (criterio 3)', () => {
    it('dos jobs seguidos sin mensajes suficientes → una sola llamada', async () => {
      responde('Curso intensivo');
      const clienteId = await crearCliente(tenantId);
      await mensajesDelCliente(tenantId, clienteId, 2);

      await clasificarTemaSiHaceFalta(tenantId.toString(), clienteId, HISTORIAL);
      await mensajesDelCliente(tenantId, clienteId, 1);
      const segunda = await clasificarTemaSiHaceFalta(tenantId.toString(), clienteId, HISTORIAL);

      expect(segunda).toBe('saltada');
      expect(mockClassifyTopic).toHaveBeenCalledTimes(1);
    });

    it(`reclasifica tras ${env.TEMA_RECLASIFICAR_CADA} mensajes nuevos del cliente`, async () => {
      responde('Curso intensivo');
      const clienteId = await crearCliente(tenantId);
      await mensajesDelCliente(tenantId, clienteId, 2);
      await clasificarTemaSiHaceFalta(tenantId.toString(), clienteId, HISTORIAL);

      await mensajesDelCliente(tenantId, clienteId, env.TEMA_RECLASIFICAR_CADA);
      expect(await clasificarTemaSiHaceFalta(tenantId.toString(), clienteId, HISTORIAL)).toBe('clasificada');
      expect(mockClassifyTopic).toHaveBeenCalledTimes(2);
    });

    it('un cambio en la lista de productos reclasifica en la siguiente ráfaga', async () => {
      responde('Curso intensivo');
      const clienteId = await crearCliente(tenantId);
      await mensajesDelCliente(tenantId, clienteId, 2);
      await clasificarTemaSiHaceFalta(tenantId.toString(), clienteId, HISTORIAL);

      await sembrarKb(tenantId, [...PRODUCTOS, { nombre: 'Asesoría' }]);
      expect(await clasificarTemaSiHaceFalta(tenantId.toString(), clienteId, HISTORIAL)).toBe('clasificada');
      expect(mockClassifyTopic).toHaveBeenCalledTimes(2);
    });
  });

  describe('repeticiones y auditoría', () => {
    async function reclasificar(clienteId: string, nombre: string): Promise<void> {
      responde(nombre);
      await mensajesDelCliente(tenantId, clienteId, env.TEMA_RECLASIFICAR_CADA);
      await clasificarTemaSiHaceFalta(tenantId.toString(), clienteId, HISTORIAL);
    }

    it('repeticiones sube con la misma clave y vuelve a 1 al cambiar', async () => {
      const clienteId = await crearCliente(tenantId);
      await reclasificar(clienteId, 'Curso intensivo');
      expect((await temaDe(clienteId))?.repeticiones).toBe(1);

      await reclasificar(clienteId, 'Curso intensivo');
      expect((await temaDe(clienteId))?.repeticiones).toBe(2);

      // Ya es estable: hacen falta TEMA_RECLASIFICAR_ESTABLE mensajes para volver a pagar.
      responde('Curso sabatino');
      await mensajesDelCliente(tenantId, clienteId, env.TEMA_RECLASIFICAR_ESTABLE);
      await clasificarTemaSiHaceFalta(tenantId.toString(), clienteId, HISTORIAL);
      expect(await temaDe(clienteId)).toMatchObject({ clave: 'curso sabatino', repeticiones: 1 });
    });

    it('audita cliente.tema solo cuando la clave cambia', async () => {
      const clienteId = await crearCliente(tenantId);
      await reclasificar(clienteId, 'Curso intensivo');
      expect(await eventosTema()).toBe(1);

      await reclasificar(clienteId, 'otros');
      expect(await eventosTema()).toBe(2);

      await reclasificar(clienteId, 'otros');
      expect(mockClassifyTopic).toHaveBeenCalledTimes(3);
      expect(await eventosTema()).toBe(2);

      const ultimo = await AuditEvent.findOne({ accion: 'cliente.tema' }).sort({ createdAt: -1, _id: -1 }).lean();
      expect(ultimo).toMatchObject({
        actorId: null,
        entidad: 'cliente',
        antes: { clave: 'curso intensivo', nombre: 'Curso intensivo' },
        despues: { clave: null, nombre: null },
      });
    });
  });

  describe('nunca lanza (criterio 4)', () => {
    it.each([
      ['429', Object.assign(new Error('[429 Too Many Requests]'), { status: 429 })],
      ['error genérico', new Error('Gemini caído')],
    ])('%s → fallida, sin escribir', async (_caso, err) => {
      mockClassifyTopic.mockRejectedValue(err);
      const clienteId = await crearCliente(tenantId);
      await mensajesDelCliente(tenantId, clienteId, 2);

      await expect(clasificarTemaSiHaceFalta(tenantId.toString(), clienteId, HISTORIAL)).resolves.toBe('fallida');
      expect(await temaDe(clienteId)).toBeUndefined();
      expect(await eventosTema()).toBe(0);
    });
  });
});
