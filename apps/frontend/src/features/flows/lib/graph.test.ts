import { describe, it, expect } from 'vitest';
import { agruparPorNodo, analizarFlujo, configSinDestinos, nombreDeNodo, ramaDeLinea } from './graph.js';
import type { ConfigNodo, INodo } from '../types.js';

const posicion = { x: 0, y: 0 };
const msg = (id: string, texto = 'Hola', nombre?: string): INodo => ({
  id,
  tipo: 'mensaje',
  posicion,
  ...(nombre ? { nombre } : {}),
  config: { tipo: 'mensaje', texto },
});

describe('analizarFlujo — las mismas reglas que el servidor (HU-FLOW-05)', () => {
  it('un flujo sano no reporta nada', () => {
    expect(analizarFlujo([msg('a'), msg('b')], [{ from: 'a', to: 'b' }], 'a')).toEqual([]);
  });

  it('un nodo suelto es huérfano; al conectarlo deja de serlo', () => {
    const nodos = [msg('a'), msg('b')];
    expect(analizarFlujo(nodos, [], 'a').map((e) => [e.nodoId, e.codigo])).toEqual([['b', 'NODO_HUERFANO']]);
    expect(analizarFlujo(nodos, [{ from: 'a', to: 'b' }], 'a')).toEqual([]);
  });

  it('nombra el nodo en el mensaje: el nombre propio o, si no, el título del tipo', () => {
    const [conNombre] = analizarFlujo([msg('a'), msg('b', 'x', 'Saludo inicial')], [], 'a');
    expect(conNombre?.mensaje).toBe('«Saludo inicial» no tiene conexión de entrada.');
    const [sinNombre] = analizarFlujo([msg('a'), msg('b')], [], 'a');
    expect(sinNombre?.mensaje).toBe('«Mensaje» no tiene conexión de entrada.');
  });

  it('un nodo recién creado (config por defecto) queda marcado como incompleto', () => {
    const ia: INodo = {
      id: 'ia',
      tipo: 'ia',
      posicion,
      config: { tipo: 'ia', objetivo: '', salidas: [], ramaPorDefecto: '', maxTurnos: 3, usarKb: true },
    };
    const codigos = analizarFlujo([ia], [], 'ia').map((e) => e.codigo);
    expect(codigos).toContain('CONTENIDO_INCOMPLETO');
    expect(codigos).toContain('DESTINO_VACIO');
  });

  it('agruparPorNodo junta los errores de un mismo nodo', () => {
    const ia: INodo = {
      id: 'ia',
      tipo: 'ia',
      posicion,
      config: { tipo: 'ia', objetivo: '', salidas: [], ramaPorDefecto: '', maxTurnos: 3, usarKb: true },
    };
    const mapa = agruparPorNodo(analizarFlujo([ia], [], 'ia'));
    expect([...mapa.keys()]).toEqual(['ia']);
    expect(mapa.get('ia')!.length).toBe(2);
  });
});

describe('nombreDeNodo', () => {
  it('usa el nombre recortado o cae al título del tipo', () => {
    expect(nombreDeNodo(msg('a', 'x', '  Cierre  '))).toBe('Cierre');
    expect(nombreDeNodo({ ...msg('a'), nombre: '   ' })).toBe('Mensaje');
  });
});

describe('configSinDestinos — borrar un nodo no deja ramas colgando (criterio 32)', () => {
  const condicion: ConfigNodo = {
    tipo: 'condicion',
    variable: 'ultimo_mensaje',
    ramas: [
      { operador: 'contiene', valor: 'si', nodoDestino: 'x' },
      { operador: 'contiene', valor: 'no', nodoDestino: 'y' },
    ],
    ramaPorDefecto: 'x',
  };

  it('deja vacío solo lo que apuntaba a los nodos borrados', () => {
    const resultado = configSinDestinos(condicion, new Set(['x']));
    expect(resultado).toMatchObject({
      ramas: [
        { valor: 'si', nodoDestino: '' },
        { valor: 'no', nodoDestino: 'y' },
      ],
      ramaPorDefecto: '',
    });
  });

  it('devuelve la MISMA referencia si nada apuntaba a ellos', () => {
    expect(configSinDestinos(condicion, new Set(['z']))).toBe(condicion);
  });

  it('cubre intención e IA, y no toca los demás tipos', () => {
    const intencion: ConfigNodo = {
      tipo: 'intencion',
      etiquetas: [{ etiqueta: 'a', descripcion: 'b', nodoDestino: 'x' }],
      ramaPorDefecto: 'x',
    };
    expect(configSinDestinos(intencion, new Set(['x']))).toMatchObject({
      etiquetas: [{ nodoDestino: '' }],
      ramaPorDefecto: '',
    });
    const ia: ConfigNodo = {
      tipo: 'ia',
      objetivo: 'Asesora con amabilidad.',
      salidas: [{ etiqueta: 'a', descripcion: 'b', nodoDestino: 'x' }],
      ramaPorDefecto: 'y',
      maxTurnos: 3,
      usarKb: false,
    };
    expect(configSinDestinos(ia, new Set(['x']))).toMatchObject({ salidas: [{ nodoDestino: '' }], ramaPorDefecto: 'y' });
    const mensaje: ConfigNodo = { tipo: 'mensaje', texto: 'hola' };
    expect(configSinDestinos(mensaje, new Set(['x']))).toBe(mensaje);
  });
});

describe('ramaDeLinea — qué rama vacía al borrar una línea con el teclado (criterio 31)', () => {
  it('una línea derivada de una rama dice a qué nodo y handle pertenece', () => {
    expect(ramaDeLinea({ data: { nodoId: 'c1', handleId: 'rama-0', etiqueta: 'si' } })).toEqual({
      nodoId: 'c1',
      handleId: 'rama-0',
    });
  });

  it('una línea lineal (sin rama) no vacía nada', () => {
    expect(ramaDeLinea({ data: { descripcion: 'sigue con…' } })).toBeNull();
    expect(ramaDeLinea({})).toBeNull();
  });
});
