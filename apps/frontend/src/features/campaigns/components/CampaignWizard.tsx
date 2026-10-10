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
import { cn } from '@/lib/utils';
import { TemplatePreview } from '@/features/whatsapp-templates/components/TemplatePreview';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useSegmentPreview } from '../hooks/useCampaigns.js';
import { formatearNumero } from '../lib/pacing.js';
import { AudienceMeter } from './AudienceMeter.js';
import { AudienceBuilder } from './audiencia/AudienceBuilder.js';
import { ResumenAudiencia } from './audiencia/ResumenAudiencia.js';
import type { CreateCampaignPayload, SegmentoFiltros } from '../types.js';

interface Props {
  open: boolean;
  pending: boolean;
  onOpenChange: (abierto: boolean) => void;
  onSubmit: (payload: CreateCampaignPayload) => void;
}

const PASOS = ['segmento', 'plantilla', 'revision'] as const;
type Paso = (typeof PASOS)[number];

const TITULO: Record<Paso, string> = {
  segmento: '¿A quién le escribes?',
  plantilla: '¿Qué les dices?',
  revision: 'Revisa antes de enviar',
};

const DESCRIPCION: Record<Paso, string> = {
  segmento: 'Elige por etapas del CRM, etiquetas o las dos. El total se actualiza con cada cambio.',
  plantilla: 'Solo aparecen las plantillas que Meta ya aprobó.',
  revision: 'Comprueba el alcance y el cupo de tu número antes de lanzar.',
};

/** Estado inicial del borrador. Función y no constante: cada apertura parte de un objeto propio. */
function borradorVacio(): {
  nombre: string;
  filtros: SegmentoFiltros;
  templateId: string;
  parametros: string[];
} {
  return { nombre: '', filtros: {}, templateId: '', parametros: [] };
}

/**
 * Alta de una campaña en tres pasos: a quién, qué, y revisar.
 *
 * Tres pasos y no un formulario largo porque las tres preguntas son independientes y la tercera
 * **depende del resultado de las dos primeras**: hasta que no hay segmento y plantilla no se puede
 * decir cuánto va a costar el envío. Un formulario plano obligaría a mostrar el medidor de cupo
 * vacío desde el principio, que es justo cuando no significa nada.
 *
 * No hay animación entre pasos a propósito. Avanzar y retroceder es lo que más se repite dentro del
 * diálogo, y una transición ahí se convierte en espera en cuanto se usa la pantalla dos veces.
 */
export function CampaignWizard({
  open,
  pending,
  onOpenChange,
  onSubmit,
}: Props): React.ReactElement {
  const [paso, setPaso] = useState<Paso>('segmento');
  const [borrador, setBorrador] = useState(borradorVacio);

  // Se recarga al abrir, no al montar: el diálogo vive montado entre aperturas, y sin esto la
  // segunda campaña llegaría con los filtros de la primera.
  useEffect(() => {
    if (!open) return;
    setPaso('segmento');
    setBorrador(borradorVacio());
  }, [open]);

  // Lo que se teclea repinta al instante; lo que consulta al servidor va retrasado.
  const filtrosDebounced = useDebouncedValue(borrador.filtros, 400);
  const preview = useSegmentPreview(filtrosDebounced, open);

  const { data: plantillas, isLoading: cargandoPlantillas } = useQuery({
    queryKey: ['templates', 'approved'],
    queryFn: () => getWhatsAppTemplates({ status: 'APPROVED', limit: 100 }),
    enabled: open,
  });

  const aprobadas = useMemo(
    // Las de imagen/documento/vídeo en la cabecera no se pueden enviar sin el archivo: esas se
    // programan desde el programador de campañas (HU-MARK-03), que sí sabe adjuntarlo.
    () =>
      (plantillas?.data ?? []).filter(
        (t) => !t.obsoleta && (t.cabecera === 'NINGUNA' || t.cabecera === 'TEXT'),
      ),
    [plantillas],
  );
  const plantilla = aprobadas.find((t) => t.id === borrador.templateId) ?? null;

  const total = preview.data?.total ?? 0;
  const presupuesto = preview.data?.presupuesto ?? null;

  const parametrosCompletos =
    plantilla === null ||
    borrador.parametros.filter((p) => p.trim()).length === plantilla.parametrosBody;

  const puedeAvanzar: Record<Paso, boolean> = {
    segmento: total > 0,
    plantilla: plantilla !== null && parametrosCompletos,
    revision: borrador.nombre.trim().length > 0 && !(presupuesto?.bloqueado ?? false),
  };

  function elegirPlantilla(id: string): void {
    const elegida = aprobadas.find((t) => t.id === id);
    setBorrador((b) => ({
      ...b,
      templateId: id,
      // Los huecos se reinician al cambiar de plantilla: conservarlos dejaría los valores de una
      // plantilla metidos en los huecos de otra, que casi nunca significan lo mismo.
      parametros: Array.from({ length: elegida?.parametrosBody ?? 0 }, () => ''),
    }));
  }

  function enviar(lanzar: boolean): void {
    onSubmit({
      nombre: borrador.nombre.trim(),
      filtros: borrador.filtros,
      templateId: borrador.templateId,
      parametros: borrador.parametros,
      ...(lanzar ? { lanzar: true } : {}),
    });
  }

  const indice = PASOS.indexOf(paso);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // El paso de la audiencia pide dos columnas (criterios y resultado); el resto son
        // formularios que se leen mejor estrechos.
        className={cn(
          'max-h-[90vh] gap-0 overflow-y-auto sm:max-w-2xl',
          paso === 'segmento' && 'lg:max-w-5xl',
        )}
      >
        <DialogHeader>
          <DialogTitle>{TITULO[paso]}</DialogTitle>
          <DialogDescription>{DESCRIPCION[paso]}</DialogDescription>
        </DialogHeader>

        <div className="py-5">
          {paso === 'segmento' ? (
            <div className="space-y-6">
              <AudienceBuilder
                valor={borrador.filtros}
                onChange={(filtros) => setBorrador((b) => ({ ...b, filtros }))}
                preview={preview.data}
                cargando={preview.isPending}
                // También mientras corre el debounce: la cifra en pantalla ya no es la de los criterios.
                actualizando={preview.isFetching || filtrosDebounced !== borrador.filtros}
                enabled={open}
              />
            </div>
          ) : null}

          {paso === 'plantilla' ? (
            <div className="space-y-5">
              {cargandoPlantillas ? (
                <Skeleton className="h-10 w-full" />
              ) : aprobadas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tienes plantillas aprobadas. Créalas y sincronízalas desde Configuración,
                  Plantillas, y vuelve aquí.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="plantilla">Plantilla</Label>
                  <Select value={borrador.templateId} onValueChange={elegirPlantilla}>
                    <SelectTrigger id="plantilla">
                      <SelectValue placeholder="Elige una plantilla" />
                    </SelectTrigger>
                    <SelectContent>
                      {aprobadas.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} ({t.language})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {plantilla ? (
                <>
                  {plantilla.parametrosBody > 0 ? (
                    <div className="space-y-2">
                      <Label>Huecos del mensaje</Label>
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
                          placeholder={`Valor para {{${i + 1}}}`}
                          aria-label={`Valor para el hueco ${i + 1}`}
                        />
                      ))}
                      <p className="text-sm text-muted-foreground">
                        El mismo texto va a todos los destinatarios de esta campaña.
                      </p>
                    </div>
                  ) : null}

                  <TemplatePreview
                    cuerpo={plantilla.cuerpo}
                    ejemplos={
                      borrador.parametros.some((p) => p.trim())
                        ? borrador.parametros
                        : plantilla.ejemplos
                    }
                  />
                </>
              ) : null}
            </div>
          ) : null}

          {paso === 'revision' ? (
            <div className="space-y-6">
              <div className="space-y-1.5">
                <Label htmlFor="nombre">Nombre de la campaña</Label>
                <Input
                  id="nombre"
                  value={borrador.nombre}
                  onChange={(e) => setBorrador((b) => ({ ...b, nombre: e.target.value }))}
                  placeholder="Recordatorio de matrículas"
                  maxLength={120}
                />
                <p className="text-sm text-muted-foreground">
                  Solo lo ves tú, en el historial de campañas.
                </p>
              </div>

              <ResumenAudiencia filtros={borrador.filtros} preview={preview.data} />

              {presupuesto ? (
                <AudienceMeter destinatarios={total} presupuesto={presupuesto} />
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

          {paso === 'revision' ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={pending || !borrador.nombre.trim()}
                onClick={() => enviar(false)}
                className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
              >
                Guardar borrador
              </Button>
              <Button
                type="button"
                disabled={pending || !puedeAvanzar.revision}
                onClick={() => enviar(true)}
                className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
              >
                {pending ? 'Enviando…' : `Enviar a ${formatearNumero(total)}`}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              disabled={!puedeAvanzar[paso]}
              onClick={() => setPaso(PASOS[indice + 1]!)}
              className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
            >
              Continuar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
