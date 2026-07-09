export interface IPlanLimites {
  usuarios: number;
  mensajesMes: number;
  leads: number;
  campanasMes: number;
}

export interface IPlan {
  _id: string;
  nombre: string;
  limites: IPlanLimites;
  precio: number;
  costoEstimado?: number;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}
