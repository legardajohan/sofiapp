import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

// `$vectorSearch` no existe en mongodb-memory-server: se mockea la única función que
// lo emite. El resto del repositorio (y su test de pipeline) queda intacto.
const { mockVectorSearch } = vi.hoisted(() => ({ mockVectorSearch: vi.fn() }));
vi.mock('./kb-faq.repository.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./kb-faq.repository.js')>();
  return { ...actual, faqVectorSearchScoped: mockVectorSearch };
});

import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { findScoped } from '../../repositories/base.repository.js';
import type { ILlmProvider } from '../../integrations/llm/llm-provider.types.js';
import { KbFaq } from './kb-faq.model.js';
import {
  createFaq,
  deleteFaq,
  listFaqs,
  mapKbFaqToResponse,
  matchFaq,
  testFaq,
  updateFaq,
} from './kb-faq.service.js';
import type { IKbFaq, LeanKbFaq } from './kb-faq.types.js';

const ZERO_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
const VECTOR = [0.1, 0.2, 0.3];

function makeProvider(): ILlmProvider {
  return {
    generateReply: vi.fn(),
    extractSlots: vi.fn(),
    classifyLead: vi.fn(),
    embedTexts: vi.fn().mockResolvedValue({ result: [VECTOR], usage: ZERO_USAGE }),
  } as unknown as ILlmProvider;
}

/** Candidato tal y como lo devolvería Atlas (ya sin `embedding`, con `score`). */
function candidato(overrides: Partial<LeanKbFaq> & { score: number }) {
  return {
    _id: new Types.ObjectId(),
    tenantId: new Types.ObjectId(),
    pregunta: '¿Cuánto cuesta el curso?',
    respuesta: 'El curso cuesta $500.000 COP.',
    activo: true,
    embedding: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockVectorSearch.mockReset();
});

// ─── createFaq ────────────────────────────────────────────────────────────────
describe('createFaq', () => {
  it('genera el embedding de la pregunta y persiste con el tenantId del argumento', async () => {
    const tenantId = new Types.ObjectId();
    const provider = makeProvider();

    const res = await createFaq(
      tenantId,
      { pregunta: '¿Dónde quedan?', respuesta: 'En la calle 10 #5-20.' },
      provider,
    );

    expect(res.activo).toBe(true);
    expect(provider.embedTexts).toHaveBeenCalledTimes(1);
    expect(provider.embedTexts).toHaveBeenCalledWith({
      texts: ['¿Dónde quedan?'],
      taskType: 'RETRIEVAL_DOCUMENT',
    });

    const saved = await KbFaq.findById(res.id).lean<IKbFaq>();
    expect(saved?.tenantId.toString()).toBe(tenantId.toString());
    expect(saved?.embedding).toEqual(VECTOR);
  });

  it('respeta activo: false cuando se envía explícitamente', async () => {
    const res = await createFaq(
      new Types.ObjectId(),
      { pregunta: '¿Hay descuentos?', respuesta: 'Sí, del 10%.', activo: false },
      makeProvider(),
    );
    expect(res.activo).toBe(false);
  });

  it('pregunta duplicada en el mismo tenant → AppError 409', async () => {
    const tenantId = new Types.ObjectId();
    await createFaq(tenantId, { pregunta: '¿Horarios?', respuesta: 'Lun-Vie.' }, makeProvider());

    await expect(
      createFaq(tenantId, { pregunta: '¿Horarios?', respuesta: 'Otra cosa.' }, makeProvider()),
    ).rejects.toThrow(AppError);
  });

  it('la misma pregunta en otro tenant SÍ se permite', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    await createFaq(tenantA, { pregunta: '¿Horarios?', respuesta: 'Lun-Vie.' }, makeProvider());

    const res = await createFaq(
      tenantB,
      { pregunta: '¿Horarios?', respuesta: 'Sáb-Dom.' },
      makeProvider(),
    );
    expect(res.pregunta).toBe('¿Horarios?');
  });
});

// ─── updateFaq ────────────────────────────────────────────────────────────────
describe('updateFaq', () => {
  it('editar solo la respuesta NO vuelve a llamar a Gemini y conserva el embedding', async () => {
    const tenantId = new Types.ObjectId();
    const creada = await createFaq(
      tenantId,
      { pregunta: '¿Cuánto dura?', respuesta: 'Tres meses.' },
      makeProvider(),
    );

    const provider = makeProvider();
    const res = await updateFaq(tenantId, creada.id, { respuesta: 'Cuatro meses.' }, provider);

    expect(res.respuesta).toBe('Cuatro meses.');
    expect(provider.embedTexts).not.toHaveBeenCalled();

    const saved = await KbFaq.findById(creada.id).lean<IKbFaq>();
    expect(saved?.embedding).toEqual(VECTOR);
  });

  it('editar solo activo NO vuelve a llamar a Gemini', async () => {
    const tenantId = new Types.ObjectId();
    const creada = await createFaq(
      tenantId,
      { pregunta: '¿Hay parqueadero?', respuesta: 'Sí.' },
      makeProvider(),
    );

    const provider = makeProvider();
    const res = await updateFaq(tenantId, creada.id, { activo: false }, provider);

    expect(res.activo).toBe(false);
    expect(provider.embedTexts).not.toHaveBeenCalled();
  });

  it('cambiar el texto de la pregunta SÍ re-embebe', async () => {
    const tenantId = new Types.ObjectId();
    const creada = await createFaq(
      tenantId,
      { pregunta: '¿Precio?', respuesta: '$500.000.' },
      makeProvider(),
    );

    const provider = makeProvider();
    const res = await updateFaq(tenantId, creada.id, { pregunta: '¿Cuál es el precio?' }, provider);

    expect(res.pregunta).toBe('¿Cuál es el precio?');
    expect(provider.embedTexts).toHaveBeenCalledTimes(1);
    expect(provider.embedTexts).toHaveBeenCalledWith({
      texts: ['¿Cuál es el precio?'],
      taskType: 'RETRIEVAL_DOCUMENT',
    });
  });

  it('reenviar la MISMA pregunta no re-embebe', async () => {
    const tenantId = new Types.ObjectId();
    const creada = await createFaq(
      tenantId,
      { pregunta: '¿Modalidad?', respuesta: 'Presencial.' },
      makeProvider(),
    );

    const provider = makeProvider();
    await updateFaq(tenantId, creada.id, { pregunta: '¿Modalidad?' }, provider);

    expect(provider.embedTexts).not.toHaveBeenCalled();
  });

  it('renombrar hacia una pregunta ya existente → AppError 409', async () => {
    const tenantId = new Types.ObjectId();
    await createFaq(tenantId, { pregunta: '¿Precio?', respuesta: 'A.' }, makeProvider());
    const otra = await createFaq(tenantId, { pregunta: '¿Sedes?', respuesta: 'B.' }, makeProvider());

    await expect(
      updateFaq(tenantId, otra.id, { pregunta: '¿Precio?' }, makeProvider()),
    ).rejects.toThrow(AppError);
  });

  it('FAQ inexistente → AppError 404', async () => {
    await expect(
      updateFaq(new Types.ObjectId(), new Types.ObjectId().toString(), { activo: false }),
    ).rejects.toThrow(AppError);
  });
});

// ─── deleteFaq ────────────────────────────────────────────────────────────────
describe('deleteFaq', () => {
  it('borra la FAQ del propio tenant', async () => {
    const tenantId = new Types.ObjectId();
    const creada = await createFaq(
      tenantId,
      { pregunta: '¿Borrable?', respuesta: 'Sí.' },
      makeProvider(),
    );

    expect(await deleteFaq(tenantId, creada.id)).toEqual({ deleted: true });
    expect(await KbFaq.findById(creada.id)).toBeNull();
  });

  it('FAQ inexistente → AppError 404', async () => {
    await expect(
      deleteFaq(new Types.ObjectId(), new Types.ObjectId().toString()),
    ).rejects.toThrow(AppError);
  });
});

// ─── mapKbFaqToResponse ───────────────────────────────────────────────────────
describe('mapKbFaqToResponse', () => {
  it('nunca expone el embedding', () => {
    const res = mapKbFaqToResponse({
      _id: new Types.ObjectId(),
      tenantId: new Types.ObjectId(),
      pregunta: 'p',
      respuesta: 'r',
      activo: true,
      embedding: VECTOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(res).not.toHaveProperty('embedding');
    expect(Object.values(res)).not.toContain(VECTOR);
  });
});

// ─── matchFaq ─────────────────────────────────────────────────────────────────
describe('matchFaq', () => {
  const tenantId = new Types.ObjectId();

  it('score por encima del umbral → devuelve la respuesta de la FAQ', async () => {
    const score = env.FAQ_MATCH_THRESHOLD + 0.05;
    mockVectorSearch.mockResolvedValue([candidato({ score })]);

    const res = await matchFaq(tenantId, '¿Qué precio tiene?', makeProvider());

    expect(res.matched).toBe(true);
    expect(res.respuesta).toBe('El curso cuesta $500.000 COP.');
    expect(res.confianza).toBe(score);
  });

  it('embebe la pregunta entrante con taskType RETRIEVAL_QUERY', async () => {
    mockVectorSearch.mockResolvedValue([]);
    const provider = makeProvider();

    await matchFaq(tenantId, '¿Qué precio tiene?', provider);

    expect(provider.embedTexts).toHaveBeenCalledWith({
      texts: ['¿Qué precio tiene?'],
      taskType: 'RETRIEVAL_QUERY',
    });
  });

  it('score por debajo del umbral → no matchea', async () => {
    mockVectorSearch.mockResolvedValue([candidato({ score: env.FAQ_MATCH_THRESHOLD - 0.05 })]);

    const res = await matchFaq(tenantId, 'algo distinto', makeProvider());

    expect(res).toEqual({ matched: false });
  });

  it('sin candidatos → no matchea', async () => {
    mockVectorSearch.mockResolvedValue([]);

    expect(await matchFaq(tenantId, 'lo que sea', makeProvider())).toEqual({ matched: false });
  });

  it('el filtro de activo vive en el repositorio: una FAQ inactiva nunca llega como candidata', async () => {
    // El repositorio filtra `activo: true` en el $vectorSearch y en el $match defensivo
    // (ver kb-faq.repository.test.ts), así que el service nunca la ve.
    mockVectorSearch.mockResolvedValue([]);

    const res = await matchFaq(tenantId, '¿Cuánto cuesta el curso?', makeProvider());

    expect(res.matched).toBe(false);
  });

  it('si el provider falla, degrada a { matched: false } sin propagar', async () => {
    const provider = makeProvider();
    vi.mocked(provider.embedTexts).mockRejectedValue(new Error('Gemini caído'));

    expect(await matchFaq(tenantId, 'hola', provider)).toEqual({ matched: false });
  });

  it('si el $vectorSearch falla (índice inexistente), degrada a { matched: false }', async () => {
    mockVectorSearch.mockRejectedValue(new Error('index not found'));

    expect(await matchFaq(tenantId, 'hola', makeProvider())).toEqual({ matched: false });
  });

  it('aislamiento: el matching se ejecuta siempre contra el tenant recibido', async () => {
    const tenantB = new Types.ObjectId();
    mockVectorSearch.mockResolvedValue([]);

    await matchFaq(tenantB, '¿Cuánto cuesta el curso?', makeProvider());

    expect(mockVectorSearch).toHaveBeenCalledWith(tenantB, VECTOR);
  });
});

// ─── testFaq ──────────────────────────────────────────────────────────────────
describe('testFaq', () => {
  const tenantId = new Types.ObjectId();

  it('devuelve el mejor candidato aunque no supere el umbral', async () => {
    const score = env.FAQ_MATCH_THRESHOLD - 0.1;
    mockVectorSearch.mockResolvedValue([candidato({ score })]);

    const res = await testFaq(tenantId, 'algo parecido', makeProvider());

    expect(res.matched).toBe(false);
    expect(res.confianza).toBe(score);
    expect(res.umbral).toBe(env.FAQ_MATCH_THRESHOLD);
    expect(res.pregunta).toBe('¿Cuánto cuesta el curso?');
    expect(res.faqId).toBeDefined();
  });

  it('marca matched: true cuando el score alcanza el umbral', async () => {
    mockVectorSearch.mockResolvedValue([candidato({ score: env.FAQ_MATCH_THRESHOLD })]);

    const res = await testFaq(tenantId, '¿Cuánto vale?', makeProvider());

    expect(res.matched).toBe(true);
  });

  it('sin candidatos → matched false pero informa el umbral vigente', async () => {
    mockVectorSearch.mockResolvedValue([]);

    expect(await testFaq(tenantId, 'nada', makeProvider())).toEqual({
      matched: false,
      umbral: env.FAQ_MATCH_THRESHOLD,
    });
  });

  it('a diferencia de matchFaq, propaga los errores para que el admin los vea', async () => {
    mockVectorSearch.mockRejectedValue(new Error('index not found'));

    await expect(testFaq(tenantId, 'hola', makeProvider())).rejects.toThrow('index not found');
  });
});

// ─── Aislamiento multi-tenant ─────────────────────────────────────────────────
describe('kb-faq — aislamiento multi-tenant', () => {
  it('tenantB no ve las FAQs de tenantA', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    await createFaq(tenantA, { pregunta: '¿Privada?', respuesta: 'Secreta.' }, makeProvider());

    const listaB = await listFaqs(tenantB, 1, 20);
    expect(listaB.total).toBe(0);
    expect(listaB.data).toHaveLength(0);

    const listaA = await listFaqs(tenantA, 1, 20);
    expect(listaA.total).toBe(1);
    expect(listaA.data[0]?.pregunta).toBe('¿Privada?');

    expect(await findScoped(KbFaq, tenantB).exec()).toHaveLength(0);
  });

  it('tenantB no puede editar una FAQ de tenantA (404) y el dato no cambia', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const creada = await createFaq(
      tenantA,
      { pregunta: '¿Solo A?', respuesta: 'Original.' },
      makeProvider(),
    );

    await expect(
      updateFaq(tenantB, creada.id, { respuesta: 'Secuestrada.' }, makeProvider()),
    ).rejects.toThrow(AppError);

    const saved = await KbFaq.findById(creada.id).lean<IKbFaq>();
    expect(saved?.respuesta).toBe('Original.');
  });

  it('tenantB no puede borrar una FAQ de tenantA (404) y el dato sobrevive', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const creada = await createFaq(
      tenantA,
      { pregunta: '¿Solo A?', respuesta: 'x' },
      makeProvider(),
    );

    await expect(deleteFaq(tenantB, creada.id)).rejects.toThrow(AppError);
    expect(await KbFaq.findById(creada.id)).not.toBeNull();
  });
});

// ─── listFaqs ─────────────────────────────────────────────────────────────────
describe('listFaqs', () => {
  it('filtra por activo cuando se indica', async () => {
    const tenantId = new Types.ObjectId();
    await createFaq(tenantId, { pregunta: '¿Activa?', respuesta: 'Sí.' }, makeProvider());
    await createFaq(
      tenantId,
      { pregunta: '¿Inactiva?', respuesta: 'No.', activo: false },
      makeProvider(),
    );

    expect((await listFaqs(tenantId, 1, 20)).total).toBe(2);
    expect((await listFaqs(tenantId, 1, 20, true)).total).toBe(1);
    expect((await listFaqs(tenantId, 1, 20, false)).data[0]?.pregunta).toBe('¿Inactiva?');
  });

  it('no devuelve el embedding en el listado', async () => {
    const tenantId = new Types.ObjectId();
    await createFaq(tenantId, { pregunta: '¿Y el vector?', respuesta: 'Oculto.' }, makeProvider());

    const lista = await listFaqs(tenantId, 1, 20);
    expect(lista.data[0]).not.toHaveProperty('embedding');
  });
});
