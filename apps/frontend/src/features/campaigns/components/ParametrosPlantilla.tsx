import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ETIQUETA_VARIABLE } from '../lib/variables.js';
import { CAMPOS_CONTACTO, type CampoContacto, type ParametroDinamico } from '../types.js';

type Origen = 'fijo' | CampoContacto;

/** Lo que se pide en el campo cuando el hueco es una variable: el plan B, dicho en concreto. */
const RESPALDO: Record<CampoContacto, string> = {
  nombre: 'Si no tiene nombre, usar…',
  telefono: 'Si no tiene teléfono, usar…',
};

interface Props {
  cantidad: number;
  parametros: string[];
  dinamicos: ParametroDinamico[];
  /** Ejemplos de la plantilla, para el placeholder de los huecos fijos. */
  ejemplos?: string[];
  etiqueta: string;
  onChange: (parametros: string[], dinamicos: ParametroDinamico[]) => void;
}

/**
 * Los huecos `{{n}}` de una plantilla (HU-MARK-05): cada uno es un texto fijo para todos o un dato
 * de cada contacto. Lo comparten el wizard y el programador, que antes repetían el mismo bloque.
 *
 * Una variable sigue pidiendo texto: es el respaldo para el contacto que no tiene ese dato. Meta
 * rechaza un parámetro vacío, así que sin él ese envío fallaría.
 */
export function ParametrosPlantilla({
  cantidad,
  parametros,
  dinamicos,
  ejemplos = [],
  etiqueta,
  onChange,
}: Props): React.ReactElement {
  const origenDe = (i: number): Origen => dinamicos.find((d) => d.indice === i)?.campo ?? 'fijo';
  const hayVariables = dinamicos.length > 0;

  function cambiarOrigen(i: number, origen: Origen): void {
    const resto = dinamicos.filter((d) => d.indice !== i);
    onChange(
      parametros,
      origen === 'fijo'
        ? resto
        : [...resto, { indice: i, campo: origen }].sort((a, b) => a.indice - b.indice),
    );
  }

  function cambiarTexto(i: number, texto: string): void {
    const siguientes = [...parametros];
    siguientes[i] = texto;
    onChange(siguientes, dinamicos);
  }

  return (
    <div className="space-y-2">
      <Label>{etiqueta}</Label>
      {Array.from({ length: cantidad }, (_, i) => {
        const origen = origenDe(i);
        return (
          <div key={i} className="flex flex-col gap-2 sm:flex-row">
            <Select value={origen} onValueChange={(v) => cambiarOrigen(i, v as Origen)}>
              <SelectTrigger
                className="sm:w-48 sm:shrink-0"
                aria-label={`Qué va en el hueco ${i + 1}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fijo">Texto fijo</SelectItem>
                {CAMPOS_CONTACTO.map((campo) => (
                  <SelectItem key={campo} value={campo}>
                    {ETIQUETA_VARIABLE[campo]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={parametros[i] ?? ''}
              onChange={(e) => cambiarTexto(i, e.target.value)}
              placeholder={
                origen === 'fijo' ? (ejemplos[i] ?? `Valor para {{${i + 1}}}`) : RESPALDO[origen]
              }
              aria-label={
                origen === 'fijo'
                  ? `Valor para el hueco ${i + 1}`
                  : `Texto de respaldo para el hueco ${i + 1}`
              }
            />
          </div>
        );
      })}
      <p className="text-sm text-muted-foreground">
        {hayVariables
          ? 'Cada contacto recibe su propio dato. Si le falta, se usa el texto que escribiste.'
          : 'El mismo texto va a todos los contactos de la campaña.'}
      </p>
    </div>
  );
}
