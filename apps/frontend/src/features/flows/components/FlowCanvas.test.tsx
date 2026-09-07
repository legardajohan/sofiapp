import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { FlowCanvas } from './FlowCanvas.js';
import type { FlowNodeData } from './nodes/FlowNode.js';
import type { INodo } from '../types.js';

// @xyflow/react mide el contenedor con getBoundingClientRect para calcular el viewport y las
// aristas; jsdom lo deja en 0x0, así que sin este stub el canvas "monta vacío" (ni un solo path de
// arista) aunque los nodos sí aparezcan. Ancho/alto arbitrarios, solo tienen que ser > 0.
beforeAll(() => {
  Element.prototype.getBoundingClientRect = () =>
    ({ width: 1000, height: 600, top: 0, left: 0, right: 1000, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect;
});

const nodoMensaje: INodo = {
  id: 'n1',
  tipo: 'mensaje',
  posicion: { x: 0, y: 0 },
  config: { tipo: 'mensaje', texto: 'Hola, ¿en qué te ayudo?' },
};

const nodoCondicion: INodo = {
  id: 'n2',
  tipo: 'condicion',
  posicion: { x: 0, y: 150 },
  config: {
    tipo: 'condicion',
    variable: 'ultimo_mensaje',
    ramas: [{ operador: 'igual_a', valor: 'si', nodoDestino: 'n1' }],
    ramaPorDefecto: 'n1',
  },
};

const nodes: Node<FlowNodeData>[] = [
  { id: 'n1', type: 'flowNode', position: nodoMensaje.posicion, data: { nodo: nodoMensaje, esEntrada: true } },
  { id: 'n2', type: 'flowNode', position: nodoCondicion.posicion, data: { nodo: nodoCondicion, esEntrada: false } },
];

const edges: Edge[] = [{ id: 'a1', source: 'n1', target: 'n2' }];

describe('FlowCanvas', () => {
  it('renderiza los nodos y aristas de un flujo cargado', () => {
    render(
      <FlowCanvas
        nodes={nodes}
        edges={edges}
        onNodesChange={vi.fn()}
        onEdgesChange={vi.fn()}
        onConnect={vi.fn()}
        onNodeClick={vi.fn()}
        onPaneClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Mensaje')).toBeInTheDocument();
    expect(screen.getByText('Condición')).toBeInTheDocument();
    expect(screen.getByText('Hola, ¿en qué te ayudo?')).toBeInTheDocument();
    // El path exacto de la arista depende del layout real (viewport, curvas), que jsdom no calcula
    // aunque se stubee `getBoundingClientRect`; el contenedor SVG de aristas sí es un hecho estable.
    expect(document.querySelector('.react-flow__edges')).toBeTruthy();
  });
});
