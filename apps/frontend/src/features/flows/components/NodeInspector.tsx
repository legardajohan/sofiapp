import { useState } from 'react';
import { AlertCircle, AlertTriangle, PanelRightClose, Plus, Trash2 } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { DestinoAsignacion } from '@sofiapp/shared';
import { DestinoSelector } from '@/components/users/DestinoSelector';
import { useTenantUsers } from '../../users/hooks/useTenantUsers.js';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { CapturaForm } from './CapturaForm.js';
import { ConditionEditor, type OpcionDestino } from './ConditionEditor.js';
import { DestinoSelect } from './DestinoSelect.js';
import { IaOutputsEditor } from './IaOutputsEditor.js';
import { NODE_VISUALS } from './nodeVisuals.js';
import { nombreDeNodo } from '../lib/graph.js';
import type { GravedadNodo } from './nodes/ProblemaNodo.js';
import type { ConfigNodo, EstadoComercial, IEtiquetaIntencion, INodo } from '../types.js';

/** Mismo umbral que `ConditionEditor` (criterio 7 de HU-FLOW-01-V3): a partir de este largo, la
 *  descripción de una intención ya no se lee cómoda en el input de una línea. */
const UMBRAL_EXPANDIR = 28;

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

function IntencionForm({ config, opcionesDestino, onChange }: FormProps<'intencion'>): React.ReactElement {
  const [expandidas, setExpandidas] = useState<Record<number, boolean>>({});

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
        {config.etiquetas.map((etiqueta, index) => {
          const esLarga = etiqueta.descripcion.length > UMBRAL_EXPANDIR;
          const expandida = esLarga && (expandidas[index] ?? false);
          return (
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
              disabled={expandida}
            />
            {esLarga ? (
              <button
                type="button"
                onClick={() => setExpandidas((prev) => ({ ...prev, [index]: !expandida }))}
                className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {expandida ? 'Ver menos' : 'Ver más'}
              </button>
            ) : null}
            <div
              className={cn(
                'grid transition-[grid-template-rows] duration-200 ease-out',
                expandida ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              )}
            >
              <div className="overflow-hidden">
                <Textarea
                  value={etiqueta.descripcion}
                  onChange={(e) => actualizar(index, { descripcion: e.target.value })}
                  rows={2}
                  className="text-xs"
                  aria-label="Descripción completa"
                />
              </div>
            </div>
            <DestinoSelect
              value={etiqueta.nodoDestino}
              opcionesDestino={opcionesDestino}
              onValueChange={(v) => actualizar(index, { nodoDestino: v })}
              placeholder="Destino…"
              ariaLabel="Nodo destino"
            />
          </div>
          );
        })}
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
        <DestinoSelect
          value={config.ramaPorDefecto}
          opcionesDestino={opcionesDestino}
          onValueChange={(v) => onChange({ ...config, ramaPorDefecto: v })}
          placeholder="Elige el nodo por defecto…"
          ariaLabel="Rama por defecto"
        />
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
                    ? { tipo, destino: DESTINO_NODO_POR_DEFECTO }
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
        <AsignarDestinoForm
          destino={efecto.destino ?? destinoDeUsuarioPrevio(efecto.asesorId) ?? DESTINO_NODO_POR_DEFECTO}
          onChange={(destino) => onChange({ ...config, efecto: { tipo: 'asignar_asesor', destino } })}
        />
      ) : null}
    </div>
  );
}

/** AUTH-06: lo que propone un nodo nuevo de asignación — el asesor con menos conversaciones. */
const DESTINO_NODO_POR_DEFECTO: DestinoAsignacion = {
  modo: 'grupo',
  grupo: { tipo: 'rol', rol: 'asesor' },
  criterio: 'menor_carga',
  soloEnLinea: false,
  reserva: { tipo: 'cualquiera' },
};

/** Un nodo guardado antes de AUTH-06 con un id de usuario se edita como destino «usuario». */
function destinoDeUsuarioPrevio(usuarioId: string | undefined): DestinoAsignacion | null {
  return usuarioId ? { modo: 'usuario', usuarioId, reserva: { tipo: 'cualquiera' } } : null;
}

function AsignarDestinoForm({
  destino,
  onChange,
}: {
  destino: DestinoAsignacion;
  onChange: (d: DestinoAsignacion) => void;
}): React.ReactElement {
  const { data: usuarios } = useTenantUsers({ alAbrir: true });
  return (
    <DestinoSelector
      idPrefix="nodo-asignar"
      etiqueta="A quién se asigna"
      value={destino}
      onChange={(d) => d && onChange(d)}
      usuarios={usuarios}
    />
  );
}

function HandoffForm({ config, onChange }: FormProps<'handoff'>): React.ReactElement {
  const { data: usuarios } = useTenantUsers({ alAbrir: true });
  const destino = config.destino ?? destinoDeUsuarioPrevio(config.notificarAsesorId);

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
      <DestinoSelector
        idPrefix="nodo-handoff"
        etiqueta="A quién se transfiere"
        value={destino}
        opcionGeneral="Como diga la configuración de transferencia"
        onChange={(d) => {
          // El formato previo (`notificarAsesorId`) se retira al editar: manda `destino`.
          const { notificarAsesorId: _previo, destino: _destino, ...resto } = config;
          void _previo;
          void _destino;
          onChange(d ? { ...resto, destino: d } : resto);
        }}
        usuarios={usuarios}
      />
      {destino === null && (
        <p className="text-[11px] text-muted-foreground">
          Se usa lo que esté elegido en Asistente IA › Transferencia a un usuario. Si la conversación
          ya tiene a alguien asignado, se queda con esa persona.
        </p>
      )}
    </div>
  );
}

/** Previsión legible del plazo, para no dejar los minutos como un número desnudo (HU-FLOW-02). */
function previsionEspera(minutos: number): string {
  if (minutos < 60) return `se reanuda ~${minutos} min después`;
  const horas = minutos / 60;
  const horasTexto = Number.isInteger(horas) ? horas : horas.toFixed(1);
  return `se reanuda ~${horasTexto} h después`;
}

function EsperaForm({ config, onChange }: FormProps<'espera'>): React.ReactElement {
  return (
    <div className="space-y-4">
      <Field label="Minutos de espera">
        <Input
          type="number"
          min={1}
          value={config.minutos}
          onChange={(e) => onChange({ ...config, minutos: Number(e.target.value) || 1 })}
        />
      </Field>
      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        El flujo se detiene aquí y {previsionEspera(config.minutos)}, sin que el cliente tenga que
        responder nada.
      </div>
    </div>
  );
}

function IaForm({ config, opcionesDestino, onChange }: FormProps<'ia'>): React.ReactElement {
  return (
    <div className="space-y-4">
      <Field label="Objetivo (lo que debe lograr el asistente mientras tenga el turno)">
        <Textarea
          value={config.objetivo}
          onChange={(e) => onChange({ ...config, objetivo: e.target.value })}
          placeholder="Descubrir si el cliente ya decidió comprar o solo está averiguando precios."
          rows={3}
        />
      </Field>

      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
        <div className="space-y-0.5">
          <Label className="text-xs font-medium text-foreground">Consultar la base de conocimiento</Label>
          <p className="text-[11px] text-muted-foreground">Responde apoyándose en la KB del negocio.</p>
        </div>
        <Switch checked={config.usarKb} onCheckedChange={(v) => onChange({ ...config, usarKb: v })} />
      </div>

      <Field label="Máximo de turnos">
        <Input
          type="number"
          min={1}
          max={10}
          value={config.maxTurnos}
          onChange={(e) => onChange({ ...config, maxTurnos: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Cada turno es una consulta al modelo. Al llegar al tope, el nodo sale por su rama por
          defecto sin volver a preguntar.
        </p>
      </Field>

      <div className="space-y-2 border-t border-border pt-3">
        <Label className="text-xs text-muted-foreground">Cuándo se cumple cada salida</Label>
        <IaOutputsEditor
          salidas={config.salidas}
          opcionesDestino={opcionesDestino}
          onChange={(salidas) => onChange({ ...config, salidas })}
        />
      </div>

      <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Al elegir una salida, el mensaje lo da el nodo siguiente — este nodo no envía nada en ese
        turno.
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <Label className="text-xs text-muted-foreground">Si no resuelve, ir a</Label>
        <DestinoSelect
          value={config.ramaPorDefecto}
          opcionesDestino={opcionesDestino}
          onValueChange={(v) => onChange({ ...config, ramaPorDefecto: v })}
          placeholder="Elige el nodo por defecto…"
          ariaLabel="Rama por defecto"
        />
      </div>
    </div>
  );
}

/** Una sola línea con lo que falta; el detalle se abre como acordeón (nunca ocupa el panel por defecto). */
function ResumenProblemas({
  lineas,
  gravedad,
}: {
  lineas: string[];
  gravedad: GravedadNodo;
}): React.ReactElement {
  const esError = gravedad === 'error';
  const Icono = esError ? AlertCircle : AlertTriangle;
  const n = lineas.length;
  const titulo = esError
    ? n === 1
      ? '1 error en este nodo'
      : `${n} errores en este nodo`
    : n === 1
      ? 'Falta 1 cosa por configurar'
      : `Faltan ${n} cosas por configurar`;
  return (
    <Accordion
      type="single"
      collapsible
      role="alert"
      className={cn(
        'mx-4 mt-3 rounded-md border px-3',
        esError ? 'border-destructive/40 bg-destructive-subtle' : 'border-amber-500/40 bg-muted/40',
      )}
    >
      <AccordionItem value="problemas" className="border-b-0">
        <AccordionTrigger className="py-2 text-xs font-medium hover:no-underline">
          <span className={cn('flex items-center gap-2', esError ? 'text-destructive' : 'text-amber-700 dark:text-amber-400')}>
            <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {titulo}
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-2 text-xs text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            {lineas.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

interface NodeInspectorProps {
  nodo: INodo | null;
  esEntrada: boolean;
  /** Error de forma que devolvió el servidor al guardar. */
  error?: string;
  /** Lo que le falta al nodo, en vivo (HU-FLOW-05). Vacío = listo. */
  problemas?: string[];
  onNombreChange: (nombre: string) => void;
  opcionesDestino: OpcionDestino[];
  onChange: (config: ConfigNodo) => void;
  onDelete: () => void;
  onMarcarEntrada: () => void;
  /** Gravedad del estado del nodo: define el color del aviso (ámbar = incompleto, rojo = roto). */
  gravedad?: GravedadNodo;
  /** Oculta el panel (el nodo sigue seleccionado). */
  onCerrar?: () => void;
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
  problemas = [],
  onNombreChange,
  opcionesDestino,
  onChange,
  onDelete,
  onMarcarEntrada,
  gravedad = 'error',
  onCerrar,
}: NodeInspectorProps): React.ReactElement {
  // Sin nodo seleccionado no hay nada que configurar: la página ni siquiera monta el panel.
  if (!nodo) return <></>;

  const visual = NODE_VISUALS[nodo.tipo];
  const Icon = visual.icon;

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-card lg:w-96">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{nombreDeNodo(nodo)}</p>
          {nodo.nombre?.trim() ? <p className="truncate text-xs text-muted-foreground">{visual.label}</p> : null}
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
          {onCerrar ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              onClick={onCerrar}
              aria-label="Ocultar panel"
            >
              <PanelRightClose className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Nombre propio del nodo (HU-FLOW-05): hace legible un flujo con varios nodos del mismo tipo. */}
      <div className="space-y-1.5 border-b border-border px-4 py-3">
        <Label htmlFor="nodo-nombre" className="text-xs text-muted-foreground">
          Nombre del nodo
        </Label>
        <Input
          id="nodo-nombre"
          value={nodo.nombre ?? ''}
          maxLength={60}
          onChange={(e) => onNombreChange(e.target.value)}
          placeholder={visual.label}
          className="h-8 text-sm"
        />
      </div>

      {error || problemas.length > 0 ? (
        <ResumenProblemas lineas={[...(error ? [error] : []), ...problemas]} gravedad={error ? 'error' : gravedad} />
      ) : null}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {nodo.config.tipo === 'mensaje' ? (
          <MensajeForm config={nodo.config} opcionesDestino={opcionesDestino} onChange={onChange} />
        ) : null}
        {nodo.config.tipo === 'captura' ? (
          <CapturaForm config={nodo.config} onChange={onChange} />
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
        {nodo.config.tipo === 'ia' ? (
          <IaForm config={nodo.config} opcionesDestino={opcionesDestino} onChange={onChange} />
        ) : null}
      </div>
    </div>
  );
}
