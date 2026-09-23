import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AudienceMeter } from './AudienceMeter.js';
import type { PresupuestoDTO } from '../types.js';

function presupuesto(parcial: Partial<PresupuestoDTO> = {}): PresupuestoDTO {
  return {
    tier: 'TIER_1K',
    calidad: 'GREEN',
    limiteDiario: 800,
    consumido24h: 0,
    disponible: 800,
    intervaloMs: 108_000,
    bloqueado: false,
    motivoBloqueo: null,
    ...parcial,
  };
}

describe('AudienceMeter', () => {
  it('dice cuánta gente entra y que la campaña sale hoy si cabe en el cupo', () => {
    render(<AudienceMeter destinatarios={120} presupuesto={presupuesto()} />);

    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('se envía hoy')).toBeInTheDocument();
    expect(screen.queryByText(/no cabe en un solo día/i)).not.toBeInTheDocument();
  });

  it('avisa cuando el volumen excede el cupo y explica que el envío continúa solo', () => {
    render(<AudienceMeter destinatarios={2400} presupuesto={presupuesto()} />);

    expect(screen.getByText(/no cabe en un solo día/i)).toBeInTheDocument();
    // 2400 / 800 = 3 días.
    expect(screen.getByText(/tardará unos 3 días/i)).toBeInTheDocument();
    expect(screen.getByText(/se reanuda solo/i)).toBeInTheDocument();
  });

  it('descuenta lo ya gastado por el número en las últimas 24 h', () => {
    render(
      <AudienceMeter
        destinatarios={100}
        presupuesto={presupuesto({ consumido24h: 300, disponible: 500 })}
      />,
    );

    expect(screen.getByText('300')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
  });

  it('con la calidad en rojo muestra el bloqueo con su motivo, no un plazo inventado', () => {
    render(
      <AudienceMeter
        destinatarios={100}
        presupuesto={presupuesto({
          calidad: 'RED',
          limiteDiario: 0,
          disponible: 0,
          bloqueado: true,
          motivoBloqueo: 'La calidad del número de WhatsApp está en rojo.',
        })}
      />,
    );

    expect(screen.getByText('Calidad baja')).toBeInTheDocument();
    expect(screen.getByText(/está en rojo/i)).toBeInTheDocument();
    expect(screen.getByText('Sin cupo hoy')).toBeInTheDocument();
    // No debe ofrecer una estimación de días cuando no se puede enviar.
    expect(screen.queryByText(/tardará unos/i)).not.toBeInTheDocument();
  });

  it('describe la barra para lectores de pantalla con las tres cifras que la componen', () => {
    render(
      <AudienceMeter
        destinatarios={200}
        presupuesto={presupuesto({ consumido24h: 300, disponible: 500 })}
      />,
    );

    expect(
      screen.getByRole('img', { name: /300 ya usados y 200 de esta campaña, sobre 800/i }),
    ).toBeInTheDocument();
  });
});
