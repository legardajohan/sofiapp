import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateRangeFilter } from './DateRangeFilter.js';

function pintar(desde: string, hasta: string, onChange = vi.fn(), onClear = vi.fn()): void {
  render(
    <DateRangeFilter
      idPrefix="t"
      desde={desde}
      hasta={hasta}
      onChange={onChange}
      onClear={onClear}
      mientrasInvertido="Mostramos todo."
    />,
  );
}

describe('DateRangeFilter — HU-REP-05-V2', () => {
  it('sin fechas no ofrece limpiar', () => {
    pintar('', '');
    expect(screen.getByLabelText('Desde')).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpiar fechas' })).not.toBeInTheDocument();
  });

  it('con una sola fecha ya ofrece limpiar, y limpiar avisa', async () => {
    const onClear = vi.fn();
    pintar('2026-10-01', '', vi.fn(), onClear);
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar fechas' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('cambiar un campo informa cuál y con qué valor', () => {
    const onChange = vi.fn();
    pintar('', '', onChange);
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-03' } });
    expect(onChange).toHaveBeenCalledWith('hasta', '2026-10-03');
  });

  it('invertido: alerta y "Hasta" marcado como inválido', () => {
    pintar('2026-10-05', '2026-10-01');
    expect(screen.getByRole('alert')).toHaveTextContent('La fecha final es anterior a la inicial. Mostramos todo.');
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('aria-invalid', 'true');
  });
});
