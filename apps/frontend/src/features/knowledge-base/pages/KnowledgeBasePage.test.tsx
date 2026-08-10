/**
 * Verifica el rediseño de HU-KB-05 sobre la página completa: una sola grilla, modales de
 * edición/creación y los dos contadores. Cubre los criterios que la lógica pura de
 * `kb-presets.test.ts` no puede demostrar por sí sola.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KnowledgeBasePage } from './KnowledgeBasePage.js';
import type { IKbDocument, KbDocumentsListResponse } from '../types/index.js';

const { mockGetKbDocuments, mockCreate, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockGetKbDocuments: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('../../../api/knowledge-base.js', () => ({
  getKbDocuments: mockGetKbDocuments,
  createKbDocument: mockCreate,
  updateKbDocument: mockUpdate,
  deleteKbDocument: mockDelete,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const OBLIGATORIO = 'Información de la empresa';
const LIBRE = 'Convenios con empresas';

function makeDoc(overrides: Partial<IKbDocument> & { titulo: string }): IKbDocument {
  return {
    id: `id-${overrides.titulo}`,
    contenido: 'Texto ya cargado.',
    estadoIndexacion: 'indexado',
    version: 2,
    chunkCount: 4,
    isPreset: false,
    obligatorio: false,
    oculto: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T10:30:00.000Z',
    ...overrides,
  };
}

const listado = (docs: IKbDocument[]): KbDocumentsListResponse => ({
  data: docs,
  total: docs.length,
  page: 1,
  limit: 50,
});

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <KnowledgeBasePage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // El onboarding se muestra una sola vez y taparía la grilla en los tests.
  localStorage.setItem('kb_onboarding_dismissed', '1');
  mockGetKbDocuments.mockResolvedValue(listado([]));
});

describe('KnowledgeBasePage — grilla única', () => {
  it('muestra las 5 categorías predefinidas más los documentos propios y la acción de crear', async () => {
    mockGetKbDocuments.mockResolvedValue(listado([makeDoc({ titulo: LIBRE })]));
    renderPage();

    expect(await screen.findByRole('button', { name: /Editar Convenios con empresas/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Completar Información de la empresa/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Productos y servicios/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agregar nuevo conocimiento/ })).toBeInTheDocument();
  });

  it('no queda rastro de la tabla ni del formulario embebido', async () => {
    renderPage();
    await screen.findByRole('button', { name: /Agregar nuevo conocimiento/ });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Contenido')).not.toBeInTheDocument();
  });

  it('un preset sin documento real no inventa versión ni fecha', async () => {
    renderPage();
    const tarjeta = await screen.findByRole('button', { name: /Completar Información de la empresa/ });

    expect(within(tarjeta).getByText('Sin contenido todavía')).toBeInTheDocument();
  });

  it('la tarjeta de un documento real traslada la información de la tabla', async () => {
    mockGetKbDocuments.mockResolvedValue(listado([makeDoc({ titulo: LIBRE })]));
    renderPage();
    const tarjeta = await screen.findByRole('button', { name: /Editar Convenios con empresas/ });

    expect(within(tarjeta).getByText(/v2 · 4 fragmentos · Actualizado/)).toBeInTheDocument();
    expect(within(tarjeta).getByText('Indexado')).toBeInTheDocument();
  });

  it('si la carga falla muestra el aviso con Reintentar en lugar de la grilla', async () => {
    mockGetKbDocuments.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText('No se pudo cargar tu conocimiento')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    // La grilla no se pinta con presets virtuales: sería afirmar que el tenant no tiene nada.
    expect(screen.queryByRole('button', { name: /Agregar nuevo conocimiento/ })).not.toBeInTheDocument();
  });
});

describe('KnowledgeBasePage — contadores', () => {
  it('separa los obligatorios (denominador fijo) de los indexados (denominador dinámico)', async () => {
    mockGetKbDocuments.mockResolvedValue(
      listado([
        makeDoc({ titulo: OBLIGATORIO, estadoIndexacion: 'indexado' }),
        makeDoc({ titulo: LIBRE, estadoIndexacion: 'indexado' }),
      ]),
    );
    renderPage();

    // 5 presets + 1 documento libre = 6 categorías; 2 de ellas indexadas.
    expect(await screen.findByText('1/2 obligatorios completados')).toBeInTheDocument();
    expect(screen.getByText('2/6 documentos indexados')).toBeInTheDocument();
  });
});

describe('KnowledgeBasePage — modal de edición', () => {
  it('abre con el título como encabezado fijo y el contenido precargado', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(listado([makeDoc({ titulo: LIBRE })]));
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Editar Convenios con empresas/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: LIBRE })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Contenido')).toHaveValue('Texto ya cargado.');
    // El título es identidad del documento, no un campo editable.
    expect(within(dialog).queryByLabelText('Título')).not.toBeInTheDocument();
  });

  it('al abrir sin tocar el texto avisa que no hay cambios que guardar (HU-KB-06)', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(listado([makeDoc({ titulo: LIBRE, version: 2 })]));
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Editar Convenios con empresas/ }));

    expect(await screen.findByText('Versión v2. Sin cambios por guardar.')).toBeInTheDocument();
  });

  it('anuncia la versión de destino en cuanto el texto cambia de verdad (HU-KB-06)', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(listado([makeDoc({ titulo: LIBRE, version: 2 })]));
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Editar Convenios con empresas/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Contenido/), ' Y algo más.');

    expect(await screen.findByText('Versión v2. Al guardar pasará a v3.')).toBeInTheDocument();
  });

  it('un cambio que es solo whitespace sigue contando como sin cambios (HU-KB-06)', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(listado([makeDoc({ titulo: LIBRE, version: 2 })]));
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Editar Convenios con empresas/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Contenido/), '   ');

    expect(await screen.findByText('Versión v2. Sin cambios por guardar.')).toBeInTheDocument();
  });

  it('explica que el primer contenido no crea una versión nueva', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(
      listado([makeDoc({ titulo: LIBRE, contenido: '', version: 1, estadoIndexacion: 'pendiente' })]),
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Completar Convenios con empresas/ }));

    expect(
      await screen.findByText('Versión v1. El primer contenido no crea una versión nueva.'),
    ).toBeInTheDocument();
  });

  it('un preset virtual se creará en v1', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Completar Horarios y ubicación/ }));

    expect(await screen.findByText('Aún sin contenido. Se guardará como v1.')).toBeInTheDocument();
  });

  it('guarda una edición con PATCH sobre el documento abierto', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(listado([makeDoc({ titulo: LIBRE })]));
    mockUpdate.mockResolvedValue(makeDoc({ titulo: LIBRE, contenido: 'Texto corregido.' }));
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Editar Convenios con empresas/ }));
    const contenido = await screen.findByLabelText('Contenido');
    await user.clear(contenido);
    await user.type(contenido, 'Texto corregido.');
    await user.click(screen.getByRole('button', { name: 'Guardar e indexar' }));

    expect(mockUpdate).toHaveBeenCalledWith(`id-${LIBRE}`, { contenido: 'Texto corregido.' });
  });
});

describe('KnowledgeBasePage — eliminar', () => {
  it('ofrece Eliminar en un documento no obligatorio, con confirmación', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(listado([makeDoc({ titulo: LIBRE })]));
    mockDelete.mockResolvedValue({ deleted: true });
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Editar Convenios con empresas/ }));
    await user.click(await screen.findByRole('button', { name: /Eliminar/ }));

    const confirmacion = await screen.findByRole('alertdialog');
    expect(within(confirmacion).getByText(`¿Eliminar «${LIBRE}»?`)).toBeInTheDocument();

    await user.click(within(confirmacion).getByRole('button', { name: 'Eliminar' }));
    // `deleteKbDocument` se pasa como `mutationFn` directa, así que TanStack le añade un segundo
    // argumento de contexto; solo nos importa el id que recibe.
    expect(mockDelete.mock.calls[0]?.[0]).toBe(`id-${LIBRE}`);
  });

  it('no ofrece Eliminar en un obligatorio', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(listado([makeDoc({ titulo: OBLIGATORIO })]));
    renderPage();

    await user.click(await screen.findByRole('button', { name: new RegExp(`Editar ${OBLIGATORIO}`) }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
  });

  it('no ofrece Eliminar en un preset virtual: no hay nada que borrar', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Completar Políticas y términos/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
  });
});

describe('KnowledgeBasePage — modal de creación', () => {
  it('crea un conocimiento nuevo con título y contenido', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(makeDoc({ titulo: 'Testimonios' }));
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Agregar nuevo conocimiento/ }));
    await user.type(await screen.findByLabelText('Título'), 'Testimonios');
    await user.type(screen.getByLabelText('Contenido'), 'Lo que dicen nuestros egresados.');
    await user.click(screen.getByRole('button', { name: 'Guardar e indexar' }));

    expect(mockCreate).toHaveBeenCalledWith({
      titulo: 'Testimonios',
      contenido: 'Lo que dicen nuestros egresados.',
    });
  });

  it('bloquea un título que ya existe y no llama al backend', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(listado([makeDoc({ titulo: LIBRE })]));
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Agregar nuevo conocimiento/ }));
    await user.type(await screen.findByLabelText('Título'), '  convenios CON empresas ');
    await user.type(screen.getByLabelText('Contenido'), 'Otro texto.');

    expect(
      screen.getByText(/Este conocimiento ya existe .* Ábrelo desde su tarjeta para editarlo\./),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar e indexar' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Guardar e indexar' }));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('reserva también los títulos de las categorías predefinidas', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Agregar nuevo conocimiento/ }));
    await user.type(await screen.findByLabelText('Título'), OBLIGATORIO);

    expect(screen.getByRole('button', { name: 'Guardar e indexar' })).toBeDisabled();
  });
});

describe('KnowledgeBasePage — buscador y filtros (HU-KB-06)', () => {
  it('reduce la grilla al escribir, sin esconder la acción de crear', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(listado([makeDoc({ titulo: LIBRE })]));
    renderPage();
    await screen.findByRole('button', { name: /Editar Convenios con empresas/ });

    await user.type(screen.getByLabelText('Buscar conocimiento por nombre'), 'convenios');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Completar Horarios y ubicación/ })).toBeNull();
    });
    expect(screen.getByRole('button', { name: /Editar Convenios con empresas/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agregar nuevo conocimiento/ })).toBeInTheDocument();
  });

  it('sin coincidencias ofrece limpiar los filtros y restaura la grilla completa', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /Completar Horarios y ubicación/ });

    await user.type(screen.getByLabelText('Buscar conocimiento por nombre'), 'zzzz');

    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
    // El aviso de error de carga es otra cosa y no debe aparecer aquí.
    expect(screen.queryByText('No se pudo cargar tu conocimiento')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(
      await screen.findByRole('button', { name: /Completar Horarios y ubicación/ }),
    ).toBeInTheDocument();
  });

  it('filtrar no mueve los contadores: describen el inventario, no la vista', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(listado([makeDoc({ titulo: LIBRE })]));
    renderPage();
    // Esperar a la tarjeta: los contadores existen desde el primer render con la lista vacía.
    await screen.findByRole('button', { name: /Editar Convenios con empresas/ });
    expect(screen.getByText('0/2 obligatorios completados')).toBeInTheDocument();
    expect(screen.getByText('1/6 documentos indexados')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Buscar conocimiento por nombre'), 'convenios');
    await screen.findByRole('button', { name: /Editar Convenios con empresas/ });

    expect(screen.getByText('0/2 obligatorios completados')).toBeInTheDocument();
    expect(screen.getByText('1/6 documentos indexados')).toBeInTheDocument();
  });

  it('el buscador no se muestra cuando la carga falla (el aviso reemplaza a la grilla)', async () => {
    mockGetKbDocuments.mockRejectedValue(new Error('sin red'));
    renderPage();

    expect(await screen.findByText('No se pudo cargar tu conocimiento')).toBeInTheDocument();
    expect(screen.queryByLabelText('Buscar conocimiento por nombre')).toBeNull();
  });
});

describe('KnowledgeBasePage — presets eliminados (HU-KB-06)', () => {
  it('un preset oculto no tiene tarjeta y no reaparece como virtual', async () => {
    mockGetKbDocuments.mockResolvedValue(
      listado([makeDoc({ titulo: 'Horarios y ubicación', oculto: true })]),
    );
    renderPage();
    await screen.findByRole('button', { name: /Completar Políticas y términos/ });

    expect(screen.queryByRole('button', { name: /Horarios y ubicación/ })).toBeNull();
  });
});
