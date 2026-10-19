import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import { KpiCell, KpiStripSkeleton } from './KpiCell.js';

describe('KpiCell — HU-REP-05', () => {
  it('pinta etiqueta, valor, detalle y un icono decorativo', () => {
    const { container } = render(<KpiCell icon={Users} label="Usuarios" value="42" detail="40 activos" />);

    expect(screen.getByText('Usuarios')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('40 activos')).toBeInTheDocument();
    const icono = container.querySelector('svg[data-kpi-icon]');
    expect(icono).toHaveAttribute('aria-hidden', 'true');
    expect(icono).toHaveClass('size-4', 'text-muted-foreground');
  });

  it('la celda con acento tiñe el icono y la etiqueta con el color primario', () => {
    const { container } = render(<KpiCell accent icon={Users} label="Ventas" value="7" />);

    expect(container.querySelector('svg[data-kpi-icon]')).toHaveClass('size-4', 'text-primary');
    expect(screen.getByText('Ventas')).toHaveClass('text-primary');
    expect(container.firstChild).toHaveClass('bg-secondary');
  });

  it('el esqueleto pinta tantas celdas como se piden y se marca como ocupado', () => {
    const { container } = render(<KpiStripSkeleton count={4} columns="grid-cols-4" />);
    const franja = container.firstChild as HTMLElement;

    expect(franja).toHaveAttribute('aria-busy', 'true');
    expect(franja.children).toHaveLength(4);
  });
});
