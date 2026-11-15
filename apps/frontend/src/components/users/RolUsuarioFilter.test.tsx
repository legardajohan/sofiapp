import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { UserDTO } from '@/features/users/types';
import type { FiltroRolUsuario } from '@/lib/grupos-usuarios';
import { RolUsuarioFilter } from './RolUsuarioFilter';

// AUTH-06 (ajuste) — filtro «rol + persona» de reportes y «Ver asignación».

function u(id: string, nombre: string, rolEmpresa: UserDTO['rolEmpresa'], extra: Partial<UserDTO> = {}): UserDTO {
  return {
    id,
    tenantId: 't',
    nombre,
    email: `${id}@x.co`,
    rol: 'admin',
    rolEmpresa,
    coordinadorId: null,
    activo: true,
    esPrincipal: false,
    puedeGestionarAdministradores: false,
    ...extra,
  };
}

const CARLA = u('aaaaaaaaaaaaaaaaaaaaaaa1', 'Carla', 'coordinador');
const USUARIOS: UserDTO[] = [
  u('aaaaaaaaaaaaaaaaaaaaaaa0', 'Alba', 'administrador', { esPrincipal: true }),
  CARLA,
  u('aaaaaaaaaaaaaaaaaaaaaaa2', 'Ana', 'asesor', { coordinadorId: CARLA.id }),
  u('aaaaaaaaaaaaaaaaaaaaaaa3', 'Beto', 'asesor'),
];

function Montar({ onChange }: { onChange: (v: FiltroRolUsuario) => void }): React.ReactElement {
  const [v, setV] = useState<FiltroRolUsuario>({ grupo: undefined, persona: undefined });
  return (
    <RolUsuarioFilter
      idPrefix="t"
      value={v}
      onChange={(n) => {
        setV(n);
        onChange(n);
      }}
      usuarios={USUARIOS}
      etiquetaTodos="Toda la empresa"
    />
  );
}

describe('RolUsuarioFilter', () => {
  it('la persona se habilita al elegir un rol y lista solo a los de ese rol', async () => {
    const onChange = vi.fn();
    render(<Montar onChange={onChange} />);
    expect(screen.getByLabelText('Persona')).toBeDisabled();

    await userEvent.click(screen.getByLabelText('Quiénes'));
    await userEvent.click(await screen.findByRole('option', { name: 'Asesores' }));
    expect(onChange).toHaveBeenLastCalledWith({ grupo: 'rol:asesor', persona: undefined });
    expect(screen.getByLabelText('Persona')).toBeEnabled();

    await userEvent.click(screen.getByLabelText('Persona'));
    expect(await screen.findByRole('option', { name: 'Ana' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Beto' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Carla' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: 'Beto' }));
    expect(onChange).toHaveBeenLastCalledWith({ grupo: 'rol:asesor', persona: USUARIOS[3]!.id });
  });

  it('el grupo de un coordinador lo incluye a él y a sus asesores; cambiar de rol limpia la persona', async () => {
    const onChange = vi.fn();
    render(<Montar onChange={onChange} />);

    await userEvent.click(screen.getByLabelText('Quiénes'));
    await userEvent.click(await screen.findByRole('option', { name: 'Grupo de Carla' }));
    await userEvent.click(screen.getByLabelText('Persona'));
    expect(await screen.findByRole('option', { name: 'Carla' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ana' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Beto' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: 'Ana' }));

    await userEvent.click(screen.getByLabelText('Quiénes'));
    await userEvent.click(await screen.findByRole('option', { name: 'Toda la empresa' }));
    expect(onChange).toHaveBeenLastCalledWith({ grupo: undefined, persona: undefined });
    expect(screen.getByLabelText('Persona')).toBeDisabled();
  });
});
