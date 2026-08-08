import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Lock, Settings2, Sparkles } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { MOTIVO_DATOS_SENSIBLES } from '@/lib/roles';
import type { ContactCardDTO, DatosExtraidosDTO } from '@/features/inbox/types';
import { useUpdateContact } from '../hooks/useUpdateContact.js';
import { useContactOptions } from '../hooks/useContactOptions.js';
import { errorMessage } from '../lib/errors.js';
import { slugificar } from '../lib/slug.js';
import { estaVacio, hayErrores, validarFicha } from '../lib/validate.js';
import { AtributosEditor } from './AtributosEditor.js';
import { PuntoColor } from './OpcionChip.js';
import { OpcionesManager } from './OpcionesManager.js';
import type { AtributoInput, ContactPatchPayload, OpcionDTO, TipoOpcion } from '../types.js';

interface Props {
  contacto: ContactCardDTO;
  /**
   * Datos que la IA extrajo de la conversación (HU-OMNI-03). Se usan para **proponer** lo que el
   * contacto todavía no tiene registrado; nunca pisan un dato ya guardado.
   */
  datosExtraidos?: DatosExtraidosDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const pressable =
  'transition-[transform,color,background-color] duration-150 ease-out motion-safe:active:scale-[0.98]';

/** `SIN_VALOR` existe porque un `<Select>` de Radix no admite un item con `value=""`. */
const SIN_VALOR = '__ninguno__';

/**
 * Los tres catálogos, en el orden en que se leen en el formulario. Ya no son constantes: interés,
 * objeción y rol son listas que cada empresa administra desde este mismo diálogo (HU-CRM-02), así
 * que lo único fijo aquí es cómo se llama cada campo en pantalla.
 */
const CATALOGOS: { tipo: TipoOpcion; campo: keyof Campos; id: string; label: string; nombre: string }[] = [
  { tipo: 'interes', campo: 'nivelInteres', id: 'contacto-nivel', label: 'Interés', nombre: 'interés' },
  { tipo: 'objecion', campo: 'objecionPrincipal', id: 'contacto-objecion', label: 'Objeción', nombre: 'objeción' },
  { tipo: 'rol', campo: 'rolContacto', id: 'contacto-rol', label: 'Rol', nombre: 'rol' },
];

interface Campos {
  nombre: string;
  telefono: string;
  correo: string;
  documento: string;
  nivelInteres: string;
  objecionPrincipal: string;
  rolContacto: string;
  atributos: AtributoInput[];
}

/** Campos que se sembraron desde la extracción de IA, para poder señalarlos en la UI. */
type CampoSugerido = 'nombre' | 'correo';

/**
 * Toma de la extracción de IA solo lo que el contacto **no** tiene registrado. Es un relleno de
 * huecos, no una sincronización: un dato que el asesor ya guardó a mano manda sobre la inferencia
 * del modelo, igual que `datosExtraidos` nunca pisa `nombre`/`telefono` en el backend.
 */
function sugerir(
  guardado: string | null,
  extraido: string | null | undefined,
  campo: CampoSugerido,
  sugeridos: Set<CampoSugerido>,
): string {
  if (guardado !== null && guardado !== '') return guardado;
  if (!extraido) return '';
  sugeridos.add(campo);
  return extraido;
}

function desdeContacto(
  c: ContactCardDTO,
  extraidos: DatosExtraidosDTO | null | undefined,
  sugeridos: Set<CampoSugerido>,
): Campos {
  // Sin permiso, `datosExtraidos.correo` llega enmascarado igual que `contacto.correo`: proponerlo
  // escribiría los puntos como si fueran el correo real.
  const ia = c.puedeVerSensibles ? extraidos : null;

  return {
    nombre: sugerir(c.nombre, extraidos?.nombreCompleto, 'nombre', sugeridos),
    // El teléfono no se propone desde la extracción: `datosExtraidos.telefono` cae al número de
    // WhatsApp cuando la conversación no dicta otro, así que "proponerlo" sería proponer el valor
    // que ya está guardado.
    telefono: c.telefono,
    // Un valor enmascarado NUNCA se siembra en el input: guardarlo escribiría los puntos como si
    // fueran el correo real. Sin permiso el campo va vacío y deshabilitado.
    correo: c.puedeVerSensibles ? sugerir(c.correo, ia?.correo, 'correo', sugeridos) : '',
    documento: c.puedeVerSensibles ? (c.documento ?? '') : '',
    nivelInteres: c.nivelInteres ?? SIN_VALOR,
    objecionPrincipal: c.objecionPrincipal ?? SIN_VALOR,
    rolContacto: c.rolContacto ?? SIN_VALOR,
    atributos: c.atributos.map((a) => ({
      key: a.key,
      label: a.label,
      // Igual que arriba: un atributo oculto se conserva tal cual, sin exponer ni pisar su valor.
      valor: a.oculto ? '' : a.valor,
      sensible: a.sensible,
    })),
  };
}

/** `null` para vaciar, `undefined` para no tocar: la misma semántica que aplica el backend. */
function textoAPatch(actual: string, original: string | null): string | null | undefined {
  const limpio = actual.trim();
  const normalizado = limpio === '' ? null : limpio;
  return normalizado === original ? undefined : normalizado;
}

function selectAPatch(actual: string, original: string | null): string | null | undefined {
  const normalizado = actual === SIN_VALOR ? null : actual;
  return normalizado === original ? undefined : normalizado;
}

export function ContactEditDialog({
  contacto,
  datosExtraidos,
  open,
  onOpenChange,
}: Props): React.ReactElement {
  const [campos, setCampos] = useState<Campos>(() => desdeContacto(contacto, null, new Set()));
  const [sugeridos, setSugeridos] = useState<Set<CampoSugerido>>(() => new Set());
  /** Catálogo cuyo CRUD está abierto, o `null`. Solo uno a la vez: son tres listas cortas. */
  const [gestionando, setGestionando] = useState<TipoOpcion | null>(null);
  const sembrado = useRef<string | null>(null);
  const guardar = useUpdateContact(contacto.id);
  const opciones = useContactOptions();
  const puedeSensibles = contacto.puedeVerSensibles;

  // Se siembra UNA vez por apertura: si la ficha se refresca mientras el asesor escribe, sus
  // cambios no deben desaparecer bajo el cursor.
  useEffect(() => {
    if (!open) {
      sembrado.current = null;
      return;
    }
    if (sembrado.current === contacto.id) return;
    sembrado.current = contacto.id;
    const marcados = new Set<CampoSugerido>();
    setCampos(desdeContacto(contacto, datosExtraidos, marcados));
    setSugeridos(marcados);
  }, [open, contacto, datosExtraidos]);

  function construirPatch(): ContactPatchPayload {
    const patch: ContactPatchPayload = {};

    const nombre = textoAPatch(campos.nombre, contacto.nombre);
    if (nombre !== undefined) patch.nombre = nombre;

    const telefono = textoAPatch(campos.telefono, contacto.telefono);
    if (telefono !== undefined) patch.telefono = telefono;

    if (puedeSensibles) {
      const correo = textoAPatch(campos.correo, contacto.correo);
      if (correo !== undefined) patch.correo = correo;
      const documento = textoAPatch(campos.documento, contacto.documento);
      if (documento !== undefined) patch.documento = documento;
    }

    const nivel = selectAPatch(campos.nivelInteres, contacto.nivelInteres);
    if (nivel !== undefined) patch.nivelInteres = nivel as ContactPatchPayload['nivelInteres'];
    const objecion = selectAPatch(campos.objecionPrincipal, contacto.objecionPrincipal);
    if (objecion !== undefined) {
      patch.objecionPrincipal = objecion as ContactPatchPayload['objecionPrincipal'];
    }
    const rol = selectAPatch(campos.rolContacto, contacto.rolContacto);
    if (rol !== undefined) patch.rolContacto = rol as ContactPatchPayload['rolContacto'];

    // Los atributos viajan completos (el backend reemplaza la lista), pero solo si cambiaron. Solo
    // se descartan las filas **en blanco** —las que se agregaron y no se llegaron a usar—; una fila
    // a medio escribir es un error que se muestra, no algo que se tire por la borda en silencio.
    const usados: string[] = [];
    const limpios = campos.atributos
      .filter((a) => !estaVacio(a))
      .map((a) => {
        // La clave se fija aquí, con la etiqueta ya completa, y solo si la fila es nueva.
        const key = a.key || slugificar(a.label, usados);
        usados.push(key);
        return { key, label: a.label.trim(), valor: a.valor.trim(), sensible: a.sensible };
      });

    const original = JSON.stringify(
      contacto.atributos.map((a) => ({
        key: a.key,
        label: a.label,
        valor: a.valor,
        sensible: a.sensible,
      })),
    );
    if (JSON.stringify(limpios) !== original) patch.atributos = limpios;

    return patch;
  }

  const patch = construirPatch();
  const errores = validarFicha(campos, contacto.nombre);
  const invalido = hayErrores(errores);
  const hayCambios = Object.keys(patch).length > 0;
  const puedeGuardar = hayCambios && !invalido && !guardar.isPending;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!puedeGuardar) return;
    // Solo se cierra al confirmar el backend: si falla, el diálogo sigue abierto con todo lo
    // escrito intacto. Volver a teclear un formulario porque la red se cayó es inaceptable.
    guardar.mutate(patch, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar datos del contacto</DialogTitle>
          <DialogDescription>
            Completa o corrige lo que la conversación no dejó claro. El correo, el documento y los
            atributos sensibles solo los ven Dirección y Gerencia.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {sugeridos.size > 0 && (
            // Explica por qué hay cambios pendientes nada más abrir: sin esto, el botón de guardar
            // aparece habilitado sin que el asesor haya tocado nada y parece un error.
            <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                Los campos marcados vienen de la extracción por IA y aún no están guardados.
                Revísalos, edítalos si hace falta y guarda para adoptarlos.
              </span>
            </p>
          )}

          <div>
            <Label htmlFor="contacto-nombre">Nombre</Label>
            <Input
              id="contacto-nombre"
              className="mt-1.5"
              value={campos.nombre}
              maxLength={120}
              placeholder="Ana Gómez"
              disabled={guardar.isPending}
              aria-invalid={errores.nombre !== undefined}
              aria-describedby={errores.nombre ? 'contacto-nombre-error' : undefined}
              onChange={(e) => setCampos((c) => ({ ...c, nombre: e.target.value }))}
            />
            <MensajeError id="contacto-nombre-error" texto={errores.nombre} />
            <PistaIA visible={sugeridos.has('nombre')} />
          </div>

          <div>
            <Label htmlFor="contacto-telefono">Teléfono</Label>
            <Input
              id="contacto-telefono"
              type="tel"
              inputMode="numeric"
              className="mt-1.5 font-mono"
              value={campos.telefono}
              maxLength={15}
              placeholder="573001112233"
              disabled={guardar.isPending}
              aria-invalid={errores.telefono !== undefined}
              aria-describedby={
                errores.telefono ? 'contacto-telefono-error' : 'contacto-telefono-ayuda'
              }
              onChange={(e) => setCampos((c) => ({ ...c, telefono: e.target.value }))}
            />
            <MensajeError id="contacto-telefono-error" texto={errores.telefono} />
            {errores.telefono === undefined && (
              <p id="contacto-telefono-ayuda" className="mt-1 text-[11px] text-muted-foreground">
                {contacto.canalOrigen === 'whatsapp'
                  ? 'Con indicativo y sin «+». En WhatsApp, Meta lo vuelve a sincronizar con el número desde el que escribe el contacto.'
                  : 'Con indicativo y sin «+», por ejemplo 573001112233.'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="contacto-correo" className="flex items-center gap-1">
                Correo
                <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              </Label>
              <Input
                id="contacto-correo"
                type="email"
                className="mt-1.5"
                value={campos.correo}
                maxLength={160}
                placeholder={puedeSensibles ? 'ana@empresa.com' : contacto.correo ?? ''}
                disabled={guardar.isPending || !puedeSensibles}
                aria-invalid={errores.correo !== undefined}
                aria-describedby={errores.correo ? 'contacto-correo-error' : undefined}
                onChange={(e) => setCampos((c) => ({ ...c, correo: e.target.value }))}
              />
              <MensajeError id="contacto-correo-error" texto={errores.correo} />
              <PistaIA visible={sugeridos.has('correo')} />
            </div>
            <div>
              <Label htmlFor="contacto-documento" className="flex items-center gap-1">
                Documento
                <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              </Label>
              <Input
                id="contacto-documento"
                className="mt-1.5"
                value={campos.documento}
                maxLength={40}
                placeholder={puedeSensibles ? '1085271234' : contacto.documento ?? ''}
                disabled={guardar.isPending || !puedeSensibles}
                onChange={(e) => setCampos((c) => ({ ...c, documento: e.target.value }))}
              />
            </div>
          </div>

          {!puedeSensibles && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {MOTIVO_DATOS_SENSIBLES} Puedes editar el resto de los datos con normalidad.
            </p>
          )}

          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-3">
              {CATALOGOS.map((catalogo) => (
                <CampoSelect
                  key={catalogo.tipo}
                  id={catalogo.id}
                  label={catalogo.label}
                  nombre={catalogo.nombre}
                  value={campos[catalogo.campo] as string}
                  opciones={opciones.data?.[catalogo.tipo] ?? []}
                  cargando={opciones.isPending}
                  disabled={guardar.isPending}
                  gestionando={gestionando === catalogo.tipo}
                  onGestionar={() =>
                    setGestionando((g) => (g === catalogo.tipo ? null : catalogo.tipo))
                  }
                  onChange={(valor) => setCampos((c) => ({ ...c, [catalogo.campo]: valor }))}
                />
              ))}
            </div>

            {CATALOGOS.filter((c) => c.tipo === gestionando).map((catalogo) => (
              <OpcionesManager
                key={catalogo.tipo}
                tipo={catalogo.tipo}
                nombre={catalogo.nombre}
                opciones={opciones.data?.[catalogo.tipo] ?? []}
                disabled={guardar.isPending}
                onCerrar={() => setGestionando(null)}
              />
            ))}
          </div>

          <AtributosEditor
            atributos={campos.atributos}
            onChange={(atributos) => setCampos((c) => ({ ...c, atributos }))}
            puedeEditarSensibles={puedeSensibles}
            disabled={guardar.isPending}
            errores={errores.atributos}
          />

          {/* El toast se pierde si el asesor está mirando el formulario. El fallo se cuenta también
              donde ocurrió, junto al botón que acaba de pulsar. */}
          {guardar.isError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive-subtle px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {errorMessage(guardar.error, 'No se pudieron guardar los datos del contacto.')} Lo
                que escribiste sigue aquí: vuelve a intentarlo.
              </span>
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className={pressable}
              onClick={() => onOpenChange(false)}
              disabled={guardar.isPending}
            >
              Cancelar
            </Button>
            {/* `min-w-36` reserva el ancho de "Guardando…" para que el botón no se encoja al
                cambiar de estado: un botón que se mueve bajo el cursor invita a un segundo clic. */}
            <Button type="submit" disabled={!puedeGuardar} className={cn('min-w-36', pressable)}>
              {guardar.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Guardando…
                </>
              ) : (
                'Guardar cambios'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mensaje de validación bajo un campo. Se pinta solo cuando hay algo que decir, así que el
 * formulario no reserva un hueco vacío bajo cada input ni salta al aparecer el primer error.
 */
function MensajeError({ id, texto }: { id: string; texto?: string }): React.ReactElement | null {
  if (!texto) return null;
  return (
    <p id={id} className="mt-1 text-[11px] text-destructive">
      {texto}
    </p>
  );
}

/** Marca un campo cuyo valor es propuesta de la IA y no un dato ya guardado. */
function PistaIA({ visible }: { visible: boolean }): React.ReactElement | null {
  if (!visible) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
      <Sparkles className="h-3 w-3 text-primary" aria-hidden="true" />
      Propuesto por la IA
    </p>
  );
}

/**
 * Un campo de catálogo. Ofrece las opciones **activas** del tenant y, junto a la etiqueta, el acceso
 * a su CRUD: el momento en que alguien descubre que le falta una opción es justo cuando abre el
 * desplegable y no la encuentra, así que la forma de crearla vive ahí y no en una pantalla aparte.
 */
function CampoSelect({
  id,
  label,
  nombre,
  value,
  opciones,
  cargando,
  disabled,
  gestionando,
  onGestionar,
  onChange,
}: {
  id: string;
  label: string;
  nombre: string;
  value: string;
  opciones: OpcionDTO[];
  cargando: boolean;
  disabled: boolean;
  gestionando: boolean;
  onGestionar: () => void;
  onChange: (value: string) => void;
}): React.ReactElement {
  // La opción archivada que el contacto todavía lleva puesta se incluye igual: sin ella el
  // desplegable saldría vacío y parecería que el dato se perdió. Se marca para que se note que ya
  // no está disponible para el resto.
  const visibles = opciones.filter((o) => o.activo || o.key === value);

  return (
    <div>
      <div className="flex items-center justify-between gap-1">
        <Label htmlFor={id}>{label}</Label>
        <button
          type="button"
          aria-label={`Gestionar las opciones de ${nombre}`}
          aria-expanded={gestionando}
          disabled={disabled || cargando}
          onClick={onGestionar}
          className={cn(
            'shrink-0 rounded-sm p-0.5 text-muted-foreground',
            'transition-colors duration-150 ease-out hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            'disabled:pointer-events-none disabled:opacity-50',
            gestionando && 'text-foreground',
          )}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {cargando ? (
        <Skeleton className="mt-1.5 h-10 w-full" />
      ) : (
        <Select value={value} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger id={id} className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_VALOR}>Sin definir</SelectItem>
            {visibles.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {/* El punto de color va dentro del item para que el disparador lo herede: así el
                    campo cerrado ya dice "caliente" en rojo sin repetir la etiqueta. */}
                <span className="flex items-center gap-1.5">
                  <PuntoColor color={o.color} />
                  <span className="truncate">{o.label}</span>
                  {!o.activo && (
                    <span className="shrink-0 text-xs text-muted-foreground">(archivada)</span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
