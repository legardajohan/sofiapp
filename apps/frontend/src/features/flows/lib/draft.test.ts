import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  borradorEsMasNuevo,
  borrarBorrador,
  claveBorrador,
  guardarBorrador,
  leerBorrador,
  mismoContenido,
  type BorradorFlujo,
} from './draft.js';
import type { INodo } from '../types.js';

const nodo: INodo = {
  id: 'n1',
  tipo: 'mensaje',
  posicion: { x: 0, y: 0 },
  config: { tipo: 'mensaje', texto: 'Hola' },
};

function borrador(over: Partial<BorradorFlujo> = {}): BorradorFlujo {
  return {
    nombre: 'Flujo',
    nodos: [nodo],
    aristas: [],
    entrada: 'n1',
    trigger: { tipo: 'siempre' },
    guardadoEn: 2_000,
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('borrador local (HU-FLOW-05, criterio 30)', () => {
  it('guarda y vuelve a leer el borrador de un flujo', () => {
    const clave = claveBorrador('u1', 'f1');
    guardarBorrador(clave, borrador());
    expect(leerBorrador(clave)).toEqual(borrador());
  });

  it('la clave separa por usuario y por flujo (y distingue el flujo nuevo)', () => {
    expect(claveBorrador('u1', 'f1')).not.toBe(claveBorrador('u2', 'f1'));
    expect(claveBorrador('u1', 'f1')).not.toBe(claveBorrador('u1', 'f2'));
    expect(claveBorrador('u1', undefined)).toBe('flow-draft:u1:nuevo');
  });

  it('borrar lo elimina', () => {
    const clave = claveBorrador('u1', 'f1');
    guardarBorrador(clave, borrador());
    borrarBorrador(clave);
    expect(leerBorrador(clave)).toBeNull();
  });

  it('un borrador corrupto o de otra forma se descarta en vez de romper el editor', () => {
    const clave = claveBorrador('u1', 'f1');
    window.localStorage.setItem(clave, '{no es json');
    expect(leerBorrador(clave)).toBeNull();
    window.localStorage.setItem(clave, JSON.stringify({ nodos: 'no-es-lista' }));
    expect(leerBorrador(clave)).toBeNull();
  });

  it('si localStorage está bloqueado, ninguna operación lanza', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(() => guardarBorrador('k', borrador())).not.toThrow();
    expect(leerBorrador('k')).toBeNull();
    expect(() => borrarBorrador('k')).not.toThrow();
  });
});

describe('borradorEsMasNuevo', () => {
  const servidor = { nombre: 'Flujo', nodos: [nodo], aristas: [], entrada: 'n1', updatedAt: new Date(1_000).toISOString() };

  it('es más nuevo y distinto → se ofrece recuperar', () => {
    expect(borradorEsMasNuevo(borrador({ nombre: 'Editado' }), servidor)).toBe(true);
  });

  it('es más viejo que lo guardado → no se ofrece', () => {
    expect(borradorEsMasNuevo(borrador({ nombre: 'Editado', guardadoEn: 500 }), servidor)).toBe(false);
  });

  it('es más nuevo pero idéntico a lo guardado → no se ofrece (no aporta nada)', () => {
    expect(borradorEsMasNuevo(borrador(), servidor)).toBe(false);
  });
});

describe('mismoContenido', () => {
  it('compara las aristas por sus extremos, no por su id (cambia entre sesiones)', () => {
    const base = { nombre: 'F', nodos: [nodo], entrada: 'n1' };
    expect(
      mismoContenido(
        { ...base, aristas: [{ id: 'a1', from: 'n1', to: 'n2' }] },
        { ...base, aristas: [{ id: 'otro', from: 'n1', to: 'n2' }] },
      ),
    ).toBe(true);
    expect(
      mismoContenido(
        { ...base, aristas: [{ id: 'a1', from: 'n1', to: 'n2' }] },
        { ...base, aristas: [{ id: 'a1', from: 'n1', to: 'n3' }] },
      ),
    ).toBe(false);
  });
});
