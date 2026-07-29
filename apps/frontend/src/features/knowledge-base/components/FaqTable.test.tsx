import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FaqTable } from './FaqTable.js';
import type { IKbFaq, KbFaqsListResponse } from '../types/index.js';

const { mockGetKbFaqs } = vi.hoisted(() => ({ mockGetKbFaqs: vi.fn() }));
vi.mock('../../../api/kb-faqs.js', () => ({
  getKbFaqs: mockGetKbFaqs,
  updateKbFaq: vi.fn(),
  deleteKbFaq: vi.fn(),
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

const listado = (faqs: IKbFaq[]): KbFaqsListResponse => ({
  data: faqs,
  total: faqs.length,
  page: 1,
  limit: 50,
});

function renderTable(props: Partial<React.ComponentProps<typeof FaqTable>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onEdit = props.onEdit ?? vi.fn();
  const onCreate = props.onCreate ?? vi.fn();
  render(
    <QueryClientProvider client={client}>
      <FaqTable onEdit={onEdit} onCreate={onCreate} />
    </QueryClientProvider>,
  );
  return { onEdit, onCreate };
}

beforeEach(() => {
  mockGetKbFaqs.mockReset();
});

describe('FaqTable', () => {
  it('muestra la pregunta y la respuesta de cada FAQ', async () => {
    mockGetKbFaqs.mockResolvedValue(listado([makeFaq()]));
    renderTable();

    expect(await screen.findByText('¿Cuánto cuesta el curso?')).toBeInTheDocument();
    expect(screen.getByText('El curso cuesta $500.000 COP.')).toBeInTheDocument();
    expect(screen.getByText('1 pregunta')).toBeInTheDocument();
  });

  it('sin FAQs muestra un estado vacío que invita a crear la primera', async () => {
    mockGetKbFaqs.mockResolvedValue(listado([]));
    renderTable();

    expect(
      await screen.findByText('Empieza por la pregunta que más te repiten'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ninguna todavía')).toBeInTheDocument();
  });

  it('el interruptor refleja si la FAQ está activa', async () => {
    mockGetKbFaqs.mockResolvedValue(
      listado([makeFaq({ pregunta: '¿Inactiva?', activo: false })]),
    );
    renderTable();

    const toggle = await screen.findByRole('switch', {
      name: /Activar la pregunta ¿Inactiva\?/,
    });
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
  });

  it('editar dispara onEdit con la FAQ de la fila', async () => {
    const faq = makeFaq();
    mockGetKbFaqs.mockResolvedValue(listado([faq]));
    const { onEdit } = renderTable();

    const boton = await screen.findByRole('button', {
      name: /Editar la pregunta ¿Cuánto cuesta el curso\?/,
    });
    await userEvent.click(boton);

    expect(onEdit).toHaveBeenCalledWith(faq);
  });

  it('«Nueva pregunta» dispara onCreate', async () => {
    mockGetKbFaqs.mockResolvedValue(listado([makeFaq()]));
    const { onCreate } = renderTable();

    await userEvent.click(await screen.findByRole('button', { name: 'Nueva pregunta' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('si la carga falla, ofrece reintentar', async () => {
    mockGetKbFaqs.mockRejectedValue(new Error('boom'));
    renderTable();

    await waitFor(() =>
      expect(screen.getByText('No se pudo cargar la lista de preguntas.')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
