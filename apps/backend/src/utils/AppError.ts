export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    /**
     * Datos accionables que viajan junto al mensaje. Existe para errores donde el cliente necesita
     * algo más que el texto para poder reaccionar: el 409 de HU-CRM-01 adjunta el `leadId` que ya
     * existe, y así la UI ofrece "Ver lead existente" en vez de un callejón sin salida.
     *
     * Es opcional a propósito: sin él la respuesta sigue siendo exactamente `{ message }`, así que
     * los usos previos de `AppError` no cambian de contrato.
     */
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
