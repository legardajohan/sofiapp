import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KnowledgeToolbar } from './KnowledgeToolbar.js';

function renderToolbar(overrides: Partial<Parameters<typeof KnowledgeToolbar>[0]> = {}): {
  onTextoChange: ReturnType<typeof vi.fn>;
  onTagChange: ReturnType<typeof vi.fn>;
  onEstadoChange: ReturnType<typeof vi.fn>;
} {
  const handlers = {
    onTextoChange: vi.fn(),
    onTagChange: vi.fn(),
    onEstadoChange: vi.fn(),
  };
  render(
    <KnowledgeToolbar
      texto=""
      tag="todos"
      estado="todos"
      resultCount={5}
      hasFilters={false}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('KnowledgeToolbar', () => {
  it('emite cada tecla del buscador para que la página decida cuándo filtrar', async () => {
    const user = userEvent.setup();
    const { onTextoChange } = renderToolbar();

    await user.type(screen.getByLabelText('Buscar conocimiento por nombre'), 'ho');

    expect(onTextoChange).toHaveBeenCalledTimes(2);
  });

  it('el botón de borrar solo aparece con texto escrito', async () => {
    const user = userEvent.setup();
    renderToolbar();
    expect(screen.queryByLabelText('Borrar la búsqueda')).not.toBeInTheDocument();

    const { onTextoChange } = renderToolbar({ texto: 'horarios' });
    await user.click(screen.getByLabelText('Borrar la búsqueda'));

    expect(onTextoChange).toHaveBeenCalledWith('');
  });

  it('el filtro de tipo ofrece las mismas etiquetas que las tarjetas', async () => {
    const user = userEvent.setup();
    const { onTagChange } = renderToolbar();

    await user.click(screen.getByLabelText('Filtrar por tipo'));
    await user.click(await screen.findByRole('option', { name: 'Requerido' }));

    expect(onTagChange).toHaveBeenCalledWith('requerido');
  });

  it('el filtro de estado agrupa procesando y pendiente bajo "En proceso"', async () => {
    const user = userEvent.setup();
    const { onEstadoChange } = renderToolbar();

    await user.click(screen.getByLabelText('Filtrar por estado'));
    await user.click(await screen.findByRole('option', { name: 'En proceso' }));

    expect(onEstadoChange).toHaveBeenCalledWith('proceso');
  });

  it('anuncia el número de resultados solo cuando hay filtros activos', () => {
    renderToolbar({ hasFilters: true, resultCount: 1 });
    expect(screen.getByText('1 resultado')).toBeInTheDocument();
  });
});
