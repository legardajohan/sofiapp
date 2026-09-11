/** Configuración vigente del asistente de la empresa (HU-IA-01). */
export interface AssistantConfig {
  /** Cómo suena Sofi. Va aparte del prompt porque el modelo lo recibe en su propio campo. */
  tono: string;
  /** Qué debe y qué no debe hacer Sofi al responder. */
  systemPrompt: string;
  /** `true` mientras la empresa no haya guardado la suya y esté usando la de fábrica. */
  heredado: boolean;
  version: string;
}

export interface UpdateAssistantPayload {
  tono: string;
  systemPrompt: string;
}

export const TONO_MAX = 200;
export const SYSTEM_PROMPT_MAX = 8000;
