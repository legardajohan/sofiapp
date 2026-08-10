import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import type { KbTriEstado } from '../../types/index.js';
import { ConditionalReveal } from './ConditionalReveal.js';
import { FieldCounter } from './KnowledgeField.js';

const OPCIONES: ReadonlyArray<{ valor: KbTriEstado; etiqueta: string }> = [
  { valor: 'si', etiqueta: 'Sí' },
  { valor: 'no', etiqueta: 'No' },
  { valor: 'na', etiqueta: 'No aplica' },
];

interface PolicyTriStateProps {
  /** Prefijo de los `id` de los radios; debe ser único en el formulario. */
  id: string;
  valor: KbTriEstado;
  onValorChange: (valor: KbTriEstado) => void;
  /** Detalle opcional. Si se omite `onDetalleChange`, el tri-estado va solo. */
  detalle?: string;
  onDetalleChange?: (detalle: string) => void;
  detalleMaxLength?: number;
  /** Copy del detalle, p. ej. «¿Con qué condiciones?». */
  etiquetaDetalle?: string;
  /** En qué respuestas se pide el detalle. Por defecto, solo al responder «Sí». */
  detalleEn?: readonly KbTriEstado[];
}

/**
 * Respuesta de tres estados para una política: Sí / No / **No aplica**.
 *
 * El tercer estado no es un adorno: sin él, «no tenemos política de devoluciones» y «no aplica
 * porque no vendemos productos físicos» se guardarían igual, y la IA respondería lo mismo en dos
 * situaciones distintas. Por eso «No aplica» es una respuesta con valor propio y no un campo vacío
 * (ver `valorVacio` en `kb-schemas.ts`).
 *
 * Es un `RadioGroup` y no tres botones: la elección es excluyente y así la anuncian los lectores de
 * pantalla, con navegación por flechas incluida.
 */
export function PolicyTriState({
  id,
  valor,
  onValorChange,
  detalle = '',
  onDetalleChange,
  detalleMaxLength = 300,
  etiquetaDetalle = 'Detalle',
  detalleEn = ['si'],
}: PolicyTriStateProps): React.ReactElement {
  const pideDetalle = onDetalleChange !== undefined && detalleEn.includes(valor);
  const idDetalle = `${id}-detalle`;

  return (
    <div className="space-y-3">
      <RadioGroup
        value={valor}
        onValueChange={(siguiente) => onValorChange(siguiente as KbTriEstado)}
        className="flex flex-wrap gap-x-6 gap-y-2"
      >
        {OPCIONES.map((opcion) => (
          <div key={opcion.valor} className="flex items-center gap-2">
            <RadioGroupItem value={opcion.valor} id={`${id}-${opcion.valor}`} />
            <Label htmlFor={`${id}-${opcion.valor}`} className="font-normal">
              {opcion.etiqueta}
            </Label>
          </div>
        ))}
      </RadioGroup>

      <ConditionalReveal visible={pideDetalle}>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor={idDetalle} className="text-xs font-normal text-muted-foreground">
              {etiquetaDetalle}
            </Label>
            <FieldCounter length={detalle.length} max={detalleMaxLength} />
          </div>
          <Textarea
            id={idDetalle}
            value={detalle}
            onChange={(e) => onDetalleChange?.(e.target.value)}
            maxLength={detalleMaxLength}
            rows={2}
            className="resize-y"
          />
        </div>
      </ConditionalReveal>
    </div>
  );
}
