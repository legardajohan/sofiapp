import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addEdge,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type OnBeforeDelete,
  type OnConnect,
  type OnEdgesDelete,
  type OnNodesDelete,
  type ReactFlowInstance,
} from '@xyflow/react';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ErrorGrafo } from '@sofiapp/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthStore } from '@/stores/authStore';
import { AddNodeMenu } from '../components/AddNodeMenu.js';
import { ActivateFlowDialog } from '../components/ActivateFlowDialog.js';
import { ConfirmarGuardadoActivoDialog } from '../components/ConfirmarGuardadoActivoDialog.js';
import { EmptyFlowState } from '../components/EmptyFlowState.js';
import { FlowCanvas } from '../components/FlowCanvas.js';
import { NodeInspector } from '../components/NodeInspector.js';
import { TriggerSettings } from '../components/TriggerSettings.js';
import { SandboxSheet } from '../../assistant-sandbox/index.js';
import {
  configConDestino,
  configPorDefecto,
  describirRelacion,
  filasDeRama,
  resumenConfig,
  NODE_VISUALS,
} from '../components/nodeVisuals.js';
import type { FlowNodeData } from '../components/nodes/FlowNode.js';
import { useFlow } from '../hooks/useFlow.js';
import { useFlowDraft } from '../hooks/useFlowDraft.js';
import { useFlows } from '../hooks/useFlows.js';
import { useGraphErrors } from '../hooks/useGraphErrors.js';
import { useSaveFlow } from '../hooks/useSaveFlow.js';
import {
  borradorEsMasNuevo,
  borrarBorrador,
  claveBorrador,
  guardarBorrador,
  leerBorrador,
  type BorradorFlujo,
} from '../lib/draft.js';
import { detalleDeGuardado } from '../lib/errors.js';
import { configSinDestinos, nombreDeNodo, ramaDeLinea } from '../lib/graph.js';
import { validarTrigger } from '../lib/trigger.js';
import { useFlowStore } from '../useFlowStore.js';
import {
  TRIGGER_POR_DEFECTO,
  type ConfigNodo,
  type IArista,
  type INodo,
  type ITriggerFlow,
  type TipoNodo,
} from '../types.js';

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

/** El nodo tal como se guarda: con la posición REAL del canvas (la que el usuario arrastró) y sin
 *  nombre si quedó en blanco (el servidor exige 1–60 caracteres o ausente). */
function nodoParaGuardar(n: Node): INodo {
  const { nodo } = n.data as FlowNodeData;
  const nombre = nodo.nombre?.trim();
  const { nombre: _descartado, ...resto } = nodo;
  void _descartado;
  return { ...resto, ...(nombre ? { nombre } : {}), posicion: { x: n.position.x, y: n.position.y } };
}

let contador = 0;
/** Id corto y estable para nodos/aristas nuevos — no necesita ser un ObjectId, el backend los trata
 *  como strings opacos. */
function nuevoId(prefijo: string): string {
  contador += 1;
  return `${prefijo}_${Date.now().toString(36)}_${contador}`;
}

/** Sin animación de cámara si el usuario pidió menos movimiento. */
function duracionDeCamara(): number {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 300;
}

export function FlowEditorPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const esNuevo = id === 'new';
  const navigate = useNavigate();

  const { data: flow, isLoading, isError } = useFlow(esNuevo ? undefined : id);
  const { data: flows } = useFlows();
  const saveFlow = useSaveFlow(esNuevo ? undefined : id);
  const usuarioId = useAuthStore((s) => s.user?.sub);

  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const select = useFlowStore((s) => s.select);
  const nodeErrors = useFlowStore((s) => s.nodeErrors);
  const resetStore = useFlowStore((s) => s.reset);

  const [nombre, setNombre] = useState('');
  const [entrada, setEntrada] = useState('');
  const [trigger, setTrigger] = useState<ITriggerFlow>(TRIGGER_POR_DEFECTO);
  const [activo, setActivo] = useState(false);
  const [activarAbierto, setActivarAbierto] = useState(false);
  const [confirmarAbierto, setConfirmarAbierto] = useState(false);
  const [erroresModal, setErroresModal] = useState<ErrorGrafo[]>([]);
  const [avisoInactivo, setAvisoInactivo] = useState(false);
  const [borradorPendiente, setBorradorPendiente] = useState<BorradorFlujo | null>(null);
  const [listo, setListo] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const instancia = useRef<ReactFlowInstance | null>(null);

  const claveDraft = claveBorrador(usuarioId, esNuevo ? undefined : id);
  const grafo = useGraphErrors(nodes, edges, entrada);

  const hidratado = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (hidratado.current === id) return;
    if (esNuevo) {
      hidratado.current = id;
      resetStore();
      setNombre('');
      setEntrada('');
      setTrigger(TRIGGER_POR_DEFECTO);
      setActivo(false);
      setAvisoInactivo(false);
      setNodes([]);
      setEdges([]);
      const guardado = leerBorrador(claveBorrador(usuarioId, undefined));
      setBorradorPendiente(guardado && guardado.nodos.length > 0 ? guardado : null);
      setListo(true);
      return;
    }
    if (!flow) return;
    hidratado.current = id;
    resetStore();
    setNombre(flow.nombre);
    setEntrada(flow.entrada);
    setTrigger(flow.trigger ?? TRIGGER_POR_DEFECTO);
    setActivo(flow.activo);
    setAvisoInactivo(false);
    setNodes(flow.nodos.map(nodoToRFNode));
    setEdges(flow.aristas.map(aristaToRFEdge));
    const guardado = leerBorrador(claveBorrador(usuarioId, id));
    setBorradorPendiente(guardado && borradorEsMasNuevo(guardado, flow) ? guardado : null);
    setListo(true);
  }, [id, esNuevo, flow, usuarioId, resetStore, setNodes, setEdges]);

  const nodosParaGuardar = useMemo(() => nodes.map(nodoParaGuardar), [nodes]);
  const aristasParaGuardar = useMemo(
    () => edges.map((e): IArista => ({ id: e.id, from: e.source, to: e.target })),
    [edges],
  );

  // Red de seguridad local (criterio 30): se pausa mientras el usuario decide si recupera un
  // borrador anterior, para que escribir el estado actual no lo pise antes de que pueda elegir.
  useFlowDraft(
    claveDraft,
    listo && borradorPendiente === null,
    { nombre, nodos: nodosParaGuardar, aristas: aristasParaGuardar, entrada, trigger },
    esNuevo || !flow
      ? null
      : { nombre: flow.nombre, nodos: flow.nodos, aristas: flow.aristas, entrada: flow.entrada },
  );

  const decoratedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...(n.data as FlowNodeData),
          esEntrada: n.id === entrada,
          error: nodeErrors[n.id],
          // Calculado en vivo con `analizarGrafo`: en cuanto se corrige, el nodo pasa de rojo a verde.
          problemas: (grafo.porNodo.get(n.id) ?? []).map((e) => e.mensaje),
        },
      })),
    [nodes, entrada, nodeErrors, grafo.porNodo],
  );

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedNodo = selectedNode ? (selectedNode.data as FlowNodeData).nodo : null;

  const opcionesDestino = useMemo(
    () =>
      nodes
        .filter((n) => n.id !== selectedNodeId)
        .map((n) => {
          const nodo = (n.data as FlowNodeData).nodo;
          const tipo = NODE_VISUALS[nodo.tipo].label;
          // Con nombre propio el destino se lee por el nombre; sin él, por tipo + resumen (como antes).
          return { id: n.id, label: nodo.nombre?.trim() ? `${nombreDeNodo(nodo)} · ${tipo}` : `${tipo} — ${resumenConfig(nodo)}` };
        }),
    [nodes, selectedNodeId],
  );

  const nodoPorId = useMemo(() => {
    const mapa = new Map<string, INodo>();
    nodes.forEach((n) => mapa.set(n.id, (n.data as FlowNodeData).nodo));
    return mapa;
  }, [nodes]);

  // Líneas de rama de `condicion`/`intencion`/`ia`: se derivan de `config` en cada render, nunca
  // se guardan en `edges`/`aristas` — evita que el destino de una rama (el `<Select>` del
  // inspector) y una arista de canvas se desincronicen, que es justo el bug que tenía el diseño
  // anterior. Cada línea lleva en `data` la frase del tooltip (HU-FLOW-04) y a QUÉ rama pertenece
  // (HU-FLOW-05): por eso se pueden borrar con el teclado — borrar la línea deja vacío ese destino.
  const edgesDerivados = useMemo<Edge[]>(
    () =>
      nodes.flatMap((n) => {
        const nodo = (n.data as FlowNodeData).nodo;
        return filasDeRama(nodo)
          .filter((fila) => fila.destino)
          .map((fila) => ({
            id: `derivado_${n.id}_${fila.handleId}`,
            source: n.id,
            sourceHandle: fila.handleId,
            target: fila.destino,
            type: 'flowEdge',
            data: {
              etiqueta: fila.label,
              descripcion: describirRelacion(nodo, fila.handleId, nodoPorId.get(fila.destino)),
              nodoId: n.id,
              handleId: fila.handleId,
            },
            deletable: true,
            reconnectable: false,
          }));
      }),
    [nodes, nodoPorId],
  );

  // Las aristas lineales (salida única de un nodo) también explican su relación al pasar el mouse.
  const edgesManuales = useMemo<Edge[]>(
    () =>
      edges.map((e) => {
        const origen = nodoPorId.get(e.source);
        return {
          ...e,
          type: 'flowEdge',
          data: { descripcion: origen ? describirRelacion(origen, null, nodoPorId.get(e.target)) : '' },
        };
      }),
    [edges, nodoPorId],
  );

  const actualizarDestinoDeRama = useCallback(
    (nodeId: string, handleId: string, destino: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const data = n.data as FlowNodeData;
          return { ...n, data: { ...data, nodo: { ...data.nodo, config: configConDestino(data.nodo.config, handleId, destino) } } };
        }),
      );
    },
    [setNodes],
  );

  const edgesParaCanvas = useMemo(() => [...edgesManuales, ...edgesDerivados], [edgesManuales, edgesDerivados]);

  const onConnect: OnConnect = useCallback(
    (connection) => {
      const handle = connection.sourceHandle;
      const esHandleDeRama =
        handle !== null && (handle === 'default' || handle.startsWith('rama-') || handle.startsWith('etiqueta-'));
      if (esHandleDeRama && handle !== null && connection.source && connection.target) {
        actualizarDestinoDeRama(connection.source, handle, connection.target);
        return;
      }
      setEdges((eds) => addEdge({ ...connection, id: nuevoId('arista') }, eds));
    },
    [setEdges, actualizarDestinoDeRama],
  );

  // ─── Borrado con teclado (Supr / Retroceso) ──────────────────────────────────────
  // Una línea LINEAL la quita `onEdgesChange` de React Flow. Una línea de RAMA no vive en `edges`
  // (se deriva de `config`), así que aquí se traduce a «dejar vacío el destino de esa rama».
  const onEdgesDelete: OnEdgesDelete = useCallback(
    (borradas) => {
      for (const linea of borradas) {
        const rama = ramaDeLinea(linea);
        if (rama) actualizarDestinoDeRama(rama.nodoId, rama.handleId, '');
      }
    },
    [actualizarDestinoDeRama],
  );

  /** Deja vacías las ramas de otros nodos que apuntaban a alguno de `ids` (no pueden quedar colgando
   *  de un nodo que ya no existe). */
  const limpiarReferencias = useCallback(
    (ids: ReadonlySet<string>) => {
      setNodes((nds) =>
        nds.map((n) => {
          const data = n.data as FlowNodeData;
          const config = configSinDestinos(data.nodo.config, ids);
          return config === data.nodo.config ? n : { ...n, data: { ...data, nodo: { ...data.nodo, config } } };
        }),
      );
    },
    [setNodes],
  );

  const hayOtrosNodos = nodes.length > 1;
  const avisarEntrada = useCallback(() => {
    toast.error('Este es el nodo de inicio', {
      description: 'Marca otro nodo como inicio antes de borrarlo.',
    });
  }, []);

  const onBeforeDelete: OnBeforeDelete = useCallback(
    async ({ nodes: porBorrar }) => {
      // El nodo de inicio no se borra mientras haya más nodos: sin él el flujo no tendría por dónde empezar.
      if (entrada && hayOtrosNodos && porBorrar.some((n) => n.id === entrada) && porBorrar.length < nodes.length) {
        avisarEntrada();
        return false;
      }
      return true;
    },
    [entrada, hayOtrosNodos, nodes.length, avisarEntrada],
  );

  const onNodesDelete: OnNodesDelete = useCallback(
    (borrados) => {
      const ids = new Set(borrados.map((n) => n.id));
      limpiarReferencias(ids);
      if (ids.has(entrada)) setEntrada('');
      if (selectedNodeId && ids.has(selectedNodeId)) select(null);
    },
    [limpiarReferencias, entrada, selectedNodeId, select],
  );

  const crearNodo = useCallback(
    (tipo: TipoNodo) => {
      const id = nuevoId('nodo');
      const columna = nodes.length % 4;
      const fila = Math.floor(nodes.length / 4);
      const posicion = { x: 60 + columna * 300, y: 60 + fila * 180 };
      const nodo: INodo = { id, tipo, posicion, config: configPorDefecto(tipo) };
      setNodes((nds) => [...nds, { id, type: 'flowNode', position: posicion, data: { nodo, esEntrada: false } }]);
      setEntrada((actual) => actual || id);
      select(id);
    },
    [nodes.length, setNodes, select],
  );

  /** Al editar un nodo, el error de forma que devolvió el servidor para ÉL ya no aplica. */
  const olvidarErrorDeServidor = useCallback((nodeId: string) => {
    const { nodeErrors: actuales, setNodeErrors } = useFlowStore.getState();
    if (!(nodeId in actuales)) return;
    const { [nodeId]: _quitado, ...resto } = actuales;
    void _quitado;
    setNodeErrors(resto);
  }, []);

  const actualizarNodo = useCallback(
    (cambio: (nodo: INodo) => INodo) => {
      if (!selectedNodeId) return;
      olvidarErrorDeServidor(selectedNodeId);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId
            ? { ...n, data: { ...(n.data as FlowNodeData), nodo: cambio((n.data as FlowNodeData).nodo) } }
            : n,
        ),
      );
    },
    [selectedNodeId, setNodes, olvidarErrorDeServidor],
  );

  const actualizarConfig = useCallback(
    (config: ConfigNodo) => actualizarNodo((nodo) => ({ ...nodo, config })),
    [actualizarNodo],
  );
  const actualizarNombreNodo = useCallback(
    (nuevo: string) => actualizarNodo((nodo) => ({ ...nodo, nombre: nuevo })),
    [actualizarNodo],
  );

  const eliminarNodoSeleccionado = useCallback(() => {
    if (!selectedNodeId) return;
    if (selectedNodeId === entrada && hayOtrosNodos) {
      avisarEntrada();
      return;
    }
    const ids = new Set([selectedNodeId]);
    limpiarReferencias(ids);
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setEntrada((actual) => (actual === selectedNodeId ? '' : actual));
    select(null);
  }, [selectedNodeId, entrada, hayOtrosNodos, avisarEntrada, limpiarReferencias, setNodes, setEdges, select]);

  const flujoActivoActual = useMemo(() => {
    if (esNuevo) return flows?.find((f) => f.activo) ?? null;
    return flows?.find((f) => f.activo && f.id !== id) ?? null;
  }, [flows, esNuevo, id]);

  function irAlPrimerError(): void {
    const primero = grafo.errores[0]?.nodoId;
    if (!primero) return;
    select(primero);
    void instancia.current?.fitView({
      nodes: [{ id: primero }],
      maxZoom: 1,
      padding: 0.8,
      duration: duracionDeCamara(),
    });
  }

  function aplicarBorrador(b: BorradorFlujo): void {
    resetStore();
    setNombre(b.nombre);
    setEntrada(b.entrada);
    setTrigger(b.trigger);
    setNodes(b.nodos.map(nodoToRFNode));
    setEdges(b.aristas.map(aristaToRFEdge));
    setBorradorPendiente(null);
  }

  function descartarBorrador(): void {
    borrarBorrador(claveDraft);
    setBorradorPendiente(null);
  }

  /**
   * `activar`: `true` = pedir activar; `false` = pedir desactivar; ausente = conservar el estado actual.
   * `confirmado`: el usuario ya aceptó guardar un flujo en producción dejándolo inactivo (modal).
   */
  function guardar({ activar, confirmado = false }: { activar?: boolean; confirmado?: boolean } = {}): void {
    const errorTrigger = validarTrigger(trigger);
    if (errorTrigger) {
      toast.error(errorTrigger);
      return;
    }
    if (grafo.nodosConError > 0) {
      if (activar === true) {
        toast.error('Corrige los nodos en rojo antes de activar el flujo.');
        return;
      }
      // Un flujo EN PRODUCCIÓN con errores no se guarda ni se desactiva en silencio: se pregunta.
      if (activo && activar !== false && !confirmado) {
        setErroresModal(grafo.errores);
        setConfirmarAbierto(true);
        return;
      }
    }
    const payload = {
      nombre: nombre.trim() || 'Flujo sin nombre',
      nodos: nodosParaGuardar,
      aristas: aristasParaGuardar,
      entrada,
      trigger,
      activo: activar ?? activo,
      ...(confirmado ? { confirmarDesactivar: true } : {}),
    };
    saveFlow.mutate(
      { payload, nodos: payload.nodos },
      {
        onSuccess: (guardado) => {
          setActivo(guardado.activo);
          setAvisoInactivo(guardado.desactivado);
          // Lo guardado manda: el borrador local ya no aporta nada.
          borrarBorrador(claveDraft);
          if (esNuevo) {
            hidratado.current = guardado.id;
            navigate(`/flows/${guardado.id}`, { replace: true });
          }
        },
        onError: (error) => {
          const detalle = detalleDeGuardado(error);
          // El servidor es quien manda: si dice que hay errores en un flujo activo (p. ej. el cálculo
          // local quedó desfasado), se muestra el mismo modal con SU lista.
          if (detalle.codigo === 'FLOW_ACTIVO_CON_ERRORES') {
            setErroresModal(detalle.errores);
            setConfirmarAbierto(true);
          }
        },
      },
    );
  }

  function noGuardar(): void {
    // El *debounce* puede no haber escrito aún lo último: se fuerza antes de salir.
    guardarBorrador(claveDraft, {
      nombre,
      nodos: nodosParaGuardar,
      aristas: aristasParaGuardar,
      entrada,
      trigger,
      guardadoEn: Date.now(),
    });
    toast.info('Cambios guardados como borrador', {
      description: 'Quedan en este navegador; al volver a abrir el flujo podrás recuperarlos.',
    });
    navigate('/flows');
  }

  function onActivarToggle(): void {
    if (activo) {
      guardar({ activar: false });
      return;
    }
    if (flujoActivoActual) {
      setActivarAbierto(true);
      return;
    }
    guardar({ activar: true });
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

  const activarBloqueado = !activo && grafo.nodosConError > 0;

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
          {/* Estado del grafo, en vivo: el contador lleva al primer nodo con error. */}
          <div aria-live="polite" className="flex items-center">
            {grafo.nodosConError > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-destructive hover:text-destructive"
                onClick={irAlPrimerError}
              >
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {grafo.nodosConError === 1 ? '1 nodo con errores' : `${grafo.nodosConError} nodos con errores`}
              </Button>
            ) : nodes.length > 0 ? (
              <span className="flex items-center gap-1.5 px-2 text-xs text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Sin errores
              </span>
            ) : null}
          </div>
          <TriggerSettings value={trigger} onChange={setTrigger} />
          {/* Solo un flujo ya guardado: lo que se prueba es la versión del servidor, no el borrador del canvas. */}
          {!esNuevo && id && (
            <SandboxSheet
              flowId={id}
              descripcion="Se prueba la versión guardada de este flujo. Guarda antes si acabas de cambiarlo."
            />
          )}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* El `span` recibe el foco y el hover: un botón `disabled` no dispara tooltips. */}
                <span tabIndex={activarBloqueado ? 0 : -1}>
                  <Button
                    variant={activo ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={onActivarToggle}
                    disabled={saveFlow.isPending || activarBloqueado}
                  >
                    {activo ? 'Desactivar' : 'Activar flujo'}
                  </Button>
                </span>
              </TooltipTrigger>
              {activarBloqueado ? (
                <TooltipContent>Corrige los nodos en rojo para poder activar el flujo.</TooltipContent>
              ) : null}
            </Tooltip>
          </TooltipProvider>
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

      {borradorPendiente ? (
        <Alert className="mt-4 shrink-0">
          <AlertTitle>Hay cambios sin guardar de la última vez</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span>Quedaron en este navegador antes de que pudieras guardarlos.</span>
            <span className="flex gap-2">
              <Button size="sm" onClick={() => aplicarBorrador(borradorPendiente)}>
                Recuperar
              </Button>
              <Button size="sm" variant="outline" onClick={descartarBorrador}>
                Descartar
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {avisoInactivo && !activo ? (
        <Alert className="mt-4 shrink-0 border-destructive/40 bg-destructive-subtle text-destructive">
          <AlertTitle>El flujo quedó inactivo</AlertTitle>
          <AlertDescription>
            Tus clientes vuelven a ser atendidos por Sofi. Corrige los nodos en rojo y activa el flujo para
            volver a producción.
          </AlertDescription>
        </Alert>
      ) : null}

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
                edges={edgesParaCanvas}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onEdgesDelete={onEdgesDelete}
                onNodesDelete={onNodesDelete}
                onBeforeDelete={onBeforeDelete}
                onInit={(rf) => {
                  instancia.current = rf;
                }}
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
          problemas={selectedNodeId ? (grafo.porNodo.get(selectedNodeId) ?? []).map((e) => e.mensaje) : []}
          onNombreChange={actualizarNombreNodo}
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
          guardar({ activar: true });
        }}
      />

      <ConfirmarGuardadoActivoDialog
        open={confirmarAbierto}
        onOpenChange={setConfirmarAbierto}
        errores={erroresModal}
        onGuardarYDesactivar={() => guardar({ confirmado: true })}
        onNoGuardar={noGuardar}
      />
    </div>
  );
}
