import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addEdge, useEdgesState, useNodesState, type Edge, type Node, type OnConnect } from '@xyflow/react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AddNodeMenu } from '../components/AddNodeMenu.js';
import { ActivateFlowDialog } from '../components/ActivateFlowDialog.js';
import { EmptyFlowState } from '../components/EmptyFlowState.js';
import { FlowCanvas } from '../components/FlowCanvas.js';
import { NodeInspector } from '../components/NodeInspector.js';
import { configPorDefecto, resumenConfig, NODE_VISUALS } from '../components/nodeVisuals.js';
import type { FlowNodeData } from '../components/nodes/FlowNode.js';
import { useFlow } from '../hooks/useFlow.js';
import { useFlows } from '../hooks/useFlows.js';
import { useSaveFlow } from '../hooks/useSaveFlow.js';
import { useFlowStore } from '../useFlowStore.js';
import type { ConfigNodo, IArista, INodo, TipoNodo } from '../types.js';

function nodoToRFNode(nodo: INodo): Node {
  return {
    id: nodo.id,
    type: 'flowNode',
    position: nodo.posicion,
    data: { nodo, esEntrada: false } satisfies FlowNodeData,
  };
}

function aristaToRFEdge(arista: IArista): Edge {
  return { id: arista.id, source: arista.from, target: arista.to };
}

let contador = 0;
/** Id corto y estable para nodos/aristas nuevos — no necesita ser un ObjectId, el backend los trata
 *  como strings opacos. */
function nuevoId(prefijo: string): string {
  contador += 1;
  return `${prefijo}_${Date.now().toString(36)}_${contador}`;
}

export function FlowEditorPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const esNuevo = id === 'new';
  const navigate = useNavigate();

  const { data: flow, isLoading, isError } = useFlow(esNuevo ? undefined : id);
  const { data: flows } = useFlows();
  const saveFlow = useSaveFlow(esNuevo ? undefined : id);

  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const select = useFlowStore((s) => s.select);
  const nodeErrors = useFlowStore((s) => s.nodeErrors);
  const resetStore = useFlowStore((s) => s.reset);

  const [nombre, setNombre] = useState('');
  const [entrada, setEntrada] = useState('');
  const [activo, setActivo] = useState(false);
  const [activarAbierto, setActivarAbierto] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const hidratado = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (hidratado.current === id) return;
    if (esNuevo) {
      hidratado.current = id;
      resetStore();
      setNombre('');
      setEntrada('');
      setActivo(false);
      setNodes([]);
      setEdges([]);
      return;
    }
    if (!flow) return;
    hidratado.current = id;
    resetStore();
    setNombre(flow.nombre);
    setEntrada(flow.entrada);
    setActivo(flow.activo);
    setNodes(flow.nodos.map(nodoToRFNode));
    setEdges(flow.aristas.map(aristaToRFEdge));
  }, [id, esNuevo, flow, resetStore, setNodes, setEdges]);

  const decoratedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: { ...(n.data as FlowNodeData), esEntrada: n.id === entrada, error: nodeErrors[n.id] },
      })),
    [nodes, entrada, nodeErrors],
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedNodo = selectedNode ? (selectedNode.data as FlowNodeData).nodo : null;

  const opcionesDestino = useMemo(
    () =>
      nodes
        .filter((n) => n.id !== selectedNodeId)
        .map((n) => {
          const nodo = (n.data as FlowNodeData).nodo;
          return { id: n.id, label: `${NODE_VISUALS[nodo.tipo].label} — ${resumenConfig(nodo)}` };
        }),
    [nodes, selectedNodeId],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((eds) => addEdge({ ...connection, id: nuevoId('arista') }, eds)),
    [setEdges],
  );

  const crearNodo = useCallback(
    (tipo: TipoNodo) => {
      const id = nuevoId('nodo');
      const columna = nodes.length % 4;
      const fila = Math.floor(nodes.length / 4);
      const posicion = { x: 60 + columna * 260, y: 60 + fila * 180 };
      const nodo: INodo = { id, tipo, posicion, config: configPorDefecto(tipo) };
      setNodes((nds) => [...nds, { id, type: 'flowNode', position: posicion, data: { nodo, esEntrada: false } }]);
      setEntrada((actual) => actual || id);
      select(id);
    },
    [nodes.length, setNodes, select],
  );

  const actualizarConfig = useCallback(
    (config: ConfigNodo) => {
      if (!selectedNodeId) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId
            ? { ...n, data: { ...(n.data as FlowNodeData), nodo: { ...(n.data as FlowNodeData).nodo, config } } }
            : n,
        ),
      );
    },
    [selectedNodeId, setNodes],
  );

  const eliminarNodoSeleccionado = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setEntrada((actual) => (actual === selectedNodeId ? '' : actual));
    select(null);
  }, [selectedNodeId, setNodes, setEdges, select]);

  const flujoActivoActual = useMemo(() => {
    if (esNuevo) return flows?.find((f) => f.activo) ?? null;
    return flows?.find((f) => f.activo && f.id !== id) ?? null;
  }, [flows, esNuevo, id]);

  function guardar(activarAhora?: boolean): void {
    const payload = {
      nombre: nombre.trim() || 'Flujo sin nombre',
      nodos: nodes.map((n) => (n.data as FlowNodeData).nodo),
      aristas: edges.map((e) => ({ id: e.id, from: e.source, to: e.target })),
      entrada,
      activo: activarAhora ?? activo,
    };
    saveFlow.mutate(
      { payload, nodos: payload.nodos },
      {
        onSuccess: (guardado) => {
          setActivo(guardado.activo);
          if (esNuevo) {
            hidratado.current = guardado.id;
            navigate(`/flows/${guardado.id}`, { replace: true });
          }
        },
      },
    );
  }

  function onActivarToggle(): void {
    if (activo) {
      setActivo(false);
      guardar(false);
      return;
    }
    if (flujoActivoActual) {
      setActivarAbierto(true);
      return;
    }
    setActivo(true);
    guardar(true);
  }

  if (!esNuevo && isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[560px] w-full" />
      </div>
    );
  }

  if (!esNuevo && isError) {
    return (
      <div className="mx-auto w-full max-w-2xl rounded-lg border border-destructive/30 bg-destructive-subtle p-6 text-center">
        <p className="text-sm text-destructive">No se pudo cargar el flujo.</p>
        <Button variant="outline" size="sm" className="mt-3" asChild>
          <a href="/flows">Volver a Flujos</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-1 pb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/flows')} aria-label="Volver a Flujos">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del flujo"
          className="h-9 max-w-xs border-transparent bg-transparent text-base font-semibold shadow-none hover:border-input focus-visible:border-input"
        />
        <div className="ml-auto flex items-center gap-2">
          <Button variant={activo ? 'secondary' : 'outline'} size="sm" onClick={onActivarToggle} disabled={saveFlow.isPending}>
            {activo ? 'Desactivar' : 'Activar flujo'}
          </Button>
          <Button size="sm" onClick={() => guardar()} disabled={saveFlow.isPending}>
            {saveFlow.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Guardando…
              </>
            ) : (
              'Guardar'
            )}
          </Button>
        </div>
      </header>

      <div className="mt-4 flex min-h-0 flex-1 gap-0 overflow-hidden rounded-lg border border-border">
        <div className="relative min-w-0 flex-1">
          {nodes.length === 0 ? (
            <div className="h-full p-4">
              <EmptyFlowState onCrearInicio={() => crearNodo('mensaje')} />
            </div>
          ) : (
            <>
              <div className="absolute left-3 top-3 z-10">
                <AddNodeMenu onAdd={crearNodo} />
              </div>
              <FlowCanvas
                nodes={decoratedNodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={select}
                onPaneClick={() => select(null)}
              />
            </>
          )}
        </div>

        <NodeInspector
          nodo={selectedNodo}
          esEntrada={selectedNodeId === entrada}
          error={selectedNodeId ? nodeErrors[selectedNodeId] : undefined}
          opcionesDestino={opcionesDestino}
          onChange={actualizarConfig}
          onDelete={eliminarNodoSeleccionado}
          onMarcarEntrada={() => selectedNodeId && setEntrada(selectedNodeId)}
        />
      </div>

      <ActivateFlowDialog
        open={activarAbierto}
        onOpenChange={setActivarAbierto}
        flujoActivoActual={flujoActivoActual?.nombre ?? null}
        onConfirm={() => {
          setActivarAbierto(false);
          setActivo(true);
          guardar(true);
        }}
      />
    </div>
  );
}
