import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactEditDialog } from './ContactEditDialog.js';
import {
  createContactOption,
  deleteContactOption,
  fetchContactOptions,
  updateContact,
  updateContactOption,
} from '../api.js';
import type { OpcionDTO, OpcionesPorTipo } from '../types.js';
import type { ContactCardDTO, DatosExtraidosDTO } from '@/features/inbox/types';

vi.mock('../api.js', () => ({
  updateContact: vi.fn(),
  fetchNotas: vi.fn(),
  createNota: vi.fn(),
  fetchContactOptions: vi.fn(),
  createContactOption: vi.fn(),
  updateContactOption: vi.fn(),
  deleteContactOption: vi.fn(),
}));

const mockUpdate = vi.mocked(updateContact);
const mockOpciones = vi.mocked(fetchContactOptions);
const mockCrearOpcion = vi.mocked(createContactOption);
const mockBorrarOpcion = vi.mocked(deleteContactOption);

/** Catálogos de fábrica del tenant, tal como los devuelve `GET /api/opciones-contacto`. */
function opcion(over: Partial<OpcionDTO> & Pick<OpcionDTO, 'tipo' | 'key' | 'label'>): OpcionDTO {
  return {
    id: `o-${over.key}`,
    color: '#475569',
    orden: 0,
    activo: true,
    esDefecto: true,
    ...over,
  };
}

const OPCIONES: OpcionesPorTipo = {
  interes: [
    opcion({ tipo: 'interes', key: 'frio', label: 'Frío' }),
    opcion({ tipo: 'interes', key: 'tibio', label: 'Tibio' }),
    opcion({ tipo: 'interes', key: 'caliente', label: 'Caliente' }),
  ],
  objecion: [
    opcion({ tipo: 'objecion', key: 'precio', label: 'Precio' }),
    opcion({ tipo: 'objecion', key: 'otra', label: 'Otra' }),
  ],
  rol: [
    opcion({ tipo: 'rol', key: 'decisor', label: 'Decisor' }),
    opcion({ tipo: 'rol', key: 'usuario', label: 'Usuario' }),
  ],
};

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
    leadId: null,
    correo: null,
    documento: null,
    atributos: [],
    puedeVerSensibles: true,
    ...over,
  };
}

function extraidos(over: Partial<DatosExtraidosDTO> = {}): DatosExtraidosDTO {
  return {
    nombreCompleto: 'Andrés Felipe Quintero',
    correo: 'andres@empresa.com',
    telefono: '573006667788',
    telefonoOrigen: 'conversacion',
    extraidoAt: '2026-07-28T12:00:00.000Z',
    ...over,
  };
}

function renderDialog(
  c: ContactCardDTO = contacto(),
  datosExtraidos: DatosExtraidosDTO | null = null,
): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ContactEditDialog
        contacto={c}
        datosExtraidos={datosExtraidos}
        open
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

// Los tres desplegables se pueblan desde el catálogo del tenant, así que TODO test de este
// diálogo necesita la respuesta del catálogo, no solo los que lo gestionan.
beforeEach(() => {
  vi.clearAllMocks();
  mockUpdate.mockResolvedValue(contacto());
  mockOpciones.mockResolvedValue(OPCIONES);
});

describe('ContactEditDialog (HU-CRM-02)', () => {

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
    renderDialog(contacto({ correo: 'andres@empresa.com' }));

    await user.clear(screen.getByLabelText(/Correo/));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('c-1', { correo: null }));
  });

  it('edita el teléfono y lo manda en el parche', async () => {
    const user = userEvent.setup();
    renderDialog();

    const telefono = screen.getByLabelText('Teléfono');
    await user.clear(telefono);
    await user.type(telefono, '573009998877');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('c-1', { telefono: '573009998877' }),
    );
  });

  it('avisa si el teléfono trae «+» o separadores antes de enviarlo', async () => {
    const user = userEvent.setup();
    renderDialog();

    const telefono = screen.getByLabelText('Teléfono');
    await user.clear(telefono);
    await user.type(telefono, '+57 300 111');

    expect(screen.getByText(/Solo dígitos, con indicativo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('no deja vaciar el teléfono', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(screen.getByLabelText('Teléfono'));

    expect(screen.getByText('El teléfono no puede quedar vacío.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('no deja vaciar el nombre: se corrige, no se borra', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(screen.getByLabelText('Nombre'));

    expect(screen.getByText('El nombre no puede quedar vacío.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('un contacto que nunca tuvo nombre puede seguir sin él', async () => {
    // Los contactos que llegan por WhatsApp sin nombre no pueden quedar bloqueados para editar
    // cualquier otro campo de la ficha.
    const user = userEvent.setup();
    renderDialog(contacto({ nombre: null, correo: 'andres@empresa.com' }));

    await user.clear(screen.getByLabelText(/Correo/));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('c-1', { correo: null }));
  });

  it('avisa de un correo mal escrito antes de gastar la petición', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/Correo/), 'ana@');

    expect(screen.getByText(/Escribe un correo válido/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    expect(mockUpdate).not.toHaveBeenCalled();
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

  it('rechaza dos atributos con el mismo nombre, aunque cambie la caja', async () => {
    const user = userEvent.setup();
    renderDialog(
      contacto({
        atributos: [
          { key: 'colegio', label: 'Colegio', valor: 'San José', sensible: false, oculto: false },
        ],
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Agregar atributo' }));
    await user.type(screen.getByLabelText('Nombre del atributo 2'), 'colegio');
    await user.type(screen.getByLabelText('Valor del atributo colegio'), 'La Salle');

    expect(screen.getByText(/Ya hay un atributo llamado "Colegio"/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('una fila a medio llenar se avisa en vez de descartarse en silencio', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Agregar atributo' }));
    await user.type(screen.getByLabelText('Nombre del atributo 1'), 'Colegio');

    expect(screen.getByText('Ponle un valor o quita el atributo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('mientras guarda avisa, se bloquea y no admite un segundo clic', async () => {
    const user = userEvent.setup();
    // La promesa no resuelve: deja el botón congelado en su estado de envío.
    mockUpdate.mockReturnValue(new Promise(() => {}));
    renderDialog();

    await user.type(screen.getByLabelText('Nombre'), ' Jr.');
    const boton = screen.getByRole('button', { name: 'Guardar cambios' });
    await user.click(boton);

    const guardando = await screen.findByRole('button', { name: /Guardando/ });
    expect(guardando).toBeDisabled();

    await user.click(guardando);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('si el guardado falla, el diálogo sigue abierto y conserva lo escrito', async () => {
    const user = userEvent.setup();
    mockUpdate.mockRejectedValue(new Error('sin red'));
    renderDialog();

    await user.type(screen.getByLabelText('Nombre'), ' Jr.');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Lo que escribiste sigue aquí/);
    expect(screen.getByLabelText('Nombre')).toHaveValue('Andrés Quintero Jr.');
  });
});

// ─── CRUD de los catálogos de interés / objeción / rol ──────────────────────────

describe('ContactEditDialog — gestión de las opciones del tenant', () => {
  /** Abre el panel de gestión de un catálogo y espera a que el catálogo haya cargado. */
  async function abrirGestor(nombre: string): Promise<void> {
    const user = userEvent.setup();
    const boton = await screen.findByRole('button', { name: `Gestionar las opciones de ${nombre}` });
    await waitFor(() => expect(boton).toBeEnabled());
    await user.click(boton);
  }

  it('lista las opciones del catálogo, no una lista fija en el código', async () => {
    renderDialog();
    await abrirGestor('interés');

    expect(screen.getByLabelText('Nombre de la opción Frío')).toHaveValue('Frío');
    expect(screen.getByLabelText('Nombre de la opción Caliente')).toHaveValue('Caliente');
    // Las de otro catálogo no se cuelan en este panel.
    expect(screen.queryByLabelText('Nombre de la opción Precio')).not.toBeInTheDocument();
  });

  it('agrega una opción nueva', async () => {
    const user = userEvent.setup();
    mockCrearOpcion.mockResolvedValue(
      opcion({ tipo: 'interes', key: 'muy-interesado', label: 'Muy interesado', esDefecto: false }),
    );

    renderDialog();
    await abrirGestor('interés');

    await user.type(screen.getByLabelText('Nueva opción de interés'), 'Muy interesado');
    // Nombre exacto: `/Agregar/` también casaría con "Agregar atributo", que es otro botón del
    // mismo formulario.
    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    // El color viaja desde el alta: por defecto el gris de fábrica, no un color con significado.
    await waitFor(() =>
      expect(mockCrearOpcion).toHaveBeenCalledWith('interes', 'Muy interesado', '#475569'),
    );
  });

  it('crea la opción con el color elegido en la gama', async () => {
    const user = userEvent.setup();
    mockCrearOpcion.mockResolvedValue(
      opcion({ tipo: 'interes', key: 'urgente', label: 'Urgente', esDefecto: false }),
    );

    renderDialog();
    await abrirGestor('interés');

    await user.click(screen.getByRole('button', { name: /Color de la nueva opción de interés/ }));
    await user.click(await screen.findByRole('button', { name: 'Rojo' }));
    await user.type(screen.getByLabelText('Nueva opción de interés'), 'Urgente');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    await waitFor(() =>
      expect(mockCrearOpcion).toHaveBeenCalledWith('interes', 'Urgente', '#DC2626'),
    );
  });

  it('recolorea una opción existente al instante', async () => {
    const user = userEvent.setup();
    renderDialog();
    await abrirGestor('interés');

    await user.click(screen.getByRole('button', { name: /Color de Frío/ }));
    await user.click(await screen.findByRole('button', { name: 'Azul' }));

    await waitFor(() =>
      expect(vi.mocked(updateContactOption)).toHaveBeenCalledWith('o-frio', {
        color: '#2563EB',
      }),
    );
  });

  it('renombra una opción al salir del campo, sin tocar su clave', async () => {
    const user = userEvent.setup();
    renderDialog();
    await abrirGestor('interés');

    const input = screen.getByLabelText('Nombre de la opción Frío');
    await user.clear(input);
    await user.type(input, 'Sin interés');
    await user.tab();

    // Solo viaja el `label`: la clave `frio` es lo que llevan grabado los contactos.
    await waitFor(() =>
      expect(vi.mocked(updateContactOption)).toHaveBeenCalledWith('o-frio', {
        label: 'Sin interés',
      }),
    );
  });

  it('vaciar el nombre revierte en vez de borrar', async () => {
    const user = userEvent.setup();
    renderDialog();
    await abrirGestor('interés');

    const input = screen.getByLabelText('Nombre de la opción Tibio');
    await user.clear(input);
    await user.tab();

    expect(input).toHaveValue('Tibio');
    expect(vi.mocked(updateContactOption)).not.toHaveBeenCalled();
  });

  it('elimina una opción', async () => {
    const user = userEvent.setup();
    mockBorrarOpcion.mockResolvedValue({ eliminada: true, enUso: 0, opcion: null });

    renderDialog();
    await abrirGestor('objeción');
    await user.click(screen.getByRole('button', { name: 'Eliminar la opción Precio de objeción' }));

    await waitFor(() => expect(mockBorrarOpcion).toHaveBeenCalledWith('o-precio'));
  });

  it('una opción archivada se puede restaurar y no ensucia la lista activa', async () => {
    const user = userEvent.setup();
    mockOpciones.mockResolvedValue({
      ...OPCIONES,
      objecion: [
        ...OPCIONES.objecion,
        opcion({ tipo: 'objecion', key: 'tiempo', label: 'Tiempo', activo: false }),
      ],
    });

    renderDialog();
    await abrirGestor('objeción');

    // Archivada: fuera de la lista editable hasta que se pide verla.
    expect(screen.queryByLabelText('Nombre de la opción Tiempo')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Ver 1 archivada/ }));
    await user.click(screen.getByRole('button', { name: /Restaurar/ }));

    await waitFor(() =>
      expect(vi.mocked(updateContactOption)).toHaveBeenCalledWith('o-tiempo', { activo: true }),
    );
  });
});

// ─── Pre-relleno desde la extracción por IA ─────────────────────────────────────

describe('ContactEditDialog — propone los datos que la IA ya extrajo', () => {
  it('rellena los campos vacíos con lo extraído y los deja editables', async () => {
    const user = userEvent.setup();
    renderDialog(contacto({ nombre: null, correo: null }), extraidos());

    const nombre = screen.getByLabelText('Nombre');
    const correo = screen.getByLabelText(/Correo/);
    expect(nombre).toHaveValue('Andrés Felipe Quintero');
    expect(correo).toHaveValue('andres@empresa.com');
    // Propuesta, no imposición: se puede reescribir encima.
    expect(nombre).toBeEnabled();
    await user.clear(correo);
    await user.type(correo, 'otro@empresa.com');
    expect(correo).toHaveValue('otro@empresa.com');
  });

  it('NO pisa un dato que el asesor ya tenía guardado', async () => {
    renderDialog(contacto({ nombre: 'Nombre Guardado', correo: 'guardado@empresa.com' }), extraidos());

    expect(screen.getByLabelText('Nombre')).toHaveValue('Nombre Guardado');
    expect(screen.getByLabelText(/Correo/)).toHaveValue('guardado@empresa.com');
    // Nada que adoptar: el formulario abre sin cambios pendientes.
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('guardar adopta la propuesta y la manda al backend', async () => {
    const user = userEvent.setup();
    renderDialog(contacto({ nombre: null, correo: null }), extraidos());

    // Hay cambios pendientes sin haber tecleado: son los valores propuestos.
    const boton = screen.getByRole('button', { name: 'Guardar cambios' });
    expect(boton).toBeEnabled();
    await user.click(boton);

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('c-1', {
        nombre: 'Andrés Felipe Quintero',
        correo: 'andres@empresa.com',
      }),
    );
  });

  it('avisa de qué campos son propuesta de la IA', () => {
    renderDialog(contacto({ nombre: null, correo: null }), extraidos());

    // Sin el aviso, el botón habilitado sin tocar nada parecería un error.
    expect(screen.getByText(/vienen de la extracción por IA/i)).toBeInTheDocument();
    expect(screen.getAllByText('Propuesto por la IA')).toHaveLength(2);
  });

  it('solo marca el campo que realmente rellenó', () => {
    renderDialog(contacto({ nombre: 'Ya tenía nombre', correo: null }), extraidos());

    expect(screen.getAllByText('Propuesto por la IA')).toHaveLength(1);
    expect(screen.getByLabelText(/Correo/)).toHaveValue('andres@empresa.com');
  });

  it('sin extracción se comporta como antes: nada propuesto', () => {
    renderDialog(contacto({ nombre: null, correo: null }), null);

    expect(screen.getByLabelText('Nombre')).toHaveValue('');
    expect(screen.queryByText('Propuesto por la IA')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('un correo extraído que llega enmascarado NO se propone', () => {
    // Sin permiso de sensibles el backend enmascara también `datosExtraidos.correo`; sembrarlo
    // guardaría los puntos como si fueran el correo real.
    renderDialog(
      contacto({ nombre: null, correo: null, puedeVerSensibles: false }),
      extraidos({ correo: 'a••••@empresa.com' }),
    );

    expect(screen.getByLabelText(/Correo/)).toHaveValue('');
    // El nombre no es sensible: ese sí se propone.
    expect(screen.getByLabelText('Nombre')).toHaveValue('Andrés Felipe Quintero');
  });
});
