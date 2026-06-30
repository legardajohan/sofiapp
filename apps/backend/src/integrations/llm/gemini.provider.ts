import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  SchemaType,
  type Schema,
} from '@google/generative-ai';
import { env } from '../../config/env.js';
import type {
  ILlmProvider,
  ChatTurn,
  SlotSpec,
  SlotResult,
  NivelInteres,
  Objecion,
} from './llm-provider.types.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err: unknown): boolean {
  if (err instanceof GoogleGenerativeAIFetchError) {
    return err.status === 429 || (err.status !== undefined && err.status >= 500);
  }
  return false;
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
  },
  required: ['nivelInteres'],
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
  }): Promise<string> {
    return this.callWithRetry(async (signal) => {
      const model = this.genAI.getGenerativeModel({ model: env.GEMINI_MODEL });
      const result = await model.generateContent(
        {
          contents: chatTurnsToContents(input.historial),
          systemInstruction: `Tono: ${input.tono}. ${input.instrucciones}`,
        },
        { signal },
      );
      return result.response.text();
    });
  }

  async extractSlots(input: {
    historial: ChatTurn[];
    camposObjetivo: SlotSpec[];
  }): Promise<SlotResult> {
    return this.callWithRetry(async (signal) => {
      const schema = slotSpecToSchema(input.camposObjetivo);
      const model = this.genAI.getGenerativeModel({
        model: env.GEMINI_MODEL,
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
      return { slots: raw, incompletos };
    });
  }

  async classifyLead(input: {
    historial: ChatTurn[];
  }): Promise<{ nivelInteres: NivelInteres; objecion: Objecion | null }> {
    return this.callWithRetry(async (signal) => {
      const model = this.genAI.getGenerativeModel({
        model: env.GEMINI_MODEL,
        generationConfig: { responseMimeType: 'application/json', responseSchema: CLASSIFY_SCHEMA },
      });
      const result = await model.generateContent(
        { contents: chatTurnsToContents(input.historial) },
        { signal },
      );
      const raw = JSON.parse(result.response.text()) as {
        nivelInteres: NivelInteres;
        objecion?: Objecion | null;
      };
      return {
        nivelInteres: raw.nivelInteres,
        objecion: raw.objecion ?? null,
      };
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
