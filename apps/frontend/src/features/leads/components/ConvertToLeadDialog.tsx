import { useEffect, useRef, useState } from 'react';
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
import { cn } from '@/lib/utils';

/**
 * De dónde salen los valores del pre-relleno:
 * - `cargando`: la ficha del contacto aún no responde, así que todavía no se sabe.
 * - `ia`: los trajo la extracción de "Datos de contacto (IA)" (HU-OMNI-03).
 * - `conversacion`: no hay extracción; se cae al nombre y al número de la conversación.
 */
export type FuenteInicial = 'cargando' | 'ia' | 'conversacion';

interface Props {
  open: boolean;
  pending: boolean;
  /** Valores con los que llega el formulario: extracción de IA si la hay, si no la conversación. */
  inicial: { nombre: string | null; telefono: string; correo: string | null };
  /** Qué produjo `inicial`. Solo cambia el copy y el estado de espera, no los valores. */
  fuente?: FuenteInicial;
  /** Mensaje del backend cuando el teléfono ya tiene lead. Mantiene el diálogo abierto. */
  duplicado: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (valores: { nombre: string; telefono: string; correo?: string }) => void;
}

const DESCRIPCION: Record<FuenteInicial, string> = {
  cargando: 'Buscando los datos que la IA extrajo de la conversación…',
  ia: 'Datos extraídos por IA de la conversación. Revísalos y edítalos si hace falta.',
  conversacion: 'Revisa los datos antes de crear el lead. Puedes editarlos.',
};

// Mismo gesto de presión que las tarjetas de la ficha (ContactExtractCard), para que todas las
// acciones de la bandeja se sientan igual. `motion-safe:` respeta `prefers-reduced-motion`.
const pressable =
  'transition-[transform,color,background-color] duration-150 ease-out motion-safe:active:scale-[0.98]';

const SOLO_DIGITOS = /\D/g;

export function ConvertToLeadDialog({
  open,
  pending,
  inicial,
  fuente = 'conversacion',
  duplicado,
  onOpenChange,
  onSubmit,
}: Props): React.ReactElement {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const nombreRef = useRef<HTMLInputElement>(null);
  // Marca la apertura en curso como ya pre-rellenada. Sin esto, la ficha llegando tarde
  // sobrescribiría lo que el asesor acabara de escribir.
  const sembrado = useRef(false);

  const cargando = fuente === 'cargando';

  // El formulario se siembra UNA vez por apertura, en cuanto se sabe qué datos hay: los de la
  // extracción de IA si existe, si no los de la conversación. Se vuelve a sembrar en la siguiente
  // apertura para que cambiar de conversación no arrastre lo escrito en la anterior.
  useEffect(() => {
    if (!open) {
      sembrado.current = false;
      return;
    }
    if (cargando || sembrado.current) return;
    sembrado.current = true;
    setNombre(inicial.nombre ?? '');
    setTelefono(inicial.telefono);
    setCorreo(inicial.correo ?? '');
    // El foco se pone aquí y no con `autoFocus`: cuando hubo espera, el campo estaba deshabilitado
    // al montar y `autoFocus` ya no puede alcanzarlo.
    nombreRef.current?.focus();
  }, [open, cargando, inicial.nombre, inicial.telefono, inicial.correo]);

  const nombreLimpio = nombre.trim();
  const digitos = telefono.replace(SOLO_DIGITOS, '').length;
  const telefonoValido = digitos >= 7 && digitos <= 20;
  const puedeGuardar = nombreLimpio.length > 0 && telefonoValido && !pending && !cargando;

  function enviar(): void {
    if (!puedeGuardar) return;
    const limpio = correo.trim();
    onSubmit({
      nombre: nombreLimpio,
      telefono,
      ...(limpio ? { correo: limpio } : {}),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Sin animación propia: el Dialog de shadcn ya entra desde `zoom-in-95` en 200ms y con
          origen centrado, que es lo correcto para un modal (no está anclado a su disparador). */}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convertir en lead</DialogTitle>
          {/* El copy es el único sitio donde se nota de dónde salen los valores: los campos son los
              mismos y siguen siendo editables vengan de donde vengan. */}
          <DialogDescription aria-live="polite">{DESCRIPCION[fuente]}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="lead-nombre">Nombre</Label>
            <Input
              id="lead-nombre"
              ref={nombreRef}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre y apellidos"
              maxLength={120}
              disabled={cargando}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lead-telefono">Teléfono</Label>
            <Input
              id="lead-telefono"
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              disabled={cargando}
              aria-invalid={telefono.length > 0 && !telefonoValido}
            />
            <p className="text-xs text-muted-foreground">
              Un solo lead por teléfono en tu empresa.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lead-correo">
              Correo <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="lead-correo"
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="nombre@empresa.com"
              disabled={cargando}
            />
          </div>

          {/* El aviso aparece donde el asesor ya está mirando. Solo opacidad, sin desplazamiento:
              un `slide` lo leería como un elemento nuevo que llega, y así `prefers-reduced-motion`
              queda satisfecho sin una rama aparte. */}
          {duplicado && (
            <p
              role="alert"
              className="rounded-md bg-destructive-subtle px-3 py-2 text-xs text-destructive motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150"
            >
              {duplicado}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className={pressable}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={!puedeGuardar} className={cn(pressable)}>
              {pending ? 'Creando…' : 'Crear lead'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
