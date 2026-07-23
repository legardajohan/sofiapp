import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminPlansPage } from './AdminPlansPage.js';
import { getAdminPlans, updateAdminPlan } from '../../../api/admin-plans.js';
import { useAdminPlansStore } from '../useAdminPlansStore.js';
import type { IPlan } from '../types/index.js';

vi.mock('../../../api/admin-plans.js', () => ({
  getAdminPlans: vi.fn(),
  createAdminPlan: vi.fn(),
  updateAdminPlan: vi.fn(),
  deleteAdminPlan: vi.fn(),
  getExchangeRateVigente: vi.fn(() =>
    Promise.resolve({ estado: 'CURRENT', tasa: { tasaCopPorUsd: '4000', fuente: 'x', fechaVigencia: '2026-01-01' } }),
  ),
}));

const mockGet = vi.mocked(getAdminPlans);
const mockUpdate = vi.mocked(updateAdminPlan);

function plan(): IPlan {
  return {
    _id: 'p1',
    nombre: 'Pro',
    periodicidad: 'mensual',
    limites: { usuarios: 3, administradores: 3, mensajesMes: 1000, leads: 500, campanasMes: 2 },
    precio: 100,
    activo: true,
    // Aparece NO en uso en la lista (botón habilitado); el error llega al guardar.
    uso: { enUso: false, tenantCount: 0, tenants: [] },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AdminPlansPage />
    </QueryClientProvider>,
  );
}

async function abrirEditarYGuardar(): Promise<void> {
  await screen.findByText('Pro');
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Guardar cambios' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  useAdminPlansStore.setState({ isModalOpen: false, planEditing: null, planDeleting: null, viewMode: 'table' });
  mockGet.mockResolvedValue([plan()]);
});

describe('AdminPlansPage — errores al editar un plan', () => {
  it('un 409 PLAN_IN_USE muestra el mensaje con las empresas (no el genérico)', async () => {
    mockUpdate.mockRejectedValue({
      response: {
        status: 409,
        data: {
          success: false,
          code: 'PLAN_IN_USE',
          message: 'x',
          data: { planId: 'p1', planName: 'Pro', tenantCount: 1, tenants: [{ id: 't1', name: 'Empresa ABC' }] },
        },
      },
    });

    renderPage();
    await abrirEditarYGuardar();

    await waitFor(() => {
      expect(screen.getByText(/está siendo utilizado por 1 empresa/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Empresa ABC/)).toBeInTheDocument();
    expect(screen.queryByText(/Error al guardar/)).not.toBeInTheDocument();
  });

  it('otro error muestra el mensaje real del servidor (no un texto genérico fijo)', async () => {
    mockUpdate.mockRejectedValue({
      response: {
        status: 422,
        data: { message: 'La cantidad de administradores (10) supera el máximo técnico por plan (5).' },
      },
    });

    renderPage();
    await abrirEditarYGuardar();

    await waitFor(() => {
      expect(screen.getByText(/supera el máximo técnico por plan/i)).toBeInTheDocument();
    });
  });
});
