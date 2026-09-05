import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FaqTester } from './FaqTester.js';
import type { FaqTestResult } from '../types/index.js';

const { mockTestKbFaq } = vi.hoisted(() => ({ mockTestKbFaq: vi.fn() }));
vi.mock('../../../api/kb-faqs.js', () => ({
  testKbFaq: mockTestKbFaq,
  faqErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

function makeResultado(overrides: Partial<FaqTestResult> = {}): FaqTestResult {
  return {
    matched: true,
    respuesta: 'Atendemos de lunes a viernes, de 8:00 a. m. a 6:00 p. m.',
    confianza: 0.91,
    umbral: 0.85,
    margenMinimo: 0.02,
    overlapMinimo: 0.2,
    faqId: 'faq-1',
    pregunta: '¿Cuál es el horario de atención?',
    senales: {
      score: 0.91,
      segundoScore: 0.86,
      margen: 0.05,
      overlap: 0.5,
      pasaUmbral: true,
      pasaMargen: true,
      pasaOverlap: true,
    },
    ...overrides,
  };
}

async function probar(pregunta = '¿A qué hora abren?'): Promise<void> {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FaqTester />
    </QueryClientProvider>,
  );
  await user.type(screen.getByLabelText('Pregunta de prueba'), pregunta);
  await user.click(screen.getByRole('button', { name: /probar/i }));
}

beforeEach(() => {
  mockTestKbFaq.mockReset();
});

describe('FaqTester — diagnóstico de las tres señales', () => {
  it('con las tres en verde, dice que la FAQ responde sin gastar tokens', async () => {
    mockTestKbFaq.mockResolvedValue(makeResultado());

    await probar();

    expect(await screen.findByText('Responde la FAQ, sin gastar tokens.')).toBeInTheDocument();
    expect(screen.getAllByText('Cumple')).toHaveLength(3);
  });

  it('muestra cada señal con su valor y el mínimo vigente', async () => {
    mockTestKbFaq.mockResolvedValue(makeResultado());

    await probar();

    expect(await screen.findByText('Se parece a la FAQ')).toBeInTheDocument();
    expect(screen.getByText('Le saca ventaja a la siguiente FAQ')).toBeInTheDocument();
    expect(screen.getByText('Comparten palabras')).toBeInTheDocument();
    expect(screen.getByText('mín. 85%')).toBeInTheDocument();
    expect(screen.getByText('mín. 2.0%')).toBeInTheDocument();
    expect(screen.getByText('mín. 20%')).toBeInTheDocument();
  });

  it('señala CUÁL bloqueó: sin palabras en común, aunque el parecido sea alto', async () => {
    // El caso que motivó HU-KB-02-V2: "¿a qué hora abren?" contra la FAQ del precio.
    mockTestKbFaq.mockResolvedValue(
      makeResultado({
        matched: false,
        pregunta: '¿Cuál es el precio del curso?',
        respuesta: 'El curso cuesta $500.000 COP.',
        senales: {
          score: 0.9,
          segundoScore: 0.6,
          margen: 0.3,
          overlap: 0,
          pasaUmbral: true,
          pasaMargen: true,
          pasaOverlap: false,
        },
      }),
    );

    await probar();

    expect(await screen.findByText('Esta pregunta iría al modelo.')).toBeInTheDocument();
    expect(screen.getAllByText('Cumple')).toHaveLength(2);
    expect(screen.getByText('No cumple')).toBeInTheDocument();
    expect(screen.getByText(/Sin palabras en común/)).toBeInTheDocument();
  });

  it('cuando el margen bloquea, muestra contra qué FAQ compitió', async () => {
    mockTestKbFaq.mockResolvedValue(
      makeResultado({
        matched: false,
        segundaPregunta: '¿Cuál es el precio del curso?',
        senales: {
          score: 0.9,
          segundoScore: 0.895,
          margen: 0.005,
          overlap: 1,
          pasaUmbral: true,
          pasaMargen: false,
          pasaOverlap: true,
        },
      }),
    );

    await probar();

    // Un margen pequeño no dice nada si no se ve con quién se empató.
    expect(
      await screen.findByText('Compite con «¿Cuál es el precio del curso?»'),
    ).toBeInTheDocument();
    expect(screen.getByText('0.5%')).toBeInTheDocument();
  });

  it('sin otra FAQ con la que competir, el margen no se mide y lo explica', async () => {
    mockTestKbFaq.mockResolvedValue(
      makeResultado({
        segundaPregunta: undefined,
        senales: {
          score: 0.91,
          margen: 0.91,
          overlap: 0.5,
          pasaUmbral: true,
          pasaMargen: true,
          pasaOverlap: true,
        },
      }),
    );

    await probar();

    expect(await screen.findByText('No hay otra FAQ con la que competir.')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('sin ninguna FAQ parecida no dibuja las señales', async () => {
    mockTestKbFaq.mockResolvedValue({
      matched: false,
      umbral: 0.85,
      margenMinimo: 0.02,
      overlapMinimo: 0.2,
    } satisfies FaqTestResult);

    await probar();

    expect(await screen.findByText('Ninguna FAQ se parece a esta pregunta.')).toBeInTheDocument();
    expect(screen.queryByText('Se parece a la FAQ')).not.toBeInTheDocument();
  });
});
