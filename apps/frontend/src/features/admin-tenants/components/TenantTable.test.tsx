import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TenantTable } from './TenantTable.js';
import type { EstadoTenant, ITenant } from '../types/index.js';

const noop = (): void => {};

function makeTenant(estado: EstadoTenant, nombre = 'Acme Corp'): ITenant {
  return {
    _id: 'id-1',
    nombre,
    slug: 'acme',
    contacto: { email: 'acme@example.com', telefono: '3001234567' },
    estado,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function renderTable(tenant: ITenant): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TenantTable
        tenants={[tenant]}
        total={1}
        page={1}
        limit={20}
        planNameById={new Map()}
        onPageChange={noop}
        onEdit={noop}
        onDelete={noop}
      />
    </QueryClientProvider>,
  );
}

describe('TenantTable — bloqueo de empresa activa (HU-SAAS-02)', () => {
  it('deshabilita Editar y Eliminar cuando la empresa está ACTIVA', () => {
    renderTable(makeTenant('activo'));
    expect(screen.getByRole('button', { name: 'Editar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
  });

  it('muestra el motivo del bloqueo (con el nombre) en el tooltip', () => {
    renderTable(makeTenant('activo', 'Empresa Viva'));
    const wrapper = screen.getByRole('button', { name: 'Editar' }).parentElement;
    const title = wrapper?.getAttribute('title') ?? '';
    expect(title).toContain('Empresa Viva');
    expect(title).toContain('activa');
  });

  it('mantiene habilitadas las acciones cuando la empresa NO está activa (suspendida)', () => {
    renderTable(makeTenant('suspendido'));
    expect(screen.getByRole('button', { name: 'Editar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeEnabled();
  });

  it('mantiene habilitadas las acciones para empresas en prueba', () => {
    renderTable(makeTenant('prueba'));
    expect(screen.getByRole('button', { name: 'Editar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeEnabled();
  });
});
