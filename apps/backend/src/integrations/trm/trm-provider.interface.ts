// Proveedor de la TRM oficial USD/COP. Vive en `integrations/` (como `integrations/llm` y
// `integrations/meta`): el `exchange-rate.service` lo recibe por inyección (patrón `ILlmProvider`).
// En v2 solo existe el stub; la integración HTTP real (Banco de la República / Superfinanciera)
// se implementa en la Fase G sin tocar el service (mismo contrato).

// Un proveedor solo produce tasas OFICIALES (la MANUAL la fija el superadmin, no un proveedor).
export type TrmProviderFuente = 'SUPERFINANCIERA' | 'BANCO_REPUBLICA';

export interface TrmFetchResult {
  tasaCopPorUsd: string; // decimal como string, para no perder precisión
  fechaVigencia: Date;
  fuente: string; // descripción textual de la fuente oficial
}

export interface ITrmProvider {
  readonly tipoFuente: TrmProviderFuente;
  fetchTrmVigente(): Promise<TrmFetchResult>;
}
