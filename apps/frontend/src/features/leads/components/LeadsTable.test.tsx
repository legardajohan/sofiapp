import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeadsTable } from './LeadsTable.js';
import type { LeadListItemDTO } from '../types.js';
import type { Paginated } from '../../inbox/types.js';

function lead(over: Partial<LeadListItemDTO> = {}): LeadListItemDTO {
  return {
    id: 'l1',
    nombre: 'Ana Pérez',
    telefono: '573001112233',
    correo: null,
    estado: 'nuevo',
    responsable: { id: 'u1', nombre: 'Carolina' },
    conversacionId: 'c1',
    semaforo: null,
    resumen: null,
    ultimoMensajeAt: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    ...over,
  };
}

function pagina(data: LeadListItemDTO[], over: Partial<Paginated<LeadListItemDTO>> = {}) {
  return { data, page: 1, limit: 20, total: data.length, ...over };
}

const ESTADOS_CAT = [
  { id: 'e1', key: 'nuevo', label: 'Nuevo', color: '#64748B', orden: 0, activo: true, esDefecto: true, esSalida: false },
  { id: 'e2', key: 'en_gestion', label: 'En gestión', color: '#2563EB', orden: 1, activo: true, esDefecto: true, esSalida: false },
  { id: 'e3', key: 'pagado', label: 'Pagado', color: '#16A34A', orden: 3, activo: true, esDefecto: true, esSalida: false },
];

const props = {
  datos: undefined as Paginated<LeadListItemDTO> | undefined,
  isLoading: false,
  isError: false,
  onRetry: vi.fn(),
  hayFiltros: false,
  onClearFiltros: vi.fn(),
  selectedId: null as string | null,
  onSelect: vi.fn(),
  onPageChange: vi.fn(),
  estados: ESTADOS_CAT,
};

describe('LeadsTable', () => {
  it('muestra el esqueleto mientras carga, sin pintar la tabla', () => {
    render(<LeadsTable {...props} isLoading />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('ofrece reintentar cuando falla la carga', async () => {
    const onRetry = vi.fn();
    render(<LeadsTable {...props} isError onRetry={onRetry} />);

    expect(screen.getByText('No se pudo cargar el listado de leads.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('el vacío inicial invita a convertir, sin ofrecer limpiar filtros', () => {
    render(<LeadsTable {...props} datos={pagina([])} />);

    expect(screen.getByText('Todavía no hay leads')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument();
  });

  it('el vacío por filtros es OTRO mensaje y ofrece limpiarlos', async () => {
    const onClearFiltros = vi.fn();
    render(
      <LeadsTable {...props} datos={pagina([])} hayFiltros onClearFiltros={onClearFiltros} />,
    );

    // Decirle "no tienes leads" a quien los tiene filtrados fuera sería desinformar.
    expect(screen.queryByText('Todavía no hay leads')).not.toBeInTheDocument();
    expect(screen.getByText('Ningún lead coincide con estos filtros')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(onClearFiltros).toHaveBeenCalled();
  });

  it('pinta los datos clave de cada lead y el conteo', () => {
    render(<LeadsTable {...props} datos={pagina([lead({ semaforo: { id: 's1', key: 'verde', label: 'Venta concretada', color: '#16A34A', orden: 2, activo: true, esDefecto: true } })])} />);

    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('573001112233')).toBeInTheDocument();
    expect(screen.getByText('Nuevo')).toBeInTheDocument();
    expect(screen.getByText('Venta concretada')).toBeInTheDocument();
    expect(screen.getByText('Carolina')).toBeInTheDocument();
    expect(screen.getByText('1 lead')).toBeInTheDocument();
  });

  it('muestra la etiqueta del semáforo del tenant, no su clave', () => {
    // El administrador renombra los semáforos; la tabla tiene que hablar su idioma.
    render(
      <LeadsTable
        {...props}
        datos={pagina([
          lead({
            semaforo: { ...{ id: 's2', key: 'rojo', label: 'Descartado', color: '#DC2626', orden: 3, activo: true, esDefecto: true }, label: 'Perdido sin remedio' },
          }),
        ])}
      />,
    );

    expect(screen.getByText('Perdido sin remedio')).toBeInTheDocument();
    expect(screen.queryByText('rojo')).not.toBeInTheDocument();
  });

  it('un lead sin semáforo muestra un guion, no una celda vacía', () => {
    render(<LeadsTable {...props} datos={pagina([lead({ semaforo: null })])} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('un lead sin responsable ni actividad no deja huecos mudos', () => {
    render(<LeadsTable {...props} datos={pagina([lead({ responsable: null })])} />);

    expect(screen.getByText('Sin responsable')).toBeInTheDocument();
    expect(screen.getByText('Sin mensajes')).toBeInTheDocument();
  });

  it('seleccionar una fila con clic abre su detalle', async () => {
    const onSelect = vi.fn();
    render(<LeadsTable {...props} datos={pagina([lead()])} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ver el lead Ana Pérez' }));
    expect(onSelect).toHaveBeenCalledWith('l1');
  });

  it('la fila también se acciona con el teclado', async () => {
    const onSelect = vi.fn();
    render(<LeadsTable {...props} datos={pagina([lead()])} onSelect={onSelect} />);

    // Sin esto el detalle quedaría fuera del alcance de quien no usa ratón.
    screen.getByRole('button', { name: 'Ver el lead Ana Pérez' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('l1');
  });

  it('la paginación solo aparece cuando hay más de una página', async () => {
    const onPageChange = vi.fn();
    const { rerender } = render(<LeadsTable {...props} datos={pagina([lead()])} />);
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();

    rerender(
      <LeadsTable
        {...props}
        datos={pagina([lead()], { total: 40 })}
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
