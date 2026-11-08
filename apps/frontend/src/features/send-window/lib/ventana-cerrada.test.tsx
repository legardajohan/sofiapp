import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { aperturaDeVentanaCerrada, textoReapertura } from './ventana-cerrada.js';
import { SendWindowBanner } from '@/features/inbox/components/SendWindowBanner.js';
import { AvisoHorarioCampana } from '@/features/campaigns/components/AvisoHorarioCampana.js';

function errorHttp(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('fallo', 'ERR', config, null, { status, statusText: '', headers: {}, config, data });
}

describe('HU-CONF-01 — avisos de horario de envío', () => {
  it('reconoce el 423 y extrae la siguiente apertura; ignora otros errores', () => {
    expect(aperturaDeVentanaCerrada(errorHttp(423, { siguienteApertura: '2026-11-04T13:00:00.000Z' }))).toBe(
      '2026-11-04T13:00:00.000Z',
    );
    expect(aperturaDeVentanaCerrada(errorHttp(423, { siguienteApertura: null }))).toBeNull();
    expect(aperturaDeVentanaCerrada(errorHttp(422, {}))).toBeUndefined();
    expect(aperturaDeVentanaCerrada(new Error('x'))).toBeUndefined();
  });

  it('el banner del composer dice cuándo podrá responder el asesor', () => {
    const apertura = new Date(Date.now() + 26 * 3_600_000).toISOString();
    render(<SendWindowBanner apertura={apertura} zonaHoraria="America/Bogota" />);
    expect(screen.getByRole('status')).toHaveTextContent(/Fuera del horario de envío de tu empresa\. Podrás enviar/);
    expect(textoReapertura(null)).toMatch(/próximas dos semanas/);
  });

  it('el aviso del programador ofrece usar la siguiente apertura', async () => {
    const onUsar = vi.fn();
    const apertura = new Date(Date.now() + 3 * 86_400_000);
    render(
      <AvisoHorarioCampana horario={{ cerrada: true, apertura, zonaHoraria: 'America/Bogota' }} onUsar={onUsar} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^Usar el / }));
    expect(onUsar).toHaveBeenCalledWith(apertura);
  });

  it('con la hora dentro del horario no muestra nada', () => {
    const { container } = render(
      <AvisoHorarioCampana horario={{ cerrada: false, apertura: null, zonaHoraria: 'America/Bogota' }} onUsar={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
