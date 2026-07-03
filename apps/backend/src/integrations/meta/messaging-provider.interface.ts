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
}
