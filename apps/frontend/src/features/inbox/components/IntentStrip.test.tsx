import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntentStrip } from './IntentStrip.js';
import type { SemaforoIADTO } from '../types.js';

const TAG = { id: 't1', nombre: 'Avanza', color: '#16A34A', semaforo: 'verde' as const };

const BASE: SemaforoIADTO = {
  slug: 'verde',
  confianza: 0.86,
  motivo: 'pide instrucciones de pago para matricularse',
  nivelInteres: 'caliente',
  objecion: null,
  at: '2026-08-27T15:00:00.000Z',
  aplicado: 'verde',
  tag: TAG,
  pendiente: false,
};

const noop = (): void => {};

function renderStrip(over: Partial<SemaforoIADTO> | null, pending = false, onApply = noop): void {
  render(
    <IntentStrip
      semaforoIA={over === null ? null : { ...BASE, ...over }}
      pending={pending}
      onApply={onApply}
    />,
  );
}

describe('IntentStrip (HU-IA-05)', () => {
  it('aplicado: muestra la etiqueta y el motivo, sin botón (AC19)', () => {
    renderStrip({});

    expect(screen.getByText('Avanza')).toBeInTheDocument();
    expect(screen.getByText('pide instrucciones de pago para matricularse')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aplicar/i })).not.toBeInTheDocument();
  });

  it('propuesta pendiente: ofrece aplicar, nombrando la etiqueta destino (AC19)', async () => {
    const onApply = vi.fn();
    renderStrip({ aplicado: null, pendiente: true }, false, onApply);

    const boton = screen.getByRole('button', { name: 'Aplicar la etiqueta Avanza' });
    await userEvent.click(boton);

    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('mientras aplica, el botón se deshabilita y lo dice (AC19)', () => {
    renderStrip({ aplicado: null, pendiente: true }, true);

    const boton = screen.getByRole('button', { name: 'Aplicar la etiqueta Avanza' });
    expect(boton).toBeDisabled();
    expect(boton).toHaveTextContent('Aplicando');
  });

  // Nada que mostrar no es lo mismo que un hueco que mostrar: sin clasificación la banda no existe,
  // para no dejar una fila de ruido permanente en cada conversación nueva.
  it('sin clasificación no renderiza nada (AC19)', () => {
    const { container } = render(<IntentStrip semaforoIA={null} pending={false} onApply={noop} />);
    expect(container).toBeEmptyDOMElement();
  });

  // El admin borró la etiqueta desde /etiquetas: sin chip que pintar la sugerencia no significa
  // nada para el asesor, y el backend ya la marca como no aplicable.
  it('sin etiqueta hidratada no renderiza nada (AC7)', () => {
    const { container } = render(
      <IntentStrip semaforoIA={{ ...BASE, tag: null }} pending={false} onApply={noop} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('la confianza no se pinta como porcentaje: va en el tooltip', () => {
    renderStrip({});

    expect(screen.queryByText(/86\s*%/)).not.toBeInTheDocument();
    expect(screen.getByTitle('Confianza de la clasificación: 86 %')).toBeInTheDocument();
  });
});
