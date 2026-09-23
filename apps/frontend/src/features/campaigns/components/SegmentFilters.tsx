import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { tagColors } from '@/features/tags/lib/tag-color';
import { useContactOptions } from '@/features/contacts/hooks/useContactOptions';
import { useSemaforos } from '@/features/semaforos';
import type { FiltroAtributo, SegmentoFiltros } from '../types.js';

interface Props {
  valor: SegmentoFiltros;
  onChange: (filtros: SegmentoFiltros) => void;
}

interface Opcion {
  key: string;
  label: string;
  color?: string;
}

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
  vacio: string;
}): React.ReactElement {
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
      <Label className="text-muted-foreground">{etiqueta}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
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
 * Filtro por atributo personalizado del contacto.
 *
 * Aquí es donde entra «grado», y por eso el control pide la **clave** además del valor: el proyecto
 * no tiene un campo `grado` y no debe tenerlo (HU-CRM-02 sacó del modelo los supuestos del vertical
 * Pre-ICFES). El mismo control sirve para «colegio», «EPS» o lo que cada empresa capture.
 */
function FilaAtributo({
  atributo,
  onChange,
  onQuitar,
}: {
  atributo: FiltroAtributo;
  onChange: (parche: Partial<FiltroAtributo>) => void;
  onQuitar: () => void;
}): React.ReactElement {
  /**
   * El texto de los valores se guarda aparte, tal cual se escribe.
   *
   * Es lo que hace que se pueda teclear una coma: si el input se pintara desde
   * `valores.join(', ')`, cada coma desaparecería en el mismo render en que se escribe —el array
   * no la conserva— y sería imposible separar dos valores. Arriba solo sube la lista ya partida.
   */
  const [texto, setTexto] = useState(atributo.valores.join(', '));

  function escribir(valor: string): void {
    setTexto(valor);
    onChange({
      valores: valor
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2">
      <Input
        value={atributo.key}
        onChange={(e) => onChange({ key: e.target.value })}
        placeholder="grado"
        aria-label="Nombre del dato"
        className="w-36"
      />
      <span className="text-sm text-muted-foreground">es</span>
      <Input
        value={texto}
        onChange={(e) => escribir(e.target.value)}
        placeholder="10, 11"
        aria-label="Valores aceptados, separados por comas"
        className="w-44 flex-1"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Quitar el filtro de ${atributo.key || 'este dato'}`}
        onClick={onQuitar}
      >
        <X className="h-4 w-4" />
      </Button>
    </li>
  );
}

function FiltroAtributos({
  atributos,
  onChange,
}: {
  atributos: FiltroAtributo[];
  onChange: (a: FiltroAtributo[]) => void;
}): React.ReactElement {
  function actualizar(indice: number, parche: Partial<FiltroAtributo>): void {
    onChange(atributos.map((a, i) => (i === indice ? { ...a, ...parche } : a)));
  }

  return (
    <div className="space-y-2">
      <Label className="text-muted-foreground">Datos propios del contacto</Label>

      {atributos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Filtra por lo que tu empresa registra en cada ficha, como el grado o el colegio.
        </p>
      ) : null}

      <ul className="space-y-2">
        {atributos.map((atributo, i) => (
          // El índice como clave es correcto aquí: las filas no se reordenan, solo se añaden y
          // se quitan por el final, así que el índice identifica establemente a cada una.
          <FilaAtributo
            key={i}
            atributo={atributo}
            onChange={(parche) => actualizar(i, parche)}
            onQuitar={() => onChange(atributos.filter((_, j) => j !== i))}
          />
        ))}
      </ul>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...atributos, { key: '', valores: [] }])}
        className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Añadir un dato
      </Button>
    </div>
  );
}

/**
 * Los ejes por los que se arma un segmento.
 *
 * El semáforo que se ofrece es el **comercial** (el del lead, HU-CRM-04), no la etiqueta de salud
 * de la conversación: una campaña se dirige a oportunidades. Un contacto que nunca se convirtió en
 * lead queda fuera cuando se usa ese filtro, y eso es lo correcto.
 */
export function SegmentFilters({ valor, onChange }: Props): React.ReactElement {
  const { data: opciones } = useContactOptions();
  const { data: semaforos } = useSemaforos();

  const roles: Opcion[] = (opciones?.rol ?? [])
    .filter((o) => o.activo)
    .map((o) => ({ key: o.key, label: o.label, color: o.color }));

  const intereses: Opcion[] = (opciones?.interes ?? [])
    .filter((o) => o.activo)
    .map((o) => ({ key: o.key, label: o.label, color: o.color }));

  // Se incluyen los archivados: un lead clasificado antes de archivarlo sigue llevando esa clave,
  // y no poder segmentarlo dejaría gente inalcanzable por un cambio de catálogo.
  const semaforosOpciones: Opcion[] = (semaforos ?? []).map((s) => ({
    key: s.key,
    label: s.label,
    color: s.color,
  }));

  function parchear(parche: Partial<SegmentoFiltros>): void {
    onChange({ ...valor, ...parche });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <FiltroCatalogo
          etiqueta="Rol del contacto"
          opciones={roles}
          seleccion={valor.rolContacto ?? []}
          onChange={(rolContacto) => parchear({ rolContacto })}
          vacio="Tu empresa todavía no tiene roles configurados."
        />
        <FiltroCatalogo
          etiqueta="Semáforo del lead"
          opciones={semaforosOpciones}
          seleccion={valor.semaforoLead ?? []}
          onChange={(semaforoLead) => parchear({ semaforoLead })}
          vacio="Tu empresa todavía no tiene semáforos configurados."
        />
        <FiltroCatalogo
          etiqueta="Nivel de interés"
          opciones={intereses}
          seleccion={valor.nivelInteres ?? []}
          onChange={(nivelInteres) => parchear({ nivelInteres })}
          vacio="Tu empresa todavía no tiene niveles de interés configurados."
        />
      </div>

      <FiltroAtributos
        atributos={valor.atributos ?? []}
        onChange={(atributos) => parchear({ atributos })}
      />
    </div>
  );
}
