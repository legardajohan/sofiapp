import { describe, it, expect } from 'vitest';
import { createFlowSchema } from './flow.validation.js';

const posicion = { x: 0, y: 0 };

function base(overrides: Record<string, unknown> = {}): unknown {
  return {
    nombre: 'Flujo de prueba',
    nodos: [
      {
        id: 'n1',
        tipo: 'condicion',
        posicion,
        config: {
          tipo: 'condicion',
          variable: 'ultimo_mensaje',
          ramas: [{ operador: 'igual_a', valor: 'si', nodoDestino: 'n2' }],
          ramaPorDefecto: 'n2',
        },
      },
      { id: 'n2', tipo: 'mensaje', posicion, config: { tipo: 'mensaje', texto: 'Gracias' } },
    ],
    aristas: [],
    entrada: 'n1',
    ...overrides,
  };
}

function parse(body: unknown) {
  return createFlowSchema.safeParse({ body, params: {}, query: {} });
}

describe('flow.validation — validación de grafo en el borde', () => {
  it('un flujo válido pasa', () => {
    expect(parse(base()).success).toBe(true);
  });

  it('una arista que apunta a un id inexistente → 400 (falla la validación)', () => {
    const body = base({ aristas: [{ id: 'a1', from: 'n1', to: 'no-existe' }] });
    expect(parse(body).success).toBe(false);
  });

  it('un nodo huérfano (sin arista entrante y distinto de la entrada) → falla', () => {
    const body = base({
      nodos: [
        { id: 'n1', tipo: 'mensaje', posicion, config: { tipo: 'mensaje', texto: 'Hola' } },
        { id: 'huerfano', tipo: 'mensaje', posicion, config: { tipo: 'mensaje', texto: '¿?' } },
      ],
      entrada: 'n1',
    });
    expect(parse(body).success).toBe(false);
  });

  it('el nodo de entrada debe existir entre los nodos declarados', () => {
    const body = base({ entrada: 'no-existe' });
    expect(parse(body).success).toBe(false);
  });

  it('ids de nodo duplicados → falla', () => {
    const body = base({
      nodos: [
        { id: 'n1', tipo: 'mensaje', posicion, config: { tipo: 'mensaje', texto: 'Hola' } },
        { id: 'n1', tipo: 'mensaje', posicion, config: { tipo: 'mensaje', texto: 'Otra vez' } },
      ],
      entrada: 'n1',
    });
    expect(parse(body).success).toBe(false);
  });

  it('un nodo `condicion` con un campo de texto de respuesta ("respuesta") → falla: .strict() lo rechaza', () => {
    const body = base({
      nodos: [
        {
          id: 'n1',
          tipo: 'condicion',
          posicion,
          config: {
            tipo: 'condicion',
            variable: 'ultimo_mensaje',
            ramas: [{ operador: 'igual_a', valor: 'si', nodoDestino: 'n2' }],
            ramaPorDefecto: 'n2',
            // Clave extra: el flujo no puede guardar contenido de conocimiento (criterio 10).
            respuesta: 'Sí, claro que sí',
          },
        },
        { id: 'n2', tipo: 'mensaje', posicion, config: { tipo: 'mensaje', texto: 'Gracias' } },
      ],
    });
    expect(parse(body).success).toBe(false);
  });

  it('un nodo `kb` con texto de respuesta embebido → falla: .strict() lo rechaza', () => {
    const body = base({
      nodos: [
        {
          id: 'n1',
          tipo: 'kb',
          posicion,
          config: { tipo: 'kb', pregunta: 'ultimo_mensaje', siNoHayRespuesta: 'No sé', texto: 'Respuesta fija' },
        },
      ],
      entrada: 'n1',
    });
    expect(parse(body).success).toBe(false);
  });

  it('`tipo: "api"` → falla: no está en la unión discriminada (reservado, no implementado)', () => {
    const body = base({
      nodos: [{ id: 'n1', tipo: 'api', posicion, config: { tipo: 'api' } }],
      entrada: 'n1',
    });
    expect(parse(body).success).toBe(false);
  });
});

describe('flow.validation — nodo ia (HU-FLOW-03)', () => {
  function nodoIa(overrides: Record<string, unknown> = {}): unknown {
    return {
      id: 'n1',
      tipo: 'ia',
      posicion,
      config: {
        tipo: 'ia',
        objetivo: 'Averiguar si el cliente quiere comprar el producto.',
        salidas: [{ etiqueta: 'quiere_comprar', descripcion: 'El cliente confirma', nodoDestino: 'n2' }],
        ramaPorDefecto: 'n2',
        maxTurnos: 3,
        usarKb: true,
        ...overrides,
      },
    };
  }

  const destino = { id: 'n2', tipo: 'mensaje', posicion, config: { tipo: 'mensaje', texto: 'Gracias' } };

  it('un nodo ia válido pasa', () => {
    const body = base({ nodos: [nodoIa(), destino], entrada: 'n1' });
    expect(parse(body).success).toBe(true);
  });

  it('maxTurnos: 0 → 400', () => {
    const body = base({ nodos: [nodoIa({ maxTurnos: 0 }), destino], entrada: 'n1' });
    expect(parse(body).success).toBe(false);
  });

  it('maxTurnos: 11 → 400', () => {
    const body = base({ nodos: [nodoIa({ maxTurnos: 11 }), destino], entrada: 'n1' });
    expect(parse(body).success).toBe(false);
  });

  it('salidas: [] → 400', () => {
    const body = base({ nodos: [nodoIa({ salidas: [] }), destino], entrada: 'n1' });
    expect(parse(body).success).toBe(false);
  });

  it('una clave extra en el config de un nodo ia → 400 (.strict())', () => {
    const body = base({ nodos: [nodoIa({ respuesta: 'texto colado' }), destino], entrada: 'n1' });
    expect(parse(body).success).toBe(false);
  });

  it('un nodoDestino de salida que no existe → 400', () => {
    const body = base({
      nodos: [nodoIa({ salidas: [{ etiqueta: 'x', descripcion: 'y', nodoDestino: 'no-existe' }] }), destino],
      entrada: 'n1',
    });
    expect(parse(body).success).toBe(false);
  });

  it('un nodo alcanzable solo desde una salida de ia no se reporta como huérfano (criterio 5)', () => {
    const body = base({
      nodos: [
        nodoIa({
          salidas: [{ etiqueta: 'quiere_comprar', descripcion: 'El cliente confirma', nodoDestino: 'solo-desde-ia' }],
        }),
        { id: 'solo-desde-ia', tipo: 'mensaje', posicion, config: { tipo: 'mensaje', texto: 'Alcanzado solo por ia' } },
        destino,
      ],
      entrada: 'n1',
    });
    expect(parse(body).success).toBe(true);
  });
});

describe('flow.validation — trigger (HU-FLOW-04)', () => {
  it('sin trigger es válido (equivale a "siempre")', () => {
    expect(parse(base()).success).toBe(true);
  });

  it('acepta cada tipo de trigger bien formado', () => {
    expect(parse(base({ trigger: { tipo: 'siempre' } })).success).toBe(true);
    expect(parse(base({ trigger: { tipo: 'primer_mensaje' } })).success).toBe(true);
    expect(parse(base({ trigger: { tipo: 'palabra_clave', palabras: ['precio', 'horario'] } })).success).toBe(true);
    expect(
      parse(
        base({
          trigger: {
            tipo: 'horario',
            horario: { dias: [1, 2, 3], desde: '08:00', hasta: '18:00', zonaHoraria: 'America/Bogota' },
          },
        }),
      ).success,
    ).toBe(true);
  });

  it('palabra_clave sin palabras o con una vacía → falla', () => {
    expect(parse(base({ trigger: { tipo: 'palabra_clave', palabras: [] } })).success).toBe(false);
    expect(parse(base({ trigger: { tipo: 'palabra_clave', palabras: ['  '] } })).success).toBe(false);
  });

  it('horario inválido → falla', () => {
    const horario = { dias: [1], desde: '08:00', hasta: '18:00', zonaHoraria: 'America/Bogota' };
    const con = (cambio: Record<string, unknown>) =>
      parse(base({ trigger: { tipo: 'horario', horario: { ...horario, ...cambio } } })).success;

    expect(con({ desde: '8:00' })).toBe(false);
    expect(con({ hasta: '25:00' })).toBe(false);
    expect(con({ desde: '18:00', hasta: '08:00' })).toBe(false);
    expect(con({ desde: '08:00', hasta: '08:00' })).toBe(false);
    expect(con({ dias: [] })).toBe(false);
    expect(con({ dias: [7] })).toBe(false);
    expect(con({ dias: [1, 1] })).toBe(false);
    expect(con({ zonaHoraria: 'Marte/Olympus' })).toBe(false);
  });

  it('rechaza un tipo desconocido y campos de otro tipo (.strict())', () => {
    expect(parse(base({ trigger: { tipo: 'semantico' } })).success).toBe(false);
    expect(parse(base({ trigger: { tipo: 'siempre', palabras: ['x'] } })).success).toBe(false);
  });
});
