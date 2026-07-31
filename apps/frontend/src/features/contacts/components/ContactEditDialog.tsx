import { useEffect, useRef, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { MOTIVO_DATOS_SENSIBLES } from '@/lib/roles';
import type { ContactCardDTO } from '@/features/inbox/types';
import { useUpdateContact } from '../hooks/useUpdateContact.js';
import { slugificar } from '../lib/slug.js';
import { AtributosEditor } from './AtributosEditor.js';
import type { AtributoInput, ContactPatchPayload } from '../types.js';

interface Props {
  contacto: ContactCardDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const pressable =
  'transition-[transform,color,background-color] duration-150 ease-out motion-safe:active:scale-[0.98]';

/** `SIN_VALOR` existe porque un `<Select>` de Radix no admite un item con `value=""`. */
const SIN_VALOR = '__ninguno__';

const NIVELES = [
  { value: 'frio', label: 'Frío' },
  { value: 'tibio', label: 'Tibio' },
  { value: 'caliente', label: 'Caliente' },
];
const OBJECIONES = [
  { value: 'precio', label: 'Precio' },
  { value: 'tiempo', label: 'Tiempo' },
  { value: 'confianza', label: 'Confianza' },
  { value: 'otra', label: 'Otra' },
];
const ROLES_CONTACTO = [
  { value: 'decisor', label: 'Decisor' },
  { value: 'usuario', label: 'Usuario' },
  { value: 'desconocido', label: 'Desconocido' },
];

interface Campos {
  nombre: string;
  correo: string;
  documento: string;
  nivelInteres: string;
  objecionPrincipal: string;
  rolContacto: string;
  atributos: AtributoInput[];
}

function desdeContacto(c: ContactCardDTO): Campos {
  return {
    nombre: c.nombre ?? '',
    // Un valor enmascarado NUNCA se siembra en el input: guardarlo escribiría los puntos como si
    // fueran el correo real. Sin permiso el campo va vacío y deshabilitado.
    correo: c.puedeVerSensibles ? (c.correo ?? '') : '',
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

export function ContactEditDialog({ contacto, open, onOpenChange }: Props): React.ReactElement {
  const [campos, setCampos] = useState<Campos>(() => desdeContacto(contacto));
  const sembrado = useRef<string | null>(null);
  const guardar = useUpdateContact(contacto.id);
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
    setCampos(desdeContacto(contacto));
  }, [open, contacto]);

  function construirPatch(): ContactPatchPayload {
    const patch: ContactPatchPayload = {};

    const nombre = textoAPatch(campos.nombre, contacto.nombre);
    if (nombre !== undefined) patch.nombre = nombre;

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

    // Los atributos viajan completos (el backend reemplaza la lista), pero solo si cambiaron.
    // Las filas a medio escribir se descartan en vez de fallar en el backend.
    const usados: string[] = [];
    const limpios = campos.atributos
      .filter((a) => a.label.trim() !== '' && a.valor.trim() !== '')
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
  const hayCambios = Object.keys(patch).length > 0;
  const puedeGuardar = hayCambios && !guardar.isPending;

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!puedeGuardar) return;
    guardar.mutate(patch, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar datos del contacto</DialogTitle>
          <DialogDescription>
            Completa o corrige lo que la conversación no dejó claro. El correo, el documento y los
            atributos sensibles se guardan cifrados.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="contacto-nombre">Nombre</Label>
            <Input
              id="contacto-nombre"
              className="mt-1.5"
              value={campos.nombre}
              maxLength={120}
              placeholder="Ana Gómez"
              disabled={guardar.isPending}
              onChange={(e) => setCampos((c) => ({ ...c, nombre: e.target.value }))}
            />
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
                onChange={(e) => setCampos((c) => ({ ...c, correo: e.target.value }))}
              />
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

          <div className="grid grid-cols-3 gap-3">
            <CampoSelect
              id="contacto-nivel"
              label="Interés"
              value={campos.nivelInteres}
              opciones={NIVELES}
              disabled={guardar.isPending}
              onChange={(nivelInteres) => setCampos((c) => ({ ...c, nivelInteres }))}
            />
            <CampoSelect
              id="contacto-objecion"
              label="Objeción"
              value={campos.objecionPrincipal}
              opciones={OBJECIONES}
              disabled={guardar.isPending}
              onChange={(objecionPrincipal) => setCampos((c) => ({ ...c, objecionPrincipal }))}
            />
            <CampoSelect
              id="contacto-rol"
              label="Rol"
              value={campos.rolContacto}
              opciones={ROLES_CONTACTO}
              disabled={guardar.isPending}
              onChange={(rolContacto) => setCampos((c) => ({ ...c, rolContacto }))}
            />
          </div>

          <AtributosEditor
            atributos={campos.atributos}
            onChange={(atributos) => setCampos((c) => ({ ...c, atributos }))}
            puedeEditarSensibles={puedeSensibles}
            disabled={guardar.isPending}
          />

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
            <Button type="submit" disabled={!puedeGuardar} className={cn('min-w-32', pressable)}>
              {guardar.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
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

function CampoSelect({
  id,
  label,
  value,
  opciones,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  opciones: { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="mt-1.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SIN_VALOR}>Sin definir</SelectItem>
          {opciones.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
