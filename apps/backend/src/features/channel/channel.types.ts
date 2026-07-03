import { Document, Types } from 'mongoose';

export interface IMetaIntegration {
  tenantId: Types.ObjectId;
  canal: 'whatsapp';
  wabaId: string;
  phoneNumberId: string;
  accessTokenEnc: string;
  activo: boolean;
}

export interface IMetaIntegrationDocument extends IMetaIntegration, Document {}

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
