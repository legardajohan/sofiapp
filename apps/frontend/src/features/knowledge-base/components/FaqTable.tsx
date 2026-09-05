import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageCircleQuestion, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { deleteKbFaq, faqErrorMessage, updateKbFaq } from '../../../api/kb-faqs.js';
import { estadoMinimo, useKbFaqs } from '../hooks/useKbFaqs.js';
import type { IKbFaq } from '../types/index.js';

interface Props {
  onEdit: (faq: IKbFaq) => void;
  onCreate: () => void;
}

/**
 * Envuelve un control que está deshabilitado por el mínimo de activas y explica por qué.
 *
 * El disparador es un `<span tabIndex={0}>` y no el control: un elemento `disabled` no emite
 * eventos de puntero, así que un tooltip colgado de él nunca aparecería. Envolviéndolo, el motivo
 * queda además alcanzable con el teclado.
 */
function MotivoDelBloqueo({ motivo, children }: {
  motivo: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex rounded-md">
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-56 text-pretty">{motivo}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function FaqTable({ onEdit, onCreate }: Props): React.ReactElement {
  const queryClient = useQueryClient();
  const [enCurso, setEnCurso] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useKbFaqs();
  const { activas, minimo, cumple, puedeReducir } = estadoMinimo(data);

  const invalidar = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['kb', 'faqs'] });
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) => updateKbFaq(id, { activo }),
    onSuccess: (saved) => {
      invalidar();
      toast.success(saved.activo ? 'Pregunta activada' : 'Pregunta desactivada', {
        description: saved.pregunta,
      });
    },
    onError: (err: Error) => {
      toast.error(faqErrorMessage(err, 'No se pudo cambiar el estado de la pregunta.'));
    },
    onSettled: () => setEnCurso(null),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteKbFaq,
    onSuccess: () => {
      invalidar();
      toast.success('Pregunta eliminada');
    },
    onError: (err: Error) => {
      toast.error(faqErrorMessage(err, 'No se pudo eliminar la pregunta.'));
    },
    onSettled: () => setEnCurso(null),
  });

  function handleToggle(faq: IKbFaq, activo: boolean): void {
    setEnCurso(faq.id);
    toggleMutation.mutate({ id: faq.id, activo });
  }

  function handleDelete(faq: IKbFaq): void {
    setEnCurso(faq.id);
    deleteMutation.mutate(faq.id);
  }

  const faqs = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <section className="rounded-xl border border-border bg-card shadow-card">
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Preguntas frecuentes</h2>
          {data && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {total === 0
                ? 'Ninguna todavía'
                : `${total} ${total === 1 ? 'pregunta' : 'preguntas'}`}
              {minimo > 0 && (
                <>
                  {total > 0 && ' · '}
                  {/* El número es el progreso: con cinco elementos, una barra sería decoración. */}
                  <span className={cumple ? undefined : 'font-medium text-destructive'}>
                    {activas} de {minimo} activas
                  </span>
                </>
              )}
            </p>
          )}
        </div>
        <Button size="sm" onClick={onCreate}>
          <Plus className="size-4" aria-hidden="true" />
          Nueva pregunta
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3 px-6 py-5">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-3/5" />
        </div>
      ) : isError ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-destructive">No se pudo cargar la lista de preguntas.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      ) : faqs.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <MessageCircleQuestion
            className="mx-auto size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-medium text-foreground">
            Empieza por la pregunta que más te repiten
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Cada pregunta que guardes aquí Sofi la responde al instante y sin consumir tokens del
            modelo.
          </p>
          <Button size="sm" className="mt-4" onClick={onCreate}>
            <Plus className="size-4" aria-hidden="true" />
            Nueva pregunta
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[32%]">Pregunta</TableHead>
                <TableHead>Respuesta</TableHead>
                <TableHead className="w-24">Activa</TableHead>
                <TableHead className="w-24 text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {faqs.map((faq) => {
                const ocupada = enCurso === faq.id;
                // Solo apagar o borrar una ACTIVA baja el conteo; sobre una apagada no hay nada
                // que proteger. El servidor rechaza igual: esto solo evita el viaje.
                const bloqueaBaja = faq.activo && !puedeReducir;
                return (
                  <TableRow key={faq.id} className={faq.activo ? undefined : 'opacity-60'}>
                    <TableCell className="align-top font-medium text-foreground">
                      <span className="line-clamp-2" title={faq.pregunta}>
                        {faq.pregunta}
                      </span>
                    </TableCell>
                    <TableCell className="align-top text-secondary-foreground">
                      <span className="line-clamp-2" title={faq.respuesta}>
                        {faq.respuesta}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      {bloqueaBaja ? (
                        <MotivoDelBloqueo
                          motivo={`Sofi necesita al menos ${minimo} preguntas activas. Activa otra antes de apagar esta.`}
                        >
                          <Switch
                            checked
                            disabled
                            aria-label={`Desactivar la pregunta ${faq.pregunta}`}
                          />
                        </MotivoDelBloqueo>
                      ) : (
                        <Switch
                          checked={faq.activo}
                          disabled={ocupada}
                          onCheckedChange={(v) => handleToggle(faq, v)}
                          aria-label={`${faq.activo ? 'Desactivar' : 'Activar'} la pregunta ${faq.pregunta}`}
                        />
                      )}
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar la pregunta ${faq.pregunta}`}
                          title="Editar"
                          disabled={ocupada}
                          onClick={() => onEdit(faq)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        {bloqueaBaja ? (
                          <MotivoDelBloqueo
                            motivo={`Sofi necesita al menos ${minimo} preguntas activas. Activa otra antes de eliminar esta.`}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Eliminar la pregunta ${faq.pregunta}`}
                              className="text-destructive hover:text-destructive"
                              disabled
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </MotivoDelBloqueo>
                        ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Eliminar la pregunta ${faq.pregunta}`}
                              title="Eliminar"
                              className="text-destructive hover:text-destructive"
                              disabled={ocupada}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar "{faq.pregunta}"?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción no se puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(faq)}>
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
