export interface ChatTurn {
  role: 'user' | 'model';
  content: string;
}

export type NivelInteres = 'frio' | 'tibio' | 'caliente';
export type Objecion = 'precio' | 'tiempo' | 'confianza' | 'otra';

export interface SlotSpec {
  campo: string;
  descripcion: string;
  tipo: 'texto' | 'numero' | 'fecha' | 'booleano';
  requerido: boolean;
}

export interface SlotResult {
  slots: Record<string, unknown>;
  incompletos: string[];
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmCallResult<T> {
  result: T;
  usage: LlmUsage;
}

export interface ILlmProvider {
  extractSlots(input: {
    historial: ChatTurn[];
    camposObjetivo: SlotSpec[];
  }): Promise<LlmCallResult<SlotResult>>;

  classifyLead(input: {
    historial: ChatTurn[];
  }): Promise<LlmCallResult<{ nivelInteres: NivelInteres; objecion: Objecion | null }>>;

  generateReply(input: {
    historial: ChatTurn[];
    tono: string;
    instrucciones: string;
  }): Promise<LlmCallResult<string>>;
}
