import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KnowledgeFaqsPage } from './KnowledgeFaqsPage.js';
import type { IKbFaq, KbFaqsListResponse } from '../types/index.js';

const { mockGetKbFaqs } = vi.hoisted(() => ({ mockGetKbFaqs: vi.fn() }));
vi.mock('../../../api/kb-faqs.js', () => ({
  getKbFaqs: mockGetKbFaqs,
  createKbFaq: vi.fn(),
  updateKbFaq: vi.fn(),
  deleteKbFaq: vi.fn(),
  testKbFaq: vi.fn(),
  faqErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

function makeFaq(overrides: Partial<IKbFaq> = {}): IKbFaq {
  return {
    id: 'faq-1',
    pregunta: '¿Cuánto cuesta el curso?',
    respuesta: 'El curso cuesta $500.000 COP.',
    activo: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const listado = (activas: number, minimoActivas = 5): KbFaqsListResponse => ({
  data: [makeFaq()],
  total: 1,
  page: 1,
  limit: 50,
  activas,
  minimoActivas,
});

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <KnowledgeFaqsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockGetKbFaqs.mockReset();
});

describe('KnowledgeFaqsPage — aviso del mínimo de activas', () => {
  it('por debajo del mínimo dice cuántas faltan', async () => {
    mockGetKbFaqs.mockResolvedValue(listado(3));
    renderPage();

    expect(await screen.findByText('Te faltan 2 preguntas frecuentes')).toBeInTheDocument();
  });

  it('cuando falta una sola, lo dice en singular', async () => {
    mockGetKbFaqs.mockResolvedValue(listado(4));
    renderPage();

    expect(await screen.findByText('Te falta 1 pregunta frecuente')).toBeInTheDocument();
  });

  it('el aviso ofrece crear, no solo informa', async () => {
    mockGetKbFaqs.mockResolvedValue(listado(3));
    renderPage();

    await screen.findByText('Te faltan 2 preguntas frecuentes');
    // El de la cabecera de la tabla y el del aviso.
    expect(screen.getAllByRole('button', { name: 'Nueva pregunta' }).length).toBeGreaterThan(1);
  });

  it('alcanzado el mínimo el aviso desaparece', async () => {
    mockGetKbFaqs.mockResolvedValue(listado(5));
    renderPage();

    await screen.findByText('Preguntas frecuentes', { selector: 'h1' });
    expect(screen.queryByText(/Te falta/)).not.toBeInTheDocument();
  });

  it('por encima del mínimo tampoco aparece', async () => {
    mockGetKbFaqs.mockResolvedValue(listado(8));
    renderPage();

    await screen.findByText('Preguntas frecuentes', { selector: 'h1' });
    expect(screen.queryByText(/Te falta/)).not.toBeInTheDocument();
  });
});
