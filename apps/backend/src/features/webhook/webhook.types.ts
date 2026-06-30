export interface IWhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: IWebhookEntry[];
}

export interface IWebhookEntry {
  id: string;
  changes: IWebhookChange[];
}

export interface IWebhookChange {
  value: IWebhookValue;
  field: 'messages';
}

export interface IWebhookValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
  messages?: IWhatsAppMessage[];
  statuses?: IWhatsAppStatus[];
}

export interface IWhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'document' | 'other';
  text?: { body: string };
}

export interface IWhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
}
