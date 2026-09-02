import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  SchemaType,
  TaskType,
  type Schema,
} from '@google/generative-ai';
import { env } from '../../config/env.js';
import type {
  ILlmProvider,
  ChatTurn,
  ClassifyLeadOutput,
  SlotSpec,
  SlotResult,
  NivelInteres,
  Objecion,
  EmbedTaskType,
  LlmUsage,
  LlmCallResult,
} from './llm-provider.types.js';

const ZERO_USAGE: LlmUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err: unknown): boolean {
  if (err instanceof GoogleGenerativeAIFetchError) {
    return err.status === 429 || (err.status !== undefined && err.status >= 500);
  }
  return false;
}

function usageFromResponse(response: {
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}): LlmUsage {
  const usage = response.usageMetadata;
  return {
    promptTokens: usage?.promptTokenCount ?? 0,
    completionTokens: usage?.candidatesTokenCount ?? 0,
    totalTokens: usage?.totalTokenCount ?? 0,
  };
}

function chatTurnsToContents(historial: ChatTurn[]): Array<{ role: string; parts: Array<{ text: string }> }> {
  return historial.map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.content }],
  }));
}

function slotSpecToSchema(slots: SlotSpec[]): Schema {
  const properties: Record<string, Schema> = {};
  for (const slot of slots) {
    switch (slot.tipo) {
      case 'numero':
        properties[slot.campo] = { type: SchemaType.NUMBER, description: slot.descripcion };
        break;
      case 'booleano':
        properties[slot.campo] = { type: SchemaType.BOOLEAN, description: slot.descripcion };
        break;
      case 'texto':
      case 'fecha':
      default:
        properties[slot.campo] = { type: SchemaType.STRING, description: slot.descripcion };
    }
  }
  return {
    type: SchemaType.OBJECT,
    properties,
    required: slots.filter((s) => s.requerido).map((s) => s.campo),
  };
}

const CLASSIFY_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    nivelInteres: {
      type: SchemaType.STRING,
      format: 'enum',
      enum: ['frio', 'tibio', 'caliente'],
    },
    objecion: {
      type: SchemaType.STRING,
      format: 'enum',
      nullable: true,
      enum: ['precio', 'tiempo', 'confianza', 'otra'],
    },
    // HU-IA-05. Sin `format: 'enum'`: son número y prosa libre, no una unión cerrada.
    confianza: { type: SchemaType.NUMBER },
    motivo: { type: SchemaType.STRING },
  },
  // `objecion` sigue fuera de `required` porque su ausencia ES la respuesta "no planteó ninguna".
  required: ['nivelInteres', 'confianza', 'motivo'],
};

export class GeminiProvider implements ILlmProvider {
  private readonly genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }

  async generateReply(input: {
    historial: ChatTurn[];
    tono: string;
    instrucciones: string;
  }): Promise<LlmCallResult<string>> {
    return this.callWithRetry(async (signal) => {
      const model = this.genAI.getGenerativeModel({ model: env.GEMINI_MODEL });
      const result = await model.generateContent(
        {
          contents: chatTurnsToContents(input.historial),
          systemInstruction: `Tono: ${input.tono}. ${input.instrucciones}`,
        },
        { signal },
      );
      return { result: result.response.text(), usage: usageFromResponse(result.response) };
    });
  }

  async extractSlots(input: {
    historial: ChatTurn[];
    camposObjetivo: SlotSpec[];
    instrucciones: string;
  }): Promise<LlmCallResult<SlotResult>> {
    return this.callWithRetry(async (signal) => {
      const schema = slotSpecToSchema(input.camposObjetivo);
      const model = this.genAI.getGenerativeModel({
        model: env.GEMINI_MODEL,
        // HU-IA-06: hasta ahora la plantilla `extract` no llegaba al modelo y el único criterio de
        // extracción eran las descripciones de los slots. Mismo patrón que `classifyLead`.
        systemInstruction: input.instrucciones,
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
      });
      const result = await model.generateContent(
        { contents: chatTurnsToContents(input.historial) },
        { signal },
      );
      const raw = JSON.parse(result.response.text()) as Record<string, unknown>;
      const incompletos = input.camposObjetivo
        .filter((s) => s.requerido && (raw[s.campo] === undefined || raw[s.campo] === null))
        .map((s) => s.campo);
      return {
        result: { slots: raw, incompletos },
        usage: usageFromResponse(result.response),
      };
    });
  }

  async classifyLead(input: {
    historial: ChatTurn[];
    instrucciones: string;
  }): Promise<LlmCallResult<ClassifyLeadOutput>> {
    return this.callWithRetry(async (signal) => {
      const model = this.genAI.getGenerativeModel({
        model: env.GEMINI_MODEL,
        generationConfig: { responseMimeType: 'application/json', responseSchema: CLASSIFY_SCHEMA },
      });
      const result = await model.generateContent(
        {
          contents: chatTurnsToContents(input.historial),
          // HU-IA-05: hasta ahora faltaba, y la plantilla `classify` que el servicio resolvía no
          // llegaba nunca al modelo. Mismo sitio que en `generateReply`.
          systemInstruction: input.instrucciones,
        },
        { signal },
      );
      const raw = JSON.parse(result.response.text()) as {
        nivelInteres: NivelInteres;
        objecion?: Objecion | null;
        confianza?: number;
        motivo?: string;
      };
      // Se devuelve tal cual viene: el saneado (recorte de `confianza` a [0,1] y de `motivo` a su
      // longitud máxima) vive en `AIService.classify`, para que valga igual con otro proveedor.
      return {
        result: {
          nivelInteres: raw.nivelInteres,
          objecion: raw.objecion ?? null,
          confianza: raw.confianza ?? 0,
          motivo: raw.motivo ?? '',
        },
        usage: usageFromResponse(result.response),
      };
    });
  }

  async embedTexts(input: {
    texts: string[];
    taskType: EmbedTaskType;
  }): Promise<LlmCallResult<number[][]>> {
    if (input.texts.length === 0) return { result: [], usage: ZERO_USAGE };
    return this.callWithRetry(async (signal) => {
      const model = this.genAI.getGenerativeModel({ model: env.GEMINI_EMBED_MODEL });
      const response = await model.batchEmbedContents(
        {
          requests: input.texts.map((text) => ({
            content: { role: 'user', parts: [{ text }] },
            taskType: input.taskType as TaskType,
            // Fija la dimensión al valor del índice vectorial de Atlas (KB_EMBED_DIM).
            outputDimensionality: env.KB_EMBED_DIM,
          })),
        },
        { signal },
      );
      // Los endpoints de embeddings no reportan usageMetadata: usage en cero.
      return { result: response.embeddings.map((e) => e.values), usage: ZERO_USAGE };
    });
  }

  private async callWithRetry<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const delays = [500, 1000, 2000] as const;

    for (let attempt = 0; attempt <= 2; attempt++) {
      const signal = AbortSignal.timeout(env.LLM_TIMEOUT_MS);
      try {
        return await fn(signal);
      } catch (err) {
        if (attempt < 2 && isRetryable(err)) {
          await sleep(delays[attempt]!);
          continue;
        }
        throw err;
      }
    }
    // nunca llega aquí: el bucle siempre lanza o retorna antes
    throw new Error('callWithRetry: estado inalcanzable');
  }
}
