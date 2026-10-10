import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AudienceBuilder } from './AudienceBuilder.js';
import { fetchAudiencia, fetchSegmentFacetas } from '../../api.js';
import type { SegmentPreviewDTO, SegmentoFiltros } from '../../types.js';

vi.mock('../../api.js', () => ({ fetchSegmentFacetas: vi.fn(), fetchAudiencia: vi.fn() }));
vi.mock('@/features/estados/hooks/useEstados', () => ({
  useEstados: () => ({
    data: [
      {
        id: 'e1',
        key: 'nuevo',
        label: 'Nuevo',
        color: '#2563EB',
        orden: 0,
        activo: true,
        esDefecto: true,
        esSalida: false,
        esConversion: false,
      },
      {
        id: 'e2',
        key: 'pagado',
        label: 'Pagado',
        color: '#16A34A',
        orden: 1,
        activo: true,
        esDefecto: true,
        esSalida: false,
        esConversion: true,
      },
    ],
    isLoading: false,
  }),
}));
vi.mock('@/features/tags/hooks/useTags', () => ({
  useTags: () => ({
    data: [{ id: 't1', nombre: 'VIP', color: '#7C3AED', semaforo: null }],
    isLoading: false,
  }),
}));
vi.mock('@/features/semaforos', () => ({ useSemaforos: () => ({ data: [] }) }));
vi.mock('@/features/contacts/hooks/useContactOptions', () => ({
  useContactOptions: () => ({ data: { rol: [], interes: [], objecion: [] } }),
}));

const mockFacetas = vi.mocked(fetchSegmentFacetas);
const mockAudiencia = vi.mocked(fetchAudiencia);

const PREVIEW: SegmentPreviewDTO = {
  total: 37,
  muestra: [],
  resumen: { coinciden: 45, bajas: 5, excluidosAMano: 1, duplicados: 2, validos: 37 },
  presupuesto: {
    tier: 'TIER_1K',
    calidad: 'GREEN',
    limiteDiario: 800,
    consumido24h: 0,
    disponible: 800,
    intervaloMs: 108_000,
    bloqueado: false,
    motivoBloqueo: null,
  },
};

/** Arnés con estado real: el constructor es controlado, y así se ve lo que de verdad emite. */
function Arnes({ onCambio }: { onCambio: (f: SegmentoFiltros) => void }): React.ReactElement {
  const [filtros, setFiltros] = useState<SegmentoFiltros>({});
  return (
    <AudienceBuilder
      valor={filtros}
      onChange={(f) => {
        setFiltros(f);
        onCambio(f);
      }}
      preview={PREVIEW}
      cargando={false}
      actualizando={false}
      enabled
    />
  );
}

function renderizar(): { onCambio: ReturnType<typeof vi.fn> } {
  const onCambio = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Arnes onCambio={onCambio} />
    </QueryClientProvider>,
  );
  return { onCambio };
}

describe('AudienceBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFacetas.mockResolvedValue({
      etapas: [
        { key: 'nuevo', contactos: 30 },
        { key: 'pagado', contactos: 12 },
      ],
      etiquetas: [{ tagId: 't1', contactos: 9 }],
    });
    mockAudiencia.mockResolvedValue({
      data: [
        { id: 'c1', nombre: 'Ana', telefono: '573001110001', excluido: false },
        { id: 'c2', nombre: 'Bruno', telefono: '573001110002', excluido: false },
      ],
      page: 1,
      limit: 20,
      total: 2,
    });
  });

  it('enseña cuántos contactos hay en cada etapa y etiqueta', async () => {
    renderizar();
    expect(await screen.findByRole('checkbox', { name: /Nuevo\s*30/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Pagado\s*12/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /VIP\s*9/ })).toBeInTheDocument();
  });

  it('desglosa válidos y excluidos antes de enviar', () => {
    renderizar();
    expect(screen.getByText('37')).toBeInTheDocument();
    expect(screen.getByText(/de 45 que cumplen los criterios/)).toBeInTheDocument();
    expect(screen.getByText('Teléfono repetido')).toBeInTheDocument();
    expect(screen.getByText('Pidieron no recibir mensajes')).toBeInTheDocument();
  });

  it('elegir etapas y etiquetas emite los filtros y pregunta cómo combinarlos', async () => {
    const user = userEvent.setup();
    const { onCambio } = renderizar();

    // Sin las dos a la vez no hay nada que combinar.
    expect(screen.queryByText('¿Cómo se combinan?')).not.toBeInTheDocument();

    await user.click(await screen.findByRole('checkbox', { name: /Nuevo/ }));
    await user.click(screen.getByRole('checkbox', { name: /VIP/ }));
    expect(onCambio).toHaveBeenLastCalledWith({ etapas: ['nuevo'], tagIds: ['t1'] });

    await user.click(screen.getByRole('radio', { name: /Cumplen cualquiera/ }));
    expect(onCambio).toHaveBeenLastCalledWith({
      etapas: ['nuevo'],
      tagIds: ['t1'],
      combinacion: 'o',
    });
  });

  it('los criterios aplicados se ven como chips y se quitan de uno en uno', async () => {
    const user = userEvent.setup();
    const { onCambio } = renderizar();

    await user.click(await screen.findByRole('checkbox', { name: /Pagado/ }));
    await user.click(screen.getByRole('button', { name: 'Quitar etapa Pagado' }));

    expect(onCambio).toHaveBeenLastCalledWith({});
    expect(screen.getByRole('checkbox', { name: /Pagado/ })).not.toBeChecked();
  });

  it('desmarcar a alguien de la lista lo excluye a mano, y se puede devolver', async () => {
    const user = userEvent.setup();
    const { onCambio } = renderizar();

    await user.click(await screen.findByRole('checkbox', { name: 'Quitar a Ana' }));
    expect(onCambio).toHaveBeenLastCalledWith({ excluirClienteIds: ['c1'] });

    await user.click(screen.getByRole('checkbox', { name: 'Incluir a Ana' }));
    expect(onCambio).toHaveBeenLastCalledWith({});
  });

  it('«Más criterios» se marca con casillas directas y son opcionales', async () => {
    const user = userEvent.setup();
    const { onCambio } = renderizar();

    await user.click(screen.getByRole('button', { name: /Más criterios/ }));
    const caliente = await screen.findByRole('checkbox', { name: 'Caliente' });
    await user.click(caliente);

    expect(caliente).toBeChecked();
    expect(onCambio).toHaveBeenLastCalledWith({ intencionCompra: ['caliente'] });

    // Desmarcar deja el eje sin restringir: es opcional.
    await user.click(caliente);
    expect(caliente).not.toBeChecked();
    expect(onCambio).toHaveBeenLastCalledWith({ intencionCompra: [] });
  });

  it('busca contactos dentro de la audiencia', async () => {
    const user = userEvent.setup();
    renderizar();

    await user.type(screen.getByLabelText('Buscar contacto en la audiencia'), 'bru');
    await waitFor(() =>
      expect(mockAudiencia).toHaveBeenLastCalledWith(expect.objectContaining({ busqueda: 'bru' })),
    );
  });
});
