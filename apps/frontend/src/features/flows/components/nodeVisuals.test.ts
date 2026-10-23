import { describe, it, expect } from 'vitest';
import { configConDestino, describirRelacion, filasDeRama, NODE_DESCRIPCION } from './nodeVisuals.js';
import { TIPOS_NODO, type INodo } from '../types.js';

const condicion: INodo = {
  id: 'n1',
  tipo: 'condicion',
  posicion: { x: 0, y: 0 },
  config: {
    tipo: 'condicion',
    variable: 'ultimo_mensaje',
    ramas: [
      { operador: 'contiene', valor: 'precio', nodoDestino: 'n2' },
      { operador: 'igual_a', valor: 'si', nodoDestino: '' },
    ],
    ramaPorDefecto: 'n3',
  },
};

const intencion: INodo = {
  id: 'n1',
  tipo: 'intencion',
  posicion: { x: 0, y: 0 },
  config: {
    tipo: 'intencion',
    etiquetas: [{ etiqueta: 'quiere_precio', descripcion: '', nodoDestino: 'n2' }],
    ramaPorDefecto: 'n4',
  },
};

const ia: INodo = {
  id: 'n1',
  tipo: 'ia',
  posicion: { x: 0, y: 0 },
  config: {
    tipo: 'ia',
    objetivo: 'Averiguar si el cliente quiere comprar.',
    salidas: [{ etiqueta: 'quiere_comprar', descripcion: '', nodoDestino: 'n2' }],
    ramaPorDefecto: 'n4',
    maxTurnos: 3,
    usarKb: true,
  },
};

describe('filasDeRama', () => {
  it('una fila por rama de condición + una final para la rama por defecto, con su destino', () => {
    const filas = filasDeRama(condicion);
    expect(filas).toEqual([
      { handleId: 'rama-0', label: 'contiene "precio"', destino: 'n2' },
      { handleId: 'rama-1', label: 'es igual a "si"', destino: '' },
      { handleId: 'default', label: 'Si ninguna coincide', destino: 'n3' },
    ]);
  });

  it('una fila por etiqueta de intención + la rama por defecto', () => {
    const filas = filasDeRama(intencion);
    expect(filas).toEqual([
      { handleId: 'etiqueta-0', label: 'quiere_precio', destino: 'n2' },
      { handleId: 'default', label: 'Si no reconoce ninguna', destino: 'n4' },
    ]);
  });

  it('nodos que no ramifican no producen ninguna fila', () => {
    const mensaje: INodo = { id: 'n5', tipo: 'mensaje', posicion: { x: 0, y: 0 }, config: { tipo: 'mensaje', texto: 'hola' } };
    expect(filasDeRama(mensaje)).toEqual([]);
  });

  it('una fila por salida de ia + la rama por defecto', () => {
    const filas = filasDeRama(ia);
    expect(filas).toEqual([
      { handleId: 'salida-0', label: 'quiere_comprar', destino: 'n2' },
      { handleId: 'default', label: 'Si no resuelve', destino: 'n4' },
    ]);
  });
});

describe('configConDestino', () => {
  it('actualiza el nodoDestino de una rama de condición por su handleId', () => {
    const config = configConDestino(condicion.config, 'rama-1', 'n9');
    expect(config).toMatchObject({ ramas: [{ nodoDestino: 'n2' }, { nodoDestino: 'n9' }] });
  });

  it('actualiza la ramaPorDefecto de una condición cuando el handle es "default"', () => {
    const config = configConDestino(condicion.config, 'default', 'n9');
    expect(config).toMatchObject({ ramaPorDefecto: 'n9' });
  });

  it('actualiza el nodoDestino de una etiqueta de intención por su handleId', () => {
    const config = configConDestino(intencion.config, 'etiqueta-0', 'n9');
    expect(config).toMatchObject({ etiquetas: [{ nodoDestino: 'n9' }] });
  });

  it('actualiza el nodoDestino de una salida de ia por su handleId', () => {
    const config = configConDestino(ia.config, 'salida-0', 'n9');
    expect(config).toMatchObject({ salidas: [{ nodoDestino: 'n9' }] });
  });

  it('actualiza la ramaPorDefecto de un nodo ia cuando el handle es "default"', () => {
    const config = configConDestino(ia.config, 'default', 'n9');
    expect(config).toMatchObject({ ramaPorDefecto: 'n9' });
  });
});

describe('describirRelacion (HU-FLOW-04)', () => {
  const destino: INodo = {
    id: 'n2',
    tipo: 'handoff',
    posicion: { x: 0, y: 0 },
    config: { tipo: 'handoff' },
  };

  it('condición "contiene": explica la regla con el ejemplo del asesor', () => {
    const nodo: INodo = {
      id: 'n1',
      tipo: 'condicion',
      posicion: { x: 0, y: 0 },
      config: {
        tipo: 'condicion',
        variable: 'ultimo_mensaje',
        ramas: [{ operador: 'contiene', valor: 'asesor', nodoDestino: 'n2' }],
        ramaPorDefecto: 'n3',
      },
    };
    expect(describirRelacion(nodo, 'rama-0', destino)).toBe(
      'Si el mensaje del cliente contiene «asesor», sigue a «Transferir a humano».',
    );
    expect(describirRelacion(nodo, 'default', destino)).toBe(
      'Si ninguna condición coincide, sigue a «Transferir a humano».',
    );
  });

  it('condición sobre una variable capturada nombra la variable, no "el mensaje"', () => {
    const nodo: INodo = {
      id: 'n1',
      tipo: 'condicion',
      posicion: { x: 0, y: 0 },
      config: {
        tipo: 'condicion',
        variable: 'var:ciudad',
        ramas: [{ operador: 'igual_a', valor: 'Cali', nodoDestino: 'n2' }],
        ramaPorDefecto: 'n3',
      },
    };
    expect(describirRelacion(nodo, 'rama-0', destino)).toContain('«ciudad» es exactamente «Cali»');
  });

  it('intención y asistente IA describen quién decide', () => {
    expect(describirRelacion(intencion, 'etiqueta-0', destino)).toBe(
      'Si la IA entiende que el cliente quiere «quiere_precio», sigue a «Transferir a humano».',
    );
    expect(describirRelacion(intencion, 'default', destino)).toContain('no reconoce ninguna intención');

    const nodoIa: INodo = {
      id: 'n1',
      tipo: 'ia',
      posicion: { x: 0, y: 0 },
      config: {
        tipo: 'ia',
        objetivo: 'Calificar al cliente',
        salidas: [{ etiqueta: 'listo', descripcion: 'x', nodoDestino: 'n2' }],
        ramaPorDefecto: 'n3',
        maxTurnos: 4,
        usarKb: true,
      },
    };
    expect(describirRelacion(nodoIa, 'salida-0', destino)).toContain('da por cumplida «listo»');
    expect(describirRelacion(nodoIa, 'default', destino)).toContain('en 4 turnos');
  });

  it('salida lineal: "al terminar X, sigue a Y"; sin destino dice que termina', () => {
    const mensaje: INodo = {
      id: 'n1',
      tipo: 'mensaje',
      posicion: { x: 0, y: 0 },
      config: { tipo: 'mensaje', texto: 'Hola' },
    };
    expect(describirRelacion(mensaje, null, destino)).toBe('Al terminar «Mensaje», sigue a «Transferir a humano».');
    expect(describirRelacion(mensaje, null, undefined)).toBe('Al terminar «Mensaje», termina.');
  });

  it('todos los tipos de nodo tienen descripción para el tooltip del menú', () => {
    for (const tipo of TIPOS_NODO) {
      expect(NODE_DESCRIPCION[tipo].length).toBeGreaterThan(20);
    }
  });
});
