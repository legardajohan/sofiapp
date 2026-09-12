import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquareText, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { useUpdateLeadEstado } from '../hooks/useUpdateLeadEstado.js';
import { SemaforoSelect } from './SemaforoSelect.js';
import { LeadHistorialSemaforo } from './LeadHistorialSemaforo.js';
import { useDeleteLead } from '../hooks/useDeleteLead.js';
import { DeleteLeadDialog } from './DeleteLeadDialog.js';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { COLOR_ESTADO_DESCONOCIDO, fechaLarga, haceCuanto } from '../lib/format.js';
import type { EstadoDTO } from '../../estados/types.js';
import type { SemaforoDTO } from '../../semaforos/types.js';
import type { LeadListItemDTO } from '../types.js';

interface Props {
  lead: LeadListItemDTO | null;
  onClose: () => void;
  /** Catálogo del tenant para resolver etiqueta y color del estado. */
  estados: EstadoDTO[];
  /** Catálogo de semaforización comercial del tenant (HU-CRM-04). */
  semaforos: SemaforoDTO[];
}

/**
 * Asignar la etapa del lead (HU-CRM-03).
 *
 * Va en el panel y no como un desplegable por fila: en la tabla serían veinte controles idénticos
 * compitiendo por atención, y cambiar de etapa es una decisión sobre UN lead, no un gesto de
 * barrido. Aquí ya estás mirando su ficha.
 *
 * Se ofrecen los estados activos más —si toca— el que el lead lleva puesto aunque esté archivado:
 * esconder su propio estado dejaría el control mintiendo sobre lo que muestra.
 */
function EstadoSelect({
  lead,
  estados,
}: {
  lead: LeadListItemDTO;
  estados: EstadoDTO[];
}): React.ReactElement {
  const cambiar = useUpdateLeadEstado();
  const suyo = estados.find((e) => e.key === lead.estado);
  const opciones = estados.filter((e) => e.activo || e.key === lead.estado);

  return (
    <Select
      value={lead.estado}
      disabled={cambiar.isPending}
      onValueChange={(estado) => {
        if (estado !== lead.estado) cambiar.mutate({ id: lead.id, estado });
      }}
    >
      <SelectTrigger className="h-8 w-auto gap-2 border-border px-2.5" aria-label="Estado del lead">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: suyo?.color ?? COLOR_ESTADO_DESCONOCIDO }}
          />
          <span className="text-sm">{suyo?.label ?? lead.estado}</span>
        </span>
      </SelectTrigger>
      <SelectContent>
        {opciones.map((estado) => (
          <SelectItem key={estado.key} value={estado.key}>
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: estado.color }}
              />
              {estado.label}
              {!estado.activo && <span className="text-muted-foreground">(archivado)</span>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Par etiqueta/valor de la ficha. El valor manda; la etiqueta solo lo sitúa. */
function Dato({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    // `min-w-0` + `break-words`: un correo largo no tiene dónde partir y, con el `min-width: auto`
    // por defecto de un item de grid, desbordaría la ficha a ancho móvil en vez de envolverse.
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function LeadDetailSheet({
  lead,
  onClose,
  estados,
  semaforos,
}: Props): React.ReactElement {
  const [confirmando, setConfirmando] = useState(false);
  const borrar = useDeleteLead(lead?.id ?? '', lead?.conversacionId ?? null);

  // Se vuelve a ESTA vista: misma página, mismos filtros y con el lead reabierto. Volver a `/leads`
  // a secas descartaría el filtro que el usuario venía usando.
  const location = useLocation();
  const volverA = useMemo(() => {
    const params = new URLSearchParams(location.search);
    if (lead) params.set('lead', lead.id);
    return encodeURIComponent(`${location.pathname}?${params.toString()}`);
  }, [location.pathname, location.search, lead]);

  return (
    <Sheet open={lead !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {lead && (
          <>
            <SheetHeader>
              <SheetTitle>{lead.nombre}</SheetTitle>
              <SheetDescription>{lead.telefono}</SheetDescription>
            </SheetHeader>

            {/* Etapa del pipeline y semáforo comercial: dos ejes del mismo lead, dos
                controles con la misma forma para que se lean como lo que son. */}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <EstadoSelect lead={lead} estados={estados} />
              <SemaforoSelect lead={lead} semaforos={semaforos} />
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-4">
              <Dato label="Responsable">{lead.responsable?.nombre ?? 'Sin responsable'}</Dato>
              <Dato label="Correo">{lead.correo ?? '—'}</Dato>
              <Dato label="Creado">{fechaLarga(lead.createdAt)}</Dato>
              <Dato label="Última actividad">{haceCuanto(lead.ultimoMensajeAt)}</Dato>
            </dl>

            <Separator className="my-6" />

            <section>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Resumen de la conversación
                </h3>
                {lead.resumen?.desactualizado && (
                  // El aviso va junto al título, no al pie: quien lee el resumen tiene que saber
                  // ANTES de creérselo que ya no está al día.
                  <Badge variant="outline">Desactualizado</Badge>
                )}
              </div>

              {lead.resumen ? (
                <>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-secondary-foreground">
                    {lead.resumen.texto}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {lead.resumen.desactualizado
                      ? `Generado el ${fechaLarga(lead.resumen.generadoAt)}; llegaron mensajes después.`
                      : `Generado el ${fechaLarga(lead.resumen.generadoAt)}.`}
                  </p>
                </>
              ) : (
                // Un hueco vacío deja al usuario preguntándose si falló algo. Se explica de dónde
                // sale el resumen para que sepa qué hacer.
                <p className="mt-2 text-sm text-muted-foreground">
                  Esta conversación todavía no tiene resumen. Se genera desde la bandeja, dentro de
                  la conversación.
                </p>
              )}
            </section>

            <Button asChild className="mt-6 w-full">
              <Link to={`/inbox?conversacion=${lead.conversacionId}&volverA=${volverA}`}>
                <MessageSquareText className="mr-2 h-4 w-4" />
                Abrir conversación
              </Link>
            </Button>

            <Separator className="my-6" />

            <LeadHistorialSemaforo leadId={lead.id} semaforos={semaforos} />

            <Separator className="my-6" />

            {/* Destructivo y por tanto discreto: ni color de marca ni ancho completo, para que no
                compita con la acción real del panel. La confirmación —y el motivo— van aparte. */}
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmando(true)}
              disabled={borrar.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar lead
            </Button>

            <DeleteLeadDialog
              open={confirmando}
              pending={borrar.isPending}
              nombre={lead.nombre}
              onOpenChange={setConfirmando}
              onConfirm={(motivo) =>
                borrar.mutate(motivo, {
                  // El panel muestra un lead que ya no existe: cerrarlo es parte del borrado.
                  onSuccess: () => {
                    setConfirmando(false);
                    onClose();
                  },
                })
              }
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
