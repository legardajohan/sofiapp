import { beforeEach, describe, expect, it } from 'vitest';
import { claveVista, guardarVista, leerVista } from './viewport.js';

beforeEach(() => window.localStorage.clear());

describe('viewport del editor', () => {
  it('guarda y recupera el encuadre por usuario y flujo', () => {
    const clave = claveVista('u1', 'f1');
    guardarVista(clave, { x: 10, y: -20, zoom: 0.8 });
    expect(leerVista(clave)).toEqual({ x: 10, y: -20, zoom: 0.8 });
    expect(leerVista(claveVista('u2', 'f1'))).toBeNull();
    expect(leerVista(claveVista('u1', 'f2'))).toBeNull();
  });

  it('ignora datos corruptos o inválidos', () => {
    const clave = claveVista('u1', 'f1');
    window.localStorage.setItem(clave, '{no es json');
    expect(leerVista(clave)).toBeNull();
    window.localStorage.setItem(clave, JSON.stringify({ x: 1, y: 2, zoom: 0 }));
    expect(leerVista(clave)).toBeNull();
    window.localStorage.setItem(clave, JSON.stringify({ x: 'a', y: 2, zoom: 1 }));
    expect(leerVista(clave)).toBeNull();
  });
});
