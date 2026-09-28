import type { TipoMediaSaliente } from '../../features/media/media.types.js';

export interface IMessagingProvider {
  sendText(
    to: string,
    text: string,
    phoneNumberId: string,
    accessToken: string,
  ): Promise<{ messageId: string }>;

  sendTemplate(
    to: string,
    templateName: string,
    langCode: string,
    components: unknown[],
    phoneNumberId: string,
    accessToken: string,
  ): Promise<{ messageId: string }>;

  /**
   * Envía un archivo ya subido a Meta (HU-OMNI-06). Recibe el `mediaId` hecho: subir el archivo es
   * un paso previo que hace `media.service`, no este cliente.
   */
  sendMedia(
    to: string,
    tipo: TipoMediaSaliente,
    mediaId: string,
    opciones: { caption?: string; filename?: string; esNotaDeVoz?: boolean },
    phoneNumberId: string,
    accessToken: string,
  ): Promise<{ messageId: string }>;
}
