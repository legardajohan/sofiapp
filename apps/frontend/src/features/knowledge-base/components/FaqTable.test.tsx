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

/**
 * `activas` se calcula del propio listado salvo que el caso lo fije aparte: en la app es un conteo
 * del tenant entero, así que un test puede necesitar decir «hay 5 activas» sin pintar 5 filas.
 */
const listado = (
  faqs: IKbFaq[],
  minimo: { activas?: number; minimoActivas?: number } = {},
): KbFaqsListResponse => ({
  data: faqs,
  total: faqs.length,
  page: 1,
  limit: 50,
  activas: minimo.activas ?? faqs.filter((f) => f.activo).length,
  minimoActivas: minimo.minimoActivas ?? 5,
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
    // Desde HU-KB-02-V3 la línea de conteo lleva además el progreso hacia el mínimo,
    // así que el texto vive repartido en varios nodos.
    expect(screen.getByText(/1 pregunta/)).toBeInTheDocument();
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

// ─── Mínimo de preguntas activas (HU-KB-02-V3) ────────────────────────────────
describe('FaqTable — mínimo de preguntas activas', () => {
  const activa = makeFaq({ id: 'faq-activa', pregunta: '¿Horarios?', activo: true });
  const inactiva = makeFaq({ id: 'faq-inactiva', pregunta: '¿Apagada?', activo: false });

  it('muestra el progreso hacia el mínimo', async () => {
    mockGetKbFaqs.mockResolvedValue(listado([activa], { activas: 3, minimoActivas: 5 }));
    renderTable();

    expect(await screen.findByText('3 de 5 activas')).toBeInTheDocument();
  });

  it('justo en el mínimo, el interruptor de una ACTIVA queda deshabilitado', async () => {
    mockGetKbFaqs.mockResolvedValue(listado([activa], { activas: 5, minimoActivas: 5 }));
    renderTable();

    const toggle = await screen.findByLabelText('Desactivar la pregunta ¿Horarios?');
    expect(toggle).toBeDisabled();
  });

  it('justo en el mínimo, eliminar una ACTIVA queda deshabilitado', async () => {
    mockGetKbFaqs.mockResolvedValue(listado([activa], { activas: 5, minimoActivas: 5 }));
    renderTable();

    expect(await screen.findByLabelText('Eliminar la pregunta ¿Horarios?')).toBeDisabled();
  });

  it('el motivo del bloqueo está en la interfaz, no solo en el servidor', async () => {
    mockGetKbFaqs.mockResolvedValue(listado([activa], { activas: 5, minimoActivas: 5 }));
    renderTable();

    await screen.findByLabelText('Desactivar la pregunta ¿Horarios?');
    // El disparador del tooltip envuelve al control deshabilitado y es alcanzable con teclado.
    const disparadores = screen.getAllByText(
      (_, el) => el?.tagName === 'SPAN' && el.getAttribute('tabindex') === '0',
    );
    expect(disparadores.length).toBeGreaterThan(0);
  });

  it('una FAQ INACTIVA nunca se bloquea: apagarla o borrarla no baja el conteo', async () => {
    mockGetKbFaqs.mockResolvedValue(listado([inactiva], { activas: 5, minimoActivas: 5 }));
    renderTable();

    expect(await screen.findByLabelText('Activar la pregunta ¿Apagada?')).toBeEnabled();
    expect(screen.getByLabelText('Eliminar la pregunta ¿Apagada?')).toBeEnabled();
  });

  it('por encima del mínimo no se bloquea nada', async () => {
    mockGetKbFaqs.mockResolvedValue(listado([activa], { activas: 6, minimoActivas: 5 }));
    renderTable();

    expect(await screen.findByLabelText('Desactivar la pregunta ¿Horarios?')).toBeEnabled();
    expect(screen.getByLabelText('Eliminar la pregunta ¿Horarios?')).toBeEnabled();
  });
});
