import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SemaforoSelect } from './SemaforoSelect.js';
import { updateLeadSemaforo } from '../api.js';
import type { SemaforoDTO } from '../../semaforos/types.js';
import type { LeadListItemDTO } from '../types.js';

vi.mock('../api.js', () => ({ updateLeadSemaforo: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockUpdate = vi.mocked(updateLeadSemaforo);

const CATALOGO: SemaforoDTO[] = [
  {
    id: 's1',
    key: 'azul',
    label: 'Frío',
    color: '#2563EB',
    orden: 0,
    activo: true,
    esDefecto: true,
  },
  {
    id: 's2',
    key: 'verde',
    label: 'Venta concretada',
    color: '#16A34A',
    orden: 2,
    activo: true,
    esDefecto: true,
  },
  // Archivado: no se ofrece, salvo que sea el que el lead lleva puesto.
  {
    id: 's3',
    key: 'tibio',
    label: 'Tibio',
    color: '#CA8A04',
    orden: 4,
    activo: false,
    esDefecto: false,
  },
];

function lead(over: Partial<LeadListItemDTO> = {}): LeadListItemDTO {
  return {
    id: 'l1',
    nombre: 'Ana Pérez',
    telefono: '573001112233',
    correo: null,
    estado: 'nuevo',
    responsable: null,
    conversacionId: 'c1',
    semaforo: null,
    resumen: null,
    ultimoMensajeAt: null,
    createdAt: '2026-08-20T10:00:00.000Z',
    ...over,
  };
}

function renderSelect(l: LeadListItemDTO) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <SemaforoSelect lead={l} semaforos={CATALOGO} />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('SemaforoSelect', () => {
  it('un lead sin clasificar lo dice, en vez de dejar el control mudo', () => {
    renderSelect(lead());

    expect(screen.getByText('Sin clasificar')).toBeInTheDocument();
  });

  it('muestra la etiqueta del tenant, no la clave de dominio', () => {
    renderSelect(lead({ semaforo: CATALOGO[1] as SemaforoDTO }));

    expect(screen.getByText('Venta concretada')).toBeInTheDocument();
    expect(screen.queryByText('verde')).not.toBeInTheDocument();
  });

  it('elegir un semáforo lo manda por su clave estable, no por su etiqueta', async () => {
    mockUpdate.mockResolvedValue({} as never);
    renderSelect(lead());

    await userEvent.click(screen.getByRole('combobox', { name: /semáforo del lead/i }));
    await userEvent.click(await screen.findByRole('option', { name: /Venta concretada/ }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('l1', 'verde'));
  });

  it('elegir "Sin clasificar" retira la clasificación con `null`', async () => {
    mockUpdate.mockResolvedValue({} as never);
    renderSelect(lead({ semaforo: CATALOGO[1] as SemaforoDTO }));

    await userEvent.click(screen.getByRole('combobox', { name: /semáforo del lead/i }));
    await userEvent.click(await screen.findByRole('option', { name: /Sin clasificar/ }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('l1', null));
  });

  it('elegir el que ya tiene no dispara ninguna escritura', async () => {
    renderSelect(lead({ semaforo: CATALOGO[1] as SemaforoDTO }));

    await userEvent.click(screen.getByRole('combobox', { name: /semáforo del lead/i }));
    await userEvent.click(await screen.findByRole('option', { name: /Venta concretada/ }));

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('no ofrece un semáforo archivado que el lead no lleva puesto', async () => {
    renderSelect(lead());

    await userEvent.click(screen.getByRole('combobox', { name: /semáforo del lead/i }));
    await screen.findByRole('option', { name: /Frío/ });

    expect(screen.queryByRole('option', { name: /Tibio/ })).not.toBeInTheDocument();
  });

  it('sí ofrece el archivado cuando es el que el lead lleva: esconderlo sería mentir', async () => {
    renderSelect(lead({ semaforo: CATALOGO[2] as SemaforoDTO }));

    await userEvent.click(screen.getByRole('combobox', { name: /semáforo del lead/i }));

    expect(await screen.findByRole('option', { name: /Tibio/ })).toBeInTheDocument();
  });
});
