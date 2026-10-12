import { useId } from 'react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { tagColors } from '@/features/tags/lib/tag-color';
import { useTags } from '@/features/tags/hooks/useTags';
import { useContactOptions } from '@/features/contacts/hooks/useContactOptions';
import { ESTADO_LABEL, ESTADOS } from '@/features/leads/lib/format';
import { useSemaforos } from '@/features/semaforos';
import { INTENCIONES } from '../lib/segmento.js';
import type { IntencionCompra, SegmentoFiltros } from '../types.js';

/** Ejes que este bloque sabe pintar. Etapas y etiquetas tienen su propio constructor (`AudienceBuilder`). */
type EjeFiltro = 'semaforoLead' | 'intencionCompra' | 'estadoComercial' | 'tagIds' | 'nivelInteres';

const TODOS_LOS_EJES: EjeFiltro[] = [
  'semaforoLead',
  'intencionCompra',
  'estadoComercial',
  'tagIds',
  'nivelInteres',
];

interface Props {
  valor: SegmentoFiltros;
  onChange: (filtros: SegmentoFiltros) => void;
  /** Qué ejes mostrar. Por defecto todos; el constructor de audiencias pide solo los secundarios. */
  ejes?: EjeFiltro[];
}

interface Opcion {
  key: string;
  label: string;
  color?: string;
}

const ESTADOS_OPCIONES: Opcion[] = ESTADOS.map((e) => ({ key: e, label: ESTADO_LABEL[e] }));

/**
 * Selector de varias claves de un catálogo del tenant.
 *
 * Es un `Popover` con casillas y no un `Select` múltiple porque Radix `Select` no admite selección
 * múltiple, y porque el disparador tiene que poder decir cuántas hay elegidas sin desplegarse: el
 * administrador arma el segmento leyendo la fila de filtros, no abriéndolos uno a uno.
 */
function FiltroCatalogo({
  etiqueta,
  opciones,
  seleccion,
  onChange,
  vacio,
}: {
  etiqueta: string;
  opciones: Opcion[];
  seleccion: string[];
  onChange: (keys: string[]) => void;
  /** Solo para catálogos del tenant, que pueden venir vacíos. Las escalas fijas nunca lo están. */
  vacio?: string;
}): React.ReactElement {
  const id = useId();
  const { resolvedTheme } = useTheme();
  const tema = resolvedTheme === 'dark' ? 'dark' : 'light';

  function alternar(key: string): void {
    onChange(seleccion.includes(key) ? seleccion.filter((k) => k !== key) : [...seleccion, key]);
  }

  const resumen =
    seleccion.length === 0
      ? 'Cualquiera'
      : seleccion.length === 1
        ? (opciones.find((o) => o.key === seleccion[0])?.label ?? '1 elegido')
        : `${seleccion.length} elegidos`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-muted-foreground">
        {etiqueta}
      </Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            className="w-full justify-start font-normal transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
          >
            <span className={seleccion.length === 0 ? 'text-muted-foreground' : undefined}>
              {resumen}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1">
          {opciones.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{vacio}</p>
          ) : (
            <ul className="max-h-64 space-y-0.5 overflow-y-auto">
              {opciones.map((o) => {
                const chip = o.color ? tagColors(o.color, tema) : null;
                return (
                  <li key={o.key}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm hover:bg-muted">
                      <Checkbox
                        checked={seleccion.includes(o.key)}
                        onCheckedChange={() => alternar(o.key)}
                      />
                      {chip ? (
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/15 dark:ring-white/25"
                          style={{ backgroundColor: chip.bg }}
                        />
                      ) : null}
                      <span className="truncate text-foreground">{o.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Los ejes por los que se arma un segmento.
 *
 * Solo ejes que el CRM llena solo o que el equipo ya usa a diario (semáforo, intención de la IA,
 * estado, etiquetas). El rol del contacto y los datos propios de la ficha se quitaron del
 * constructor: casi nadie los carga, y filtrar por ellos devolvía segmentos vacíos. El backend los
 * sigue aceptando para no romper campañas ya guardadas con esos filtros.
 *
 * El semáforo que se ofrece es el **comercial** (el del lead, HU-CRM-04), no la etiqueta de salud
 * de la conversación: una campaña se dirige a oportunidades. Un contacto que nunca se convirtió en
 * lead queda fuera cuando se usa ese filtro, y eso es lo correcto.
 */
export function SegmentFilters({
  valor,
  onChange,
  ejes = TODOS_LOS_EJES,
}: Props): React.ReactElement {
  const { data: opciones } = useContactOptions();
  const { data: semaforos } = useSemaforos();
  const { data: tags } = useTags();

  const intereses: Opcion[] = (opciones?.interes ?? [])
    .filter((o) => o.activo)
    .map((o) => ({ key: o.key, label: o.label, color: o.color }));

  // Se incluyen los archivados: un lead clasificado antes de archivarlo sigue llevando esa clave,
  // y no poder segmentarlo dejaría gente inalcanzable por un cambio de catálogo.
  const etiquetas: Opcion[] = (tags ?? []).map((t) => ({ key: t.id, label: t.nombre, color: t.color }));

  const semaforosOpciones: Opcion[] = (semaforos ?? []).map((s) => ({
    key: s.key,
    label: s.label,
    color: s.color,
  }));

  function parchear(parche: Partial<SegmentoFiltros>): void {
    onChange({ ...valor, ...parche });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ejes.includes('semaforoLead') ? (
        <FiltroCatalogo
          etiqueta="Semáforo del lead"
          opciones={semaforosOpciones}
          seleccion={valor.semaforoLead ?? []}
          onChange={(semaforoLead) => parchear({ semaforoLead })}
          vacio="Tu empresa todavía no tiene semáforos configurados."
        />
      ) : null}
      {ejes.includes('intencionCompra') ? (
        <FiltroCatalogo
          etiqueta="Intención de compra"
          opciones={INTENCIONES}
          seleccion={valor.intencionCompra ?? []}
          onChange={(keys) => parchear({ intencionCompra: keys as IntencionCompra[] })}
        />
      ) : null}
      {ejes.includes('estadoComercial') ? (
        <FiltroCatalogo
          etiqueta="Estado comercial"
          opciones={ESTADOS_OPCIONES}
          seleccion={valor.estadoComercial ?? []}
          onChange={(estadoComercial) => parchear({ estadoComercial })}
        />
      ) : null}
      {ejes.includes('tagIds') ? (
        <FiltroCatalogo
          etiqueta="Etiquetas"
          opciones={etiquetas}
          seleccion={valor.tagIds ?? []}
          onChange={(tagIds) => parchear({ tagIds })}
          vacio="Tu empresa todavía no tiene etiquetas. Créalas en Etiquetas."
        />
      ) : null}
      {ejes.includes('nivelInteres') ? (
        <FiltroCatalogo
          etiqueta="Nivel de interés"
          opciones={intereses}
          seleccion={valor.nivelInteres ?? []}
          onChange={(nivelInteres) => parchear({ nivelInteres })}
          vacio="Tu empresa todavía no tiene niveles de interés configurados."
        />
      ) : null}
    </div>
  );
}
