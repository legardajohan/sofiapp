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
