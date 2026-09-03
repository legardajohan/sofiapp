import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { ConditionEditor, type OpcionDestino } from './ConditionEditor.js';
import { NODE_VISUALS } from './nodeVisuals.js';
import type { ConfigNodo, EstadoComercial, IEtiquetaIntencion, INodo } from '../types.js';

const ESTADOS_COMERCIALES: { valor: EstadoComercial; label: string }[] = [
  { valor: 'nuevo', label: 'Nuevo' },
  { valor: 'en_gestion', label: 'En gestión' },
  { valor: 'pago_pendiente', label: 'Pago pendiente' },
  { valor: 'pagado', label: 'Pagado' },
  { valor: 'perdido', label: 'Perdido' },
];

interface FormProps<T extends ConfigNodo['tipo']> {
  config: Extract<ConfigNodo, { tipo: T }>;
  opcionesDestino: OpcionDestino[];
  onChange: (config: ConfigNodo) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function MensajeForm({ config, onChange }: FormProps<'mensaje'>): React.ReactElement {
  return (
    <Field label="Texto que envía el flujo">
      <Textarea
        value={config.texto ?? ''}
        onChange={(e) => onChange({ ...config, texto: e.target.value })}
        placeholder="Escribe el mensaje…"
        rows={4}
      />
    </Field>
  );
}

function CapturaForm({ config, onChange }: FormProps<'captura'>): React.ReactElement {
  return (
    <div className="space-y-4">
      <Field label="Pregunta que se le hace al cliente">
        <Textarea
          value={config.pregunta}
          onChange={(e) => onChange({ ...config, pregunta: e.target.value })}
          placeholder="¿Cuál es tu correo?"
          rows={2}
        />
      </Field>
      <Field label="Nombre del dato (variable)">
        <Input
          value={config.campo}
          onChange={(e) => onChange({ ...config, campo: e.target.value })}
          placeholder="correo"
        />
      </Field>
      <Field label="Qué se espera (para la IA que extrae la respuesta)">
        <Input
          value={config.descripcion}
          onChange={(e) => onChange({ ...config, descripcion: e.target.value })}
          placeholder="Correo electrónico del cliente"
        />
      </Field>
      <Field label="Tipo de dato">
        <Select
          value={config.tipoDato}
          onValueChange={(v) => onChange({ ...config, tipoDato: v as typeof config.tipoDato })}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="texto">Texto</SelectItem>
            <SelectItem value="numero">Número</SelectItem>
            <SelectItem value="fecha">Fecha</SelectItem>
            <SelectItem value="booleano">Sí / No</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function IntencionForm({ config, opcionesDestino, onChange }: FormProps<'intencion'>): React.ReactElement {
  function actualizar(index: number, cambio: Partial<IEtiquetaIntencion>): void {
    onChange({
      ...config,
      etiquetas: config.etiquetas.map((e, i) => (i === index ? { ...e, ...cambio } : e)),
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Intenciones que reconoce este nodo</Label>
        {config.etiquetas.map((etiqueta, index) => (
          <div key={index} className="space-y-1.5 rounded-md border border-border bg-muted/30 p-2">
            <div className="flex items-center gap-1.5">
              <Input
                value={etiqueta.etiqueta}
                onChange={(e) => actualizar(index, { etiqueta: e.target.value })}
                placeholder="quiere_precio"
                className="h-8 text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  onChange({ ...config, etiquetas: config.etiquetas.filter((_, i) => i !== index) })
                }
                aria-label="Eliminar intención"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Input
              value={etiqueta.descripcion}
              onChange={(e) => actualizar(index, { descripcion: e.target.value })}
              placeholder="El cliente pregunta por precios o planes"
              className="h-8 text-xs"
            />
            <Select value={etiqueta.nodoDestino || undefined} onValueChange={(v) => actualizar(index, { nodoDestino: v })}>
              <SelectTrigger className="h-8 text-xs" aria-label="Nodo destino">
                <SelectValue placeholder="Destino…" />
              </SelectTrigger>
              <SelectContent>
                {opcionesDestino.map((op) => (
                  <SelectItem key={op.id} value={op.id} className="text-xs">
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            onChange({
              ...config,
              etiquetas: [...config.etiquetas, { etiqueta: '', descripcion: '', nodoDestino: '' }],
            })
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Agregar intención
        </Button>
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <Label className="text-xs text-muted-foreground">Si no reconoce ninguna, ir a</Label>
        <Select value={config.ramaPorDefecto || undefined} onValueChange={(v) => onChange({ ...config, ramaPorDefecto: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Elige el nodo por defecto…" />
          </SelectTrigger>
          <SelectContent>
            {opcionesDestino.map((op) => (
              <SelectItem key={op.id} value={op.id} className="text-xs">
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function KbForm({ config, onChange }: FormProps<'kb'>): React.ReactElement {
  const usaUltimoMensaje = config.pregunta === 'ultimo_mensaje';
  return (
    <div className="space-y-4">
      <Field label="Qué se le pregunta a la base de conocimiento">
        <Select
          value={usaUltimoMensaje ? 'ultimo_mensaje' : 'fija'}
          onValueChange={(v) => onChange({ ...config, pregunta: v === 'ultimo_mensaje' ? 'ultimo_mensaje' : '' })}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ultimo_mensaje">Lo que el cliente acaba de escribir</SelectItem>
            <SelectItem value="fija">Una pregunta fija</SelectItem>
          </SelectContent>
        </Select>
        {!usaUltimoMensaje ? (
          <Textarea
            value={config.pregunta === 'ultimo_mensaje' ? '' : config.pregunta}
            onChange={(e) => onChange({ ...config, pregunta: e.target.value })}
            placeholder="¿Cuáles son los horarios de atención?"
            rows={2}
            className="mt-1.5"
          />
        ) : null}
      </Field>
      <Field label="Si no hay respuesta en la base de conocimiento">
        <Textarea
          value={config.siNoHayRespuesta}
          onChange={(e) => onChange({ ...config, siNoHayRespuesta: e.target.value })}
          placeholder="No tengo esa información, un asesor te ayuda enseguida."
          rows={2}
        />
      </Field>
    </div>
  );
}

function AccionForm({ config, onChange }: FormProps<'accion'>): React.ReactElement {
  const { efecto } = config;
  return (
    <div className="space-y-4">
      <Field label="Qué hace este nodo">
        <Select
          value={efecto.tipo}
          onValueChange={(v) => {
            const tipo = v as typeof efecto.tipo;
            const nuevoEfecto =
              tipo === 'cambiar_estado'
                ? { tipo, estado: 'en_gestion' as EstadoComercial }
                : tipo === 'aplicar_etiquetas'
                  ? { tipo, tagIds: [] }
                  : tipo === 'asignar_asesor'
                    ? { tipo, asesorId: '' }
                    : { tipo: 'crear_lead' as const };
            onChange({ ...config, efecto: nuevoEfecto });
          }}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cambiar_estado">Cambiar el estado comercial</SelectItem>
            <SelectItem value="aplicar_etiquetas">Aplicar etiquetas</SelectItem>
            <SelectItem value="crear_lead">Crear un lead</SelectItem>
            <SelectItem value="asignar_asesor">Asignar un asesor</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {efecto.tipo === 'cambiar_estado' ? (
        <Field label="Nuevo estado">
          <Select
            value={efecto.estado}
            onValueChange={(v) => onChange({ ...config, efecto: { tipo: 'cambiar_estado', estado: v as EstadoComercial } })}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTADOS_COMERCIALES.map((e) => (
                <SelectItem key={e.valor} value={e.valor}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      {efecto.tipo === 'aplicar_etiquetas' ? (
        <Field label="IDs de las etiquetas (separados por coma)">
          <Input
            value={efecto.tagIds.join(', ')}
            onChange={(e) =>
              onChange({
                ...config,
                efecto: {
                  tipo: 'aplicar_etiquetas',
                  tagIds: e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
              })
            }
            placeholder="507f1f77bcf86cd799439011"
          />
        </Field>
      ) : null}

      {efecto.tipo === 'asignar_asesor' ? (
        <Field label="ID del asesor">
          <Input
            value={efecto.asesorId}
            onChange={(e) => onChange({ ...config, efecto: { tipo: 'asignar_asesor', asesorId: e.target.value } })}
            placeholder="507f1f77bcf86cd799439011"
          />
        </Field>
      ) : null}
    </div>
  );
}

function HandoffForm({ config, onChange }: FormProps<'handoff'>): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-destructive/30 bg-destructive-subtle px-3 py-2 text-xs text-destructive">
        Este nodo apaga el automatismo para la conversación: a partir de aquí responde un asesor,
        no el flujo.
      </div>
      <Field label="Motivo (opcional, queda para el asesor)">
        <Textarea
          value={config.motivo ?? ''}
          onChange={(e) => onChange({ ...config, motivo: e.target.value })}
          placeholder="El cliente pidió hablar con una persona"
          rows={2}
        />
      </Field>
      <Field label="ID del asesor a notificar (opcional)">
        <Input
          value={config.notificarAsesorId ?? ''}
          onChange={(e) => onChange({ ...config, notificarAsesorId: e.target.value })}
          placeholder="507f1f77bcf86cd799439011"
        />
      </Field>
    </div>
  );
}

function EsperaForm({ config, onChange }: FormProps<'espera'>): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Los nodos de espera se guardan, pero el flujo todavía no los ejecuta — llega con
        HU-FLOW-02.
      </div>
      <Field label="Minutos de espera">
        <Input
          type="number"
          min={1}
          value={config.minutos}
          onChange={(e) => onChange({ ...config, minutos: Number(e.target.value) || 1 })}
        />
      </Field>
    </div>
  );
}

interface NodeInspectorProps {
  nodo: INodo | null;
  esEntrada: boolean;
  error?: string;
  opcionesDestino: OpcionDestino[];
  onChange: (config: ConfigNodo) => void;
  onDelete: () => void;
  onMarcarEntrada: () => void;
}

/**
 * Panel lateral de ancho fijo (nunca `absolute` sobre el canvas, criterio 22): configura el nodo
 * seleccionado. Para `condicion` es prácticamente todo el panel — es la tarea literal de la
 * historia y tiene que sentirse así, no como un campo más de un formulario largo.
 */
export function NodeInspector({
  nodo,
  esEntrada,
  error,
  opcionesDestino,
  onChange,
  onDelete,
  onMarcarEntrada,
}: NodeInspectorProps): React.ReactElement {
  if (!nodo) {
    return (
      <div className="flex h-full w-80 shrink-0 flex-col items-center justify-center border-l border-border bg-card px-6 text-center lg:w-96">
        <p className="text-sm text-muted-foreground">
          Selecciona un nodo del canvas para configurarlo.
        </p>
      </div>
    );
  }

  const visual = NODE_VISUALS[nodo.tipo];
  const Icon = visual.icon;

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-card lg:w-96">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{visual.label}</p>
          {esEntrada ? <p className="text-xs text-primary">Nodo de inicio</p> : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {!esEntrada ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={onMarcarEntrada}
            >
              Marcar como inicio
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            aria-label="Eliminar nodo"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive-subtle px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {nodo.config.tipo === 'mensaje' ? (
          <MensajeForm config={nodo.config} opcionesDestino={opcionesDestino} onChange={onChange} />
        ) : null}
        {nodo.config.tipo === 'captura' ? (
          <CapturaForm config={nodo.config} opcionesDestino={opcionesDestino} onChange={onChange} />
        ) : null}
        {nodo.config.tipo === 'condicion' ? (
          <ConditionEditor
            ramas={nodo.config.ramas}
            ramaPorDefecto={nodo.config.ramaPorDefecto}
            opcionesDestino={opcionesDestino}
            onChange={(ramas, ramaPorDefecto) =>
              onChange({ ...nodo.config, ramas, ramaPorDefecto } as ConfigNodo)
            }
          />
        ) : null}
        {nodo.config.tipo === 'intencion' ? (
          <IntencionForm config={nodo.config} opcionesDestino={opcionesDestino} onChange={onChange} />
        ) : null}
        {nodo.config.tipo === 'kb' ? (
          <KbForm config={nodo.config} opcionesDestino={opcionesDestino} onChange={onChange} />
        ) : null}
        {nodo.config.tipo === 'accion' ? (
          <AccionForm config={nodo.config} opcionesDestino={opcionesDestino} onChange={onChange} />
        ) : null}
        {nodo.config.tipo === 'handoff' ? (
          <HandoffForm config={nodo.config} opcionesDestino={opcionesDestino} onChange={onChange} />
        ) : null}
        {nodo.config.tipo === 'espera' ? (
          <EsperaForm config={nodo.config} opcionesDestino={opcionesDestino} onChange={onChange} />
        ) : null}
      </div>
    </div>
  );
}
