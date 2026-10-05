import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentFilters } from './SegmentFilters.js';
import type { SegmentoFiltros } from '../types.js';

// Los catálogos del tenant son de otros features: se simulan para aislar el constructor.
vi.mock('@/features/contacts/hooks/useContactOptions', () => ({
  useContactOptions: () => ({ data: { rol: [], interes: [], objecion: [] } }),
}));
vi.mock('@/features/semaforos', () => ({ useSemaforos: () => ({ data: [] }) }));
vi.mock('@/features/tags/hooks/useTags', () => ({
  useTags: () => ({ data: [{ id: 't1', nombre: 'VIP', color: '#7C3AED', semaforo: null }] }),
}));

/**
 * Se prueba fuera del diálogo del wizard a propósito: dentro de un modal de Radix, jsdom cierra el
 * popover en cuanto le pasa el foco (no replica las capas anidadas del navegador).
 */
describe('SegmentFilters', () => {
  it('ofrece semáforo, intención, estado, etiquetas e interés; no rol ni datos de la ficha', () => {
    render(<SegmentFilters valor={{}} onChange={vi.fn()} />);

    for (const eje of [
      'Semáforo del lead',
      'Intención de compra',
      'Estado comercial',
      'Etiquetas',
      'Nivel de interés',
    ]) {
      expect(screen.getByLabelText(eje)).toBeInTheDocument();
    }
    expect(screen.queryByText('Rol del contacto')).not.toBeInTheDocument();
    expect(screen.queryByText('Datos propios del contacto')).not.toBeInTheDocument();
  });

  it('la intención de compra viaja como escala de la IA', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(f: SegmentoFiltros) => void>();
    render(<SegmentFilters valor={{}} onChange={onChange} />);

    await user.click(screen.getByLabelText('Intención de compra'));
    await user.click(await screen.findByRole('checkbox', { name: 'Caliente' }));

    expect(onChange).toHaveBeenLastCalledWith({ intencionCompra: ['caliente'] });
  });

  it('las etiquetas viajan por id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(f: SegmentoFiltros) => void>();
    render(<SegmentFilters valor={{}} onChange={onChange} />);

    await user.click(screen.getByLabelText('Etiquetas'));
    await user.click(await screen.findByRole('checkbox', { name: 'VIP' }));

    expect(onChange).toHaveBeenLastCalledWith({ tagIds: ['t1'] });
  });

  it('el estado comercial usa las claves del CRM', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(f: SegmentoFiltros) => void>();
    render(<SegmentFilters valor={{}} onChange={onChange} />);

    await user.click(screen.getByLabelText('Estado comercial'));
    await user.click(await screen.findByRole('checkbox', { name: 'Pago pendiente' }));

    expect(onChange).toHaveBeenLastCalledWith({ estadoComercial: ['pago_pendiente'] });
  });
});
