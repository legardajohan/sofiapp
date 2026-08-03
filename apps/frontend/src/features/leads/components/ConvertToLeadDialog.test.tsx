import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConvertToLeadDialog } from './ConvertToLeadDialog.js';

const inicial = { nombre: 'Ana Pérez', telefono: '573001112233', correo: null };

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof ConvertToLeadDialog>> = {},
): { onSubmit: ReturnType<typeof vi.fn>; onOpenChange: ReturnType<typeof vi.fn> } {
  const onSubmit = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ConvertToLeadDialog
      open
      pending={false}
      inicial={inicial}
      duplicado={null}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { onSubmit, onOpenChange };
}

describe('ConvertToLeadDialog — pre-relleno desde la conversación', () => {
  it('llega con el nombre y el teléfono de la conversación', () => {
    renderDialog();

    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana Pérez');
    expect(screen.getByLabelText('Teléfono')).toHaveValue('573001112233');
  });

  it('usa el correo extraído por IA cuando existe', () => {
    renderDialog({ inicial: { ...inicial, correo: 'ana@empresa.com' } });

    expect(screen.getByLabelText(/Correo/)).toHaveValue('ana@empresa.com');
  });

  it('un contacto sin nombre deja el campo vacío para que el asesor lo escriba', () => {
    renderDialog({ inicial: { ...inicial, nombre: null } });

    expect(screen.getByLabelText('Nombre')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Crear lead' })).toBeDisabled();
  });
});

describe('ConvertToLeadDialog — pre-relleno desde la extracción con IA', () => {
  const extraidos = {
    nombre: 'Ana María Pérez Gómez',
    telefono: '573009998877',
    correo: 'ana@empresa.com',
  };

  it('los tres campos llegan con lo que extrajo la IA, y editables', async () => {
    renderDialog({ inicial: extraidos, fuente: 'ia' });

    const nombre = screen.getByLabelText('Nombre');
    expect(nombre).toHaveValue('Ana María Pérez Gómez');
    expect(screen.getByLabelText('Teléfono')).toHaveValue('573009998877');
    expect(screen.getByLabelText(/Correo/)).toHaveValue('ana@empresa.com');

    // Editable: el pre-relleno es un punto de partida, no un valor impuesto.
    expect(nombre).toBeEnabled();
    await userEvent.type(nombre, ' (papá)');
    expect(nombre).toHaveValue('Ana María Pérez Gómez (papá)');
  });

  it('mientras la ficha responde, el formulario espera en vez de sembrar valores que van a cambiar', () => {
    renderDialog({ inicial: extraidos, fuente: 'cargando' });

    expect(screen.getByLabelText('Nombre')).toBeDisabled();
    expect(screen.getByLabelText('Nombre')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Crear lead' })).toBeDisabled();
  });

  it('cuando la extracción llega tarde, siembra el formulario', () => {
    const { rerender } = render(
      <ConvertToLeadDialog
        open
        pending={false}
        inicial={inicial}
        fuente="cargando"
        duplicado={null}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    rerender(
      <ConvertToLeadDialog
        open
        pending={false}
        inicial={extraidos}
        fuente="ia"
        duplicado={null}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana María Pérez Gómez');
    expect(screen.getByLabelText(/Correo/)).toHaveValue('ana@empresa.com');
  });

  it('una ficha que llega después de escribir no pisa lo que el asesor tecleó', async () => {
    const props = {
      open: true,
      pending: false,
      duplicado: null,
      onOpenChange: vi.fn(),
      onSubmit: vi.fn(),
    };
    const { rerender } = render(
      <ConvertToLeadDialog {...props} inicial={inicial} fuente="conversacion" />,
    );

    const correo = screen.getByLabelText(/Correo/);
    await userEvent.type(correo, 'escrito@amano.com');

    rerender(<ConvertToLeadDialog {...props} inicial={extraidos} fuente="ia" />);

    expect(correo).toHaveValue('escrito@amano.com');
  });
});

describe('ConvertToLeadDialog — validación antes de enviar', () => {
  it('sin nombre no se puede crear', async () => {
    const { onSubmit } = renderDialog();

    await userEvent.clear(screen.getByLabelText('Nombre'));
    expect(screen.getByRole('button', { name: 'Crear lead' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('un teléfono demasiado corto no se puede enviar', async () => {
    renderDialog();

    const telefono = screen.getByLabelText('Teléfono');
    await userEvent.clear(telefono);
    await userEvent.type(telefono, '12345');

    expect(screen.getByRole('button', { name: 'Crear lead' })).toBeDisabled();
    expect(telefono).toHaveAttribute('aria-invalid', 'true');
  });

  it('envía los valores recortados y omite el correo vacío', async () => {
    const { onSubmit } = renderDialog();

    const nombre = screen.getByLabelText('Nombre');
    await userEvent.clear(nombre);
    await userEvent.type(nombre, '  Ana Pérez  ');
    await userEvent.click(screen.getByRole('button', { name: 'Crear lead' }));

    expect(onSubmit).toHaveBeenCalledWith({
      nombre: 'Ana Pérez',
      telefono: '573001112233',
    });
  });

  it('mientras crea, el botón lo dice y queda bloqueado', () => {
    renderDialog({ pending: true });

    expect(screen.getByRole('button', { name: 'Creando…' })).toBeDisabled();
  });
});

describe('ConvertToLeadDialog — teléfono duplicado', () => {
  it('el aviso se muestra sin cerrar el diálogo, para poder corregir', () => {
    const { onOpenChange } = renderDialog({
      duplicado: 'Ya existe un lead con ese teléfono. Corrígelo o abre el lead existente.',
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/Ya existe un lead con ese teléfono/);
    // El formulario sigue en pie y editable: no se cerró.
    expect(screen.getByLabelText('Teléfono')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('sin duplicado no hay aviso', () => {
    renderDialog();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
