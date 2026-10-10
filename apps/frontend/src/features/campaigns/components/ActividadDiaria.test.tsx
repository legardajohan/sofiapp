import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ActividadDiaria } from './ActividadDiaria.js';
import type { PuntoSerie } from '../types.js';

const SERIE: PuntoSerie[] = [
  { dia: '2026-10-01', enviados: 120, respondidos: 4, convertidos: 0 },
  { dia: '2026-10-02', enviados: 0, respondidos: 7, convertidos: 2 },
  { dia: '2026-10-03', enviados: 0, respondidos: 1, convertidos: 1 },
];

describe('HU-MARK-04 — ActividadDiaria', () => {
  it('nombra las dos gráficas y lleva los totales del período en la leyenda', () => {
    render(<ActividadDiaria serie={SERIE} />);

    expect(screen.getByText('Mensajes enviados por día')).toBeInTheDocument();
    const lineas = screen.getByText('Respuestas y ventas por día').closest('figure');
    expect(lineas).not.toBeNull();
    const caption = within(lineas as HTMLElement).getByText('Respuestas').parentElement;
    expect(caption).toHaveTextContent('Respuestas12');
    expect(within(lineas as HTMLElement).getByText('Ventas').parentElement).toHaveTextContent(
      'Ventas3',
    );
  });

  it('expone los mismos datos como tabla para lectores de pantalla', () => {
    render(<ActividadDiaria serie={SERIE} />);

    const tabla = screen.getByRole('table', { name: 'Actividad por día' });
    // Cabecera + un día por fila.
    expect(within(tabla).getAllByRole('row')).toHaveLength(SERIE.length + 1);
    expect(within(tabla).getByText('120')).toBeInTheDocument();
  });
});
