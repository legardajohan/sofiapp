import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del SDK antes de importar GeminiProvider
const mockGenerateContent = vi.fn();
const mockBatchEmbedContents = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
  batchEmbedContents: mockBatchEmbedContents,
}));

vi.mock('@google/generative-ai', () => {
  class GoogleGenerativeAIFetchError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  }
  return {
    GoogleGenerativeAI: vi.fn(() => ({ getGenerativeModel: mockGetGenerativeModel })),
    GoogleGenerativeAIFetchError,
    SchemaType: { STRING: 'STRING', NUMBER: 'NUMBER', BOOLEAN: 'BOOLEAN', OBJECT: 'OBJECT', ARRAY: 'ARRAY', INTEGER: 'INTEGER' },
    TaskType: { RETRIEVAL_DOCUMENT: 'RETRIEVAL_DOCUMENT', RETRIEVAL_QUERY: 'RETRIEVAL_QUERY' },
  };
});

import { GeminiProvider } from './gemini.provider.js';
import { GoogleGenerativeAIFetchError } from '@google/generative-ai';

const HISTORIAL = [{ role: 'user' as const, content: '¿Cuánto cuesta?' }];

describe('GeminiProvider.generateReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('respuesta OK → retorna el texto de Gemini', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'El precio es $50/mes.' },
    });
    const provider = new GeminiProvider();
    const { result } = await provider.generateReply({
      historial: HISTORIAL,
      tono: 'amable',
      instrucciones: 'Responde brevemente',
    });
    expect(result).toBe('El precio es $50/mes.');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('respuesta OK con usageMetadata → retorna conteo de tokens real', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'El precio es $50/mes.',
        usageMetadata: { promptTokenCount: 42, candidatesTokenCount: 8, totalTokenCount: 50 },
      },
    });
    const provider = new GeminiProvider();
    const { usage } = await provider.generateReply({
      historial: HISTORIAL,
      tono: 'amable',
      instrucciones: 'Responde brevemente',
    });
    expect(usage).toEqual({ promptTokens: 42, completionTokens: 8, totalTokens: 50 });
  });

  it('respuesta OK sin usageMetadata → usage en cero', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'El precio es $50/mes.' },
    });
    const provider = new GeminiProvider();
    const { usage } = await provider.generateReply({
      historial: HISTORIAL,
      tono: 'amable',
      instrucciones: 'Responde brevemente',
    });
    expect(usage).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  });

  it('error 429 → reintenta 3 veces y finalmente lanza', async () => {
    const err429 = new GoogleGenerativeAIFetchError('Too Many Requests', 429);
    mockGenerateContent.mockRejectedValue(err429);

    const provider = new GeminiProvider();
    await expect(
      provider.generateReply({ historial: HISTORIAL, tono: 'neutro', instrucciones: '' }),
    ).rejects.toThrow('Too Many Requests');

    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
  });

  it('error de red no retryable → lanza inmediatamente sin reintentos', async () => {
    mockGenerateContent.mockRejectedValue(new Error('Network error'));
    const provider = new GeminiProvider();
    await expect(
      provider.generateReply({ historial: HISTORIAL, tono: 'neutro', instrucciones: '' }),
    ).rejects.toThrow('Network error');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });
});

const INSTRUCCIONES = 'Clasificas conversaciones comerciales.';

describe('GeminiProvider.classifyLead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve nivelInteres y objecion del JSON de Gemini', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () =>
          JSON.stringify({
            nivelInteres: 'tibio',
            objecion: 'precio',
            confianza: 0.82,
            motivo: 'compara precios sin comprometerse',
          }),
      },
    });
    const provider = new GeminiProvider();
    const { result } = await provider.classifyLead({ historial: HISTORIAL, instrucciones: INSTRUCCIONES });
    expect(result.nivelInteres).toBe('tibio');
    expect(result.objecion).toBe('precio');
    expect(result.confianza).toBe(0.82);
    expect(result.motivo).toBe('compara precios sin comprometerse');
  });

  it('objecion null cuando Gemini no devuelve objecion', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ nivelInteres: 'frio' }) },
    });
    const provider = new GeminiProvider();
    const { result } = await provider.classifyLead({ historial: HISTORIAL, instrucciones: INSTRUCCIONES });
    expect(result.objecion).toBeNull();
  });

  // HU-IA-05: hasta entonces la plantilla `classify` que el servicio resolvía no llegaba al modelo.
  it('pasa las instrucciones como systemInstruction', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ nivelInteres: 'frio', confianza: 0.4, motivo: 'x' }) },
    });
    const provider = new GeminiProvider();
    await provider.classifyLead({ historial: HISTORIAL, instrucciones: INSTRUCCIONES });
    expect(mockGenerateContent.mock.calls[0]![0]).toMatchObject({
      systemInstruction: INSTRUCCIONES,
    });
  });

  // Sin ellos, `AIService.classify` los sanea a 0 y '' — el semáforo simplemente no se mueve.
  it('confianza 0 y motivo vacío cuando Gemini no los devuelve', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ nivelInteres: 'caliente' }) },
    });
    const provider = new GeminiProvider();
    const { result } = await provider.classifyLead({ historial: HISTORIAL, instrucciones: INSTRUCCIONES });
    expect(result.confianza).toBe(0);
    expect(result.motivo).toBe('');
  });
});

describe('GeminiProvider.embedTexts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista vacía → no llama al SDK y retorna []', async () => {
    const provider = new GeminiProvider();
    const { result } = await provider.embedTexts({ texts: [], taskType: 'RETRIEVAL_QUERY' });
    expect(result).toEqual([]);
    expect(mockBatchEmbedContents).not.toHaveBeenCalled();
  });

  it('retorna un vector por texto de entrada', async () => {
    mockBatchEmbedContents.mockResolvedValue({
      embeddings: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }],
    });
    const provider = new GeminiProvider();
    const { result } = await provider.embedTexts({
      texts: ['hola', 'mundo'],
      taskType: 'RETRIEVAL_DOCUMENT',
    });
    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(mockBatchEmbedContents).toHaveBeenCalledTimes(1);
  });
});

describe('GeminiProvider.extractSlots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve slots y detecta campos incompletos', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ nombre: 'Juan' }) },
    });
    const provider = new GeminiProvider();
    const { result } = await provider.extractSlots({
      historial: HISTORIAL,
      camposObjetivo: [
        { campo: 'nombre', descripcion: 'Nombre del prospecto', tipo: 'texto', requerido: true },
        { campo: 'email', descripcion: 'Email del prospecto', tipo: 'texto', requerido: true },
      ],
    });
    expect(result.slots['nombre']).toBe('Juan');
    expect(result.incompletos).toContain('email');
    expect(result.incompletos).not.toContain('nombre');
  });
});
