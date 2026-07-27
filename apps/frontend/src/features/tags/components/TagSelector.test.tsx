import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TagSelector } from './TagSelector.js';
import { fetchTags } from '../api.js';
import type { TagDTO } from '../types.js';

vi.mock('../api.js', () => ({
  fetchTags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

const mockFetchTags = vi.mocked(fetchTags);

const URGENTE: TagDTO = { id: 't1', nombre: 'Urgente', color: '#DC2626', semaforo: null };
const VERDE: TagDTO = { id: 't2', nombre: 'Avanza', color: '#16A34A', semaforo: 'verde' };
const AZUL: TagDTO = { id: 't3', nombre: 'Informativo', color: '#2563EB', semaforo: 'azul' };

function renderSelector(aplicadas: TagDTO[]): { onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TagSelector aplicadas={aplicadas} pending={false} onChange={onChange} />
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
