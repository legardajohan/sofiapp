import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TagsPage } from './TagsPage.js';
import { deleteTag, fetchTags } from '../api.js';
import type { TagDTO } from '../types.js';

vi.mock('../api.js', () => ({
  fetchTags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

const mockFetchTags = vi.mocked(fetchTags);
const mockDeleteTag = vi.mocked(deleteTag);

const URGENTE: TagDTO = { id: 't1', nombre: 'Urgente', color: '#DC2626', semaforo: null };
const EN_RIESGO: TagDTO = { id: 't2', nombre: 'En riesgo', color: '#DC2626', semaforo: 'rojo' };

function renderPage(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TagsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchTags.mockResolvedValue([URGENTE, EN_RIESGO]);
  mockDeleteTag.mockResolvedValue(undefined);
});

describe('TagsPage — borrado de etiquetas', () => {
  it('ofrece borrar también las de semaforización', async () => {
    renderPage();
    expect(await screen.findByLabelText('Eliminar la etiqueta En riesgo')).toBeInTheDocument();
  });

  it('borra una etiqueta normal sin pedir confirmación', async () => {
    renderPage();

    await userEvent.click(await screen.findByLabelText('Eliminar la etiqueta Urgente'));

    await waitFor(() => expect(mockDeleteTag).toHaveBeenCalledWith('t1'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('pide confirmación antes de borrar una de semaforización', async () => {
    renderPage();

    await userEvent.click(await screen.findByLabelText('Eliminar la etiqueta En riesgo'));

    // El diálogo aparece y NADA se ha borrado todavía: es el punto del feature.
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(mockDeleteTag).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar etiqueta' }));
    await waitFor(() => expect(mockDeleteTag).toHaveBeenCalledWith('t2'));
  });

  it('cancelar deja la etiqueta de semaforización intacta', async () => {
    renderPage();

    await userEvent.click(await screen.findByLabelText('Eliminar la etiqueta En riesgo'));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mockDeleteTag).not.toHaveBeenCalled();
  });
});
