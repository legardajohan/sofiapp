import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TriggerSettings } from './TriggerSettings.js';

describe('TriggerSettings (HU-FLOW-04)', () => {
  it('el botón resume cuándo arranca el flujo', () => {
    render(<TriggerSettings value={{ tipo: 'palabra_clave', palabras: ['precio'] }} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /arranca:\s*precio/i })).toBeInTheDocument();
  });

  it('agrega una palabra con Enter, sin duplicar', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TriggerSettings value={{ tipo: 'palabra_clave', palabras: ['precio'] }} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /arranca/i }));
    const campo = await screen.findByPlaceholderText(/precio, horario/i);

    await user.type(campo, 'Horario{Enter}');
    expect(onChange).toHaveBeenLastCalledWith({ tipo: 'palabra_clave', palabras: ['precio', 'Horario'] });

    onChange.mockClear();
    await user.type(campo, 'PRECIO{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('quitar una palabra la saca de la lista', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TriggerSettings value={{ tipo: 'palabra_clave', palabras: ['precio', 'sede'] }} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /arranca/i }));
    await user.click(await screen.findByRole('button', { name: 'Quitar precio' }));

    expect(onChange).toHaveBeenCalledWith({ tipo: 'palabra_clave', palabras: ['sede'] });
  });

  it('el horario permite alternar días', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const horario = { dias: [1], desde: '08:00', hasta: '18:00', zonaHoraria: 'America/Bogota' };
    render(<TriggerSettings value={{ tipo: 'horario', horario }} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: /arranca/i }));
    await user.click(await screen.findByRole('button', { name: 'Sábado' }));

    expect(onChange).toHaveBeenCalledWith({ tipo: 'horario', horario: { ...horario, dias: [1, 6] } });
  });
});
