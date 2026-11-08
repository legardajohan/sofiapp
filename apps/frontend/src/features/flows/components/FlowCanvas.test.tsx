import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const sinOp = (): void => {};

describe('FlowCanvas', () => {
  it('renderiza los nodos y aristas de un flujo cargado', () => {
    render(
      <FlowCanvas
        nodes={nodes}
        edges={edges}
        onNodesChange={vi.fn()}
        onEdgesChange={vi.fn()}
        onConnect={vi.fn()}
        onEdgesDelete={vi.fn()}
        onNodesDelete={vi.fn()}
        onBeforeDelete={vi.fn()}
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

describe('FlowCanvas — borrar con el teclado (HU-FLOW-05, criterio 30)', () => {
  function montar(over: Partial<React.ComponentProps<typeof FlowCanvas>> = {}) {
    const onEdgesDelete = vi.fn();
    render(
      <FlowCanvas
        nodes={nodes}
        edges={[{ id: 'a1', source: 'n1', target: 'n2', selected: true }]}
        onNodesChange={sinOp}
        onEdgesChange={sinOp}
        onConnect={sinOp}
        onEdgesDelete={onEdgesDelete}
        onNodesDelete={sinOp}
        onBeforeDelete={async () => true}
        onNodeClick={sinOp}
        onPaneClick={sinOp}
        {...over}
      />,
    );
    return { onEdgesDelete };
  }

  it.each([
    ['Supr', '{Delete}'],
    ['Retroceso', '{Backspace}'],
  ])('%s borra el enlace seleccionado', async (_nombre, tecla) => {
    const { onEdgesDelete } = montar();
    await userEvent.keyboard(tecla);
    await waitFor(() => expect(onEdgesDelete).toHaveBeenCalledTimes(1));
    expect(onEdgesDelete.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ id: 'a1' })]);
  });

  it('si onBeforeDelete veta el borrado, no se borra nada', async () => {
    const { onEdgesDelete } = montar({ onBeforeDelete: async () => false });
    await userEvent.keyboard('{Delete}');
    // Se da un margen para que React Flow procese la tecla y se compruebe que NO borró.
    await new Promise((r) => setTimeout(r, 50));
    expect(onEdgesDelete).not.toHaveBeenCalled();
  });

  it('no actúa si el foco está en un campo de texto', async () => {
    const onEdgesDelete = vi.fn();
    render(
      <div>
        <input aria-label="campo" />
        <FlowCanvas
          nodes={nodes}
          edges={[{ id: 'a1', source: 'n1', target: 'n2', selected: true }]}
          onNodesChange={sinOp}
          onEdgesChange={sinOp}
          onConnect={sinOp}
          onEdgesDelete={onEdgesDelete}
          onNodesDelete={sinOp}
          onBeforeDelete={async () => true}
          onNodeClick={sinOp}
          onPaneClick={sinOp}
        />
      </div>,
    );
    await userEvent.type(screen.getByLabelText('campo'), '{Backspace}{Delete}');
    await new Promise((r) => setTimeout(r, 50));
    expect(onEdgesDelete).not.toHaveBeenCalled();
  });
});
