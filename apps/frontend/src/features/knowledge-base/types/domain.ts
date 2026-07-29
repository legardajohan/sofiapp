export type EstadoIndexacion = 'pendiente' | 'procesando' | 'indexado' | 'fallido';

export interface IKbDocument {
  id: string;
  titulo: string;
  contenido: string;
  estadoIndexacion: EstadoIndexacion;
  version: number;
  chunkCount: number;
  isPreset: boolean;
  obligatorio: boolean;
  proposito?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
