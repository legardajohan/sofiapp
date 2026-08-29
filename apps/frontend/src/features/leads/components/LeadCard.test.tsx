import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeadCard } from './LeadCard.js';
import { deleteLead } from '../api.js';
import type { LeadDTO } from '../types.js';

vi.mock('../api.js', () => ({
  createLead: vi.fn(),
  fetchLead: vi.fn(),
  deleteLead: vi.fn(),
}));

// El toast de éxito no aporta nada aquí y `sonner` necesita su `<Toaster/>` montado.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockDelete = vi.mocked(deleteLead);

const LEAD: LeadDTO = {
  id: 'lead-1',
  nombre: 'Ana Pérez',
  telefono: '573001112233',
  correo: null,
  estado: 'nuevo',
  semaforo: null,
  contacto: { id: 'cliente-1', nombre: 'Ana', telefono: '573001112233' },
  responsable: { id: 'u-1', nombre: 'Carolina' },
  origen: {
    conversacionId: 'cliente-1',
    convertidoPor: { id: 'u-1', nombre: 'Carolina' },
    convertidoAt: '2026-07-28T12:00:00.000Z',
  },
  createdAt: '2026-07-28T12:00:00.000Z',
};

function renderCard(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LeadCard lead={LEAD} isLoading={false} isError={false} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDelete.mockResolvedValue(undefined);
});

describe('LeadCard — eliminar no es una acción principal', () => {
  it('la tarjeta no expone ningún botón de eliminar a la vista', () => {
    renderCard();

    expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument();
    // Lo que sí hay es el menú de acciones secundarias.
    expect(screen.getByRole('button', { name: 'Acciones del lead' })).toBeInTheDocument();
  });

  it('la opción vive dentro del menú y abre una confirmación, no borra al instante', async () => {
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: 'Acciones del lead' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Eliminar lead/ }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('¿Eliminar el lead de Ana Pérez?');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('confirmar con un motivo llama al backend con el id y el motivo', async () => {
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: 'Acciones del lead' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Eliminar lead/ }));

    await userEvent.click(await screen.findByLabelText('Motivo'));
    await userEvent.click(await screen.findByRole('option', { name: 'Conversación de prueba' }));
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar lead' }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('lead-1', 'prueba'));
  });
});
