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

/**
 * HU-KB-07 — los dos modos del modal, sobre la página real.
 *
 * `COMPLEMENTARIA` es la única categoría con schema registrado en esta HU, así que es la única que
 * puede abrir el formulario guiado. El resto sigue en modo legado hasta HU-KB-08 y siguientes.
 */
describe('KnowledgeBasePage — modo legado y estructurado (HU-KB-07)', () => {
  const COMPLEMENTARIA = 'Información Complementaria';

  async function abrir(
    user: ReturnType<typeof userEvent.setup>,
    nombre: RegExp,
  ): Promise<HTMLElement> {
    await user.click(await screen.findByRole('button', { name: nombre }));
    return screen.findByRole('dialog');
  }

  it('un documento con texto libre abre el textarea de siempre', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(
      listado([makeDoc({ titulo: LIBRE, contenido: 'Convenio con Acme S.A.' })]),
    );
    renderPage();

    const dialog = await abrir(user, /Editar Convenios con empresas/);

    expect(within(dialog).getByLabelText('Contenido')).toHaveValue('Convenio con Acme S.A.');
    // Nada del formulario guiado se cuela en el modo legado.
    expect(within(dialog).queryByLabelText('Información adicional')).toBeNull();
  });

  it('el tope del modo legado subió a 10.000', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(listado([makeDoc({ titulo: LIBRE })]));
    renderPage();

    const dialog = await abrir(user, /Editar Convenios con empresas/);

    expect(within(dialog).getByLabelText('Contenido')).toHaveAttribute('maxlength', '10000');
    expect(within(dialog).getByText(/\/ 10\.000/)).toBeInTheDocument();
  });

  it('guardar en modo legado sigue enviando solo el contenido, sin estructura', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(listado([makeDoc({ titulo: LIBRE, contenido: 'v1' })]));
    mockUpdate.mockResolvedValue(makeDoc({ titulo: LIBRE, contenido: 'v2' }));
    renderPage();

    const dialog = await abrir(user, /Editar Convenios con empresas/);
    await user.type(within(dialog).getByLabelText('Contenido'), ' corregido');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar e indexar' }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate).toHaveBeenCalledWith(`id-${LIBRE}`, { contenido: 'v1 corregido' });
  });

  it('una categoría con texto libre NO se convierte en formulario: la retrocompatibilidad manda', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(
      listado([makeDoc({ titulo: COMPLEMENTARIA, contenido: 'Texto que ya escribí a mano.' })]),
    );
    renderPage();

    const dialog = await abrir(user, new RegExp(`Editar ${COMPLEMENTARIA}`));

    expect(within(dialog).getByLabelText('Contenido')).toHaveValue('Texto que ya escribí a mano.');
    expect(within(dialog).queryByLabelText('Información adicional')).toBeNull();
  });

  it('la misma categoría vacía SÍ abre el formulario guiado', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(
      listado([makeDoc({ titulo: COMPLEMENTARIA, contenido: '', estadoIndexacion: 'pendiente' })]),
    );
    renderPage();

    const dialog = await abrir(user, new RegExp(`Completar ${COMPLEMENTARIA}`));

    expect(within(dialog).getByLabelText('Información adicional')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Contenido')).toBeNull();
    expect(within(dialog).getByText('Texto que leerá la IA')).toBeInTheDocument();
  });

  it('un documento SIN schema registrado sigue en legado aunque esté vacío', async () => {
    const user = userEvent.setup();
    // Desde HU-KB-11 ningún preset sirve de ejemplo: los cinco tienen schema. El caso sobrevive
    // solo para los documentos de título libre, que es donde sigue teniendo sentido.
    mockGetKbDocuments.mockResolvedValue(
      listado([makeDoc({ titulo: LIBRE, contenido: '', estadoIndexacion: 'pendiente' })]),
    );
    renderPage();

    const dialog = await abrir(user, new RegExp(`Completar ${LIBRE}`));

    expect(within(dialog).getByLabelText('Contenido')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Información adicional')).toBeNull();
  });

  it('el contador global mide el texto SERIALIZADO, no lo tecleado en un campo', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(
      listado([makeDoc({ titulo: COMPLEMENTARIA, contenido: '', estadoIndexacion: 'pendiente' })]),
    );
    renderPage();

    const dialog = await abrir(user, new RegExp(`Completar ${COMPLEMENTARIA}`));
    await user.type(within(dialog).getByLabelText('Información adicional'), 'Hola');

    // 4 tecleados + los 25 del encabezado «## Información adicional\n» que añade el serializer.
    expect(within(dialog).getByText('29 / 10.000')).toBeInTheDocument();
  });

  it('guardar en estructurado envía contenido Y estructura en el mismo payload', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(
      listado([makeDoc({ titulo: COMPLEMENTARIA, contenido: '', estadoIndexacion: 'pendiente' })]),
    );
    mockUpdate.mockResolvedValue(makeDoc({ titulo: COMPLEMENTARIA }));
    renderPage();

    const dialog = await abrir(user, new RegExp(`Completar ${COMPLEMENTARIA}`));
    await user.type(within(dialog).getByLabelText('Información adicional'), 'Cerramos en enero');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar e indexar' }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate).toHaveBeenCalledWith(`id-${COMPLEMENTARIA}`, {
      contenido: '## Información adicional\nCerramos en enero',
      estructura: {
        schemaVersion: 1,
        schemaId: 'generico',
        campos: {},
        adicional: 'Cerramos en enero',
      },
    });
  });

  it('un documento que YA tiene estructura abre guiado y la precarga', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(
      listado([
        makeDoc({
          titulo: LIBRE,
          contenido: '## Información adicional\nLo de siempre',
          estructura: {
            schemaVersion: 1,
            schemaId: 'generico',
            campos: {},
            adicional: 'Lo de siempre',
          },
        }),
      ]),
    );
    renderPage();

    const dialog = await abrir(user, /Editar Convenios con empresas/);

    // Abre guiado por su `estructura`, aunque su título no esté en el registry.
    expect(within(dialog).getByLabelText('Información adicional')).toHaveValue('Lo de siempre');
    expect(within(dialog).queryByLabelText('Contenido')).toBeNull();
  });

  it('«Información de la empresa» vacía abre el formulario guiado (HU-KB-08)', async () => {
    const user = userEvent.setup();
    renderPage();

    const dialog = await abrir(user, new RegExp(`Completar ${OBLIGATORIO}`));

    expect(within(dialog).getByRole('button', { name: /Identidad/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Propósito y valores/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Alcance y respaldo/ })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Información adicional')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Contenido')).toBeNull();
  });

  it('la misma categoría con texto libre sigue abriendo su textarea (HU-KB-08)', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(
      listado([makeDoc({ titulo: OBLIGATORIO, obligatorio: true, contenido: 'Somos Acme.' })]),
    );
    renderPage();

    const dialog = await abrir(user, new RegExp(`Editar ${OBLIGATORIO}`));

    expect(within(dialog).getByLabelText('Contenido')).toHaveValue('Somos Acme.');
    expect(within(dialog).queryByRole('button', { name: /Identidad/ })).toBeNull();
  });

  it('los dos obligatorios de empresa bloquean el guardado hasta completarse (HU-KB-08)', async () => {
    const user = userEvent.setup();
    renderPage();

    const dialog = await abrir(user, new RegExp(`Completar ${OBLIGATORIO}`));
    const guardar = within(dialog).getByRole('button', { name: 'Guardar e indexar' });
    expect(guardar).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/Nombre comercial/), 'Acme');
    expect(guardar).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/¿A qué se dedica\?/), 'Insumos de panadería.');
    expect(guardar).toBeEnabled(); // todos los opcionales siguen vacíos
  });

  it('«Nombre del grupo» aparece solo al responder que sí (HU-KB-08)', async () => {
    const user = userEvent.setup();
    renderPage();

    const dialog = await abrir(user, new RegExp(`Completar ${OBLIGATORIO}`));
    expect(within(dialog).queryByLabelText(/Nombre del grupo/)).toBeNull();

    await user.click(within(dialog).getByRole('radio', { name: 'Sí' }));
    expect(within(dialog).getByLabelText(/Nombre del grupo/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('radio', { name: 'No aplica' }));
    expect(within(dialog).queryByLabelText(/Nombre del grupo/)).toBeNull();
  });

  it('guardar empresa envía contenido y estructura con schemaId empresa (HU-KB-08)', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(makeDoc({ titulo: OBLIGATORIO }));
    renderPage();

    const dialog = await abrir(user, new RegExp(`Completar ${OBLIGATORIO}`));
    await user.type(within(dialog).getByLabelText(/Nombre comercial/), 'Acme');
    await user.type(within(dialog).getByLabelText(/¿A qué se dedica\?/), 'Insumos.');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar e indexar' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate).toHaveBeenCalledWith({
      titulo: OBLIGATORIO,
      contenido: '## Identidad\nNombre comercial: Acme\n¿A qué se dedica?: Insumos.',
      estructura: {
        schemaVersion: 1,
        schemaId: 'empresa',
        campos: {
          nombre_comercial: { tipo: 'texto', valor: 'Acme' },
          descripcion: { tipo: 'texto', valor: 'Insumos.' },
        },
        adicional: '',
      },
    });
  });

  it('«Productos y servicios» vacía abre el formulario guiado (HU-KB-09)', async () => {
    const user = userEvent.setup();
    renderPage();

    const dialog = await abrir(user, /Completar Productos y servicios/);

    expect(within(dialog).getByRole('button', { name: /Qué ofrece/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Precios y condiciones/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Cómo se entrega/ })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Información adicional')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Contenido')).toBeNull();
  });

  it('la misma categoría con texto libre sigue abriendo su textarea (HU-KB-09)', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(
      listado([
        makeDoc({ titulo: 'Productos y servicios', obligatorio: true, contenido: 'Vendemos harina.' }),
      ]),
    );
    renderPage();

    const dialog = await abrir(user, /Editar Productos y servicios/);

    expect(within(dialog).getByLabelText('Contenido')).toHaveValue('Vendemos harina.');
    expect(within(dialog).queryByRole('button', { name: /Qué ofrece/ })).toBeNull();
  });

  it('el catálogo pide nombre y descripción, y NINGÚN precio (HU-KB-09)', async () => {
    const user = userEvent.setup();
    renderPage();

    const dialog = await abrir(user, /Completar Productos y servicios/);
    await user.click(within(dialog).getByRole('button', { name: /Añadir a productos y servicios/i }));

    expect(within(dialog).getByLabelText('Nombre 1')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Qué es o qué incluye 1')).toBeInTheDocument();
    // Acotado a controles: `/precio/i` a secas también casaría con la sección «Precios y
    // condiciones» del acordeón, que Radix etiqueta con `aria-labelledby`.
    expect(within(dialog).queryByRole('textbox', { name: /precio/i })).toBeNull();
  });

  it('los obligatorios bloquean hasta tener resumen y una fila con nombre (HU-KB-09)', async () => {
    const user = userEvent.setup();
    renderPage();

    const dialog = await abrir(user, /Completar Productos y servicios/);
    const guardar = within(dialog).getByRole('button', { name: 'Guardar e indexar' });
    expect(guardar).toBeDisabled();

    await user.type(
      within(dialog).getByLabelText(/¿Qué vende o qué servicios presta\?/),
      'Insumos de panadería.',
    );
    expect(guardar).toBeDisabled(); // falta el catálogo

    await user.click(within(dialog).getByRole('button', { name: /Añadir a productos y servicios/i }));
    expect(guardar).toBeDisabled(); // una fila en blanco no cuenta

    await user.type(within(dialog).getByLabelText('Nombre 1'), 'Harina');
    expect(guardar).toBeEnabled(); // sin descripción: basta con el nombre
  });

  it('guardar productos envía contenido y estructura con schemaId productos (HU-KB-09)', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(makeDoc({ titulo: 'Productos y servicios' }));
    renderPage();

    const dialog = await abrir(user, /Completar Productos y servicios/);
    await user.type(
      within(dialog).getByLabelText(/¿Qué vende o qué servicios presta\?/),
      'Insumos.',
    );
    await user.click(within(dialog).getByRole('button', { name: /Añadir a productos y servicios/i }));
    await user.type(within(dialog).getByLabelText('Nombre 1'), 'Harina');
    await user.type(within(dialog).getByLabelText('Qué es o qué incluye 1'), 'Bulto de 25 kg');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar e indexar' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate).toHaveBeenCalledWith({
      titulo: 'Productos y servicios',
      contenido: [
        '## Qué ofrece',
        '¿Qué vende o qué servicios presta?: Insumos.',
        'Productos y servicios:',
        '- nombre: Harina · descripcion: Bulto de 25 kg',
      ].join('\n'),
      estructura: {
        schemaVersion: 1,
        schemaId: 'productos',
        campos: {
          resumen_oferta: { tipo: 'texto', valor: 'Insumos.' },
          catalogo: {
            tipo: 'repetible',
            items: [{ nombre: 'Harina', descripcion: 'Bulto de 25 kg' }],
          },
        },
        adicional: '',
      },
    });
  });

  it('«Horarios y ubicación» vacía abre el formulario guiado con los 7 días (HU-KB-10)', async () => {
    const user = userEvent.setup();
    renderPage();

    const dialog = await abrir(user, /Completar Horarios y ubicación/);

    expect(within(dialog).getByRole('button', { name: /Dónde están/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Cómo contactarlos/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Cuándo atienden/ })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/WhatsApp/)).toBeInTheDocument();
    // Los siete días se pintan siempre: nadie debería tener que «crear» el martes.
    for (const dia of ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']) {
      expect(within(dialog).getByText(dia)).toBeInTheDocument();
    }
    expect(within(dialog).getAllByRole('switch')).toHaveLength(7);
    expect(within(dialog).queryByLabelText('Contenido')).toBeNull();
  });

  it('la misma categoría con texto libre sigue abriendo su textarea (HU-KB-10)', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(
      listado([makeDoc({ titulo: 'Horarios y ubicación', contenido: 'Abrimos de 8 a 6.' })]),
    );
    renderPage();

    const dialog = await abrir(user, /Editar Horarios y ubicación/);

    expect(within(dialog).getByLabelText('Contenido')).toHaveValue('Abrimos de 8 a 6.');
    expect(within(dialog).queryByRole('button', { name: /Cuándo atienden/ })).toBeNull();
  });

  it('marcar un día como Cerrado esconde sus tramos sin borrarlos (HU-KB-10)', async () => {
    const user = userEvent.setup();
    renderPage();

    const dialog = await abrir(user, /Completar Horarios y ubicación/);
    // Hay un «Añadir horario» por día; el primero es el de lunes.
    const anadirLunes = within(dialog).getAllByRole('button', { name: /Añadir horario/ })[0] as HTMLElement;
    await user.click(anadirLunes);
    expect(within(dialog).getByLabelText('Abre el lunes, horario 1')).toHaveValue('08:00');

    const cerrado = within(dialog).getAllByRole('switch')[0] as HTMLElement;
    await user.click(cerrado);
    expect(within(dialog).queryByLabelText('Abre el lunes, horario 1')).toBeNull();

    await user.click(cerrado);
    expect(within(dialog).getByLabelText('Abre el lunes, horario 1')).toHaveValue('08:00');
  });

  it('ningún campo es obligatorio: basta el WhatsApp para poder guardar (HU-KB-10)', async () => {
    const user = userEvent.setup();
    renderPage();

    const dialog = await abrir(user, /Completar Horarios y ubicación/);
    const guardar = within(dialog).getByRole('button', { name: 'Guardar e indexar' });
    // Deshabilitado con todo vacío, pero por texto vacío, no por un campo exigido.
    expect(guardar).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/WhatsApp/), '3001234567');
    expect(guardar).toBeEnabled();
  });

  it('«Horarios y ubicación» NO ofrece Eliminar: es una categoría protegida (HU-KB-12)', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(
      listado([
        makeDoc({
          titulo: 'Horarios y ubicación',
          contenido: '## Cómo contactarlos\nWhatsApp: 3001234567',
          estructura: {
            schemaVersion: 1,
            schemaId: 'horarios',
            campos: { whatsapp: { tipo: 'texto', valor: '3001234567' } },
            adicional: '',
          },
        }),
      ]),
    );
    renderPage();

    const dialog = await abrir(user, /Editar Horarios y ubicación/);

    // **Invierte** el criterio 16 de HU-KB-10, que exigía el botón. La categoría sigue siendo
    // opcional —se puede dejar vacía y no indexa nada—, pero borrarla no tiene vuelta atrás:
    // `mergePresetsWithDocuments` descarta los `oculto` y la tarjeta no vuelve.
    expect(within(dialog).queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
  });

  it('guardar horarios envía contenido y estructura con schemaId horarios (HU-KB-10)', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(makeDoc({ titulo: 'Horarios y ubicación' }));
    renderPage();

    const dialog = await abrir(user, /Completar Horarios y ubicación/);
    await user.type(within(dialog).getByLabelText(/WhatsApp/), '3001234567');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar e indexar' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate).toHaveBeenCalledWith({
      titulo: 'Horarios y ubicación',
      contenido: '## Cómo contactarlos\nWhatsApp: 3001234567',
      estructura: {
        schemaVersion: 1,
        schemaId: 'horarios',
        campos: { whatsapp: { tipo: 'texto', valor: '3001234567' } },
        adicional: '',
      },
    });
  });

  it('«Políticas y términos» vacía abre el formulario guiado con las seis preguntas (HU-KB-11)', async () => {
    const user = userEvent.setup();
    renderPage();

    const dialog = await abrir(user, /Completar Políticas y términos/);

    expect(within(dialog).getByRole('button', { name: /Políticas frecuentes/ })).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /Términos y condiciones/ }),
    ).toBeInTheDocument();
    // Seis preguntas × tres opciones excluyentes.
    expect(within(dialog).getAllByRole('radio')).toHaveLength(18);
    expect(within(dialog).getAllByRole('radio', { name: 'No aplica' })).toHaveLength(6);
    expect(within(dialog).getByText('¿Aceptan devoluciones?', { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Información adicional')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Contenido')).toBeNull();
  });

  it('la misma categoría con texto libre sigue abriendo su textarea (HU-KB-11)', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(
      listado([
        makeDoc({ titulo: 'Políticas y términos', contenido: 'No aceptamos devoluciones.' }),
      ]),
    );
    renderPage();

    const dialog = await abrir(user, /Editar Políticas y términos/);

    expect(within(dialog).getByLabelText('Contenido')).toHaveValue('No aceptamos devoluciones.');
    expect(within(dialog).queryByRole('button', { name: /Políticas frecuentes/ })).toBeNull();
  });

  it('el detalle solo se pide al responder «Sí», y conserva lo escrito (HU-KB-11)', async () => {
    const user = userEvent.setup();
    renderPage();

    const dialog = await abrir(user, /Completar Políticas y términos/);
    // El orden de los radios es el del schema: el primer «Sí» es el de `acepta_devoluciones`.
    const si = within(dialog).getAllByRole('radio', { name: 'Sí' })[0] as HTMLElement;
    const no = within(dialog).getAllByRole('radio', { name: 'No' })[0] as HTMLElement;

    expect(within(dialog).queryByLabelText('Detalle')).toBeNull();

    await user.click(si);
    await user.type(within(dialog).getByLabelText('Detalle'), '30 días con factura');

    // Al cambiar a «No» el detalle se repliega —`detalleEn=['si']`— pero no se pierde.
    await user.click(no);
    expect(within(dialog).queryByLabelText('Detalle')).toBeNull();

    await user.click(si);
    expect(within(dialog).getByLabelText('Detalle')).toHaveValue('30 días con factura');
  });

  it('basta UNA respuesta para poder guardar, y «No aplica» cuenta como respuesta (HU-KB-11)', async () => {
    const user = userEvent.setup();
    renderPage();

    const dialog = await abrir(user, /Completar Políticas y términos/);
    const guardar = within(dialog).getByRole('button', { name: 'Guardar e indexar' });
    const noAplica = within(dialog).getAllByRole('radio', {
      name: 'No aplica',
    })[0] as HTMLElement;

    // Deshabilitado con todo sin responder, pero por texto vacío, no por un campo exigido.
    expect(guardar).toBeDisabled();

    // **Hallazgo H1, en su forma más aguda.** El radio nace con «No aplica» marcado, así que pulsarlo
    // no cambia el valor y el `RadioGroup` no emite nada: el campo sigue sin entrar en `campos` y el
    // formulario sigue sin texto que guardar. El admin que quiere responder «No aplica» —la
    // respuesta más común de esta categoría— tiene que pasar por otra opción y volver.
    await user.click(noAplica);
    expect(noAplica).toBeChecked();
    expect(guardar).toBeDisabled();

    await user.click(within(dialog).getAllByRole('radio', { name: 'Sí' })[0] as HTMLElement);
    expect(guardar).toBeEnabled();

    // Y de vuelta en «No aplica» sigue habiendo respuesta: un tri-estado respondido nunca está vacío.
    await user.click(noAplica);
    expect(guardar).toBeEnabled();
  });

  it('«Políticas y términos» NO ofrece Eliminar: es una categoría protegida (HU-KB-12)', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(
      listado([
        makeDoc({
          titulo: 'Políticas y términos',
          contenido: '## Políticas frecuentes\n¿Admiten mascotas?: No aplica',
          estructura: {
            schemaVersion: 1,
            schemaId: 'politicas',
            campos: { admite_mascotas: { tipo: 'triestado', valor: 'na' } },
            adicional: '',
          },
        }),
      ]),
    );
    renderPage();

    const dialog = await abrir(user, /Editar Políticas y términos/);

    // **Invierte** el criterio 17 de HU-KB-11, por la misma razón que su gemelo de horarios.
    expect(within(dialog).queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
  });

  it('«Información Complementaria» SÍ conserva Eliminar: es la excepción deliberada (HU-KB-12)', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(
      listado([
        makeDoc({
          titulo: COMPLEMENTARIA,
          contenido: '## Información adicional\nCerramos en enero.',
          estructura: {
            schemaVersion: 1,
            schemaId: 'generico',
            campos: {},
            adicional: 'Cerramos en enero.',
          },
        }),
      ]),
    );
    renderPage();

    const dialog = await abrir(user, new RegExp(`Editar ${COMPLEMENTARIA}`));

    // Blinda la excepción: es la vía de escape del admin y él decide si la quiere en su grilla. Este
    // test existe para que nadie «uniformice» las tres opcionales en una limpieza futura.
    await user.click(within(dialog).getByRole('button', { name: /Eliminar/ }));

    const confirmacion = await screen.findByRole('alertdialog');
    expect(within(confirmacion).getByText(`¿Eliminar «${COMPLEMENTARIA}»?`)).toBeInTheDocument();
    // Y el aviso dice lo que de verdad pasa: la categoría desaparece de la grilla.
    expect(
      within(confirmacion).getByText(/La categoría también desaparecerá de tu base de conocimiento/),
    ).toBeInTheDocument();
  });

  it('guardar políticas envía contenido y estructura con schemaId politicas (HU-KB-11)', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(makeDoc({ titulo: 'Políticas y términos' }));
    renderPage();

    const dialog = await abrir(user, /Completar Políticas y términos/);
    // «No aplica» va al texto tal cual: es lo que impide que la IA conteste «no aceptan
    // devoluciones» a un negocio que simplemente no vende productos físicos.
    // El rodeo por «Sí» es obligado, no un capricho del test: ver el hallazgo H1 arriba.
    await user.click(within(dialog).getAllByRole('radio', { name: 'Sí' })[0] as HTMLElement);
    await user.click(within(dialog).getAllByRole('radio', { name: 'No aplica' })[0] as HTMLElement);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar e indexar' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate).toHaveBeenCalledWith({
      titulo: 'Políticas y términos',
      contenido: '## Políticas frecuentes\n¿Aceptan devoluciones?: No aplica',
      estructura: {
        schemaVersion: 1,
        schemaId: 'politicas',
        campos: { acepta_devoluciones: { tipo: 'triestado', valor: 'na', detalle: '' } },
        adicional: '',
      },
    });
  });

  it('la leyenda avisa cuando solo cambió la estructura, sin prometer versión nueva', async () => {
    const user = userEvent.setup();
    mockGetKbDocuments.mockResolvedValue(
      listado([
        makeDoc({
          titulo: LIBRE,
          version: 3,
          contenido: '## Información adicional\nHola',
          estructura: {
            schemaVersion: 1,
            schemaId: 'generico',
            campos: {},
            adicional: 'Hola',
          },
        }),
      ]),
    );
    renderPage();

    const dialog = await abrir(user, /Editar Convenios con empresas/);
    expect(within(dialog).getByText(/Sin cambios por guardar/)).toBeInTheDocument();

    // Un espacio al final: el texto normalizado no cambia, pero la estructura sí.
    await user.type(within(dialog).getByLabelText('Información adicional'), ' ');

    expect(
      within(dialog).getByText(/Se guardarán tus cambios sin crear una versión nueva/),
    ).toBeInTheDocument();
  });
});
