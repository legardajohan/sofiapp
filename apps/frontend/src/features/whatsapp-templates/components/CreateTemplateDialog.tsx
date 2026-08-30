import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, TriangleAlert } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createWhatsAppTemplate, templateErrorMessage } from '../../../api/whatsapp-templates.js';
import { TemplatePreview } from './TemplatePreview.js';
import { CATEGORIAS_PLANTILLA, type CategoriaPlantilla } from '../types/index.js';

const MAX_CUERPO = 1_024;

const CATEGORIA_LABEL: Record<CategoriaPlantilla, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidad',
  AUTHENTICATION: 'Autenticación',
};

/** Placeholders `{{n}}` distintos, en orden. `null` si no son consecutivos desde 1 (Meta lo exige). */
function parsePlaceholders(cuerpo: string): number[] | null {
  const encontrados = [...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  const unicos = [...new Set(encontrados)].sort((a, b) => a - b);
  const consecutivos = unicos.every((n, i) => n === i + 1);
  return consecutivos ? unicos : null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTemplateDialog({ open, onOpenChange }: Props): React.ReactElement {
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [language, setLanguage] = useState('es');
  const [category, setCategory] = useState<CategoriaPlantilla>('UTILITY');
  const [cuerpo, setCuerpo] = useState('');
  const [ejemplos, setEjemplos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setLanguage('es');
    setCategory('UTILITY');
    setCuerpo('');
    setEjemplos([]);
    setError(null);
  }, [open]);

  const placeholders = useMemo(() => parsePlaceholders(cuerpo), [cuerpo]);
  const parametrosInvalidos = cuerpo.trim().length > 0 && placeholders === null;

  useEffect(() => {
    const n = placeholders?.length ?? 0;
    setEjemplos((prev) => {
      if (prev.length === n) return prev;
      const next = prev.slice(0, n);
      while (next.length < n) next.push('');
      return next;
    });
  }, [placeholders]);

  const mutation = useMutation({
    mutationFn: () =>
      createWhatsAppTemplate({
        name: name.trim(),
        language: language.trim(),
        category,
        cuerpo: cuerpo.trim(),
        ejemplos,
      }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast.success('Plantilla enviada a Meta', { description: saved.name });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      setError(templateErrorMessage(err, 'No se pudo crear la plantilla. Intenta de nuevo.'));
    },
  });

  const nombreValido = /^[a-z0-9_]+$/.test(name.trim());
  const puedeGuardar =
    nombreValido &&
    language.trim().length >= 2 &&
    cuerpo.trim().length > 0 &&
    !parametrosInvalidos &&
    ejemplos.every((e) => e.trim().length > 0) &&
    !mutation.isPending;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!puedeGuardar) return;
    setError(null);
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nueva plantilla</DialogTitle>
          <DialogDescription>
            Se envía a Meta para aprobación. El cuerpo queda fijo mientras se revisa: cualquier
            cambio después exige volver a aprobarla.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tpl-name">Nombre</Label>
              <Input
                id="tpl-name"
                className="mt-1.5"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="recordatorio_cita"
                required
                autoFocus
              />
              {name.length > 0 && !nombreValido && (
                <p className="mt-1 text-xs text-destructive">
                  Solo minúsculas, números y guión bajo.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="tpl-language">Idioma</Label>
              <Input
                id="tpl-language"
                className="mt-1.5"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="es"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="tpl-category">Categoría</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as CategoriaPlantilla)}>
              <SelectTrigger id="tpl-category" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS_PLANTILLA.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORIA_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <Label htmlFor="tpl-cuerpo">Cuerpo</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {cuerpo.length.toLocaleString('es-CO')} / {MAX_CUERPO.toLocaleString('es-CO')}
              </span>
            </div>
            <Textarea
              id="tpl-cuerpo"
              className="mt-1.5 resize-y"
              rows={4}
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              placeholder="Hola {{1}}, tu cita es el {{2}}."
              maxLength={MAX_CUERPO}
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Usa <code className="rounded bg-muted px-1 py-0.5">{'{{1}}'}</code>,{' '}
              <code className="rounded bg-muted px-1 py-0.5">{'{{2}}'}</code>… para los datos
              variables, en orden y sin saltos.
            </p>
            {parametrosInvalidos && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-destructive">
                <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                Los parámetros deben ser consecutivos empezando en {'{{1}}'}.
              </p>
            )}
          </div>

          {ejemplos.length > 0 && (
            <div className="space-y-2">
              <Label>Ejemplos (para la vista previa y la revisión de Meta)</Label>
              <div className="grid grid-cols-2 gap-2">
                {ejemplos.map((valor, i) => (
                  <Input
                    key={i}
                    value={valor}
                    onChange={(e) =>
                      setEjemplos((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                    }
                    placeholder={`Ejemplo para {{${i + 1}}}`}
                    required
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Vista previa</Label>
            <div className="mt-1.5">
              <TemplatePreview cuerpo={cuerpo.trim() || null} ejemplos={ejemplos} />
            </div>
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
            <Button type="submit" disabled={!puedeGuardar} className="min-w-40">
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                'Enviar a Meta'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
