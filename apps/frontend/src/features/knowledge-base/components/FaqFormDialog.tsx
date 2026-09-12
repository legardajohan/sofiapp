import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { createKbFaq, faqErrorMessage, updateKbFaq } from '../../../api/kb-faqs.js';
import { estadoMinimo, useKbFaqs } from '../hooks/useKbFaqs.js';
import type { IKbFaq } from '../types/index.js';

const MAX_PREGUNTA = 300;
const MAX_RESPUESTA = 2000;

interface Props {
  /** Presente = modo editar; ausente = modo crear. */
  faq?: IKbFaq | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FaqFormDialog({ faq, open, onOpenChange }: Props): React.ReactElement {
  const isEdit = Boolean(faq);
  const queryClient = useQueryClient();
  const { data } = useKbFaqs();
  const { minimo, puedeReducir } = estadoMinimo(data);
  // Solo al editar una que ya está activa: crear nunca se limita, y sobre una apagada no hay
  // conteo que proteger (HU-KB-02-V3).
  const bloqueaApagar = Boolean(faq?.activo) && !puedeReducir;

  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [activo, setActivo] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Al abrir (o al cambiar de FAQ) el formulario se recarga desde cero: sin restos
  // de la edición anterior ni mensajes de error viejos.
  useEffect(() => {
    if (!open) return;
    setPregunta(faq?.pregunta ?? '');
    setRespuesta(faq?.respuesta ?? '');
    setActivo(faq?.activo ?? true);
    setError(null);
  }, [open, faq?.id, faq?.pregunta, faq?.respuesta, faq?.activo]);

  const mutation = useMutation({
    mutationFn: async (): Promise<IKbFaq> => {
      const payload = { pregunta: pregunta.trim(), respuesta: respuesta.trim(), activo };
      return faq ? updateKbFaq(faq.id, payload) : createKbFaq(payload);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['kb', 'faqs'] });
      toast.success(isEdit ? 'Pregunta actualizada' : 'Pregunta creada', {
        description: saved.pregunta,
      });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      setError(faqErrorMessage(err, 'No se pudo guardar la pregunta. Intenta de nuevo.'));
    },
  });

  const puedeGuardar =
    pregunta.trim().length >= 3 && respuesta.trim().length > 0 && !mutation.isPending;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!puedeGuardar) return;
    setError(null);
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar pregunta' : 'Nueva pregunta'}</DialogTitle>
          <DialogDescription>
            Sofi responderá con este texto, palabra por palabra, cuando alguien pregunte algo
            parecido.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="faq-pregunta">Pregunta</Label>
            <Input
              id="faq-pregunta"
              className="mt-1.5"
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              placeholder="¿Cuánto cuesta el curso?"
              minLength={3}
              maxLength={MAX_PREGUNTA}
              required
              autoFocus
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <Label htmlFor="faq-respuesta">Respuesta</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {respuesta.length.toLocaleString('es-CO')} /{' '}
                {MAX_RESPUESTA.toLocaleString('es-CO')}
              </span>
            </div>
            <Textarea
              id="faq-respuesta"
              className="mt-1.5 resize-y"
              rows={5}
              value={respuesta}
              onChange={(e) => setRespuesta(e.target.value)}
              placeholder="El curso cuesta $500.000 COP e incluye material y simulacros."
              maxLength={MAX_RESPUESTA}
              required
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div className="pr-4">
              <Label htmlFor="faq-activo" className="cursor-pointer">
                Activa
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {bloqueaApagar
                  ? `Sofi necesita al menos ${minimo} preguntas activas. Activa otra antes de apagar esta.`
                  : 'Si la desactivas, Sofi deja de usarla y esa consulta vuelve al modelo.'}
              </p>
            </div>
            <Switch
              id="faq-activo"
              checked={activo}
              disabled={bloqueaApagar}
              onCheckedChange={setActivo}
            />
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive-subtle px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!puedeGuardar} className="min-w-32">
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : isEdit ? (
                'Guardar cambios'
              ) : (
                'Crear pregunta'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
