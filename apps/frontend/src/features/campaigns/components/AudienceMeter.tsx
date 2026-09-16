import { AlertTriangle, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { ETIQUETA_CALIDAD, etiquetaTier, formatearNumero, plazoLegible } from '../lib/pacing.js';
import type { PresupuestoDTO } from '../types.js';

interface Props {
  /** Cuánta gente cae en el segmento. */
  destinatarios: number;
  presupuesto: PresupuestoDTO;
  className?: string;
}

/** Fracción del cupo del día, acotada a [0,1] para que un desbordamiento no se salga de la barra. */
function fraccion(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, parte / total));
}

/**
 * Cuánto cupo tiene hoy el número y cuánto de él se lleva esta campaña.
 *
 * Es la pieza que justifica toda la pantalla. Una campaña no se decide por "¿a cuánta gente llego?"
 * sino por "¿me cabe hoy, y si no, cuántos días tardo?" — y esa segunda pregunta no se puede
 * responder con un contador de destinatarios suelto.
 *
 * Por eso la barra no mide el segmento: mide **el día del número**. El largo total es el cupo
 * diario, y dentro se ven las tres partes que compiten por él: lo que ya se gastó en las últimas
 * 24 h (recordatorios, envíos manuales), lo que se llevaría esta campaña, y lo que sobra. Un
 * segmento de 5 000 personas sobre un cupo de 800 se lee de un vistazo como lo que es: seis días
 * de envío, no un número grande y feliz.
 */
export function AudienceMeter({ destinatarios, presupuesto, className }: Props): React.ReactElement {
  const { limiteDiario, consumido24h, disponible, bloqueado, motivoBloqueo } = presupuesto;

  // Lo que esta campaña alcanzaría HOY: lo que quepa en el cupo que queda.
  const hoy = Math.min(destinatarios, disponible);
  const fracConsumido = fraccion(consumido24h, limiteDiario);
  const fracCampana = fraccion(hoy, limiteDiario);
  const excede = destinatarios > disponible;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-2xl font-semibold tabular-nums text-foreground">
          {formatearNumero(destinatarios)}{' '}
          <span className="text-sm font-normal text-muted-foreground">
            {destinatarios === 1 ? 'contacto' : 'contactos'}
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          {bloqueado ? 'Sin cupo hoy' : plazoLegible(destinatarios, limiteDiario)}
        </p>
      </div>

      {/*
        Barra de capacidad del día. Las capas se mueven con `transform` y no con `width` para que
        el cambio no dispare relayout, y se anclan a la izquierda con `origin-left`: la del gasto
        previo crece desde el principio del día, y la de la campaña arranca justo donde acaba.
      */}
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Cupo diario: ${formatearNumero(consumido24h)} ya usados y ${formatearNumero(
          hoy,
        )} de esta campaña, sobre ${formatearNumero(limiteDiario)}.`}
      >
        <div
          className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-muted-foreground/40 transition-transform duration-200 ease-out"
          style={{ transform: `scaleX(${fracConsumido})` }}
        />
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-full origin-left rounded-full transition-transform duration-200 ease-out',
            bloqueado ? 'bg-destructive' : 'bg-primary',
          )}
          style={{
            transform: `translateX(${fracConsumido * 100}%) scaleX(${fracCampana})`,
          }}
        />
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Cupo del día</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-foreground">
            {formatearNumero(limiteDiario)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ya usado</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-foreground">
            {formatearNumero(consumido24h)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Libre ahora</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-foreground">
            {formatearNumero(disponible)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tu número</dt>
          <dd className="mt-0.5 font-medium text-foreground">{etiquetaTier(presupuesto.tier)}</dd>
        </div>
      </dl>

      {bloqueado && motivoBloqueo ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{ETIQUETA_CALIDAD[presupuesto.calidad]}</AlertTitle>
          <AlertDescription>{motivoBloqueo}</AlertDescription>
        </Alert>
      ) : null}

      {!bloqueado && excede ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>La campaña no cabe en un solo día</AlertTitle>
          <AlertDescription>
            Hoy saldrán {formatearNumero(hoy)} mensajes y el resto continuará en los días
            siguientes. No hace falta que hagas nada: el envío se reanuda solo.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
