import { apiClient } from '../../api/apiClient.js';

export interface IChannelConnectDto {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}

export interface IChannelStatusResponse {
  activo: boolean;
  phoneNumberId: string;
  wabaId: string;
}

export async function connectWhatsApp(dto: IChannelConnectDto): Promise<IChannelStatusResponse> {
  const { data } = await apiClient.post<IChannelStatusResponse>(
    '/api/channels/whatsapp/connect',
    dto,
  );
  return data;
}

export async function getWhatsAppStatus(): Promise<IChannelStatusResponse> {
  const { data } = await apiClient.get<IChannelStatusResponse>('/api/channels/whatsapp/status');
  return data;
}
