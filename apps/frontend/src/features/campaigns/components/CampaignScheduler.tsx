import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWhatsAppTemplates } from '@/api/whatsapp-templates';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { IWhatsAppTemplate } from '@/features/whatsapp-templates/types';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useSegmentPreview } from '../hooks/useCampaigns.js';
import { problemaConHora } from '../lib/programacion.js';
import { AudienceMeter } from './AudienceMeter.js';
import { DateTimePicker } from './DateTimePicker.js';
import { ImageDropzone } from './ImageDropzone.js';
import { MessagePreview } from './MessagePreview.js';
import { SegmentCount } from './SegmentCount.js';
import { SegmentFilters } from './SegmentFilters.js';
import type { ScheduleCampaignPayload, SegmentoFiltros } from '../types.js';

interface Props {
  open: boolean;
  pending: boolean;
  onOpenChange: (abierto: boolean) => void;
  onSubmit: (payload: ScheduleCampaignPayload) => void;
}

const PASOS = ['segmento', 'contenido', 'horario'] as const;
type Paso = (typeof PASOS)[number];

const TITULO: Record<Paso, string> = {
  segmento: '¿A quién le haces seguimiento?',
  contenido: '¿Qué les llega?',
  horario: '¿Cuándo sale?',
};

const DESCRIPCION: Record<Paso, string> = {
  segmento: 'Los contactos se cuentan de nuevo a la hora del envío: entra quien cumpla los filtros entonces.',
  contenido: 'Elige una plantilla aprobada, rellena el texto y añade la imagen si la plantilla la lleva.',
  horario: 'La campaña arranca sola a esta hora y reparte el envío según el cupo de tu número.',
};

const PULSABLE = 'transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]';

/** Plantillas que el programador sabe enviar: con imagen en la cabecera primero, que es su razón de ser. */
function programables(plantillas: IWhatsAppTemplate[]): IWhatsAppTemplate[] {
  return plantillas
    .filter((t) => !t.obsoleta && ['IMAGE', 'NINGUNA', 'TEXT'].includes(t.cabecera))
    .sort((a, b) => Number(b.cabecera === 'IMAGE') - Number(a.cabecera === 'IMAGE'));
}

interface Borrador {
  nombre: string;
  filtros: SegmentoFiltros;
  templateId: string;
  parametros: string[];
  imagen: File | null;
  programadaPara: Date | null;
}

function borradorVacio(): Borrador {
  return {
    nombre: '',
    filtros: {},
    templateId: '',
    parametros: [],
    imagen: null,
    programadaPara: null,
  };
}

/**
 * Programador de campañas de seguimiento (HU-MARK-03): a quién, qué, y cuándo.
 *
 * El paso del contenido pone el formulario y el mensaje resultante uno al lado del otro: con texto
 * e imagen, la única forma de saber si «queda bien» es verlo junto. En pantallas estrechas la vista
 * previa baja debajo del formulario en vez de desaparecer.
 *
 * Sin animación entre pasos, igual que el wizard de envío inmediato: ir y volver es lo que más se
 * repite aquí dentro.
 */
export function CampaignScheduler({
  open,
  pending,
  onOpenChange,
  onSubmit,
}: Props): React.ReactElement {
  const [paso, setPaso] = useState<Paso>('segmento');
  const [borrador, setBorrador] = useState<Borrador>(borradorVacio);
  const [urlImagen, setUrlImagen] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPaso('segmento');
    setBorrador(borradorVacio());
  }, [open]);

  // Una sola URL de objeto para la vista previa del mensaje, ligada al archivo elegido.
  useEffect(() => {
    if (!borrador.imagen) {
      setUrlImagen(null);
      return;
    }
    const url = URL.createObjectURL(borrador.imagen);
    setUrlImagen(url);
    return () => URL.revokeObjectURL(url);
  }, [borrador.imagen]);

  const filtrosDebounced = useDebouncedValue(borrador.filtros, 400);
  const preview = useSegmentPreview(filtrosDebounced, open);

  const { data: plantillas, isLoading: cargandoPlantillas } = useQuery({
    queryKey: ['templates', 'approved'],
    queryFn: () => getWhatsAppTemplates({ status: 'APPROVED', limit: 100 }),
    enabled: open,
  });

  const disponibles = useMemo(() => programables(plantillas?.data ?? []), [plantillas]);
  const plantilla = disponibles.find((t) => t.id === borrador.templateId) ?? null;
  const llevaImagen = plantilla?.cabecera === 'IMAGE';

  const total = preview.data?.total ?? 0;
  const presupuesto = preview.data?.presupuesto ?? null;

  const parametrosCompletos =
    plantilla !== null &&
    borrador.parametros.filter((p) => p.trim()).length === plantilla.parametrosBody;

  const puedeAvanzar: Record<Paso, boolean> = {
    segmento: total > 0,
    contenido: parametrosCompletos && (!llevaImagen || borrador.imagen !== null),
    horario:
      borrador.nombre.trim().length > 0 && problemaConHora(borrador.programadaPara) === null,
  };

  function elegirPlantilla(id: string): void {
    const elegida = disponibles.find((t) => t.id === id);
    setBorrador((b) => ({
      ...b,
      templateId: id,
      parametros: Array.from({ length: elegida?.parametrosBody ?? 0 }, () => ''),
      // Una plantilla sin imagen no la admite: se descarta para no mandar algo que el servidor
      // rechazaría con un 400.
      imagen: elegida?.cabecera === 'IMAGE' ? b.imagen : null,
    }));
  }

  function enviar(): void {
    if (!borrador.programadaPara) return;
    onSubmit({
      nombre: borrador.nombre.trim(),
      filtros: borrador.filtros,
      templateId: borrador.templateId,
      parametros: borrador.parametros,
      programadaPara: borrador.programadaPara.toISOString(),
      imagen: llevaImagen ? borrador.imagen : null,
    });
  }

  const indice = PASOS.indexOf(paso);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <p className="text-sm text-muted-foreground">
            Paso {indice + 1} de {PASOS.length}
          </p>
          <DialogTitle>{TITULO[paso]}</DialogTitle>
          <DialogDescription>{DESCRIPCION[paso]}</DialogDescription>
        </DialogHeader>

        <div className="py-5">
          {paso === 'segmento' ? (
            <div className="space-y-6">
              <SegmentFilters
                valor={borrador.filtros}
                onChange={(filtros) => setBorrador((b) => ({ ...b, filtros }))}
              />
              <SegmentCount cargando={preview.isPending} preview={preview.data} />
            </div>
          ) : null}

          {paso === 'contenido' ? (
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
              <div className="space-y-5">
                {cargandoPlantillas ? (
                  <Skeleton className="h-10 w-full" />
                ) : disponibles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tienes plantillas aprobadas. Crea en Meta una plantilla con imagen en la
                    cabecera, sincronízala desde Configuración, Plantillas, y vuelve aquí.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="programador-plantilla">Plantilla</Label>
                    <Select value={borrador.templateId} onValueChange={elegirPlantilla}>
                      <SelectTrigger id="programador-plantilla">
                        <SelectValue placeholder="Elige una plantilla" />
                      </SelectTrigger>
                      <SelectContent>
                        {disponibles.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} ({t.language}){t.cabecera === 'IMAGE' ? ', con imagen' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {plantilla && plantilla.parametrosBody > 0 ? (
                  <div className="space-y-2">
                    <Label>Texto del mensaje</Label>
                    {Array.from({ length: plantilla.parametrosBody }, (_, i) => (
                      <Input
                        key={i}
                        value={borrador.parametros[i] ?? ''}
                        onChange={(e) =>
                          setBorrador((b) => {
                            const parametros = [...b.parametros];
                            parametros[i] = e.target.value;
                            return { ...b, parametros };
                          })
                        }
                        placeholder={plantilla.ejemplos[i] ?? `Valor para {{${i + 1}}}`}
                        aria-label={`Valor para el hueco ${i + 1}`}
                      />
                    ))}
                    <p className="text-sm text-muted-foreground">
                      El mismo texto va a todos los contactos de la campaña.
                    </p>
                  </div>
                ) : null}

                {llevaImagen ? (
                  <div className="space-y-1.5">
                    <Label>Imagen</Label>
                    <ImageDropzone
                      valor={borrador.imagen}
                      onChange={(imagen) => setBorrador((b) => ({ ...b, imagen }))}
                    />
                  </div>
                ) : plantilla ? (
                  <p className="text-sm text-muted-foreground">
                    Esta plantilla no lleva imagen. Para enviar una, elige una plantilla con imagen
                    en la cabecera.
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5 md:sticky md:top-0 md:self-start">
                <p className="text-sm font-medium text-foreground">Así lo verán</p>
                <MessagePreview
                  cuerpo={plantilla?.cuerpo ?? null}
                  parametros={
                    borrador.parametros.some((p) => p.trim())
                      ? borrador.parametros
                      : (plantilla?.ejemplos ?? [])
                  }
                  imagenUrl={urlImagen}
                  conImagen={llevaImagen}
                  hora={borrador.programadaPara}
                />
              </div>
            </div>
          ) : null}

          {paso === 'horario' ? (
            <div className="space-y-6">
              <DateTimePicker
                valor={borrador.programadaPara}
                onChange={(programadaPara) => setBorrador((b) => ({ ...b, programadaPara }))}
              />

              <div className="space-y-1.5">
                <Label htmlFor="programador-nombre">Nombre de la campaña</Label>
                <Input
                  id="programador-nombre"
                  value={borrador.nombre}
                  onChange={(e) => setBorrador((b) => ({ ...b, nombre: e.target.value }))}
                  placeholder="Seguimiento a interesados de octubre"
                  maxLength={120}
                />
                <p className="text-sm text-muted-foreground">
                  Solo lo ves tú, en el historial de campañas.
                </p>
              </div>

              {presupuesto ? (
                <div className="space-y-2">
                  <AudienceMeter destinatarios={total} presupuesto={presupuesto} />
                  <p className="text-sm text-muted-foreground">
                    Es el cupo de hoy. A la hora del envío se vuelve a calcular con el de ese
                    momento.
                  </p>
                </div>
              ) : (
                <Skeleton className="h-32 w-full" />
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => (indice === 0 ? onOpenChange(false) : setPaso(PASOS[indice - 1]!))}
            disabled={pending}
          >
            {indice === 0 ? 'Cancelar' : 'Atrás'}
          </Button>

          {paso === 'horario' ? (
            <Button
              type="button"
              disabled={pending || !puedeAvanzar.horario}
              onClick={enviar}
              className={PULSABLE}
            >
              {pending ? 'Programando…' : 'Programar campaña'}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!puedeAvanzar[paso]}
              onClick={() => setPaso(PASOS[indice + 1]!)}
              className={PULSABLE}
            >
              Continuar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
