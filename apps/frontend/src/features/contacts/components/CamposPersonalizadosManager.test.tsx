import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse } from 'axios';
import { archiveContactField, createContactField, fetchContactFields, updateContactField } from '../api.js';
import type { CampoContactoDTO } from '../types.js';
import { CamposPersonalizadosManager } from './CamposPersonalizadosManager.js';

vi.mock('../api.js', () => ({
  fetchContactFields: vi.fn(),
  createContactField: vi.fn(),
  updateContactField: vi.fn(),
  archiveContactField: vi.fn(),
}));

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

function montar(campos: CampoContactoDTO[] = [campo('colegio', 'Colegio'), campo('ciudad', 'Ciudad')]) {
  vi.mocked(fetchContactFields).mockResolvedValue(campos);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CamposPersonalizadosManager open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CamposPersonalizadosManager (HU-FLOW-05, criterio 18)', () => {
  it('lista los campos con su etiqueta y su clave (que se ve pero no se edita)', async () => {
    montar();
    expect(await screen.findByDisplayValue('Colegio')).toBeInTheDocument();
    expect(screen.getByText('colegio', { selector: 'code' })).toBeInTheDocument();
    expect(screen.getByText('ciudad', { selector: 'code' })).toBeInTheDocument();
  });

  it('sin campos, invita a crear el primero', async () => {
    montar([]);
    expect(await screen.findByText(/Aún no hay campos/)).toBeInTheDocument();
  });

  it('crea un campo con el nombre, el tipo y «sensible» elegidos', async () => {
    const user = userEvent.setup();
    vi.mocked(createContactField).mockResolvedValue(campo('presupuesto', 'Presupuesto'));
    montar();
    await screen.findByDisplayValue('Colegio');

    await user.type(screen.getByLabelText('Nuevo campo'), 'Presupuesto');
    await user.click(screen.getByRole('switch', { name: 'Sensible' }));
    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    await waitFor(() =>
      expect(createContactField).toHaveBeenCalledWith({ label: 'Presupuesto', tipoDato: 'texto', sensible: true }),
    );
  });

  it('Enter en el campo nuevo también lo crea', async () => {
    const user = userEvent.setup();
    vi.mocked(createContactField).mockResolvedValue(campo('beca', 'Beca'));
    montar();
    await screen.findByDisplayValue('Colegio');
    await user.type(screen.getByLabelText('Nuevo campo'), 'Beca{Enter}');
    await waitFor(() => expect(createContactField).toHaveBeenCalledTimes(1));
  });

  it.each([
    ['Email', /dato fijo/],
    ['colegio', /Ya existe/],
    ['CÓLEGIO', /Ya existe/],
  ])('«%s» se rechaza ANTES de enviar, con el motivo en el campo', async (nombre, mensaje) => {
    const user = userEvent.setup();
    montar();
    await screen.findByDisplayValue('Colegio');

    await user.type(screen.getByLabelText('Nuevo campo'), nombre);

    expect(screen.getByRole('alert')).toHaveTextContent(mensaje);
    expect(screen.getByRole('button', { name: 'Agregar' })).toBeDisabled();
    expect(createContactField).not.toHaveBeenCalled();
  });

  it('muestra en el campo el error del servidor (p. ej. duplicado que el editor no vio)', async () => {
    const user = userEvent.setup();
    vi.mocked(createContactField).mockRejectedValue(
      new AxiosError('x', '409', undefined, undefined, {
        status: 409,
        data: { message: 'Ya existe un campo con ese nombre.' },
      } as AxiosResponse),
    );
    montar();
    await screen.findByDisplayValue('Colegio');

    await user.type(screen.getByLabelText('Nuevo campo'), 'Beca');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un campo con ese nombre.');
  });

  it('renombrar guarda al salir del campo; un nombre reservado se revierte sin enviar nada', async () => {
    const user = userEvent.setup();
    vi.mocked(updateContactField).mockResolvedValue(campo('colegio', 'Institución'));
    montar();
    const input = await screen.findByLabelText('Nombre del campo Colegio');

    await user.clear(input);
    await user.type(input, 'Institución');
    await user.tab();
    await waitFor(() => expect(updateContactField).toHaveBeenCalledWith('f-colegio', { label: 'Institución' }));

    vi.mocked(updateContactField).mockClear();
    const otro = screen.getByLabelText('Nombre del campo Ciudad');
    await user.clear(otro);
    await user.type(otro, 'Correo');
    await user.tab();
    expect(updateContactField).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nombre del campo Ciudad')).toHaveValue('Ciudad');
  });

  it('cambiar «sensible» se guarda al momento', async () => {
    const user = userEvent.setup();
    vi.mocked(updateContactField).mockResolvedValue(campo('colegio', 'Colegio', { sensible: true }));
    montar();
    await user.click(await screen.findByRole('switch', { name: 'Colegio es sensible' }));
    await waitFor(() => expect(updateContactField).toHaveBeenCalledWith('f-colegio', { sensible: true }));
  });

  it('archivar pide confirmación EN la interfaz (no un `confirm()` del navegador) y luego archiva', async () => {
    const user = userEvent.setup();
    vi.mocked(archiveContactField).mockResolvedValue(undefined);
    const confirmar = vi.spyOn(window, 'confirm');
    montar();

    await user.click(await screen.findByRole('button', { name: 'Archivar el campo Colegio' }));
    expect(archiveContactField).not.toHaveBeenCalled(); // todavía no
    expect(screen.getByText(/los contactos que ya lo tienen lo conservan/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Archivar' }));
    await waitFor(() => expect(archiveContactField).toHaveBeenCalledWith('f-colegio'));
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('«No» cancela el archivado', async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole('button', { name: 'Archivar el campo Colegio' }));
    await user.click(screen.getByRole('button', { name: 'No' }));
    expect(archiveContactField).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Archivar el campo Colegio' })).toBeInTheDocument();
  });

  it('los archivados salen aparte y se pueden restaurar (crearlos de nuevo los reactiva)', async () => {
    const user = userEvent.setup();
    vi.mocked(createContactField).mockResolvedValue(campo('beca', 'Beca'));
    montar([campo('colegio', 'Colegio'), campo('beca', 'Beca', { activo: false, sensible: true })]);
    await screen.findByDisplayValue('Colegio');

    expect(screen.queryByText('Beca')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver archivados (1)' }));
    await user.click(screen.getByRole('button', { name: /Restaurar/ }));

    await waitFor(() =>
      expect(createContactField).toHaveBeenCalledWith({ label: 'Beca', tipoDato: 'texto', sensible: true }),
    );
  });

  it('un nombre que coincide con un campo ARCHIVADO se puede crear (lo reactiva)', async () => {
    const user = userEvent.setup();
    montar([campo('colegio', 'Colegio'), campo('beca', 'Beca', { activo: false })]);
    await screen.findByDisplayValue('Colegio');
    await user.type(screen.getByLabelText('Nuevo campo'), 'Beca');
    expect(screen.getByRole('button', { name: 'Agregar' })).toBeEnabled();
  });
});
