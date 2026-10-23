import { useState } from 'react';
import { Play, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DIAS_SEMANA,
  TRIGGER_LABEL,
  ZONAS_COMUNES,
  resumenTrigger,
  triggerPorTipo,
} from '../lib/trigger.js';
import { TIPOS_TRIGGER, type IHorarioTrigger, type ITriggerFlow, type TipoTrigger } from '../types.js';

interface TriggerSettingsProps {
  value: ITriggerFlow;
  onChange: (trigger: ITriggerFlow) => void;
}

/**
 * Disparador del flujo (HU-FLOW-04): cuándo arranca. Vive en un popover del encabezado y no en el
 * inspector porque es una propiedad del flujo entero, no de un nodo, y tiene que seguir a la vista
 * aunque haya un nodo seleccionado. El botón ya resume la regla vigente, así que casi nunca hace
 * falta abrirlo para saber cómo está configurado.
 */
export function TriggerSettings({ value, onChange }: TriggerSettingsProps): React.ReactElement {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-64 gap-1.5">
          <Play className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="shrink-0 text-muted-foreground">Arranca:</span>
          <span className="truncate">{resumenTrigger(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">¿Cuándo arranca este flujo?</h2>
          <p className="text-xs text-muted-foreground">
            Se evalúa cuando un cliente escribe y aún no está dentro del flujo. Si no se cumple,
            responde Sofi con tu base de conocimiento.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Disparador</Label>
          <Select
            value={value.tipo}
            onValueChange={(tipo) => onChange(triggerPorTipo(tipo as TipoTrigger, value))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_TRIGGER.map((tipo) => (
                <SelectItem key={tipo} value={tipo}>
                  {TRIGGER_LABEL[tipo]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {value.tipo === 'palabra_clave' ? (
          <PalabrasEditor
            palabras={value.palabras ?? []}
            onChange={(palabras) => onChange({ tipo: 'palabra_clave', palabras })}
          />
        ) : null}

        {value.tipo === 'horario' && value.horario ? (
          <HorarioEditor
            horario={value.horario}
            onChange={(horario) => onChange({ tipo: 'horario', horario })}
          />
        ) : null}

        {value.tipo === 'siempre' ? (
          <p className="text-xs text-muted-foreground">
            Cualquier mensaje de un cliente nuevo o que ya terminó el flujo lo inicia.
          </p>
        ) : null}
        {value.tipo === 'primer_mensaje' ? (
          <p className="text-xs text-muted-foreground">
            Solo inicia con el primer mensaje que el cliente te escribe. Si ya había conversado antes,
            responde Sofi.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function PalabrasEditor({
  palabras,
  onChange,
}: {
  palabras: string[];
  onChange: (palabras: string[]) => void;
}): React.ReactElement {
  const [borrador, setBorrador] = useState('');

  function agregar(): void {
    const nueva = borrador.trim();
    setBorrador('');
    if (!nueva || palabras.some((p) => p.toLowerCase() === nueva.toLowerCase())) return;
    onChange([...palabras, nueva]);
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Palabras que lo inician</Label>
      <Input
        value={borrador}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={agregar}
        onKeyDown={(e) => {
          // `isComposing`: el panel de emojis/IME del SO confirma con Enter y no debe agregar.
          if ((e.key === 'Enter' || e.key === ',') && !e.nativeEvent.isComposing) {
            e.preventDefault();
            agregar();
          }
        }}
        placeholder="precio, horario… y pulsa Enter"
        maxLength={60}
      />
      {palabras.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {palabras.map((palabra) => (
            <li key={palabra}>
              <Badge variant="secondary" className="gap-1 pr-1">
                {palabra}
                <button
                  type="button"
                  onClick={() => onChange(palabras.filter((p) => p !== palabra))}
                  aria-label={`Quitar ${palabra}`}
                  className="rounded-sm p-0.5 text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Basta con una. No distingue mayúsculas ni tildes: «precio» también reconoce «¿Cuál es el
        PRECIO?». Busca la palabra tal cual, no entiende sinónimos.
      </p>
    </div>
  );
}

function HorarioEditor({
  horario,
  onChange,
}: {
  horario: IHorarioTrigger;
  onChange: (horario: IHorarioTrigger) => void;
}): React.ReactElement {
  const zonas = ZONAS_COMUNES.includes(horario.zonaHoraria)
    ? ZONAS_COMUNES
    : [horario.zonaHoraria, ...ZONAS_COMUNES];

  function alternarDia(dia: number): void {
    const dias = horario.dias.includes(dia) ? horario.dias.filter((d) => d !== dia) : [...horario.dias, dia];
    onChange({ ...horario, dias });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Días</Label>
        <div className="flex gap-1.5" role="group" aria-label="Días de la semana">
          {DIAS_SEMANA.map((dia) => {
            const activo = horario.dias.includes(dia.valor);
            return (
              <Button
                key={dia.valor}
                type="button"
                size="icon"
                variant={activo ? 'default' : 'outline'}
                className="size-8 text-xs"
                aria-pressed={activo}
                aria-label={dia.largo}
                title={dia.largo}
                onClick={() => alternarDia(dia.valor)}
              >
                {dia.corto}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input type="time" value={horario.desde} onChange={(e) => onChange({ ...horario, desde: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input type="time" value={horario.hasta} onChange={(e) => onChange({ ...horario, hasta: e.target.value })} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Zona horaria</Label>
        <Select value={horario.zonaHoraria} onValueChange={(zonaHoraria) => onChange({ ...horario, zonaHoraria })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {zonas.map((zona) => (
              <SelectItem key={zona} value={zona}>
                {zona.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Fuera de este horario responde Sofi. El rango incluye la hora de inicio y excluye la de fin.
        </p>
      </div>
    </div>
  );
}
