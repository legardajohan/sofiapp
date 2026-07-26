import type { ITrmProvider, TrmFetchResult } from './trm-provider.interface.js';

// Stub inyectable para v2 (sin red). Permite construir proveedores con un resultado controlado
// (usado en tests) y expone un proveedor por defecto para la ruta `POST /refresh`.
// Fase G: reemplazar por `banco-republica.provider.ts` / `superfinanciera.provider.ts` (HTTP real).

export function createStubTrmProvider(result: TrmFetchResult): ITrmProvider {
  return {
    tipoFuente: 'BANCO_REPUBLICA',
    fetchTrmVigente: async () => result,
  };
}
