import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { FlowCanvas } from '../FlowCanvas.js';
import type { FlowNodeData } from './FlowNode.js';
import type { INodo } from '../../types.js';

beforeAll(() => {
  Element.prototype.getBoundingClientRect = () =>
    ({ width: 1000, height: 600, top: 0, left: 0, right: 1000, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect;
});

const nodo: INodo = {
  id: 'n1',
  tipo: 'mensaje',
  posicion: { x: 0, y: 0 },
  config: { tipo: 'mensaje', texto: 'Hola' },
};

const noop = (): void => {};

function pintar(data: Partial<FlowNodeData>, nodoPropio: INodo = nodo) {
  const nodes: Node<FlowNodeData>[] = [
    { id: 'n1', type: 'flowNode', position: { x: 0, y: 0 }, data: { nodo: nodoPropio, esEntrada: false, ...data } },
  ];
  const props = {
    edges: [],
    onNodesChange: noop,
    onEdgesChange: noop,
    onConnect: noop,
    onEdgesDelete: noop,
    onNodesDelete: noop,
    onBeforeDelete: async () => true,
    onNodeClick: vi.fn(),
    onPaneClick: noop,
  };
  const ui = (n: Node<FlowNodeData>[]) => <FlowCanvas nodes={n} {...props} />;
  const resultado = render(ui(nodes));
  return { ...resultado, repintar: (d: Partial<FlowNodeData>) => resultado.rerender(ui([{ ...nodes[0]!, data: { ...nodes[0]!.data, ...d } }])) };
}

describe('FlowNode — estado en vivo, rojo o verde (HU-FLOW-05, criterio 26)', () => {
  it('con problemas se ve en rojo: icono, texto accesible y la primera causa a la vista', () => {
    pintar({ problemas: ['«Mensaje» no tiene conexión de entrada.', 'otra cosa'] });
    expect(screen.getByLabelText('Con errores')).toBeInTheDocument();
    expect(screen.getByText('«Mensaje» no tiene conexión de entrada.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Listo')).not.toBeInTheDocument();
  });

  it('sin problemas se ve en verde (listo)', () => {
    pintar({ problemas: [] });
    expect(screen.getByLabelText('Listo')).toBeInTheDocument();
    expect(screen.queryByLabelText('Con errores')).not.toBeInTheDocument();
  });

  it('pasa de rojo a verde en cuanto se corrige, sin recargar ni guardar', () => {
    const { repintar } = pintar({ problemas: ['falta algo'] });
    expect(screen.getByLabelText('Con errores')).toBeInTheDocument();

    repintar({ problemas: [] });

    expect(screen.getByLabelText('Listo')).toBeInTheDocument();
    expect(screen.queryByLabelText('Con errores')).not.toBeInTheDocument();
    expect(screen.queryByText('falta algo')).not.toBeInTheDocument();
  });

  it('un error de forma del servidor también lo marca en rojo', () => {
    pintar({ error: 'La pregunta no puede ir vacía', problemas: [] });
    expect(screen.getByLabelText('Con errores')).toBeInTheDocument();
    expect(screen.getByText('La pregunta no puede ir vacía')).toBeInTheDocument();
  });

  it('sin información de estado (fuera del editor) no pinta ni rojo ni verde', () => {
    pintar({});
    expect(screen.queryByLabelText('Listo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Con errores')).not.toBeInTheDocument();
  });
});

describe('FlowNode — nombre propio (criterio 35)', () => {
  it('sin nombre muestra el título del tipo', () => {
    pintar({ problemas: [] });
    expect(screen.getByText('Mensaje')).toBeInTheDocument();
  });

  it('con nombre lo muestra, junto al tipo', () => {
    pintar({ problemas: [] }, { ...nodo, nombre: 'Saludo inicial' });
    expect(screen.getByText('Saludo inicial')).toBeInTheDocument();
    expect(screen.getByText(/· Mensaje/)).toBeInTheDocument();
  });
});
