import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplateList } from './TemplateList.js';
import { getWhatsAppTemplates } from '../../../api/whatsapp-templates.js';
import type { IWhatsAppTemplate, WhatsAppTemplatesListResponse } from '../types/index.js';

vi.mock('../../../api/whatsapp-templates.js', () => ({
  getWhatsAppTemplates: vi.fn(),
  syncWhatsAppTemplates: vi.fn(),
  templateErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

const mockGetTemplates = vi.mocked(getWhatsAppTemplates);

function makeTemplate(overrides: Partial<IWhatsAppTemplate> = {}): IWhatsAppTemplate {
  return {
    id: 'tpl-1',
    name: 'bienvenida',
    language: 'es',
    category: 'UTILITY',
    status: 'APPROVED',
    cuerpo: 'Hola {{1}}',
    ejemplos: ['Ana'],
    parametrosBody: 1,
    obsoleta: false,
    syncedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const listado = (data: IWhatsAppTemplate[]): WhatsAppTemplatesListResponse => ({
  data,
  total: data.length,
  page: 1,
  limit: 50,
});

function renderList(): { onCreate: ReturnType<typeof vi.fn> } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onCreate = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <TemplateList onCreate={onCreate} />
    </QueryClientProvider>,
  );
  return { onCreate };
}

beforeEach(() => {
  mockGetTemplates.mockReset();
});

describe('TemplateList', () => {
  it('muestra el nombre y el estado de cada plantilla', async () => {
    mockGetTemplates.mockResolvedValue(listado([makeTemplate()]));
    renderList();

    expect(await screen.findByText('bienvenida')).toBeInTheDocument();
    expect(screen.getByText('Aprobada')).toBeInTheDocument();
  });

  it('sin plantillas y sin filtros, invita a sincronizar o crear', async () => {
    mockGetTemplates.mockResolvedValue(listado([]));
    renderList();

    expect(await screen.findByText('Todavía no hay plantillas')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Sincronizar' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Nueva plantilla/ }).length).toBeGreaterThan(0);
  });

  it('«Nueva plantilla» dispara onCreate', async () => {
    mockGetTemplates.mockResolvedValue(listado([makeTemplate()]));
    const { onCreate } = renderList();

    await userEvent.click(await screen.findByRole('button', { name: 'Nueva plantilla' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('cambiar el filtro de estado vuelve a consultar con el status elegido', async () => {
    mockGetTemplates.mockResolvedValue(listado([makeTemplate()]));
    renderList();
    await screen.findByText('bienvenida');

    mockGetTemplates.mockResolvedValue(listado([]));
    await userEvent.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Esperando a Meta' }));

    expect(await screen.findByText('Ninguna plantilla coincide con el filtro')).toBeInTheDocument();
    expect(mockGetTemplates).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'PENDING' }),
    );
  });
});
