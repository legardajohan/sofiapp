import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeadDetailSheet } from './LeadDetailSheet.js';
import { deleteLead, updateLeadEstado } from '../api.js';
import type { LeadListItemDTO } from '../types.js';

vi.mock('../api.js', () => ({
  updateLeadEstado: vi.fn(),
  deleteLead: vi.fn(),
  updateLeadSemaforo: vi.fn(),
  fetchHistorialSemaforo: vi.fn(),
}));

const mockUpdate = vi.mocked(updateLeadEstado);
const mockDelete = vi.mocked(deleteLead);

beforeEach(() => vi.clearAllMocks());

function lead(over: Partial<LeadListItemDTO> = {}): LeadListItemDTO {
  return {
    id: 'l1',
    nombre: 'Ana Pérez',
    telefono: '573001112233',
    correo: 'ana@correo.test',
    estado: 'en_gestion',
    responsable: { id: 'u1', nombre: 'Carolina' },
    conversacionId: 'c1',
    semaforo: null,
    resumen: null,
    ultimoMensajeAt: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    ...over,
  };
}

const SEMAFOROS_CAT = [
  { id: 's1', key: 'verde', label: 'Venta concretada', color: '#16A34A', orden: 2, activo: true, esDefecto: true },
  { id: 's2', key: 'rojo', label: 'Descartado', color: '#DC2626', orden: 3, activo: true, esDefecto: true },
];

const ESTADOS_CAT = [
  { id: 'e1', key: 'nuevo', label: 'Nuevo', color: '#64748B', orden: 0, activo: true, esDefecto: true, esSalida: false },
  { id: 'e2', key: 'en_gestion', label: 'En gestión', color: '#2563EB', orden: 1, activo: true, esDefecto: true, esSalida: false },
  { id: 'e3', key: 'pagado', label: 'Pagado', color: '#16A34A', orden: 3, activo: true, esDefecto: true, esSalida: false },
];

function renderSheet(l: LeadListItemDTO | null) {
  // El panel deja asignar el estado, así que monta una mutación de TanStack Query.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LeadDetailSheet
          lead={l}
          onClose={vi.fn()}
          estados={ESTADOS_CAT}
          semaforos={SEMAFOROS_CAT}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LeadDetailSheet', () => {
  it('sin lead no hay panel abierto', () => {
    renderSheet(null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('muestra los datos clave del lead', () => {
    renderSheet(lead());

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('573001112233')).toBeInTheDocument();
    expect(screen.getByText('En gestión')).toBeInTheDocument();
    expect(screen.getByText('Carolina')).toBeInTheDocument();
    expect(screen.getByText('ana@correo.test')).toBeInTheDocument();
  });

  it('pinta el resumen de la conversación', () => {
    renderSheet(
      lead({
        resumen: {
          texto: 'Quiere el plan anual.',
          generadoAt: '2026-08-01T10:00:00.000Z',
          desactualizado: false,
        },
      }),
    );

    expect(screen.getByText('Quiere el plan anual.')).toBeInTheDocument();
    expect(screen.queryByText('Desactualizado')).not.toBeInTheDocument();
  });

  it('avisa cuando el resumen quedó desactualizado', () => {
    renderSheet(
      lead({
        resumen: {
          texto: 'Preguntó por precios.',
          generadoAt: '2026-08-01T10:00:00.000Z',
          desactualizado: true,
        },
      }),
    );

    // El aviso tiene que verse ANTES de creerse el texto, no después de haberlo leído.
    expect(screen.getByText('Desactualizado')).toBeInTheDocument();
    expect(screen.getByText(/llegaron mensajes después/)).toBeInTheDocument();
  });

  it('sin resumen explica cómo se genera en vez de dejar un hueco', () => {
    renderSheet(lead());
    expect(screen.getByText(/todavía no tiene resumen/)).toBeInTheDocument();
  });

  it('enlaza a la conversación de origen con el parámetro que la abre', () => {
    renderSheet(lead({ conversacionId: 'c-abc' }));

    const enlace = screen.getByRole('link', { name: /Abrir conversación/ });
    expect(enlace.getAttribute('href')).toContain('/inbox?conversacion=c-abc');
  });

  it('el enlace lleva la vuelta al lead, para que la bandeja no sea un viaje de ida', () => {
    renderSheet(lead({ conversacionId: 'c-abc' }));

    const href = screen.getByRole('link', { name: /Abrir conversación/ }).getAttribute('href') ?? '';
    const volverA = decodeURIComponent(new URLSearchParams(href.split('?')[1]).get('volverA') ?? '');

    // Vuelve a ESTA vista y con el lead reabierto, no a `/leads` a secas.
    expect(volverA).toContain('lead=l1');
  });

  it('muestra la etiqueta del semáforo que devuelve la API, no su clave', () => {
    renderSheet(
      lead({
        semaforo: {
          id: 's2',
          key: 'rojo',
          label: 'Descartado',
          color: '#DC2626',
          orden: 3,
          activo: true,
          esDefecto: true,
        },
      }),
    );

    expect(screen.getByText('Descartado')).toBeInTheDocument();
    expect(screen.queryByText('rojo')).not.toBeInTheDocument();
  });

  it('un lead sin clasificar lo dice, en vez de dejar el control mudo', () => {
    renderSheet(lead({ semaforo: null }));

    expect(screen.getByText('Sin clasificar')).toBeInTheDocument();
  });

  it('asignar un estado lo manda por su clave de dominio, no por su etiqueta', async () => {
    mockUpdate.mockResolvedValue({} as never);
    renderSheet(lead({ estado: 'nuevo' }));

    await userEvent.click(screen.getByRole('combobox', { name: /estado del lead/i }));
    await userEvent.click(await screen.findByRole('option', { name: /Pagado/ }));

    // Viaja 'pagado' (la `key` del catálogo), nunca 'Pagado'.
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('l1', 'pagado'));
  });

  it('elegir el estado que ya tiene no dispara ninguna escritura', async () => {
    renderSheet(lead({ estado: 'nuevo' }));

    await userEvent.click(screen.getByRole('combobox', { name: /estado del lead/i }));
    await userEvent.click(await screen.findByRole('option', { name: /Nuevo/ }));

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('ofrece eliminar el lead, pero detrás de una confirmación con motivo', async () => {
    renderSheet(lead());

    await userEvent.click(screen.getByRole('button', { name: /Eliminar lead/i }));

    // No borra al instante: primero confirma, y el motivo es parte de la confirmación.
    expect(mockDelete).not.toHaveBeenCalled();
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });
});
