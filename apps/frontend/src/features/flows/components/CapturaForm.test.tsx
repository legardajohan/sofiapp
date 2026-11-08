import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fetchContactFields, fetchContactOptions } from '@/features/contacts/api';
import type { CampoContactoDTO, OpcionDTO, OpcionesPorTipo } from '@/features/contacts/types';
import { CapturaForm } from './CapturaForm.js';
import type { ConfigNodo } from '../types.js';

vi.mock('@/features/contacts/api', () => ({
  fetchContactFields: vi.fn(),
  fetchContactOptions: vi.fn(),
  createContactField: vi.fn(),
  updateContactField: vi.fn(),
  archiveContactField: vi.fn(),
}));

type Captura = Extract<ConfigNodo, { tipo: 'captura' }>;

const campo = (key: string, label: string, over: Partial<CampoContactoDTO> = {}): CampoContactoDTO => ({
  id: `f-${key}`,
  key,
  label,
  tipoDato: 'texto',
  sensible: false,
  orden: 0,
  activo: true,
  ...over,
});
const CAMPOS = [campo('colegio', 'Colegio'), campo('edad', 'Edad', { tipoDato: 'numero' })];

const rol = (key: string, label: string, activo = true): OpcionDTO => ({
  id: `o-${key}`,
  tipo: 'rol',
  key,
  label,
  color: '#475569',
  orden: 0,
  activo,
  esDefecto: true,
});
const OPCIONES: OpcionesPorTipo = {
  interes: [],
  objecion: [],
  rol: [rol('decisor', 'Decisor'), rol('usuario', 'Usuario'), rol('retirado', 'Retirado', false)],
};

const base: Captura = {
  tipo: 'captura',
  campo: 'grado',
  descripcion: 'Grado escolar',
  tipoDato: 'texto',
  pregunta: '¿En qué grado va?',
  reintentos: 1,
};

/** Dueño de estado real, como `NodeInspector`: sin él cada cambio se evalúa contra props que no se actualizan. */
function Controlado({ inicial, onCambio }: { inicial: Captura; onCambio: (c: Captura) => void }) {
  const [config, setConfig] = useState<Captura>(inicial);
  return (
    <CapturaForm
      config={config}
      onChange={(c) => {
        setConfig(c as Captura);
        onCambio(c as Captura);
      }}
    />
  );
}

function montar(inicial: Captura = base) {
  const onCambio = vi.fn<(c: Captura) => void>();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Controlado inicial={inicial} onCambio={onCambio} />
    </QueryClientProvider>,
  );
  const ultimo = (): Captura => onCambio.mock.calls.at(-1)![0];
  return { onCambio, ultimo };
}

async function elegirDestino(user: ReturnType<typeof userEvent.setup>, opcion: RegExp | string): Promise<void> {
  await user.click(screen.getByRole('combobox', { name: 'Guardar en' }));
  await user.click(await screen.findByRole('option', { name: opcion }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchContactFields).mockResolvedValue(CAMPOS);
  vi.mocked(fetchContactOptions).mockResolvedValue(OPCIONES);
});

describe('CapturaForm — «Guardar en» (HU-FLOW-05, criterio 17)', () => {
  it('por defecto (flujo legado) la respuesta se queda en una variable editable, sin interruptores', async () => {
    montar();
    expect(screen.getByRole('combobox', { name: 'Guardar en' })).toHaveTextContent('Variable del flujo');
    expect(screen.getByDisplayValue('grado')).not.toHaveAttribute('readonly');
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tipo de dato' })).toBeInTheDocument();
  });

  it('el desplegable agrupa: variable · dato del contacto · campos personalizados · crear', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('combobox', { name: 'Guardar en' }));
    for (const nombre of ['Variable del flujo', 'Nombre', 'Correo', 'Documento', 'Rol del contacto', 'Colegio', 'Edad', 'Crear campo…']) {
      expect(await screen.findByRole('option', { name: nombre })).toBeInTheDocument();
    }
  });

  it('elegir un dato del contacto fija el nombre de la variable y el tipo, y activa los dos interruptores', async () => {
    const user = userEvent.setup();
    const { ultimo } = montar();

    await elegirDestino(user, 'Nombre');

    expect(ultimo()).toMatchObject({
      destino: { tipo: 'contacto', campo: 'nombre' },
      campo: 'nombre',
      tipoDato: 'texto',
      saltarSiExiste: true,
      sobrescribir: false,
    });
    expect(screen.getByLabelText('Variable')).toHaveValue('var:nombre');
    expect(screen.getByLabelText('Variable')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Tipo de dato')).toHaveAttribute('readonly');
    expect(screen.getAllByRole('switch')).toHaveLength(2);
  });

  it('elegir un campo personalizado toma la clave y el tipo del catálogo', async () => {
    const user = userEvent.setup();
    const { ultimo } = montar();

    await elegirDestino(user, 'Edad');

    expect(ultimo()).toMatchObject({
      destino: { tipo: 'atributo', key: 'edad' },
      campo: 'edad',
      tipoDato: 'numero',
    });
    expect(screen.getByLabelText('Variable')).toHaveValue('var:edad');
    expect(screen.getByLabelText('Tipo de dato')).toHaveValue('Número');
  });

  it('los interruptores explican su efecto y cambian la config', async () => {
    const user = userEvent.setup();
    const { ultimo } = montar({ ...base, destino: { tipo: 'contacto', campo: 'nombre' }, campo: 'nombre', saltarSiExiste: true, sobrescribir: false });

    expect(screen.getByText(/no se lo vuelve a preguntar/)).toBeInTheDocument();
    expect(screen.getByText(/no se pisa/)).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Saltar la pregunta si ya lo tengo' }));
    expect(ultimo().saltarSiExiste).toBe(false);
    await user.click(screen.getByRole('switch', { name: 'Reemplazar el dato si ya existe' }));
    expect(ultimo().sobrescribir).toBe(true);
  });

  it('volver a «Variable del flujo» devuelve el nombre editable y quita los interruptores', async () => {
    const user = userEvent.setup();
    const { ultimo } = montar({ ...base, destino: { tipo: 'contacto', campo: 'nombre' }, campo: 'nombre', saltarSiExiste: true, sobrescribir: false });

    await elegirDestino(user, 'Variable del flujo');

    expect(ultimo().destino).toEqual({ tipo: 'variable' });
    expect(ultimo()).not.toHaveProperty('saltarSiExiste');
    expect(ultimo()).not.toHaveProperty('sobrescribir');
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('nombre')).not.toHaveAttribute('readonly');
  });

  it('con destino «Rol del contacto» muestra los roles ACTIVOS que reconocerá la IA', async () => {
    montar({ ...base, destino: { tipo: 'contacto', campo: 'rolContacto' }, campo: 'rolContacto' });
    expect(await screen.findByText('Decisor')).toBeInTheDocument();
    expect(screen.getByText('Usuario')).toBeInTheDocument();
    expect(screen.queryByText('Retirado')).not.toBeInTheDocument();
  });

  it('si el campo personalizado elegido ya no existe, avisa y no lo oculta', async () => {
    montar({ ...base, destino: { tipo: 'atributo', key: 'archivado' }, campo: 'archivado' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/«archivado» ya no está disponible/);
  });

  it('«Crear campo…» abre el gestor del catálogo', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('combobox', { name: 'Guardar en' }));
    await user.click(await screen.findByRole('option', { name: 'Crear campo…' }));
    expect(await screen.findByRole('heading', { name: 'Campos personalizados' })).toBeInTheDocument();
  });

  it('escribir la pregunta y lo esperado sigue funcionando como antes', async () => {
    const user = userEvent.setup();
    const { ultimo } = montar();
    const pregunta = screen.getByDisplayValue('¿En qué grado va?');
    await user.clear(pregunta);
    await user.type(pregunta, '¿Cuál es su correo?');
    await waitFor(() => expect(ultimo().pregunta).toBe('¿Cuál es su correo?'));
  });
});
