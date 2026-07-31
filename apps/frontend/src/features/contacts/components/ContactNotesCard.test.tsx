import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { ContactNotesCard } from './ContactNotesCard.js';
import { createNota, fetchNotas } from '../api.js';

vi.mock('../api.js', () => ({
  fetchNotas: vi.fn(),
  createNota: vi.fn(),
  updateContact: vi.fn(),
}));

const mockFetch = vi.mocked(fetchNotas);
const mockCreate = vi.mocked(createNota);

function renderCard(puedeVerSensibles = true): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ContactNotesCard clienteId="c-1" puedeVerSensibles={puedeVerSensibles} />
    </QueryClientProvider>,
  );
}

function error403(): AxiosError {
  return new AxiosError('Acceso denegado.', '403', undefined, null, {
    status: 403,
    data: { message: 'Acceso denegado.' },
    statusText: 'Forbidden',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  });
}

describe('ContactNotesCard (HU-CRM-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ data: [], page: 1, limit: 20, total: 0 });
  });

  it('sin permiso no se renderiza ni pide las notas', () => {
    renderCard(false);
    expect(screen.queryByText('Notas')).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('un 403 del backend oculta la tarjeta en vez de mostrar un error', async () => {
    // Es una falta de permiso, no un fallo: acusar un error sería ruido en un panel ya denso.
    mockFetch.mockRejectedValue(error403());
    renderCard();
    await waitFor(() => expect(screen.queryByText('Notas')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('muestra un estado vacío que invita a escribir la primera nota', async () => {
    renderCard();
    expect(await screen.findByText(/Aún no hay notas/)).toBeInTheDocument();
  });

  it('lista las notas con su autor', async () => {
    mockFetch.mockResolvedValue({
      data: [
        {
          id: 'n-1',
          texto: 'Pidió descuento',
          autor: { id: 'u-1', nombre: 'Ana Gómez' },
          createdAt: '2026-07-30T12:00:00.000Z',
        },
      ],
      page: 1,
      limit: 20,
      total: 1,
    });
    renderCard();

    expect(await screen.findByText('Pidió descuento')).toBeInTheDocument();
    expect(screen.getByText(/Ana Gómez/)).toBeInTheDocument();
  });

  it('el botón está deshabilitado sin texto y el campo se limpia tras guardar', async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({
      id: 'n-2',
      texto: 'Nueva',
      autor: { id: 'u-1', nombre: 'Ana' },
      createdAt: '2026-07-31T12:00:00.000Z',
    });
    renderCard();

    const boton = await screen.findByRole('button', { name: 'Agregar nota' });
    expect(boton).toBeDisabled();

    const campo = screen.getByLabelText('Nueva nota');
    await user.type(campo, 'Nueva');
    expect(boton).toBeEnabled();

    await user.click(boton);
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith('c-1', 'Nueva'));
    await waitFor(() => expect(campo).toHaveValue(''));
  });

  it('un autor borrado no rompe la lista', async () => {
    mockFetch.mockResolvedValue({
      data: [
        {
          id: 'n-3',
          texto: 'Sobrevive',
          autor: { id: 'u-9', nombre: null },
          createdAt: '2026-07-30T12:00:00.000Z',
        },
      ],
      page: 1,
      limit: 20,
      total: 1,
    });
    renderCard();

    expect(await screen.findByText('Sobrevive')).toBeInTheDocument();
    expect(screen.getByText(/Usuario eliminado/)).toBeInTheDocument();
  });
});
