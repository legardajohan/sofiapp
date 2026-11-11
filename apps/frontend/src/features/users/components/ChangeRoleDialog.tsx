import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ROL_EMPRESA_LABEL } from '@/lib/roles';
import type { RolEmpresa } from '@/stores/authStore';
import type { MoverEquipo, UserDTO } from '../types.js';
import { TeamResolution } from './TeamResolution.js';

/** Cambio de rol de un coordinador con equipo que el backend frenó con un 409. */
export interface CambioRolPendiente {
  user: UserDTO;
  rolEmpresa: RolEmpresa;
  asesores: number;
}

interface Props {
  cambio: CambioRolPendiente | null;
  /** Coordinadores activos que pueden recibir el equipo (ya excluye al afectado). */
  coordinadores: UserDTO[];
  pending: boolean;
  onOpenChange: (abierto: boolean) => void;
  onConfirm: (equipo: MoverEquipo) => void;
}

/**
 * Un coordinador que deja de serlo no puede dejar a sus asesores colgando (AUTH-04). El formulario
 * envía el cambio de rol; si el backend responde que tiene equipo, este diálogo pregunta a dónde va
 * y reenvía el cambio con la decisión.
 */
export function ChangeRoleDialog({
  cambio,
  coordinadores,
  pending,
  onOpenChange,
  onConfirm,
}: Props): React.ReactElement {
  // Lo fija `TeamResolution` al montarse con cada cambio (su efecto reporta el valor inicial).
  const [equipo, setEquipo] = useState<MoverEquipo | null>(null);

  return (
    <AlertDialog open={cambio !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            ¿Cambiar a {cambio?.user.nombre} a {cambio ? ROL_EMPRESA_LABEL[cambio.rolEmpresa] : ''}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Al dejar de coordinar, su equipo necesita otro lugar. Su sesión se cerrará para que entre con
            los permisos nuevos.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {cambio && (
          <TeamResolution asesores={cambio.asesores} coordinadores={coordinadores} onChange={setEquipo} />
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button
            disabled={pending || equipo === null}
            onClick={() => equipo && onConfirm(equipo)}
            className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.97]"
          >
            {pending ? 'Guardando…' : 'Cambiar rol'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
