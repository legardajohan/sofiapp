import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError, type AxiosResponse } from 'axios';

const { fetchFlowMock, fetchFlowsMock, updateFlowMock, createFlowMock } = vi.hoisted(() => ({
  fetchFlowMock: vi.fn(),
  fetchFlowsMock: vi.fn(),
  updateFlowMock: vi.fn(),
  createFlowMock: vi.fn(),
}));

vi.mock('../api.js', () => ({
  fetchFlow: fetchFlowMock,
  fetchFlows: fetchFlowsMock,
  updateFlow: updateFlowMock,
  createFlow: createFlowMock,
  fetchReminder: vi.fn().mockResolvedValue({ activo: false, antelacionMinutos: 30, texto: '', templateId: null }),
  updateReminder: vi.fn(),
}));
// El chat de prueba trae su propio mundo (realtime, sesión); aquí solo estorba.
vi.mock('../../assistant-sandbox/index.js', () => ({ SandboxSheet: () => null }));
// El gestor de campos y los catálogos hacen peticiones propias que este test no necesita.
vi.mock('@/features/contacts/hooks/useContactFields', () => ({
  useContactFields: () => ({ data: [], isSuccess: true }),
  camposPorKey: () => new Map(),
}));
vi.mock('@/features/contacts/hooks/useContactOptions', () => ({ useContactOptions: () => ({ data: undefined }) }));

import { FlowEditorPage } from './FlowEditorPage.js';
import { claveBorrador } from '../lib/draft.js';
import { useFlowStore } from '../useFlowStore.js';
import type { FlowDTO, INodo } from '../types.js';

beforeAll(() => {
  Element.prototype.getBoundingClientRect = () =>
    ({ width: 1000, height: 600, top: 0, left: 0, right: 1000, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect;
});

const posicion = { x: 0, y: 0 };
const msg = (id: string, texto: string, x = 0): INodo => ({
  id,
  tipo: 'mensaje',
  posicion: { x, y: 0 },
  config: { tipo: 'mensaje', texto },
});
const condicion = (destino: string): INodo => ({
  id: 'c1',
  tipo: 'condicion',
  posicion,
  config: {
    tipo: 'condicion',
    variable: 'ultimo_mensaje',
    ramas: [{ operador: 'contiene', valor: 'si', nodoDestino: destino }],
    ramaPorDefecto: 'm1',
  },
});

function flujo(over: Partial<FlowDTO> = {}): FlowDTO {
  return {
    id: 'f1',
    nombre: 'Flujo de prueba',
    // c1 (inicio) → rama «si» sin destino; m1 por defecto; m2 suelto: c1 y m2 están en rojo.
    nodos: [condicion(''), msg('m1', 'Hola', 300), msg('m2', 'Suelto', 600)],
    aristas: [],
    entrada: 'c1',
    trigger: { tipo: 'siempre' },
    version: 1,
    estado: 'borrador',
    activo: false,
    createdAt: new Date(1_000).toISOString(),
    updatedAt: new Date(1_000).toISOString(),
    ...over,
  };
}

/** Un flujo completo y conectado: ningún nodo en rojo. */
function flujoSano(over: Partial<FlowDTO> = {}): FlowDTO {
  return flujo({
    nodos: [msg('m1', 'Hola'), msg('m2', 'Adiós', 300)],
    aristas: [{ id: 'a1', from: 'm1', to: 'm2' }],
    entrada: 'm1',
    ...over,
  });
}

function respuestaDeGuardado(f: FlowDTO, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...f, advertencias: [], desactivado: false, ...extra };
}

function errorHttp(status: number, data: unknown): AxiosError {
  return new AxiosError('fallo', String(status), undefined, undefined, { status, data } as AxiosResponse);
}

function montar(f: FlowDTO) {
  fetchFlowMock.mockResolvedValue(f);
  fetchFlowsMock.mockResolvedValue([]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/flows/${f.id}`]}>
        <Routes>
          <Route path="/flows/:id" element={<FlowEditorPage />} />
          <Route path="/flows" element={<div>Lista de flujos</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Selecciona un nodo del canvas. Con `fireEvent.click` y no `userEvent.click`: este último emite
 *  también `mousedown` SIN `view`, y el `d3-drag` de React Flow lo lee y revienta en jsdom. */
function seleccionarNodo(titulo: HTMLElement): void {
  fireEvent.click(titulo);
}

async function cargado(): Promise<void> {
  await screen.findByRole('button', { name: 'Guardar' });
}

beforeEach(() => {
  window.localStorage.clear();
  useFlowStore.getState().reset();
  fetchFlowMock.mockReset();
  fetchFlowsMock.mockReset();
  updateFlowMock.mockReset();
  createFlowMock.mockReset();
});

describe('FlowEditorPage — estado de errores en vivo (HU-FLOW-05, criterios 26-28)', () => {
  it('marca en rojo los nodos con problemas y cuenta cuántos son', async () => {
    montar(flujo());
    await cargado();

    expect(screen.getAllByLabelText('Con errores')).toHaveLength(2); // c1 y m2
    expect(screen.getAllByLabelText('Listo')).toHaveLength(1); // m1
    expect(screen.getByRole('button', { name: '2 nodos con errores' })).toBeInTheDocument();
  });

  it('con errores, «Activar flujo» está deshabilitado', async () => {
    montar(flujo());
    await cargado();
    expect(screen.getByRole('button', { name: 'Activar flujo' })).toBeDisabled();
  });

  it('un flujo sin errores lo dice y permite activar', async () => {
    montar(flujoSano());
    await cargado();
    expect(screen.getByText('Sin errores')).toBeInTheDocument();
    expect(screen.queryByLabelText('Con errores')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activar flujo' })).toBeEnabled();
  });

  it('corregir la conexión pone el nodo en verde AL INSTANTE, sin guardar', async () => {
    montar(flujo());
    await cargado();
    expect(screen.getAllByLabelText('Con errores')).toHaveLength(2);

    // Selecciona la condición y apunta su rama sin destino al nodo suelto.
    seleccionarNodo(screen.getByText('Condición'));
    await userEvent.click(screen.getAllByRole('combobox', { name: 'Nodo destino' })[0]!);
    await userEvent.click(await screen.findByRole('option', { name: /Suelto/ }));

    await waitFor(() => expect(screen.queryByLabelText('Con errores')).not.toBeInTheDocument());
    expect(screen.getAllByLabelText('Listo')).toHaveLength(3);
    expect(screen.getByText('Sin errores')).toBeInTheDocument();
    expect(updateFlowMock).not.toHaveBeenCalled(); // nada se envió al servidor
  });

  it('el contador lleva al primer nodo con error (lo selecciona en el inspector)', async () => {
    montar(flujo());
    await cargado();
    await userEvent.click(screen.getByRole('button', { name: '2 nodos con errores' }));
    expect(await screen.findByText('Nombre del nodo')).toBeInTheDocument();
    // En el panel, el problema va en UNA línea y el detalle se abre como acordeón.
    const aviso = screen.getByRole('alert');
    expect(aviso).toHaveTextContent(/1 error en este nodo/);
    expect(screen.queryByText(/no tiene destino/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /1 error en este nodo/ }));
    expect(await screen.findByText(/no tiene destino/)).toBeInTheDocument();
  });
});

describe('FlowEditorPage — guardar con errores (criterios 20-23)', () => {
  it('un flujo INACTIVO con errores se guarda directo, sin confirmación', async () => {
    const f = flujo();
    updateFlowMock.mockResolvedValue(respuestaDeGuardado(f, { advertencias: [{ nodoId: 'm2' }] }));
    montar(f);
    await cargado();

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(updateFlowMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Este flujo está en producción y tiene errores')).not.toBeInTheDocument();
    expect(updateFlowMock.mock.calls[0]?.[1]).not.toHaveProperty('confirmarDesactivar');
  });

  it('un flujo sin errores se guarda directo', async () => {
    const f = flujoSano();
    updateFlowMock.mockResolvedValue(respuestaDeGuardado(f));
    montar(f);
    await cargado();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(updateFlowMock).toHaveBeenCalledTimes(1));
  });
});

describe('FlowEditorPage — editar un flujo EN PRODUCCIÓN con errores (criterio 29)', () => {
  const activo = (): FlowDTO => flujo({ activo: true });

  it('abre el modal y NO llama a la API hasta confirmar', async () => {
    montar(activo());
    await cargado();

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Este flujo está en producción y tiene errores')).toBeInTheDocument();
    expect(updateFlowMock).not.toHaveBeenCalled();
  });

  it('«Cancelar» cierra el modal y sigue editando: nada se envía', async () => {
    montar(activo());
    await cargado();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    await waitFor(() =>
      expect(screen.queryByText('Este flujo está en producción y tiene errores')).not.toBeInTheDocument(),
    );
    expect(updateFlowMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument(); // sigue en el editor
  });

  it('«Guardar y desactivar» envía `confirmarDesactivar` y muestra el aviso de inactivo', async () => {
    const f = activo();
    updateFlowMock.mockResolvedValue(
      respuestaDeGuardado({ ...f, activo: false }, { desactivado: true, advertencias: [{ nodoId: 'm2' }] }),
    );
    montar(f);
    await cargado();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar y desactivar' }));

    await waitFor(() => expect(updateFlowMock).toHaveBeenCalledTimes(1));
    expect(updateFlowMock.mock.calls[0]?.[1]).toMatchObject({ confirmarDesactivar: true, activo: true });
    expect(await screen.findByText('El flujo quedó inactivo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activar flujo' })).toBeInTheDocument(); // ya no dice «Desactivar»
  });

  it('«No guardar» sale al listado SIN enviar nada y conserva los cambios como borrador', async () => {
    montar(activo());
    await cargado();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'No guardar' }));

    expect(await screen.findByText('Lista de flujos')).toBeInTheDocument();
    expect(updateFlowMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(claveBorrador(undefined, 'f1'))).not.toBeNull();
  });

  it('si el servidor dice 409 aunque el editor no vio errores, se abre el mismo modal con la lista del servidor', async () => {
    const f = flujoSano({ activo: true });
    updateFlowMock.mockRejectedValue(
      errorHttp(409, {
        codigo: 'FLOW_ACTIVO_CON_ERRORES',
        errores: [{ nodoId: 'm2', codigo: 'NODO_HUERFANO', mensaje: '«Adiós» no tiene conexión de entrada.' }],
      }),
    );
    montar(f);
    await cargado();

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Este flujo está en producción y tiene errores')).toBeInTheDocument();
    expect(screen.getByText('«Adiós» no tiene conexión de entrada.')).toBeInTheDocument();
  });

  it('un flujo activo SIN errores se guarda directo, sin modal', async () => {
    const f = flujoSano({ activo: true });
    updateFlowMock.mockResolvedValue(respuestaDeGuardado(f));
    montar(f);
    await cargado();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(updateFlowMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Este flujo está en producción y tiene errores')).not.toBeInTheDocument();
  });
});

describe('FlowEditorPage — borrador local (criterio 30)', () => {
  const clave = claveBorrador(undefined, 'f1');

  function sembrarBorrador(nombre: string): void {
    window.localStorage.setItem(
      clave,
      JSON.stringify({
        nombre,
        nodos: [msg('m1', 'Hola'), msg('m2', 'Adiós', 300)],
        aristas: [{ id: 'a1', from: 'm1', to: 'm2' }],
        entrada: 'm1',
        trigger: { tipo: 'siempre' },
        guardadoEn: Date.now() + 60_000,
      }),
    );
  }

  it('ofrece recuperar un borrador más reciente que lo guardado', async () => {
    sembrarBorrador('Editado sin conexión');
    montar(flujoSano());
    expect(await screen.findByText('Hay cambios sin guardar de la última vez')).toBeInTheDocument();
  });

  it('«Recuperar» aplica el borrador al editor', async () => {
    sembrarBorrador('Editado sin conexión');
    montar(flujoSano());
    await userEvent.click(await screen.findByRole('button', { name: 'Recuperar' }));
    expect(screen.getByPlaceholderText('Nombre del flujo')).toHaveValue('Editado sin conexión');
    expect(screen.queryByText('Hay cambios sin guardar de la última vez')).not.toBeInTheDocument();
  });

  it('«Descartar» borra el borrador', async () => {
    sembrarBorrador('Editado sin conexión');
    montar(flujoSano());
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
    expect(window.localStorage.getItem(clave)).toBeNull();
    expect(screen.queryByText('Hay cambios sin guardar de la última vez')).not.toBeInTheDocument();
  });

  it('sin borrador, no se ofrece nada', async () => {
    montar(flujoSano());
    await cargado();
    expect(screen.queryByText('Hay cambios sin guardar de la última vez')).not.toBeInTheDocument();
  });

  it('un borrador idéntico a lo guardado no se ofrece', async () => {
    window.localStorage.setItem(
      clave,
      JSON.stringify({
        nombre: 'Flujo de prueba',
        nodos: flujoSano().nodos,
        aristas: flujoSano().aristas,
        entrada: 'm1',
        trigger: { tipo: 'siempre' },
        guardadoEn: Date.now() + 60_000,
      }),
    );
    montar(flujoSano());
    await cargado();
    expect(screen.queryByText('Hay cambios sin guardar de la última vez')).not.toBeInTheDocument();
  });

  it('si guardar falla sin conexión, el editor conserva lo escrito', async () => {
    const f = flujoSano();
    updateFlowMock.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    montar(f);
    await cargado();
    await userEvent.type(screen.getByPlaceholderText('Nombre del flujo'), ' v2');

    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(updateFlowMock).toHaveBeenCalledTimes(1));
    expect(screen.getByPlaceholderText('Nombre del flujo')).toHaveValue('Flujo de prueba v2');
  });
});

describe('FlowEditorPage — nombres de nodo (criterios 33-35)', () => {
  it('el nombre se escribe en el inspector, se ve en el nodo y viaja al guardar', async () => {
    const f = flujoSano();
    updateFlowMock.mockResolvedValue(respuestaDeGuardado(f));
    montar(f);
    await cargado();

    seleccionarNodo(screen.getAllByText('Mensaje')[0]!);
    await userEvent.type(await screen.findByLabelText('Nombre del nodo'), 'Saludo inicial');

    expect(screen.getAllByText('Saludo inicial').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(updateFlowMock).toHaveBeenCalledTimes(1));
    const nodos = (updateFlowMock.mock.calls[0]?.[1] as { nodos: INodo[] }).nodos;
    expect(nodos.find((n) => n.id === 'm1')?.nombre).toBe('Saludo inicial');
  });

  it('un nombre en blanco no viaja (el servidor exige 1–60 caracteres o ausente)', async () => {
    const f = flujoSano();
    updateFlowMock.mockResolvedValue(respuestaDeGuardado(f));
    montar(f);
    await cargado();

    seleccionarNodo(screen.getAllByText('Mensaje')[0]!);
    await userEvent.type(await screen.findByLabelText('Nombre del nodo'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(updateFlowMock).toHaveBeenCalledTimes(1));
    const nodos = (updateFlowMock.mock.calls[0]?.[1] as { nodos: INodo[] }).nodos;
    expect(nodos.find((n) => n.id === 'm1')).not.toHaveProperty('nombre');
  });

  it('el nombre aparece en el desplegable de destino de otro nodo', async () => {
    const f = flujo({
      nodos: [condicion(''), { ...msg('m1', 'Hola', 300), nombre: 'Saludo inicial' }, msg('m2', 'Suelto', 600)],
    });
    montar(f);
    await cargado();

    seleccionarNodo(screen.getByText('Condición'));
    await userEvent.click(screen.getAllByRole('combobox', { name: 'Nodo destino' })[0]!);

    expect(await screen.findByRole('option', { name: /Saludo inicial/ })).toBeInTheDocument();
  });
});

describe('FlowEditorPage — borrar nodos y enlaces (criterios 30-32)', () => {
  it('el nodo de inicio no se puede borrar mientras haya otros nodos', async () => {
    montar(flujoSano());
    await cargado();
    seleccionarNodo(screen.getAllByText('Mensaje')[0]!); // m1, que es el inicio
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar nodo' }));

    expect(document.querySelectorAll('.react-flow__node')).toHaveLength(2); // siguen los dos
  });

  it('borrar un nodo deja vacías las ramas que apuntaban a él y marca en rojo al que las tenía', async () => {
    const f = flujo({
      nodos: [condicion('m2'), msg('m1', 'Hola', 300), msg('m2', 'Destino', 600)],
    });
    montar(f);
    await cargado();
    // c1 apunta a m1 (por defecto) y a m2 (rama «si»): todo conectado, nada en rojo.
    expect(screen.queryByLabelText('Con errores')).not.toBeInTheDocument();

    seleccionarNodo(screen.getAllByText('Mensaje')[1]!); // m2
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar nodo' }));
    // m2 tiene una conexión (la rama «si» de c1): antes de borrar avisa y la nombra.
    expect(await screen.findByText('¿Borrar «Mensaje»?')).toBeInTheDocument();
    expect(screen.getByText(/Condición → Mensaje/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Borrar' }));

    await waitFor(() => expect(document.querySelectorAll('.react-flow__node')).toHaveLength(2)); // c1 y m1
    // La condición queda con una rama sin destino → en rojo, en vez de apuntar a un nodo que ya no existe.
    fireEvent.click(await screen.findByLabelText('Con errores'));
    expect(await screen.findByText(/no tiene destino/)).toBeInTheDocument();
  });

  it('cancelar el aviso conserva el nodo y sus conexiones', async () => {
    montar(flujo({ nodos: [condicion('m2'), msg('m1', 'Hola', 300), msg('m2', 'Destino', 600)] }));
    await cargado();

    seleccionarNodo(screen.getAllByText('Mensaje')[1]!);
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar nodo' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(document.querySelectorAll('.react-flow__node')).toHaveLength(3);
    expect(screen.queryByLabelText('Con errores')).not.toBeInTheDocument();
  });

  it('un nodo SIN conexiones se borra directo, sin aviso', async () => {
    montar(flujo()); // m2 está suelto
    await cargado();

    seleccionarNodo(screen.getAllByText('Mensaje')[1]!); // m2
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar nodo' }));

    await waitFor(() => expect(document.querySelectorAll('.react-flow__node')).toHaveLength(2));
    expect(screen.queryByText(/¿Borrar/)).not.toBeInTheDocument();
  });
});

describe('FlowEditorPage — panel derecho', () => {
  it('sin ningún nodo seleccionado el panel no existe', async () => {
    montar(flujoSano());
    await cargado();
    expect(screen.queryByText('Nombre del nodo')).not.toBeInTheDocument();
  });

  it('se puede ocultar con un nodo seleccionado y se vuelve a abrir desde el lienzo', async () => {
    montar(flujoSano());
    await cargado();
    seleccionarNodo(screen.getAllByText('Mensaje')[0]!);
    expect(await screen.findByText('Nombre del nodo')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar panel' }));
    expect(screen.queryByText('Nombre del nodo')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar panel' }));
    expect(await screen.findByText('Nombre del nodo')).toBeInTheDocument();
  });
});

describe('FlowEditorPage — nodo recién creado', () => {
  it('no marca error mientras se configura; lo marca al salir de él', async () => {
    montar(flujoSano());
    await cargado();

    await userEvent.click(screen.getByRole('button', { name: /Agregar nodo/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Mensaje/ }));
    // El nuevo mensaje está vacío (incompleto) pero el usuario apenas empieza: ni lienzo ni panel avisan.
    expect(await screen.findByText('Nombre del nodo')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Falta configurar')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Con errores')).not.toBeInTheDocument();

    // Al salir (clic en otro nodo) se evalúa: aparece la marca.
    seleccionarNodo(screen.getAllByText('Mensaje')[0]!);
    await waitFor(() =>
      expect(screen.queryByLabelText('Falta configurar') ?? screen.queryByLabelText('Con errores')).toBeInTheDocument(),
    );
  });
});
