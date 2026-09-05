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
  puedeReducirActivas,
  testFaq,
  updateFaq,
} from './kb-faq.service.js';
import type { IKbFaq, IKbFaqResponse, LeanKbFaq } from './kb-faq.types.js';

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

/** El mínimo vigente, leído del entorno: las fixtures no hardcodean el 5. */
const MINIMO = env.FAQ_MIN_ACTIVAS;

/** Deja al tenant con exactamente `n` FAQs activas, y devuelve las creadas en orden. */
async function sembrarActivas(tenantId: Types.ObjectId, n: number): Promise<IKbFaqResponse[]> {
  const creadas: IKbFaqResponse[] = [];
  for (let i = 0; i < n; i += 1) {
    creadas.push(
      await createFaq(
        tenantId,
        { pregunta: `¿Pregunta número ${i}?`, respuesta: `Respuesta ${i}.` },
        makeProvider(),
      ),
    );
  }
  return creadas;
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
    // Con margen sobre el mínimo de activas (HU-KB-02-V3): apagar una es legal aquí.
    await sembrarActivas(tenantId, MINIMO);
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
    // Con margen sobre el mínimo de activas (HU-KB-02-V3): borrar una es legal aquí.
    await sembrarActivas(tenantId, MINIMO);
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

  it('las tres señales en verde → devuelve la respuesta de la FAQ', async () => {
    const score = env.FAQ_MATCH_THRESHOLD + 0.05;
    mockVectorSearch.mockResolvedValue([candidato({ score })]);

    const res = await matchFaq(tenantId, '¿Cuánto cuesta el curso?', makeProvider());

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

    const res = await matchFaq(tenantId, '¿Cuánto cuesta el curso?', makeProvider());

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

// ─── matchFaq: el caso que motivó HU-KB-02-V2 ─────────────────────────────────
describe('matchFaq — horarios vs precios', () => {
  const tenantId = new Types.ObjectId();

  // Dos FAQs temáticamente cercanas del mismo tenant. Sus embeddings viven cerca porque
  // hablan del mismo negocio, así que ambas sacan score alto contra la misma pregunta: es
  // exactamente la confusión que el matching por coseno a secas dejaba pasar.
  const horarios = (score: number) =>
    candidato({
      score,
      pregunta: '¿Cuál es el horario de atención?',
      respuesta: 'Atendemos de lunes a viernes, de 8:00 a. m. a 6:00 p. m.',
    });
  const precios = (score: number) =>
    candidato({ score, pregunta: '¿Cuál es el precio del curso?' });

  const PREGUNTA_DE_HORARIO = '¿A qué hora abren?';

  it('(a) margen ínfimo y overlap cero → no matchea, la conversación va al RAG/LLM', async () => {
    // Las dos FAQs empatadas: el coseno está midiendo tema, no intención.
    mockVectorSearch.mockResolvedValue([precios(0.87), horarios(0.865)]);

    const res = await matchFaq(tenantId, PREGUNTA_DE_HORARIO, makeProvider());

    expect(res).toEqual({ matched: false });
  });

  it('(b) margen amplio pero overlap cero → no matchea', async () => {
    // El embedding está seguro de la FAQ equivocada; el léxico lo desmiente.
    mockVectorSearch.mockResolvedValue([precios(0.9), horarios(0.6)]);

    const res = await matchFaq(tenantId, PREGUNTA_DE_HORARIO, makeProvider());

    expect(res).toEqual({ matched: false });
  });

  it('(c) overlap alto pero margen ínfimo → no matchea', async () => {
    mockVectorSearch.mockResolvedValue([horarios(0.9), precios(0.895)]);

    const res = await matchFaq(
      tenantId,
      '¿Cuál es el horario de atención los sábados?',
      makeProvider(),
    );

    expect(res).toEqual({ matched: false });
  });

  it('(d) margen y overlap suficientes → matchea con la respuesta literal', async () => {
    mockVectorSearch.mockResolvedValue([horarios(0.91), precios(0.86)]);

    const res = await matchFaq(tenantId, PREGUNTA_DE_HORARIO, makeProvider());

    expect(res.matched).toBe(true);
    expect(res.respuesta).toBe('Atendemos de lunes a viernes, de 8:00 a. m. a 6:00 p. m.');
    expect(res.confianza).toBe(0.91);
  });

  it('(e) candidato único: el tenant con una sola FAQ sigue cortocircuitando', async () => {
    // Sin segundo candidato no hay ambigüedad que medir: la señal de margen pasa.
    mockVectorSearch.mockResolvedValue([horarios(0.9)]);

    const res = await matchFaq(tenantId, PREGUNTA_DE_HORARIO, makeProvider());

    expect(res.matched).toBe(true);
    expect(res.confianza).toBe(0.9);
  });

  it('(f) el service ordena los candidatos: no asume el orden de salida de Atlas', async () => {
    mockVectorSearch.mockResolvedValue([precios(0.6), horarios(0.91)]);

    const res = await matchFaq(tenantId, PREGUNTA_DE_HORARIO, makeProvider());

    expect(res.matched).toBe(true);
    expect(res.respuesta).toBe('Atendemos de lunes a viernes, de 8:00 a. m. a 6:00 p. m.');
  });
});

// ─── testFaq ──────────────────────────────────────────────────────────────────
describe('testFaq', () => {
  const tenantId = new Types.ObjectId();

  const minimosVigentes = {
    umbral: env.FAQ_MATCH_THRESHOLD,
    margenMinimo: env.FAQ_MATCH_MIN_MARGIN,
    overlapMinimo: env.FAQ_MATCH_MIN_OVERLAP,
  };

  it('devuelve el mejor candidato aunque no supere el umbral', async () => {
    const score = env.FAQ_MATCH_THRESHOLD - 0.1;
    mockVectorSearch.mockResolvedValue([candidato({ score })]);

    const res = await testFaq(tenantId, '¿Cuánto cuesta el curso?', makeProvider());

    expect(res.matched).toBe(false);
    expect(res.confianza).toBe(score);
    expect(res.pregunta).toBe('¿Cuánto cuesta el curso?');
    expect(res.faqId).toBeDefined();
  });

  it('expone los tres mínimos vigentes para poder calibrarlos', async () => {
    mockVectorSearch.mockResolvedValue([candidato({ score: 0.9 })]);

    const res = await testFaq(tenantId, '¿Cuánto cuesta el curso?', makeProvider());

    expect(res.umbral).toBe(env.FAQ_MATCH_THRESHOLD);
    expect(res.margenMinimo).toBe(env.FAQ_MATCH_MIN_MARGIN);
    expect(res.overlapMinimo).toBe(env.FAQ_MATCH_MIN_OVERLAP);
  });

  it('marca matched: true cuando las tres señales pasan', async () => {
    mockVectorSearch.mockResolvedValue([candidato({ score: env.FAQ_MATCH_THRESHOLD })]);

    const res = await testFaq(tenantId, '¿Cuánto cuesta el curso?', makeProvider());

    expect(res.matched).toBe(true);
    expect(res.senales?.pasaUmbral).toBe(true);
    expect(res.senales?.pasaMargen).toBe(true);
    expect(res.senales?.pasaOverlap).toBe(true);
  });

  it('dice CUÁL señal bloqueó: overlap cero pese a un score alto', async () => {
    mockVectorSearch.mockResolvedValue([
      candidato({ score: 0.9, pregunta: '¿Cuál es el precio del curso?' }),
    ]);

    const res = await testFaq(tenantId, '¿A qué hora abren?', makeProvider());

    expect(res.matched).toBe(false);
    expect(res.senales?.pasaUmbral).toBe(true);
    expect(res.senales?.pasaOverlap).toBe(false);
    expect(res.senales?.overlap).toBe(0);
  });

  it('dice CUÁL señal bloqueó: margen insuficiente, con la FAQ rival a la vista', async () => {
    mockVectorSearch.mockResolvedValue([
      candidato({ score: 0.9, pregunta: '¿Cuál es el horario de atención?' }),
      candidato({ score: 0.895, pregunta: '¿Cuál es el precio del curso?' }),
    ]);

    const res = await testFaq(tenantId, '¿Cuál es el horario de atención?', makeProvider());

    expect(res.matched).toBe(false);
    expect(res.senales?.pasaMargen).toBe(false);
    expect(res.senales?.segundoScore).toBe(0.895);
    expect(res.senales?.margen).toBeCloseTo(0.005, 10);
    // Sin ver contra qué compitió, un margen pequeño no le dice nada al admin.
    expect(res.segundaPregunta).toBe('¿Cuál es el precio del curso?');
  });

  it('sin candidatos → matched false pero informa los mínimos vigentes', async () => {
    mockVectorSearch.mockResolvedValue([]);

    expect(await testFaq(tenantId, 'nada', makeProvider())).toEqual({
      matched: false,
      ...minimosVigentes,
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

  it('pedir DOS candidatos no abre una vía de fuga: ambos salen de la búsqueda scoped', async () => {
    // HU-KB-02-V2 pasó el pipeline de limit 1 a limit 2. El aislamiento vive en
    // buildFaqVectorSearchPipeline (filter.tenantId + $match defensivo, ver
    // kb-faq.repository.test.ts); lo que se verifica aquí es que el service no tiene otra
    // puerta: el único acceso a candidatos es faqVectorSearchScoped con el tenant recibido.
    const tenantB = new Types.ObjectId();
    mockVectorSearch.mockResolvedValue([]);

    await matchFaq(tenantB, '¿A qué hora abren?', makeProvider());
    await testFaq(tenantB, '¿A qué hora abren?', makeProvider());

    expect(mockVectorSearch).toHaveBeenCalledTimes(2);
    for (const [tenantUsado] of mockVectorSearch.mock.calls) {
      expect(String(tenantUsado)).toBe(tenantB.toString());
    }
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

  it('informa las activas del tenant y el mínimo vigente', async () => {
    const tenantId = new Types.ObjectId();
    await sembrarActivas(tenantId, 2);
    await createFaq(tenantId, { pregunta: '¿Apagada?', respuesta: 'x', activo: false }, makeProvider());

    const lista = await listFaqs(tenantId, 1, 20);

    expect(lista.total).toBe(3);
    expect(lista.activas).toBe(2);
    expect(lista.minimoActivas).toBe(MINIMO);
  });

  it('activas es del tenant entero: no lo mueve el filtro ni la paginación', async () => {
    // `total` responde al filtro; `activas` NO, porque es el número contra el que se compara el
    // mínimo. Si respetara el filtro, `?activo=false` diría que no queda ninguna activa.
    const tenantId = new Types.ObjectId();
    await sembrarActivas(tenantId, 3);
    await createFaq(tenantId, { pregunta: '¿Apagada?', respuesta: 'x', activo: false }, makeProvider());

    const soloInactivas = await listFaqs(tenantId, 1, 20, false);

    expect(soloInactivas.total).toBe(1);
    expect(soloInactivas.activas).toBe(3);
  });
});

// ─── Mínimo de FAQs activas (HU-KB-02-V3) ─────────────────────────────────────
describe('puedeReducirActivas', () => {
  it('permite bajar solo si queda margen sobre el mínimo', () => {
    expect(puedeReducirActivas(6, 5)).toBe(true);
    expect(puedeReducirActivas(5, 5)).toBe(false);
  });

  it('piso duro: por debajo del mínimo tampoco se puede bajar más', () => {
    expect(puedeReducirActivas(3, 5)).toBe(false);
    expect(puedeReducirActivas(0, 5)).toBe(false);
  });

  it('con el mínimo en 0 la regla no existe', () => {
    expect(puedeReducirActivas(0, 0)).toBe(true);
    expect(puedeReducirActivas(1, 0)).toBe(true);
  });
});

describe('mínimo de activas — bloqueo', () => {
  it('justo en el mínimo, desactivar una activa → 409 y el documento no cambia', async () => {
    const tenantId = new Types.ObjectId();
    const [primera] = await sembrarActivas(tenantId, MINIMO);

    await expect(
      updateFaq(tenantId, primera!.id, { activo: false }, makeProvider()),
    ).rejects.toThrow(AppError);

    const saved = await KbFaq.findById(primera!.id).lean<IKbFaq>();
    expect(saved?.activo).toBe(true);
  });

  it('el 409 adjunta cuántas activas hay y cuál es el mínimo', async () => {
    const tenantId = new Types.ObjectId();
    const [primera] = await sembrarActivas(tenantId, MINIMO);

    const err = await updateFaq(tenantId, primera!.id, { activo: false }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(409);
    expect((err as AppError).details).toEqual({ activas: MINIMO, minimo: MINIMO });
  });

  it('justo en el mínimo, eliminar una activa → 409 y la FAQ sobrevive', async () => {
    const tenantId = new Types.ObjectId();
    const [primera] = await sembrarActivas(tenantId, MINIMO);

    await expect(deleteFaq(tenantId, primera!.id)).rejects.toThrow(AppError);
    expect(await KbFaq.findById(primera!.id)).not.toBeNull();
  });

  it('piso duro: un tenant YA por debajo del mínimo tampoco puede bajar más', async () => {
    const tenantId = new Types.ObjectId();
    const [primera] = await sembrarActivas(tenantId, MINIMO - 2);

    await expect(deleteFaq(tenantId, primera!.id)).rejects.toThrow(AppError);
    await expect(
      updateFaq(tenantId, primera!.id, { activo: false }, makeProvider()),
    ).rejects.toThrow(AppError);
  });

  it('la guarda corre ANTES de re-embeber: no se gasta una llamada a Gemini en un rechazo', async () => {
    const tenantId = new Types.ObjectId();
    const [primera] = await sembrarActivas(tenantId, MINIMO);
    const provider = makeProvider();

    await expect(
      updateFaq(tenantId, primera!.id, { pregunta: '¿Otro texto?', activo: false }, provider),
    ).rejects.toThrow(AppError);

    expect(provider.embedTexts).not.toHaveBeenCalled();
  });
});

describe('mínimo de activas — lo que nunca se bloquea', () => {
  it('por encima del mínimo, desactivar funciona y deja el conteo justo en el mínimo', async () => {
    const tenantId = new Types.ObjectId();
    const [primera] = await sembrarActivas(tenantId, MINIMO + 1);

    const res = await updateFaq(tenantId, primera!.id, { activo: false }, makeProvider());

    expect(res.activo).toBe(false);
    expect((await listFaqs(tenantId, 1, 50)).activas).toBe(MINIMO);
  });

  it('por encima del mínimo, eliminar una activa funciona', async () => {
    const tenantId = new Types.ObjectId();
    const [primera] = await sembrarActivas(tenantId, MINIMO + 1);

    expect(await deleteFaq(tenantId, primera!.id)).toEqual({ deleted: true });
  });

  it('crear nunca se bloquea, ni siquiera con cero activas', async () => {
    const tenantId = new Types.ObjectId();

    const res = await createFaq(
      tenantId,
      { pregunta: '¿La primera?', respuesta: 'Sí.' },
      makeProvider(),
    );

    expect(res.activo).toBe(true);
  });

  it('editar el texto es la salida del piso duro: nunca se bloquea', async () => {
    // Es lo que impide que un tenant por debajo del mínimo quede atrapado con una FAQ equivocada.
    const tenantId = new Types.ObjectId();
    const [primera] = await sembrarActivas(tenantId, MINIMO - 2);

    const res = await updateFaq(
      tenantId,
      primera!.id,
      { pregunta: '¿Texto corregido?', respuesta: 'Respuesta corregida.' },
      makeProvider(),
    );

    expect(res.pregunta).toBe('¿Texto corregido?');
    expect(res.respuesta).toBe('Respuesta corregida.');
  });

  it('reactivar una apagada nunca se bloquea', async () => {
    const tenantId = new Types.ObjectId();
    await sembrarActivas(tenantId, MINIMO);
    const apagada = await createFaq(
      tenantId,
      { pregunta: '¿Dormida?', respuesta: 'x', activo: false },
      makeProvider(),
    );

    const res = await updateFaq(tenantId, apagada.id, { activo: true }, makeProvider());

    expect(res.activo).toBe(true);
  });

  it('mandar activo: false sobre una que YA estaba inactiva no toca la guarda', async () => {
    const tenantId = new Types.ObjectId();
    await sembrarActivas(tenantId, MINIMO);
    const apagada = await createFaq(
      tenantId,
      { pregunta: '¿Dormida?', respuesta: 'x', activo: false },
      makeProvider(),
    );

    const res = await updateFaq(tenantId, apagada.id, { activo: false }, makeProvider());

    expect(res.activo).toBe(false);
  });

  it('eliminar una INACTIVA está permitido aunque el tenant esté justo en el mínimo', async () => {
    // No mueve el conteo de activas, así que la regla no tiene nada que decir.
    const tenantId = new Types.ObjectId();
    await sembrarActivas(tenantId, MINIMO);
    const apagada = await createFaq(
      tenantId,
      { pregunta: '¿Dormida?', respuesta: 'x', activo: false },
      makeProvider(),
    );

    expect(await deleteFaq(tenantId, apagada.id)).toEqual({ deleted: true });
  });
});

describe('mínimo de activas — aislamiento multi-tenant', () => {
  it('cada tenant se mide con SU conteo: A por encima puede, B justo en el mínimo no', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const [aPrimera] = await sembrarActivas(tenantA, MINIMO + 2);
    const [bPrimera] = await sembrarActivas(tenantB, MINIMO);

    expect(await deleteFaq(tenantA, aPrimera!.id)).toEqual({ deleted: true });
    await expect(deleteFaq(tenantB, bPrimera!.id)).rejects.toThrow(AppError);
  });

  it('a la inversa: el conteo holgado de B no desbloquea a A', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    const [aPrimera] = await sembrarActivas(tenantA, MINIMO);
    await sembrarActivas(tenantB, MINIMO + 5);

    await expect(deleteFaq(tenantA, aPrimera!.id)).rejects.toThrow(AppError);
  });

  it('listFaqs de un tenant nunca cuenta las activas del otro', async () => {
    const tenantA = new Types.ObjectId();
    const tenantB = new Types.ObjectId();
    await sembrarActivas(tenantA, 4);
    await sembrarActivas(tenantB, 2);

    expect((await listFaqs(tenantA, 1, 50)).activas).toBe(4);
    expect((await listFaqs(tenantB, 1, 50)).activas).toBe(2);
  });
});
