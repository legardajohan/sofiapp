export interface ChatTurn {
  role: 'user' | 'model';
  content: string;
}

export type NivelInteres = 'frio' | 'tibio' | 'caliente';
export type Objecion = 'precio' | 'tiempo' | 'confianza' | 'otra';

export type EmbedTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

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

/**
 * Lo que el clasificador devuelve sobre una conversación (HU-IA-03 + HU-IA-05).
 *
 * `confianza` y `motivo` los añade HU-IA-05: sin ellos no hay umbral con el que decidir si tocar el
 * semáforo, ni justificación que auditar. Salen de la MISMA llamada al modelo — solo amplían el
 * `responseSchema`—, así que no cuestan una petición extra.
 */
export interface ClassifyLeadOutput {
  nivelInteres: NivelInteres;
  objecion: Objecion | null;
  /** Seguridad del modelo en su propia clasificación, en `[0, 1]`. */
  confianza: number;
  /** Una frase en español que justifica el nivel, citando lo que el cliente pidió. */
  motivo: string;
}

export interface ILlmProvider {
  extractSlots(input: {
    historial: ChatTurn[];
    camposObjetivo: SlotSpec[];
  }): Promise<LlmCallResult<SlotResult>>;

  classifyLead(input: {
    historial: ChatTurn[];
    /**
     * `systemPrompt` de la plantilla `classify` activa. **Obligatorio, no opcional**: hasta HU-IA-05
     * este parámetro no existía y la plantilla que `classify()` resolvía nunca llegaba al modelo
     * (era texto muerto). Hacerlo opcional dejaría vivo ese mismo agujero, y el fallo es silencioso
     * — el modelo responde igual, solo que sin criterio.
     */
    instrucciones: string;
  }): Promise<LlmCallResult<ClassifyLeadOutput>>;

  generateReply(input: {
    historial: ChatTurn[];
    tono: string;
    instrucciones: string;
  }): Promise<LlmCallResult<string>>;

  // Genera embeddings (vectores) para RAG. Un vector por texto de entrada.
  embedTexts(input: {
    texts: string[];
    taskType: EmbedTaskType;
  }): Promise<LlmCallResult<number[][]>>;
}
