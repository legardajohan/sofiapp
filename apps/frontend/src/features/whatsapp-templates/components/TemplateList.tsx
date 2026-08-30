import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, FileStack, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getWhatsAppTemplates, syncWhatsAppTemplates, templateErrorMessage } from '../../../api/whatsapp-templates.js';
import { TemplatePreview } from './TemplatePreview.js';
import { TemplateStatusBadge } from './TemplateStatusBadge.js';
import {
  CATEGORIAS_PLANTILLA,
  ESTADOS_PLANTILLA,
  type CategoriaPlantilla,
  type EstadoPlantilla,
  type IWhatsAppTemplate,
  type WhatsAppTemplatesListResponse,
} from '../types/index.js';

const CATEGORIA_LABEL: Record<CategoriaPlantilla, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidad',
  AUTHENTICATION: 'Autenticación',
};

const ESTADO_LABEL: Record<EstadoPlantilla, string> = {
  APPROVED: 'Aprobada',
  PENDING: 'Esperando a Meta',
  REJECTED: 'Rechazada',
  PAUSED: 'Pausada',
  DISABLED: 'Deshabilitada',
};

interface Props {
  onCreate: () => void;
}

export function TemplateList({ onCreate }: Props): React.ReactElement {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<EstadoPlantilla | 'todas'>('todas');
  const [category, setCategory] = useState<CategoriaPlantilla | 'todas'>('todas');
  const [preview, setPreview] = useState<IWhatsAppTemplate | null>(null);

  const params = {
    page: 1,
    limit: 50,
    ...(status !== 'todas' ? { status } : {}),
    ...(category !== 'todas' ? { category } : {}),
  };

  const { data, isLoading, isError, refetch } = useQuery<WhatsAppTemplatesListResponse>({
    queryKey: ['whatsapp-templates', status, category],
    queryFn: () => getWhatsAppTemplates(params),
  });

  const syncMutation = useMutation({
    mutationFn: syncWhatsAppTemplates,
    onSuccess: (resultado) => {
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast.success('Catálogo sincronizado con Meta', {
        description: `${resultado.creadas} nuevas, ${resultado.actualizadas} actualizadas, ${resultado.obsoletas} obsoletas.`,
      });
    },
    onError: (err: Error) => {
      toast.error(templateErrorMessage(err, 'No se pudo sincronizar el catálogo.'));
    },
  });

  const templates = data?.data ?? [];
  const total = data?.total ?? 0;
  const hayFiltros = status !== 'todas' || category !== 'todas';

  return (
    <section className="rounded-xl border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Catálogo</h2>
          {data && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {total === 0 ? 'Ninguna todavía' : `${total} ${total === 1 ? 'plantilla' : 'plantillas'}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as EstadoPlantilla | 'todas')}>
            <SelectTrigger className="h-9 w-[168px]" aria-label="Filtrar por estado">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos los estados</SelectItem>
              {ESTADOS_PLANTILLA.map((s) => (
                <SelectItem key={s} value={s}>
                  {ESTADO_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(v) => setCategory(v as CategoriaPlantilla | 'todas')}>
            <SelectTrigger className="h-9 w-[168px]" aria-label="Filtrar por categoría">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las categorías</SelectItem>
              {CATEGORIAS_PLANTILLA.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORIA_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw
              className={`size-4 ${syncMutation.isPending ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Sincronizar
          </Button>
          <Button size="sm" onClick={onCreate}>
            <Plus className="size-4" aria-hidden="true" />
            Nueva plantilla
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 px-6 py-5">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-3/5" />
        </div>
      ) : isError ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-destructive">No se pudo cargar el catálogo de plantillas.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      ) : templates.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <FileStack className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-foreground">
            {hayFiltros ? 'Ninguna plantilla coincide con el filtro' : 'Todavía no hay plantillas'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {hayFiltros
              ? 'Prueba con otro estado o categoría.'
              : 'Sincroniza las que ya tengas aprobadas en Meta, o crea la primera desde acá.'}
          </p>
          {!hayFiltros && (
            <div className="mt-4 flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                <RefreshCw
                  className={`size-4 ${syncMutation.isPending ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                Sincronizar
              </Button>
              <Button size="sm" onClick={onCreate}>
                <Plus className="size-4" aria-hidden="true" />
                Nueva plantilla
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[26%]">Nombre</TableHead>
                <TableHead className="w-24">Idioma</TableHead>
                <TableHead className="w-32">Categoría</TableHead>
                <TableHead className="w-40">Estado</TableHead>
                <TableHead>Cuerpo</TableHead>
                <TableHead className="w-24 text-right">Vista previa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((tpl) => (
                <TableRow key={tpl.id} className={tpl.obsoleta ? 'opacity-60' : undefined}>
                  <TableCell className="align-top font-medium text-foreground">
                    <span className="font-mono text-sm">{tpl.name}</span>
                    {tpl.obsoleta && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(obsoleta)</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top text-secondary-foreground">{tpl.language}</TableCell>
                  <TableCell className="align-top text-secondary-foreground">
                    {CATEGORIA_LABEL[tpl.category]}
                  </TableCell>
                  <TableCell className="align-top">
                    <TemplateStatusBadge status={tpl.status} />
                  </TableCell>
                  <TableCell className="align-top text-secondary-foreground">
                    <span className="line-clamp-2" title={tpl.cuerpo ?? undefined}>
                      {tpl.cuerpo ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell className="align-top text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Vista previa de ${tpl.name}`}
                      title="Vista previa"
                      onClick={() => setPreview(tpl)}
                    >
                      <Eye className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={preview !== null} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview && <TemplatePreview cuerpo={preview.cuerpo} ejemplos={preview.ejemplos} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
