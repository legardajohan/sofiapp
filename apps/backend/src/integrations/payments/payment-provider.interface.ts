import type { EstadoPago } from '@sofiapp/shared';

// Puerto de la pasarela de pagos (HT-PAY-01). Independiente de Mongo y del tenant: ninguna
// operación recibe el identificador del tenant; opera solo sobre referencia, monto e ids del proveedor.

export interface CrearIntentoParams {
  reference: string;
  amountInCents: number;
  expiraEn: Date;
}

export interface DatosCheckout {
  publicKey: string;
  currency: 'COP';
  amountInCents: number;
  reference: string;
  /** ISO 8601 UTC; el MISMO string que se firmó. */
  expirationTime: string;
  /** SHA256 hexadecimal. */
  signatureIntegrity: string;
  redirectUrl: string;
}

export interface TokensAceptacion {
  aceptacion: { token: string; urlTerminos: string };
  datosPersonales: { token: string; urlPolitica: string };
}

export interface TransaccionProveedor {
  id: string;
  reference: string;
  /** `null` = estado desconocido para SofiApp. */
  estado: EstadoPago | null;
  /** El estado de Wompi, tal cual. */
  estadoProveedor: string;
  amountInCents: number;
  currency: string;
  metodo: string | null;
  detalle: string | null;
}

export interface EventoProveedor {
  evento: string;
  transaccionId: string;
  estado: EstadoPago | null;
  estadoProveedor: string;
  reference: string;
  amountInCents: number;
  currency: string;
  entorno: 'test' | 'prod';
  timestamp: number;
}

export type ResultadoVerificacion = { valido: true; evento: EventoProveedor } | { valido: false };

export interface IPaymentProvider {
  readonly nombre: 'wompi' | 'stub';
  crearIntento(params: CrearIntentoParams): Promise<DatosCheckout>;
  obtenerTokensAceptacion(): Promise<TokensAceptacion>;
  /** `AppError` 404 si no existe. */
  consultarTransaccion(id: string): Promise<TransaccionProveedor>;
  buscarPorReferencia(reference: string): Promise<TransaccionProveedor | null>;
  /** Síncrona y pura: no hace red. */
  verificarEvento(body: unknown, checksumCabecera?: string): ResultadoVerificacion;
}
