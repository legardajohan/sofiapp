export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    /** Código de negocio estable para el cliente (ej. `PLAN_IN_USE`). Opcional. */
    public readonly code?: string,
    /** Payload estructurado adicional para el cliente (ej. empresas que usan el plan). Opcional. */
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
