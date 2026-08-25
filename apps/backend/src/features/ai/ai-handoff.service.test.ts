import { describe, it, expect, beforeEach, vi } from 'vitest';

// El servicio importa el singleton de AIService (para `classify`), que abre Redis al instanciarse.
const { mockClassify } = vi.hoisted(() => ({ mockClassify: vi.fn() }));
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ classify: mockClassify }),
}));

import {
  evaluarAntesDeGenerar,
  evaluarDespuesDeGenerar,
  FRASES_PETICION_EXPLICITA,
} from './ai-handoff.service.js';
import type { HandoffSettingsDTO } from './ai-handoff.types.js';
import type { AiResult } from '../../services/ai/ai-service.types.js';
import type { ChatTurn } from '../../integrations/llm/llm-provider.types.js';
import { CHAT_FRASE_DERIVACION } from '../../seed/seed-prompt-templates.js';

const TENANT = '6a8dbe9c479f47f5e11d6242';
const HISTORIAL: ChatTurn[] = [{ role: 'user', content: 'Hola' }];

function settings(overrides: Partial<HandoffSettingsDTO['reglas']> = {}): HandoffSettingsDTO {
  return {
    activo: true,
    asesorDestinoId: null,
    mensajeTransicion: 'Ya le pasé tu conversación a un asesor.',
    heredado: false,
    reglas: {
      explicitRequest: { activa: false, frases: FRASES_PETICION_EXPLICITA },
      keyword: { activa: false, palabras: [] },
      lowConfidence: { activa: false, umbral: null },
      intentPurchase: { activa: false, nivelMinimo: 'caliente' },
      ...overrides,
    },
  };
}

/** `chat()` devuelve mucho más que el texto; el motor lee `cacheHit`, `fromFaq` y los fragmentos. */
function resultado(overrides: Partial<AiResult<string>> = {}): AiResult<string> {
  return {
    data: 'La matrícula cuesta 500.000 pesos.',
    cacheHit: false,
    fromFaq: false,
    retrievedChunks: [{ texto: 'Matrícula: 500.000', documentId: 'doc1', score: 0.9 }],
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    durationMs: 100,
    ...overrides,
  };
}

beforeEach(() => {
  mockClassify.mockReset();
});

describe('HU-IA-03 — evaluación antes de generar', () => {
  it('con la configuración apagada no dispara nada', () => {
    const s = { ...settings({ explicitRequest: { activa: true, frases: ['asesor'] } }), activo: false };
    expect(evaluarAntesDeGenerar(s, 'quiero un asesor')).toEqual({ dispara: false });
  });

  it('petición explícita: "quiero hablar con una persona" dispara', () => {
    const s = settings({ explicitRequest: { activa: true, frases: FRASES_PETICION_EXPLICITA } });
    expect(evaluarAntesDeGenerar(s, 'Buenas, quiero hablar con una persona por favor')).toEqual({
      dispara: true,
      motivo: 'explicit_request',
    });
  });

  it('petición explícita: un mensaje normal no dispara', () => {
    const s = settings({ explicitRequest: { activa: true, frases: FRASES_PETICION_EXPLICITA } });
    expect(evaluarAntesDeGenerar(s, '¿Cuánto cuesta la matrícula?')).toEqual({ dispara: false });
  });

  it('palabra clave: compara sin distinguir mayúsculas ni acentos', () => {
    const s = settings({ keyword: { activa: true, palabras: ['reclamo'] } });
    expect(evaluarAntesDeGenerar(s, 'Quiero poner un RECLAMO')).toEqual({
      dispara: true,
      motivo: 'keyword',
    });
    expect(evaluarAntesDeGenerar(s, 'tengo una devolución pendiente')).toEqual({ dispara: false });
  });

  it('palabra clave: la tilde del mensaje no impide la coincidencia', () => {
    const s = settings({ keyword: { activa: true, palabras: ['factura'] } });
    expect(evaluarAntesDeGenerar(s, 'necesito la fáctura de enero')).toEqual({
      dispara: true,
      motivo: 'keyword',
    });
  });

  it('palabra clave: "asesoría" NO dispara la palabra "asesor"', () => {
    // Con `includes` a secas esto saltaría, y ocuparía a una persona porque el cliente escribió una
    // palabra que contiene otra. El admin configuró "asesor", no un prefijo.
    const s = settings({ keyword: { activa: true, palabras: ['asesor'] } });
    expect(evaluarAntesDeGenerar(s, 'me interesa la asesoría financiera')).toEqual({
      dispara: false,
    });
    expect(evaluarAntesDeGenerar(s, 'necesito un asesor')).toEqual({
      dispara: true,
      motivo: 'keyword',
    });
  });

  it('la palabra clave coincide aunque venga pegada a un signo de puntuación', () => {
    const s = settings({ keyword: { activa: true, palabras: ['cancelar'] } });
    expect(evaluarAntesDeGenerar(s, '¿puedo cancelar?')).toEqual({
      dispara: true,
      motivo: 'keyword',
    });
  });

  it('una regla inactiva no se evalúa', () => {
    const s = settings({ keyword: { activa: false, palabras: ['reclamo'] } });
    expect(evaluarAntesDeGenerar(s, 'quiero un reclamo')).toEqual({ dispara: false });
  });

  it('prioridad: con ambas activas y ambas ciertas gana la petición explícita', () => {
    const s = settings({
      explicitRequest: { activa: true, frases: ['hablar con un asesor'] },
      keyword: { activa: true, palabras: ['precio'] },
    });
    expect(evaluarAntesDeGenerar(s, 'quiero hablar con un asesor sobre el precio')).toEqual({
      dispara: true,
      motivo: 'explicit_request',
    });
  });
});

describe('HU-IA-03 — evaluación después de generar: baja confianza', () => {
  const bajaConfianza = settings({ lowConfidence: { activa: true, umbral: null } });

  it('sin fragmentos y con la frase de derivación, dispara', async () => {
    const r = resultado({ retrievedChunks: [], data: CHAT_FRASE_DERIVACION });
    await expect(evaluarDespuesDeGenerar(bajaConfianza, TENANT, HISTORIAL, r)).resolves.toEqual({
      dispara: true,
      motivo: 'low_confidence',
    });
  });

  it('una respuesta cacheada NO dispara aunque venga sin fragmentos', async () => {
    // `chat()` devuelve `retrievedChunks: []` por construcción en la rama de caché: la respuesta es
    // buena, solo que esta vez no se recuperó nada.
    const r = resultado({ cacheHit: true, retrievedChunks: [], data: CHAT_FRASE_DERIVACION });
    await expect(evaluarDespuesDeGenerar(bajaConfianza, TENANT, HISTORIAL, r)).resolves.toEqual({
      dispara: false,
    });
  });

  it('una respuesta de FAQ NO dispara aunque venga sin fragmentos', async () => {
    // La escribió el propio admin: es lo contrario de baja confianza.
    const r = resultado({ fromFaq: true, cacheHit: true, retrievedChunks: [], data: 'Abrimos de 8 a 5.' });
    await expect(evaluarDespuesDeGenerar(bajaConfianza, TENANT, HISTORIAL, r)).resolves.toEqual({
      dispara: false,
    });
  });

  it('un "gracias" respondido con naturalidad NO dispara', async () => {
    // Sin fragmentos (no había nada que buscar) pero sin frase de derivación. Es el falso positivo
    // que HU-IA-02 acaba de corregir en el prompt; el motor no puede reintroducirlo.
    const r = resultado({ retrievedChunks: [], data: '¡Con mucho gusto! Que tengas buen día.' });
    await expect(evaluarDespuesDeGenerar(bajaConfianza, TENANT, HISTORIAL, r)).resolves.toEqual({
      dispara: false,
    });
  });

  it('con umbral propio, un score por debajo dispara', async () => {
    const s = settings({ lowConfidence: { activa: true, umbral: 0.9 } });
    const r = resultado({ retrievedChunks: [{ texto: 'algo', documentId: 'd', score: 0.8 }] });
    await expect(evaluarDespuesDeGenerar(s, TENANT, HISTORIAL, r)).resolves.toEqual({
      dispara: true,
      motivo: 'low_confidence',
    });
  });

  it('con umbral propio, un score por encima no dispara', async () => {
    const s = settings({ lowConfidence: { activa: true, umbral: 0.85 } });
    const r = resultado({ retrievedChunks: [{ texto: 'algo', documentId: 'd', score: 0.95 }] });
    await expect(evaluarDespuesDeGenerar(s, TENANT, HISTORIAL, r)).resolves.toEqual({
      dispara: false,
    });
  });

  it('sin umbral propio, tener fragmentos basta para no disparar', async () => {
    await expect(
      evaluarDespuesDeGenerar(bajaConfianza, TENANT, HISTORIAL, resultado()),
    ).resolves.toEqual({ dispara: false });
  });
});

describe('HU-IA-03 — evaluación después de generar: intención de compra', () => {
  it('dispara cuando el nivel alcanza el mínimo configurado', async () => {
    mockClassify.mockResolvedValue({ data: { nivelInteres: 'caliente', objecion: null } });
    const s = settings({ intentPurchase: { activa: true, nivelMinimo: 'caliente' } });

    await expect(evaluarDespuesDeGenerar(s, TENANT, HISTORIAL, resultado())).resolves.toEqual({
      dispara: true,
      motivo: 'intent_purchase',
    });
  });

  it('no dispara cuando el nivel se queda corto', async () => {
    mockClassify.mockResolvedValue({ data: { nivelInteres: 'tibio', objecion: 'precio' } });
    const s = settings({ intentPurchase: { activa: true, nivelMinimo: 'caliente' } });

    await expect(evaluarDespuesDeGenerar(s, TENANT, HISTORIAL, resultado())).resolves.toEqual({
      dispara: false,
    });
  });

  it('compara por orden de la escala, no por igualdad: "caliente" cumple un mínimo "tibio"', async () => {
    mockClassify.mockResolvedValue({ data: { nivelInteres: 'caliente', objecion: null } });
    const s = settings({ intentPurchase: { activa: true, nivelMinimo: 'tibio' } });

    await expect(evaluarDespuesDeGenerar(s, TENANT, HISTORIAL, resultado())).resolves.toEqual({
      dispara: true,
      motivo: 'intent_purchase',
    });
  });

  it('no llama a classify() si la regla está inactiva', async () => {
    // Es una llamada extra al modelo por mensaje: si nadie la pidió, no se paga.
    await expect(
      evaluarDespuesDeGenerar(settings(), TENANT, HISTORIAL, resultado()),
    ).resolves.toEqual({ dispara: false });
    expect(mockClassify).not.toHaveBeenCalled();
  });

  it('no llama a classify() si la baja confianza ya disparó', async () => {
    const s = settings({
      lowConfidence: { activa: true, umbral: null },
      intentPurchase: { activa: true, nivelMinimo: 'caliente' },
    });
    const r = resultado({ retrievedChunks: [], data: CHAT_FRASE_DERIVACION });

    await expect(evaluarDespuesDeGenerar(s, TENANT, HISTORIAL, r)).resolves.toEqual({
      dispara: true,
      motivo: 'low_confidence',
    });
    expect(mockClassify).not.toHaveBeenCalled();
  });

  it('si classify() lanza, no dispara y no propaga', async () => {
    // La respuesta ya está generada y tiene que salir: un fallo del clasificador puede costar un
    // handoff, pero propagarlo costaría la respuesta entera.
    mockClassify.mockRejectedValue(new Error('Gemini 429'));
    const s = settings({ intentPurchase: { activa: true, nivelMinimo: 'caliente' } });

    await expect(evaluarDespuesDeGenerar(s, TENANT, HISTORIAL, resultado())).resolves.toEqual({
      dispara: false,
    });
  });

  it('con la configuración apagada no se evalúa nada', async () => {
    const s = { ...settings({ intentPurchase: { activa: true, nivelMinimo: 'tibio' } }), activo: false };
    await expect(evaluarDespuesDeGenerar(s, TENANT, HISTORIAL, resultado())).resolves.toEqual({
      dispara: false,
    });
    expect(mockClassify).not.toHaveBeenCalled();
  });
});
