import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactPanel } from './ContactPanel.js';
import { fetchContactHistory } from '../api.js';
import { useInboxStore } from '../useInboxStore.js';
import type { ContactHistoryDTO } from '../types.js';

// Mockeamos la capa de API para no tocar red ni el apiClient real.
vi.mock('../api.js', () => ({
  fetchContactHistory: vi.fn(),
  generateSummary: vi.fn(),
  extractContactData: vi.fn(),
}));

const mockFetch = vi.mocked(fetchContactHistory);

const HISTORY: ContactHistoryDTO = {
  contacto: {
    id: 'c-1',
    nombre: 'Andrés Quintero',
    telefono: '573006667788',
    canalOrigen: 'whatsapp',
    estadoComercial: 'en_gestion',
    nivelInteres: 'caliente',
    objecionPrincipal: null,
    rolContacto: 'decisor',
    tags: [],
    asesorId: null,
    ultimoMensajeAt: '2026-07-27T12:00:00.000Z',
    createdAt: '2026-07-24T12:00:00.000Z',
    // Sin convertir a lead (HU-CRM-01): la ficha no monta la tarjeta.
    leadId: null,
  },
  resumen: null,
  datosExtraidos: null,
  mensajes: { data: [], page: 1, limit: 50, total: 0 },
};

function renderPanel(
  open: boolean,
  onOpenChange = vi.fn(),
): { onOpenChange: ReturnType<typeof vi.fn>; container: HTMLElement } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <ContactPanel clienteId="c-1" open={open} onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange, container };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue(HISTORY);
});

describe('ContactPanel — colapsar sin dejar rastro en el layout', () => {
  it('colapsado no renderiza nada: ni panel ni franja propia', () => {
    const { container } = renderPanel(false);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.queryByText('Ficha del contacto')).not.toBeInTheDocument();
  });

  it('colapsado NO pide el historial al servidor', async () => {
    renderPanel(false);
    // Damos margen a que un efecto dispare la query antes de afirmar que no ocurrió.
    await new Promise((r) => setTimeout(r, 50));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('desplegado pide el historial y pinta la ficha', async () => {
    renderPanel(true);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('c-1'));
    expect(await screen.findByText('Andrés Quintero')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /ficha del contacto/i })).toBeInTheDocument();
  });

  // Regresión: la ficha pintaba `{tag}` con el objeto entero y React lanzaba "Objects are not
  // valid as a React child (found: object with keys {id, nombre, color, semaforo})". El fixture de
  // arriba trae `tags: []`, así que esa rama no se ejecutaba y la suite pasaba con el bug dentro.
  it('pinta las etiquetas hidratadas por su nombre, sin reventar', async () => {
    mockFetch.mockResolvedValue({
      ...HISTORY,
      contacto: {
        ...HISTORY.contacto,
        tags: [
          { id: 'tg-1', nombre: 'En riesgo', color: '#DC2626', semaforo: 'rojo' },
          { id: 'tg-2', nombre: 'Urgente', color: '#EA580C', semaforo: null },
        ],
      },
    });

    renderPanel(true);

    expect(await screen.findByText('En riesgo')).toBeInTheDocument();
    expect(screen.getByText('Urgente')).toBeInTheDocument();
  });

  it('desplegado ofrece el control para colapsar', async () => {
    const { onOpenChange } = renderPanel(true);
    const boton = await screen.findByRole('button', { name: /colapsar la ficha/i });
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(boton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

/** El icono de persona de la cabecera del hilo despacha esta acción del store. */
describe('useInboxStore — el icono de persona alterna la ficha', () => {
  it('el mismo disparo abre y vuelve a colapsar', () => {
    useInboxStore.setState({ contactPanelOpen: false });

    useInboxStore.getState().toggleContactPanel();
    expect(useInboxStore.getState().contactPanelOpen).toBe(true);

    useInboxStore.getState().toggleContactPanel();
    expect(useInboxStore.getState().contactPanelOpen).toBe(false);
  });
});
