export type EstadoIndexacion = 'pendiente' | 'procesando' | 'indexado' | 'fallido';

export interface IKbDocument {
  id: string;
  titulo: string;
  estadoIndexacion: EstadoIndexacion;
  version: number;
  chunkCount: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
