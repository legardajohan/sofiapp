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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SUBROL_LABEL } from '@/lib/roles';
import { cn } from '@/lib/utils';
import type { ConversacionesAsignadas, MoverConversaciones, UserDTO } from '../types.js';

type Accion = MoverConversaciones['accion'];

interface Props {
  user: UserDTO | null;
  /** Respuesta 409 del primer intento: si llega, el diálogo pasa a preguntar qué hacer. */
  conflicto: ConversacionesAsignadas | null;
  /** Admins activos que pueden recibir las conversaciones (ya excluye al usuario). */
  destinos: UserDTO[];
  pending: boolean;
  onOpenChange: (abierto: boolean) => void;
  onConfirm: (conversaciones?: MoverConversaciones) => void;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/**
 * Desactivar a alguien tiene dos momentos. Primero, la confirmación de siempre. Si el backend
 * responde que tiene conversaciones asignadas (409), el mismo diálogo cambia a la decisión que
 * importa: a quién van esas conversaciones. Nada se desactiva hasta que el gestor elige; así ningún
 * cliente queda escribiéndole a alguien que ya no está.
 */
export function DeactivateUserDialog({
  user,
  conflicto,
  destinos,
  pending,
  onOpenChange,
  onConfirm,
}: Props): React.ReactElement {
  const id = useId();
  const [accion, setAccion] = useState<Accion>('reasignar');
  const [destinoId, setDestinoId] = useState('');

  useEffect(() => {
    if (!conflicto) return;
    // Sin nadie a quien reasignar, la única salida razonable es la bandeja.
    setAccion(destinos.length > 0 ? 'reasignar' : 'desasignar');
    setDestinoId('');
  }, [conflicto, destinos.length]);

  const falta = conflicto !== null && accion === 'reasignar' && !destinoId;

  function confirmar(): void {
    if (!conflicto) {
      onConfirm();
      return;
    }
    onConfirm(accion === 'reasignar' ? { accion, destinoId } : { accion: 'desasignar' });
  }

  const etiquetaBoton = pending
    ? 'Desactivando…'
    : !conflicto
      ? 'Desactivar'
      : accion === 'reasignar'
        ? 'Reasignar y desactivar'
        : 'Mover a la bandeja y desactivar';

  return (
    <AlertDialog open={user !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Desactivar a {user?.nombre}?</AlertDialogTitle>
          <AlertDialogDescription>
            {conflicto
              ? `Tiene ${plural(conflicto.asignadas, 'conversación asignada', 'conversaciones asignadas')}. Decide a dónde van antes de desactivarlo.`
              : 'Su sesión se cerrará en el acto y no podrá volver a entrar. Puedes reactivarlo cuando quieras.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {conflicto && (
          <div className="space-y-4">
            <RadioGroup
              value={accion}
              onValueChange={(v) => setAccion(v as Accion)}
              aria-label="Qué hacer con sus conversaciones"
              className="gap-2"
            >
              <Opcion
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
                    <SelectTrigger aria-label="Persona que recibe las conversaciones" className="mt-3 bg-background">
                      <SelectValue placeholder="Elige a quién" />
                    </SelectTrigger>
                    <SelectContent>
                      {destinos.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.nombre}
                          {d.subrol && (
                            <span className="text-muted-foreground"> · {SUBROL_LABEL[d.subrol]}</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Opcion>

              <Opcion
                id={`${id}-desasignar`}
                valor="desasignar"
                activa={accion === 'desasignar'}
                icono={<Inbox className="h-4 w-4" />}
                titulo="Moverlas a la bandeja sin asignar"
                detalle="Quedan disponibles para que cualquiera del equipo las tome."
              />
            </RadioGroup>

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

function Opcion({
  id,
  valor,
  activa,
  deshabilitada = false,
  icono,
  titulo,
  detalle,
  children,
}: {
  id: string;
  valor: Accion;
  activa: boolean;
  deshabilitada?: boolean;
  icono: React.ReactNode;
  titulo: string;
  detalle: string;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-3 transition-[border-color,background-color] duration-150 ease-out',
        activa ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-border bg-card',
        deshabilitada ? 'opacity-60' : !activa && 'hover:border-foreground/25',
      )}
    >
      <label
        htmlFor={id}
        className={cn('flex items-start gap-3', deshabilitada ? 'cursor-not-allowed' : 'cursor-pointer')}
      >
        <RadioGroupItem id={id} value={valor} disabled={deshabilitada} className="mt-0.5" />
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span className="text-muted-foreground" aria-hidden>
              {icono}
            </span>
            {titulo}
          </span>
          <span className="block text-sm text-muted-foreground">{detalle}</span>
        </span>
      </label>
      {children && <div className="pl-7">{children}</div>}
    </div>
  );
}
