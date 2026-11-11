import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProgramacionPendiente } from '@/features/contacts/components/ProgramacionPendiente';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { navGroupsForRole } from '@/components/layout/nav-config';
import { useAuthStore } from '@/stores/authStore';
import { RecordatoriosStack } from './components/RecordatoriosStack.js';
import { CerrarPendienteDialog } from './components/CerrarPendienteDialog.js';
import { PosponerPendienteDialog } from './components/PosponerPendienteDialog.js';
import { OrganizadorSwitch } from './components/OrganizadorSwitch.js';
import {
  cerrarConMotivo,
  crearMotivo,
  fetchActivos,
  fetchMotivos,
  fetchPreferencia,
  guardarPreferencia,
  posponerPendiente,
} from './api.js';
import type { OrganizadorPendienteDTO, PendienteGestionable } from './types.js';

vi.mock('./api.js', () => ({
  fetchPreferencia: vi.fn(),
  guardarPreferencia: vi.fn(),
  fetchActivos: vi.fn(),
  fetchMotivos: vi.fn(),
  crearMotivo: vi.fn(),
  cerrarConMotivo: vi.fn(),
  posponerPendiente: vi.fn(),
  fetchOrganizador: vi.fn(),
  fetchConteos: vi.fn(),
  fetchHistorialPendiente: vi.fn(),
  fetchActividad: vi.fn(),
}));

vi.mock('@/features/tags/hooks/useTags', () => ({
  useTags: () => ({ data: [], isLoading: false }),
  useCreateTag: () => ({ mutate: vi.fn(), isPending: false }),
}));

function recordatorio(id: string, descripcion: string): OrganizadorPendienteDTO {
  return {
    id,
    clienteId: `cli-${id}`,
    cliente: { nombre: `Cliente ${id}`, telefono: '573001112233' },
    descripcion,
    programadoDia: '2026-11-10',
    programadoHora: '10:00',
    recordatorioAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    avisoAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    avisoAntesMin: 0,
    estado: 'vencido',
    vecesPospuesto: 0,
    responsable: { id: 'u1', nombre: 'Ana' },
    cerradoAt: null,
    cerradoPor: null,
    version: '2026-11-10T15:00:00.000Z',
  };
}

const OBJETIVO: PendienteGestionable = {
  id: 'n1',
  clienteId: 'cli-1',
  clienteNombre: 'Luis',
  descripcion: 'Llamar para confirmar matrícula',
  programadoDia: '2026-11-10',
  programadoHora: '10:00',
  version: '2026-11-10T15:00:00.000Z',
};

function pintar(ui: React.ReactElement): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  try {
    sessionStorage.clear();
  } catch {
    // sin almacenamiento
  }
  useAuthStore.setState({
    status: 'authenticated',
    user: { sub: 'u1', nombre: 'Ana', rol: 'admin' },
  });
  vi.mocked(fetchPreferencia).mockResolvedValue({ activo: true });
  vi.mocked(fetchMotivos).mockResolvedValue({
    predefinidos: [
      { key: 'contactado', nombre: 'Cliente contactado exitosamente' },
      { key: 'venta', nombre: 'Venta concretada' },
    ],
    personalizados: [],
  });
});

describe('HU-PDF-02 — menú (CA-01)', () => {
  it('«Organizador» va justo debajo de «Etapas del embudo»', () => {
    const operacion = navGroupsForRole('admin').find((g) => g.label === 'Operación');
    const labels = operacion?.items.map((i) => i.label) ?? [];
    expect(labels[labels.indexOf('Etapas del embudo') + 1]).toBe('Organizador');
  });

  it('se oculta a un subrol sin acceso a las notas', () => {
    const operacion = navGroupsForRole('admin', 'coordinator').find((g) => g.label === 'Operación');
    expect(operacion?.items.some((i) => i.label === 'Organizador')).toBe(false);
  });
});

describe('HU-PDF-02 — switch (CA-02)', () => {
  it('refleja la preferencia guardada y la cambia', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchPreferencia).mockResolvedValue({ activo: false });
    vi.mocked(guardarPreferencia).mockResolvedValue({ activo: true });
    pintar(<OrganizadorSwitch />);

    const sw = await screen.findByRole('switch', { name: 'Activar Organizador y recordatorios' });
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'));
    await user.click(sw);
    await waitFor(() => expect(vi.mocked(guardarPreferencia).mock.calls[0]?.[0]).toBe(true));
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });
});

describe('HU-PDF-02 — pila de recordatorios (CA-03, CA-04, CA-13)', () => {
  it('muestra los vencidos con las dos acciones y sin forma de descartarlos', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchActivos).mockResolvedValue({
      items: [recordatorio('1', 'Llamar a Luis'), recordatorio('2', 'Enviar cotización')],
      total: 2,
    });
    pintar(<RecordatoriosStack />);

    const pila = await screen.findByRole('region', { name: 'Recordatorios pendientes' });
    expect(within(pila).getByText('2 recordatorios pendientes')).toBeInTheDocument();
    expect(within(pila).getByText('Llamar a Luis')).toBeInTheDocument();
    expect(within(pila).getByRole('button', { name: 'Cerrar pendiente' })).toBeInTheDocument();
    expect(within(pila).getByRole('button', { name: 'Posponer pendiente' })).toBeInTheDocument();
    expect(within(pila).queryByRole('button', { name: /descartar|cerrar aviso/i })).toBeNull();

    // Esc y clic fuera no la ocultan.
    await user.keyboard('{Escape}');
    await user.click(document.body);
    expect(screen.getByRole('region', { name: 'Recordatorios pendientes' })).toBeInTheDocument();

    // El segundo se gestiona por separado, sin perder ninguno.
    await user.click(within(pila).getByRole('button', { name: 'Ver 1 más' }));
    expect(within(pila).getByText('Enviar cotización')).toBeInTheDocument();
  });

  it('minimizar deja una píldora con el contador, nunca la oculta', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchActivos).mockResolvedValue({ items: [recordatorio('1', 'Llamar')], total: 1 });
    pintar(<RecordatoriosStack />);

    await user.click(await screen.findByRole('button', { name: 'Minimizar recordatorios' }));
    const pildora = screen.getByRole('button', { name: '1 recordatorio pendiente. Mostrar' });
    await user.click(pildora);
    expect(screen.getByRole('region', { name: 'Recordatorios pendientes' })).toBeInTheDocument();
  });

  it('con el organizador apagado no muestra avisos ni los pide', async () => {
    vi.mocked(fetchPreferencia).mockResolvedValue({ activo: false });
    vi.mocked(fetchActivos).mockResolvedValue({ items: [recordatorio('1', 'Llamar')], total: 1 });
    pintar(<RecordatoriosStack />);

    await waitFor(() => expect(fetchPreferencia).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole('region', { name: 'Recordatorios pendientes' })).toBeNull();
  });
});

describe('HU-PDF-02 A1 — «Recordarme antes»', () => {
  it('la casilla ofrece 5 o 10 minutos y devuelve la anticipación elegida', async () => {
    const user = userEvent.setup();
    const onAviso = vi.fn();
    function Envoltura(): React.ReactElement {
      const [aviso, setAviso] = useState<0 | 5 | 10>(0);
      return (
        <ProgramacionPendiente
          dia="2026-12-01"
          hora="10:30"
          onDiaChange={vi.fn()}
          onHoraChange={vi.fn()}
          aviso={aviso}
          onAvisoChange={(v) => {
            onAviso(v);
            setAviso(v);
          }}
        />
      );
    }
    pintar(<Envoltura />);

    expect(screen.queryByRole('radio', { name: '10 min' })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'Recordarme antes' }));
    expect(onAviso).toHaveBeenLastCalledWith(5);
    await user.click(screen.getByRole('radio', { name: '10 min' }));
    expect(onAviso).toHaveBeenLastCalledWith(10);
    await user.click(screen.getByRole('checkbox', { name: 'Recordarme antes' }));
    expect(onAviso).toHaveBeenLastCalledWith(0);
  });

  it('mientras corre la anticipación el aviso dice «Vence en…»', async () => {
    vi.mocked(fetchActivos).mockResolvedValue({
      items: [
        {
          ...recordatorio('1', 'Llamar'),
          recordatorioAt: new Date(Date.now() + 8 * 60_000).toISOString(),
          avisoAntesMin: 10,
          estado: 'pendiente',
        },
      ],
      total: 1,
    });
    pintar(<RecordatoriosStack />);
    expect(await screen.findByText(/Vence en [89] min/)).toBeInTheDocument();
  });
});

describe('HU-PDF-02 — cerrar pendiente (CA-05, CA-06)', () => {
  it('no deja confirmar sin motivo; «Otros motivos» exige texto', async () => {
    const user = userEvent.setup();
    vi.mocked(cerrarConMotivo).mockResolvedValue(recordatorio('n1', 'x'));
    pintar(<CerrarPendienteDialog pendiente={OBJETIVO} onClose={vi.fn()} />);

    const confirmar = await screen.findByRole('button', { name: 'Confirmar cierre' });
    expect(confirmar).toBeDisabled();

    await user.click(await screen.findByRole('checkbox', { name: 'Otros motivos' }));
    expect(confirmar).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /Describe el motivo/ }), 'Pagó en la sede');
    expect(confirmar).toBeEnabled();

    await user.click(screen.getByRole('checkbox', { name: 'Venta concretada' }));
    await user.click(confirmar);
    await waitFor(() =>
      expect(cerrarConMotivo).toHaveBeenCalledWith('n1', {
        motivoKeys: ['venta'],
        motivoIds: [],
        otro: { texto: 'Pagó en la sede' },
        tagIds: [],
        version: OBJETIVO.version,
      }),
    );
  });

  it('«Crear nuevo motivo» lo guarda y lo deja marcado', async () => {
    const user = userEvent.setup();
    vi.mocked(crearMotivo).mockResolvedValue({ id: 'm1', nombre: 'Agendó visita' });
    vi.mocked(cerrarConMotivo).mockResolvedValue(recordatorio('n1', 'x'));
    pintar(<CerrarPendienteDialog pendiente={OBJETIVO} onClose={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Crear nuevo motivo' }));
    await user.type(screen.getByRole('textbox', { name: 'Nombre del nuevo motivo' }), 'Agendó visita');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(vi.mocked(crearMotivo).mock.calls[0]?.[0]).toBe('Agendó visita'));

    const confirmar = screen.getByRole('button', { name: 'Confirmar cierre' });
    await waitFor(() => expect(confirmar).toBeEnabled());
    await user.click(confirmar);
    await waitFor(() =>
      expect(vi.mocked(cerrarConMotivo).mock.calls[0]?.[1]).toMatchObject({ motivoIds: ['m1'] }),
    );
  });
});

describe('HU-PDF-02 — posponer pendiente (CA-08)', () => {
  it('exige motivo y una hora; manda la nueva programación', async () => {
    const user = userEvent.setup();
    vi.mocked(posponerPendiente).mockResolvedValue(recordatorio('n1', 'x'));
    pintar(
      <PosponerPendienteDialog pendiente={{ ...OBJETIVO, programadoHora: null }} onClose={vi.fn()} />,
    );

    const confirmar = await screen.findByRole('button', { name: 'Confirmar aplazamiento' });
    expect(confirmar).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe por qué lo pospones.');

    await user.type(
      screen.getByRole('textbox', { name: /¿Por qué desea posponer este pendiente\?/ }),
      'Pidió que lo llamáramos mañana',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Elige la nueva hora.');

    await user.type(screen.getByLabelText('Hora del pendiente'), '09:30');
    await waitFor(() => expect(confirmar).toBeEnabled());
    await user.click(confirmar);
    await waitFor(() =>
      expect(vi.mocked(posponerPendiente).mock.calls[0]?.[1]).toMatchObject({
        motivo: 'Pidió que lo llamáramos mañana',
        nuevaHora: '09:30',
        version: OBJETIVO.version,
      }),
    );
  });
});
