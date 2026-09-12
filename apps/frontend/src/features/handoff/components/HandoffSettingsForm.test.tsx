/**
 * Los cambios de HU-IA-07 sobre la pantalla de transferencia: crear condiciones propias, el nuevo
 * título de la sección de destino y la estrategia de reparto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HandoffSettingsForm } from './HandoffSettingsForm.js';
import type { HandoffSettings } from '../types.js';

const { mockSave, mockFetchUsers, mockFetchMetricas } = vi.hoisted(() => ({
  mockSave: vi.fn(),
  mockFetchUsers: vi.fn(),
  mockFetchMetricas: vi.fn(),
}));

vi.mock('../api.js', () => ({
  fetchHandoffSettings: vi.fn(),
  saveHandoffSettings: mockSave,
  fetchAsesorMetricas: mockFetchMetricas,
}));

vi.mock('../../users/api.js', () => ({ fetchTenantUsers: mockFetchUsers }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const BASE: HandoffSettings = {
  activo: true,
  asesorDestinoId: null,
  estrategiaDestino: 'primero',
  mensajeTransicion: 'Ya le pasé tu conversación a un asesor.',
  heredado: false,
  condicionesExtras: [],
  reglas: {
    explicitRequest: { activa: true, frases: ['hablar con un asesor'] },
    keyword: { activa: false, palabras: [] },
    lowConfidence: { activa: false, umbral: null },
    intentPurchase: { activa: false, nivelMinimo: 'caliente' },
  },
};

function renderForm(over: Partial<HandoffSettings> = {}): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <HandoffSettingsForm settings={{ ...BASE, ...over }} />
    </QueryClientProvider>,
  );
}

describe('HandoffSettingsForm (HU-IA-07)', () => {
  beforeEach(() => {
    mockSave.mockReset().mockResolvedValue(BASE);
    mockFetchUsers.mockReset().mockResolvedValue([{ id: 'u1', nombre: 'Ana Ruiz' }]);
    mockFetchMetricas.mockReset().mockResolvedValue([]);
  });

  // AC13
  it('la sección de destino se llama «Asignación y aviso»', () => {
    renderForm();

    expect(screen.getByRole('heading', { name: 'Asignación y aviso' })).toBeInTheDocument();
    expect(screen.queryByText('Qué pasa al transferir')).not.toBeInTheDocument();
  });

  // AC3
  it('«Añadir condición» abre el modal y la condición creada aparece como tarjeta', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: /añadir condición/i }));

    const modal = await screen.findByRole('dialog');
    await userEvent.type(within(modal).getByLabelText('Nombre'), 'Facturación');
    await userEvent.type(within(modal).getByLabelText('Palabras que la activan'), 'factura');
    await userEvent.click(within(modal).getByRole('button', { name: 'Añadir "factura"' }));
    await userEvent.click(within(modal).getByRole('button', { name: 'Añadir condición' }));

    expect(await screen.findByText('Facturación')).toBeInTheDocument();
  });

  it('no deja guardar una condición sin palabras (AC5)', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: /añadir condición/i }));
    const modal = await screen.findByRole('dialog');
    await userEvent.type(within(modal).getByLabelText('Nombre'), 'Facturación');

    expect(within(modal).getByRole('button', { name: 'Añadir condición' })).toBeDisabled();
  });

  it('las condiciones guardadas se pintan y se pueden eliminar', async () => {
    renderForm({
      condicionesExtras: [
        { key: 'facturacion', nombre: 'Facturación', activa: true, palabras: ['factura'] },
      ],
    });

    expect(screen.getByText('Facturación')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Eliminar la condición Facturación' }),
    );

    expect(screen.queryByText('Facturación')).not.toBeInTheDocument();
  });

  it('con el máximo de condiciones el botón queda deshabilitado (AC5)', () => {
    renderForm({
      condicionesExtras: Array.from({ length: 10 }, (_, i) => ({
        key: `c${i}`,
        nombre: `Condición ${i}`,
        activa: true,
        palabras: ['x'],
      })),
    });

    expect(screen.getByRole('button', { name: /máximo 10 condiciones/i })).toBeDisabled();
  });

  // AC14: la estrategia y el asesor son un solo destino, no dos campos sueltos.
  it('elegir el reparto por carga guarda la estrategia sin asesor fijo', async () => {
    renderForm();

    await userEvent.click(screen.getByLabelText('Asesor que la recibe'));
    await userEvent.click(
      await screen.findByRole('option', { name: 'Quien tenga menos conversaciones activas' }),
    );
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    // Sobre el primer argumento y no con `toHaveBeenCalledWith`: TanStack Query le pasa a la
    // `mutationFn` un segundo parámetro de contexto que aquí no importa.
    expect(mockSave.mock.calls[0]![0]).toMatchObject({
      estrategiaDestino: 'menor_carga',
      asesorDestinoId: null,
    });
  });

  it('elegir un asesor concreto guarda la estrategia fija con su id (AC14)', async () => {
    renderForm();

    await userEvent.click(screen.getByLabelText('Asesor que la recibe'));
    await userEvent.click(await screen.findByRole('option', { name: 'Ana Ruiz' }));
    await userEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(mockSave.mock.calls[0]![0]).toMatchObject({
      estrategiaDestino: 'fijo',
      asesorDestinoId: 'u1',
    });
  });

  it('«Ver asignación» abre el panel de reparto', async () => {
    renderForm();

    await userEvent.click(screen.getByRole('button', { name: /ver asignación/i }));

    expect(await screen.findByText('Cómo está repartido el trabajo')).toBeInTheDocument();
  });

  // Una condición encendida cuenta como disparador: si no, encender la transferencia con SOLO
  // condiciones propias quedaría bloqueado por un error que ya no es cierto.
  it('una condición propia encendida basta para poder guardar', () => {
    renderForm({
      reglas: { ...BASE.reglas, explicitRequest: { activa: false, frases: [] } },
      condicionesExtras: [
        { key: 'facturacion', nombre: 'Facturación', activa: true, palabras: ['factura'] },
      ],
    });

    expect(screen.queryByText('Elige al menos una condición.')).not.toBeInTheDocument();
  });
});
