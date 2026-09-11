import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationSummaryStrip } from './ConversationSummaryStrip.js';
import { MOTIVO_DATOS_SENSIBLES } from '@/lib/roles';
import type { ResumenDTO } from '../types.js';

const TEXTO =
  'La clienta pregunta por el curso de preparación y compara precios con otra academia. ' +
  'Quedó pendiente enviarle el temario y confirmar si hay descuento por pago anticipado.';

const RESUMEN: ResumenDTO = {
  texto: TEXTO,
  generadoAt: '2026-08-25T15:00:00.000Z',
  desactualizado: false,
};

const noop = (): void => {};

interface Overrides {
  resumen?: ResumenDTO | null;
  puedeVer?: boolean;
  puedeGenerar?: boolean;
  expandido?: boolean;
  pending?: boolean;
  onToggle?: () => void;
  onGenerate?: () => void;
}

function renderStrip(over: Overrides = {}): void {
  render(
    <ConversationSummaryStrip
      resumen={over.resumen !== undefined ? over.resumen : RESUMEN}
      puedeVer={over.puedeVer ?? true}
      puedeGenerar={over.puedeGenerar ?? true}
      expandido={over.expandido ?? false}
      onToggle={over.onToggle ?? noop}
      pending={over.pending ?? false}
      onGenerate={over.onGenerate ?? noop}
    />,
  );
}

describe('ConversationSummaryStrip (HU-IA-04)', () => {
  it('con permiso muestra el resumen y ofrece verlo completo', async () => {
    const onToggle = vi.fn();
    renderStrip({ onToggle });

    expect(screen.getByText(TEXTO)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /ver el resumen completo/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('colapsada anuncia aria-expanded=false; expandida, true y la fecha de generación', () => {
    const { unmount } = render(
      <ConversationSummaryStrip
        resumen={RESUMEN}
        puedeVer
        puedeGenerar
        expandido={false}
        onToggle={noop}
        pending={false}
        onGenerate={noop}
      />,
    );
    expect(screen.getByRole('button', { name: /ver el resumen completo/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByText(/generado/i)).not.toBeInTheDocument();
    unmount();

    renderStrip({ expandido: true });
    expect(screen.getByRole('button', { name: /contraer el resumen/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText(/generado/i)).toBeInTheDocument();
  });

  it('SIN permiso muestra el motivo y NO ofrece generar', () => {
    // Distinguir "no hay resumen" de "no puedes verlo" es requisito, no matiz (ADR-0006 §4).
    renderStrip({ puedeVer: false });

    expect(screen.getByText(MOTIVO_DATOS_SENSIBLES)).toBeInTheDocument();
    expect(screen.queryByText(TEXTO)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generar resumen/i })).not.toBeInTheDocument();
  });

  it('sin resumen todavía invita a generarlo', async () => {
    const onGenerate = vi.fn();
    renderStrip({ resumen: null, onGenerate });

    expect(screen.getByText(/genera un resumen/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /generar resumen/i }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('sin resumen y sin permiso de generar, no ofrece el botón', () => {
    renderStrip({ resumen: null, puedeGenerar: false });

    expect(screen.queryByRole('button', { name: /generar resumen/i })).not.toBeInTheDocument();
  });

  it('marca el resumen desactualizado y ofrece actualizarlo al expandir', async () => {
    const onGenerate = vi.fn();
    renderStrip({
      resumen: { ...RESUMEN, desactualizado: true },
      expandido: true,
      onGenerate,
    });

    expect(screen.getByText('Desactualizado')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('mientras genera anuncia el estado a los lectores de pantalla', () => {
    renderStrip({ pending: true });

    expect(screen.getByLabelText('Generando el resumen')).toHaveAttribute('aria-busy', 'true');
  });
});
