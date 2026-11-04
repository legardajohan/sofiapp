import { CalendarClock, CircleCheck, Loader2, Mail, Phone, RotateCcw } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { Button } from '@/components/ui/button';
import { fechaCompleta, fechaHora } from '@/features/contacts/lib/fecha';
import { tagColors } from '@/features/tags/lib/tag-color';
import { estaVencido, etiquetaProgramacion } from '@/lib/agenda';
import { cn } from '@/lib/utils';
import type { CanalOrigen, PendienteDTO } from '../types.js';

interface Props {
  pendiente: PendienteDTO;
  onAbrir: (pendiente: PendienteDTO) => void;
  /** Abiertos: «Cerrar pendiente». */
  onCerrar?: (pendiente: PendienteDTO) => void;
  /** Historial: «Reabrir». */
  onReabrir?: (pendiente: PendienteDTO) => void;
  /** Esta tarjeta tiene una transición en curso. */
  ocupado?: boolean;
}

const CANALES: Record<CanalOrigen, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Messenger',
  formulario: 'Formulario',
  web: 'Web',
};

/** Etapa del lead con el color del catálogo, o «Sin convertir» en neutro. */
function EtapaChip({ etapa }: { etapa: PendienteDTO['lead']['etapa'] }): React.ReactElement {
  const { resolvedTheme } = useTheme();
  if (!etapa) {
    return (
      <span className="shrink-0 rounded border border-dashed border-border px-1.5 py-px text-[11px] text-muted-foreground">
        Sin convertir
      </span>
    );
  }
  // Mismo motor de contraste que las cabeceras del embudo: un hex del tenant poco afortunado sigue
  // siendo legible en claro y en oscuro.
  const chip = tagColors(etapa.color, resolvedTheme === 'dark' ? 'dark' : 'light');
  return (
    <span
      className="max-w-[8rem] shrink-0 truncate rounded border px-1.5 py-px text-[11px] font-medium"
      style={{ backgroundColor: chip.bg, color: chip.fg, borderColor: chip.border }}
      title={`Etapa: ${etapa.label}`}
    >
      {etapa.label}
    </span>
  );
}

/** Nombre del lead y su etapa: la segunda línea de las dos variantes. */
function LineaLead({ pendiente }: { pendiente: PendienteDTO }): React.ReactElement {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/80">
        {pendiente.lead.nombre ?? 'Sin nombre'}
      </span>
      <EtapaChip etapa={pendiente.lead.etapa} />
    </div>
  );
}

const SUPERFICIE =
  'group/pend relative flex w-full flex-col gap-1.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow,transform] duration-150 ease-out motion-reduce:transition-none [@media(hover:hover)]:hover:border-primary/30 [@media(hover:hover)]:hover:shadow-md motion-safe:has-[button.abrir:active]:scale-[0.99]';

/**
 * Un pendiente en la columna del embudo (HU-PDF-01, A1).
 *
 * **Lo que manda es el compromiso y su fecha, no el lead.** En las columnas de etapa la tarjeta
 * abre con el nombre porque se escanea a quién; aquí se escanea *qué hay que hacer y cuándo*, así
 * que la agenda va arriba, la descripción después con peso, y el lead baja a la tercera línea.
 *
 * La tarjeta entera abre la ficha (un `button` que la cubre); la acción de cerrar o reabrir es un
 * botón propio por encima. Un botón dentro de otro no es HTML válido ni se navega bien con teclado.
 */
export function PendienteCard({
  pendiente,
  onAbrir,
  onCerrar,
  onReabrir,
  ocupado = false,
}: Props): React.ReactElement {
  const { lead } = pendiente;
  const nombre = lead.nombre ?? 'Sin nombre';
  const cerrado = pendiente.estado === 'cerrado';
  const vencido = !cerrado && estaVencido(pendiente.programadoDia, pendiente.programadoHora);
  const agenda = etiquetaProgramacion(pendiente.programadoDia, pendiente.programadoHora);

  return (
    <article className={SUPERFICIE}>
      <button
        type="button"
        onClick={() => onAbrir(pendiente)}
        aria-label={`Pendiente de ${nombre}: ${pendiente.descripcion}. ${agenda}. Abrir la ficha del contacto`}
        className="abrir absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
      />

      <div className="flex min-h-7 items-center gap-1.5">
        {cerrado ? (
          <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-success">
            <CircleCheck className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              Cerrado{' '}
              {pendiente.cerradoAt && (
                <time dateTime={pendiente.cerradoAt} title={fechaCompleta(pendiente.cerradoAt)}>
                  {fechaHora(pendiente.cerradoAt).toLowerCase()}
                </time>
              )}
            </span>
          </p>
        ) : (
          <p
            className={cn(
              'flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium tabular-nums',
              vencido ? 'text-destructive' : 'text-foreground',
            )}
          >
            <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{agenda}</span>
            {vencido && (
              <span className="shrink-0 rounded bg-destructive-subtle px-1.5 py-px text-[11px] font-medium">
                Vencido
              </span>
            )}
          </p>
        )}

        {cerrado && onReabrir && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={ocupado}
            onClick={() => onReabrir(pendiente)}
            className="relative z-10 -mr-1.5 h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground motion-safe:active:scale-[0.97]"
          >
            {ocupado ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="size-3.5" aria-hidden="true" />
            )}
            Reabrir
          </Button>
        )}

        {!cerrado && onCerrar && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={ocupado}
            onClick={() => onCerrar(pendiente)}
            aria-label={`Cerrar pendiente de ${nombre}`}
            title="Cerrar pendiente: la tarea se cumplió"
            className="relative z-10 -mr-1.5 size-7 shrink-0 text-muted-foreground hover:bg-success-subtle hover:text-success motion-safe:active:scale-[0.92]"
          >
            {ocupado ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <CircleCheck className="size-4" aria-hidden="true" />
            )}
          </Button>
        )}
      </div>

      <p
        className={cn(
          'whitespace-pre-line text-sm leading-snug',
          cerrado ? 'line-clamp-2 text-muted-foreground' : 'line-clamp-3 text-foreground',
        )}
      >
        {pendiente.descripcion}
      </p>

      <LineaLead pendiente={pendiente} />

      {!cerrado && (
        <div className="flex min-w-0 flex-col gap-0.5 text-xs text-muted-foreground">
          {lead.telefono && (
            <span className="flex min-w-0 items-center gap-1.5">
              <Phone className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate tabular-nums">{lead.telefono}</span>
              {lead.canalOrigen && (
                <span className="ml-auto shrink-0 text-[11px]">{CANALES[lead.canalOrigen]}</span>
              )}
            </span>
          )}
          {lead.correo && (
            <span className="flex min-w-0 items-center gap-1.5">
              <Mail className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{lead.correo}</span>
            </span>
          )}
        </div>
      )}

      <p className="flex min-w-0 items-center gap-1.5 border-t border-border/60 pt-1.5 text-[11px] text-muted-foreground">
        {cerrado ? (
          <>
            <span className="min-w-0 truncate">
              por {pendiente.cerradoPor?.nombre ?? 'Usuario eliminado'}
            </span>
            <span className="ml-auto shrink-0 tabular-nums" title="Fecha programada">
              {agenda}
            </span>
          </>
        ) : (
          <>
            <span className="min-w-0 truncate">{pendiente.autor.nombre ?? 'Usuario eliminado'}</span>
            <time
              className="ml-auto shrink-0 tabular-nums"
              dateTime={pendiente.createdAt}
              title={`Creado: ${fechaCompleta(pendiente.createdAt)}`}
            >
              {fechaHora(pendiente.createdAt)}
            </time>
          </>
        )}
      </p>
    </article>
  );
}
