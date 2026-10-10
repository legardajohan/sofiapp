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

/**
 * Tema de una conversación (HU-REP-03): qué producto de la KB del tenant consulta el cliente.
 * `tema` es uno de los nombres ofrecidos, literal, o `'otros'`. El proveedor lo restringe con un
 * `enum`, pero el llamador vuelve a comprobarlo: lo que devuelve el modelo es una sugerencia.
 */
export interface ClassifyTopicOutput {
  tema: string;
  /** Seguridad del modelo, en `[0, 1]`. */
  confianza: number;
}

/** Una opción de la lista cerrada del clasificador de tema. */
export interface TopicOption {
  nombre: string;
  descripcion?: string;
}

/** Valor reservado del clasificador de tema: ningún producto de la lista encaja. */
export const TEMA_OTROS = 'otros';

export interface ILlmProvider {
  extractSlots(input: {
    historial: ChatTurn[];
    camposObjetivo: SlotSpec[];
    /**
     * `systemPrompt` de la plantilla `extract` activa. **Obligatorio, no opcional**: hasta HU-IA-06
     * este parámetro no existía y la plantilla que `extract()` resolvía nunca llegaba al modelo
     * (era texto muerto, el mismo agujero que HU-IA-05 cerró en `classifyLead`). Hacerlo opcional
     * lo dejaría vivo, y el fallo es silencioso — el modelo responde igual, solo que sin criterio.
     */
    instrucciones: string;
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

  /**
   * HU-REP-03. `opciones` es la lista cerrada de productos de la KB del tenant: el proveedor la
   * anexa a las instrucciones y la convierte en el `enum` de la salida, con `'otros'` añadido.
   */
  classifyTopic(input: {
    historial: ChatTurn[];
    /** `systemPrompt` de la plantilla `topic`. Obligatorio por lo mismo que en `classifyLead`. */
    instrucciones: string;
    opciones: TopicOption[];
  }): Promise<LlmCallResult<ClassifyTopicOutput>>;

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
