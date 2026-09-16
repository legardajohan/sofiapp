import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BloqueoBorrado, EstadoDTO } from '../types.js';

interface Props {
  /** La etapa que se quiere eliminar. `null` cierra el diálogo. */
  etapa: EstadoDTO | null;
  /** El `409` del servidor, si ya se intentó y lo rechazó. */
  bloqueo: BloqueoBorrado | null;
  borrando: boolean;
  archivando: boolean;
  onOpenChange: (abierto: boolean) => void;
  onConfirmar: () => void;
  onArchivar: () => void;
  onVerLeads: () => void;
}

function plural(n: number): string {
  return n === 1 ? '1 lead' : `${n} leads`;
}

/**
 * Confirmación de borrado de una etapa, en sus tres desenlaces.
 *
 * Siempre se pide confirmación, incluso con la etapa vacía: borrar una columna del embudo no es un
 * gesto reversible y desde la lista no se ve a qué afecta.
 *
 * Cuando la etapa **tiene leads** el diálogo no se limita a negar: dice cuántos son, lleva a verlos
 * y ofrece archivarla, que es lo que resuelve el caso real —«esta etapa ya no la usamos»— sin dejar
 * a esos leads apuntando a una clave que nadie puede resolver. El conteo se conoce antes de pulsar
 * (`?uso=true`), así que el bloqueo se anuncia de entrada; `bloqueo` cubre además la carrera de que
 * entre la carga y el clic haya aterrizado un lead nuevo.
 */
export function EliminarEtapaDialog({
  etapa,
  bloqueo,
  borrando,
  archivando,
  onOpenChange,
  onConfirmar,
  onArchivar,
  onVerLeads,
}: Props): React.ReactElement {
  // Lo que diga el servidor manda sobre lo que traía el listado, que pudo quedarse viejo.
  const enUso = bloqueo?.motivo === 'en_uso' ? bloqueo.enUso : (etapa?.leads ?? 0);
  const esEntrada = bloqueo?.motivo === 'entrada';
  const bloqueada = esEntrada || enUso > 0;

  return (
    <AlertDialog open={etapa !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {bloqueada ? `No se puede eliminar «${etapa?.label}»` : `¿Eliminar «${etapa?.label}»?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {esEntrada ? (
              <>
                Es la etapa donde entran los leads que se convierten desde una conversación. Sin ella
                no habría dónde ponerlos, así que no se puede eliminar ni archivar. Sí puedes
                renombrarla y cambiarle el color.
              </>
            ) : enUso > 0 ? (
              <>
                Hay {plural(enUso)} en esta etapa. Muévelos a otra desde el tablero, o archívala:
                sale del embudo y de los filtros, pero esos leads siguen mostrando su nombre en vez
                de una clave en crudo.
              </>
            ) : (
              <>
                No hay ningún lead en esta etapa, así que desaparece del tablero sin dejar rastro.
                Los enlaces guardados que filtren por ella dejarán de encontrar resultados.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          {bloqueada ? (
            <>
              <AlertDialogCancel>Cerrar</AlertDialogCancel>
              {enUso > 0 && (
                <>
                  <Button variant="outline" onClick={onVerLeads}>
                    Ver {enUso === 1 ? 'el lead' : `los ${enUso} leads`}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={archivando}
                    onClick={onArchivar}
                    className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.97]"
                  >
                    {archivando ? 'Archivando…' : 'Archivar etapa'}
                  </Button>
                </>
              )}
            </>
          ) : (
            <>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={borrando}
                onClick={(e) => {
                  // El cierre lo decide la mutación: si el servidor rechaza el borrado, el diálogo
                  // se queda abierto y pasa a explicar el bloqueo en vez de desaparecer como si
                  // hubiera funcionado.
                  e.preventDefault();
                  onConfirmar();
                }}
                className={cn(
                  buttonVariants({ variant: 'destructive' }),
                  'transition-transform duration-150 ease-out motion-safe:active:scale-[0.97]',
                )}
              >
                {borrando ? 'Eliminando…' : 'Eliminar etapa'}
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
