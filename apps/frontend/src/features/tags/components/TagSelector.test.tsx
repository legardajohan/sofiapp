import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TagSelector } from './TagSelector.js';
import { createTag, fetchTags } from '../api.js';
import type { TagDTO } from '../types.js';

vi.mock('../api.js', () => ({
  fetchTags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

const mockFetchTags = vi.mocked(fetchTags);
const mockCreateTag = vi.mocked(createTag);

const URGENTE: TagDTO = { id: 't1', nombre: 'Urgente', color: '#DC2626', semaforo: null };
const VERDE: TagDTO = { id: 't2', nombre: 'Avanza', color: '#16A34A', semaforo: 'verde' };
const AZUL: TagDTO = { id: 't3', nombre: 'Informativo', color: '#2563EB', semaforo: 'azul' };

function renderSelector(aplicadas: TagDTO[]): { onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      {/* En la app el provider lo monta el AppShell (`SidebarProvider`); aislado hay que ponerlo,
          o el `Tooltip` del chip lanza "must be used within TooltipProvider". */}
      <TooltipProvider>
        <TagSelector aplicadas={aplicadas} pending={false} onChange={onChange} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { onChange };
}

async function abrirMenu(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: /etiquet/i }));
  await screen.findByText('Etiquetas de la conversación');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchTags.mockResolvedValue([URGENTE, VERDE, AZUL]);
});

describe('TagSelector — envía siempre el conjunto completo', () => {
  it('marcar una etiqueta la añade a las ya aplicadas', async () => {
    const { onChange } = renderSelector([URGENTE]);
    await abrirMenu();

    await userEvent.click(await screen.findByText('Avanza'));

    // El backend reemplaza, no acumula: debe recibir las dos, no solo la nueva.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect([...(onChange.mock.calls[0]?.[0] as string[])].sort()).toEqual(['t1', 't2']);
  });

  it('desmarcar una etiqueta la quita del conjunto', async () => {
    const { onChange } = renderSelector([URGENTE, VERDE]);
    await abrirMenu();

    await userEvent.click(await screen.findByText('Urgente'));

    expect(onChange).toHaveBeenCalledWith(['t2']);
  });

  it('desmarcar la última envía un array vacío', async () => {
    const { onChange } = renderSelector([URGENTE]);
    await abrirMenu();

    await userEvent.click(await screen.findByText('Urgente'));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('el menú sigue abierto tras marcar, para poder aplicar varias seguidas', async () => {
    renderSelector([]);
    await abrirMenu();

    await userEvent.click(await screen.findByText('Avanza'));

    expect(screen.getByText('Etiquetas de la conversación')).toBeInTheDocument();
  });

  it('sin etiquetas creadas, explica dónde crearlas en vez de mostrar un menú vacío', async () => {
    mockFetchTags.mockResolvedValue([]);
    renderSelector([]);
    await abrirMenu();

    expect(await screen.findByText(/Aún no hay etiquetas/i)).toBeInTheDocument();
  });

  it('el disparador comunica cuántas etiquetas tiene la conversación', () => {
    renderSelector([URGENTE, VERDE]);
    expect(screen.getByRole('button', { name: /2 aplicadas/i })).toBeInTheDocument();
  });
});

describe('TagSelector — crear una etiqueta sin salir de la conversación', () => {
  const NUEVA: TagDTO = { id: 't9', nombre: 'Recontactar', color: '#7C3AED', semaforo: null };

  it('ofrece crear una etiqueta desde el menú', async () => {
    renderSelector([]);
    await abrirMenu();
    expect(await screen.findByRole('button', { name: 'Crear etiqueta' })).toBeInTheDocument();
  });

  it('sin etiquetas creadas invita a crear la primera desde aquí', async () => {
    mockFetchTags.mockResolvedValue([]);
    renderSelector([]);
    await abrirMenu();

    expect(await screen.findByText(/Crea la primera aquí arriba/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear etiqueta' })).toBeInTheDocument();
  });

  it('crear la etiqueta la aplica a la conversación en el mismo paso', async () => {
    mockCreateTag.mockResolvedValue(NUEVA);
    const { onChange } = renderSelector([URGENTE]);
    await abrirMenu();

    await userEvent.click(await screen.findByRole('button', { name: 'Crear etiqueta' }));

    // El diálogo se abre con el formulario vacío.
    const nombre = await screen.findByLabelText(/Nombre/i);
    await userEvent.type(nombre, 'Recontactar');
    const dialogo = screen.getByRole('dialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Crear etiqueta/i }));

    await waitFor(() => expect(mockCreateTag).toHaveBeenCalledTimes(1));
    expect(mockCreateTag.mock.calls[0]?.[0]).toMatchObject({ nombre: 'Recontactar' });

    // Lo que importa: no solo se creó, quedó aplicada junto a la que ya había.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['t1', 't9']));
  });

  it('al abrir el diálogo el foco queda en Nombre, no de vuelta en el botón de etiquetas', async () => {
    renderSelector([]);
    await abrirMenu();

    await userEvent.click(await screen.findByRole('button', { name: 'Crear etiqueta' }));

    // Se puede escribir el nombre de inmediato, sin ir al campo con el ratón. Ojo: en jsdom el
    // diálogo gana el foco aunque se quite el `onCloseAutoFocus` del menú, así que esto cubre el
    // `autoFocus` del campo, no la pelea de foco con Radix — esa solo se ve en un navegador real.
    const nombre = await screen.findByLabelText(/Nombre/i);
    await waitFor(() => expect(nombre).toHaveFocus());
  });
});
