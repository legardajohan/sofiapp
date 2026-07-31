import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactEditDialog } from './ContactEditDialog.js';
import { updateContact } from '../api.js';
import type { ContactCardDTO } from '@/features/inbox/types';

vi.mock('../api.js', () => ({
  updateContact: vi.fn(),
  fetchNotas: vi.fn(),
  createNota: vi.fn(),
}));

const mockUpdate = vi.mocked(updateContact);

function contacto(over: Partial<ContactCardDTO> = {}): ContactCardDTO {
  return {
    id: 'c-1',
    nombre: 'Andrés Quintero',
    telefono: '573006667788',
    canalOrigen: 'whatsapp',
    estadoComercial: 'en_gestion',
    nivelInteres: 'caliente',
    objecionPrincipal: null,
    rolContacto: 'decisor',
    tags: [],
    asesorId: null,
    ultimoMensajeAt: '2026-07-27T12:00:00.000Z',
    createdAt: '2026-07-24T12:00:00.000Z',
    correo: null,
    documento: null,
    atributos: [],
    puedeVerSensibles: true,
    ...over,
  };
}

function renderDialog(c: ContactCardDTO = contacto()): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ContactEditDialog contacto={c} open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('ContactEditDialog (HU-CRM-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue(contacto());
  });

  it('guardar está deshabilitado mientras no haya cambios', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('se habilita al editar y manda SOLO los campos que cambiaron', async () => {
    const user = userEvent.setup();
    renderDialog();

    const nombre = screen.getByLabelText('Nombre');
    await user.clear(nombre);
    await user.type(nombre, 'Ana Gómez');

    const boton = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(boton).toBeEnabled();
    await user.click(boton);

    // Ni `nivelInteres` ni `rolContacto` viajan: no se tocaron.
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('c-1', { nombre: 'Ana Gómez' }));
  });

  it('vaciar un campo lo manda como null explícito, no como cadena vacía', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(screen.getByLabelText('Nombre'));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('c-1', { nombre: null }));
  });

  it('sin permiso, correo y documento quedan deshabilitados y se explica por qué', () => {
    renderDialog(
      contacto({ puedeVerSensibles: false, correo: 'd••••@empresa.com', documento: '••••1234' }),
    );

    expect(screen.getByLabelText(/Correo/)).toBeDisabled();
    expect(screen.getByLabelText(/Documento/)).toBeDisabled();
    expect(screen.getByText(/Solo Dirección y Gerencia/)).toBeInTheDocument();
  });

  it('sin permiso, el valor enmascarado NO se siembra en el input', () => {
    // Sembrarlo guardaría los puntos como si fueran el correo real.
    renderDialog(contacto({ puedeVerSensibles: false, correo: 'd••••@empresa.com' }));
    expect(screen.getByLabelText(/Correo/)).toHaveValue('');
  });

  it('sin permiso, editar el nombre sigue funcionando y no arrastra los sensibles', async () => {
    const user = userEvent.setup();
    renderDialog(contacto({ puedeVerSensibles: false, correo: 'd••••@empresa.com' }));

    await user.clear(screen.getByLabelText('Nombre'));
    await user.type(screen.getByLabelText('Nombre'), 'Solo nombre');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('c-1', { nombre: 'Solo nombre' }));
  });

  it('un atributo sensible existente no es editable sin permiso', () => {
    renderDialog(
      contacto({
        puedeVerSensibles: false,
        atributos: [{ key: 'eps', label: 'EPS', valor: '••••••', sensible: true, oculto: true }],
      }),
    );

    expect(screen.getByLabelText('Nombre del atributo 1')).toBeDisabled();
    expect(screen.getByLabelText(/Quitar el atributo/)).toBeDisabled();
  });

  it('agrega un atributo y deriva su clave del nombre', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Agregar atributo' }));
    await user.type(screen.getByLabelText('Nombre del atributo 1'), 'Colegio');
    await user.type(screen.getByLabelText(/Valor del atributo/), 'San José');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('c-1', {
        atributos: [{ key: 'colegio', label: 'Colegio', valor: 'San José', sensible: false }],
      }),
    );
  });
});
