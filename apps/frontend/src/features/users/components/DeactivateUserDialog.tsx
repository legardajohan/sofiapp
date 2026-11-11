import { useEffect, useId, useState } from 'react';
import { Inbox, UserRoundCheck, Workflow } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RadioGroup } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ROL_EMPRESA_LABEL } from '@/lib/roles';
import type {
  DependenciasUsuario,
  MoverConversaciones,
  MoverEquipo,
  SetUserEstadoPayload,
  UserDTO,
} from '../types.js';
import { OpcionCard } from './OpcionCard.js';
import { TeamResolution } from './TeamResolution.js';

type Accion = MoverConversaciones['accion'];

interface Props {
  user: UserDTO | null;
  /** Respuesta 409 del primer intento: si llega, el diálogo pasa a preguntar qué hacer. */
  conflicto: DependenciasUsuario | null;
  /** Usuarios activos que pueden recibir las conversaciones (ya excluye al usuario). */
  destinos: UserDTO[];
  /** Coordinadores activos que pueden recibir su equipo (ya excluye al usuario). */
  coordinadores: UserDTO[];
  pending: boolean;
  onOpenChange: (abierto: boolean) => void;
  onConfirm: (resolucion: Omit<SetUserEstadoPayload, 'activo'>) => void;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

function resumen(c: DependenciasUsuario): string {
  const partes: string[] = [];
  if (c.asignadas > 0) partes.push(plural(c.asignadas, 'conversación asignada', 'conversaciones asignadas'));
  if (c.asesores > 0) partes.push(plural(c.asesores, 'asesor a su cargo', 'asesores a su cargo'));
  return `Tiene ${partes.join(' y ')}. Decide qué pasa antes de desactivarlo.`;
}

/**
 * Desactivar a alguien tiene dos momentos. Primero, la confirmación de siempre. Si el backend
 * responde que tiene conversaciones asignadas o, siendo coordinador, asesores a su cargo (409), el
 * mismo diálogo cambia a esas decisiones. Nada se desactiva hasta que el gestor elige; así ningún
 * cliente le escribe a alguien que ya no está y ningún asesor depende de un coordinador inactivo.
 */
export function DeactivateUserDialog({
  user,
  conflicto,
  destinos,
  coordinadores,
  pending,
  onOpenChange,
  onConfirm,
}: Props): React.ReactElement {
  const id = useId();
  const [accion, setAccion] = useState<Accion>('reasignar');
  const [destinoId, setDestinoId] = useState('');
  const [equipo, setEquipo] = useState<MoverEquipo | null>(null);

  useEffect(() => {
    if (!conflicto) return;
    // Sin nadie a quien reasignar, la única salida razonable es la bandeja.
    setAccion(destinos.length > 0 ? 'reasignar' : 'desasignar');
    setDestinoId('');
    // `equipo` no se reinicia aquí: `TeamResolution` se monta con el conflicto y reporta su valor
    // inicial en su propio efecto, que corre ANTES que este (los efectos del hijo van primero).
  }, [conflicto, destinos.length]);

  const pideConversaciones = (conflicto?.asignadas ?? 0) > 0;
  const pideEquipo = (conflicto?.asesores ?? 0) > 0;
  const falta =
    (pideConversaciones && accion === 'reasignar' && !destinoId) || (pideEquipo && equipo === null);

  function confirmar(): void {
    if (!conflicto) {
      onConfirm({});
      return;
    }
    onConfirm({
      ...(pideConversaciones
        ? {
            conversaciones:
              accion === 'reasignar' ? { accion, destinoId } : { accion: 'desasignar' as const },
          }
        : {}),
      ...(pideEquipo && equipo ? { equipo } : {}),
    });
  }

  const etiquetaBoton = pending
    ? 'Desactivando…'
    : !conflicto
      ? 'Desactivar'
      : 'Aplicar y desactivar';

  return (
    <AlertDialog open={user !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Desactivar a {user?.nombre}?</AlertDialogTitle>
          <AlertDialogDescription>
            {conflicto
              ? resumen(conflicto)
              : 'Su sesión se cerrará en el acto y no podrá volver a entrar. Puedes reactivarlo cuando quieras.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {conflicto && (
          <div className="space-y-5">
            {pideConversaciones && (
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium text-foreground">
                  {plural(conflicto.asignadas, 'conversación asignada', 'conversaciones asignadas')}
                </legend>
                <RadioGroup
                  value={accion}
                  onValueChange={(v) => setAccion(v as Accion)}
                  aria-label="Qué hacer con sus conversaciones"
                  className="gap-2"
                >
                  <OpcionCard
                    id={`${id}-reasignar`}
                    valor="reasignar"
                    activa={accion === 'reasignar'}
                    deshabilitada={destinos.length === 0}
                    icono={<UserRoundCheck className="h-4 w-4" />}
                    titulo="Reasignarlas a otra persona"
                    detalle={
                      destinos.length === 0
                        ? 'No hay otros usuarios activos que puedan recibirlas.'
                        : 'Siguen atendidas sin pasar por la bandeja.'
                    }
                  >
                    {accion === 'reasignar' && destinos.length > 0 && (
                      <Select value={destinoId} onValueChange={setDestinoId}>
                        <SelectTrigger
                          aria-label="Persona que recibe las conversaciones"
                          className="mt-3 bg-background"
                        >
                          <SelectValue placeholder="Elige a quién" />
                        </SelectTrigger>
                        <SelectContent>
                          {destinos.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.nombre}
                              {d.rolEmpresa && (
                                <span className="text-muted-foreground">
                                  {' '}
                                  · {ROL_EMPRESA_LABEL[d.rolEmpresa]}
                                </span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </OpcionCard>

                  <OpcionCard
                    id={`${id}-desasignar`}
                    valor="desasignar"
                    activa={accion === 'desasignar'}
                    icono={<Inbox className="h-4 w-4" />}
                    titulo="Moverlas a la bandeja sin asignar"
                    detalle="Quedan disponibles para que cualquiera del equipo las tome."
                  />
                </RadioGroup>
              </fieldset>
            )}

            {pideEquipo && (
              <TeamResolution
                asesores={conflicto.asesores}
                coordinadores={coordinadores}
                onChange={setEquipo}
              />
            )}

            {conflicto.flujos > 0 && (
              <Alert>
                <Workflow className="h-4 w-4" />
                <AlertDescription>
                  También aparece en {plural(conflicto.flujos, 'flujo', 'flujos')}. Esos pasos dejarán la
                  conversación sin asignar hasta que edites el flujo.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          {/* `Button` y no `AlertDialogAction`: este último cierra el diálogo al pulsarlo, y aquí el
              cierre lo decide la respuesta — un 409 tiene que dejarlo abierto con la pregunta. */}
          <Button
            variant="destructive"
            disabled={pending || falta}
            onClick={confirmar}
            className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.97]"
          >
            {etiquetaBoton}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
