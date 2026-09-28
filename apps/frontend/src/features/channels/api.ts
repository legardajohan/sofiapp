import { apiClient } from '../../api/apiClient.js';
import type { MessagingTier, QualityRating } from '../campaigns/types.js';

export interface IChannelConnectDto {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}

/** Lo que devuelve el popup de Meta: un `code` de un solo uso, nunca un token (HT-WA-03). */
export interface IEmbeddedSignupDto {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

export interface IChannelStatusResponse {
  activo: boolean;
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  messagingTier: MessagingTier;
  qualityRating: QualityRating;
  tierSyncedAt: string | null;
  tierManual: boolean;
}

/**
 * El canje del code, la suscripción y el registro del número son varias llamadas seguidas a Meta:
 * los 10 s por defecto del cliente se quedan cortos en un día lento de la Graph API.
 */
const ONBOARDING_TIMEOUT_MS = 45_000;

export async function connectWhatsApp(dto: IChannelConnectDto): Promise<IChannelStatusResponse> {
  const { data } = await apiClient.post<IChannelStatusResponse>('/channels/whatsapp/connect', dto);
  return data;
}

export async function connectEmbeddedSignup(
  dto: IEmbeddedSignupDto,
): Promise<IChannelStatusResponse> {
  const { data } = await apiClient.post<IChannelStatusResponse>(
    '/channels/whatsapp/embedded-signup',
    dto,
    { timeout: ONBOARDING_TIMEOUT_MS },
  );
  return data;
}

export async function activateWhatsApp(pin?: string): Promise<IChannelStatusResponse> {
  const { data } = await apiClient.post<IChannelStatusResponse>(
    '/channels/whatsapp/activate',
    pin ? { pin } : {},
    { timeout: ONBOARDING_TIMEOUT_MS },
  );
  return data;
}

export async function getWhatsAppStatus(): Promise<IChannelStatusResponse> {
  const { data } = await apiClient.get<IChannelStatusResponse>('/channels/whatsapp/status');
  return data;
}
