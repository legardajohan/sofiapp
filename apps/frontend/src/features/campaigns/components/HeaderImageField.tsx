import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { formatearTamano } from '@/features/inbox/lib/media';
import { cn } from '@/lib/utils';
import { ACCEPT_IMAGEN, validarImagen } from '../lib/programacion.js';
import { ImageDropzone } from './ImageDropzone.js';

interface Props {
  /** Imagen por defecto de la plantilla, ya con `apiUrl`. `null` si la plantilla no tiene. */
  imagenDefectoUrl: string | null;
  /** Imagen de reemplazo elegida para este envío. `null` = se envía la de por defecto. */
  valor: File | null;
  onChange: (archivo: File | null) => void;
}

const PULSABLE =
  'transition-[transform,color,background-color] duration-150 ease-out motion-safe:active:scale-[0.98]';

/**
 * «Imagen del mensaje» (HT-WA-04, criterios 10 y 15): la imagen que de verdad va a salir.
 *
 * Arranca mostrando la imagen por defecto de la plantilla, así que no hay que hacer nada para usarla.
 * «Cambiar imagen» la sustituye solo para este envío y «Restaurar imagen por defecto» deshace el
 * cambio: la plantilla no se toca y no vuelve a revisión. La etiqueta de debajo dice siempre cuál de
 * las dos se enviará, porque es lo único que el admin necesita confirmar.
 *
 * Si la plantilla llegó desde Meta sin imagen por defecto, no hay nada que restaurar y el bloque
 * pasa a ser un selector obligatorio.
 */
export function HeaderImageField({ imagenDefectoUrl, valor, onChange }: Props): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  useEffect(() => {
    if (!valor) {
      setPrevia(null);
      return;
    }
    const url = URL.createObjectURL(valor);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [valor]);

  function elegir(archivo: File | undefined): void {
    if (!archivo) return;
    const resultado = validarImagen(archivo);
    if (!resultado.ok) {
      setError(resultado.motivo);
      return;
    }
    setError(null);
    onChange(archivo);
  }

  const aviso = (
    <p className="text-xs text-muted-foreground">
      La imagen que cambies no pasa por la revisión de Meta, pero debe cumplir sus políticas: una que
      las incumpla puede bajar la calidad de tu número o pausar la plantilla.
    </p>
  );

  if (!imagenDefectoUrl) {
    return (
      <div className="space-y-1.5">
        <Label>Imagen del mensaje</Label>
        <ImageDropzone valor={valor} onChange={onChange} />
        <p className="text-xs text-muted-foreground">
          Esta plantilla no tiene imagen por defecto: elige la que se enviará.
        </p>
        {aviso}
      </div>
    );
  }

  const src = previa ?? imagenDefectoUrl;
  const personalizada = valor !== null;

  return (
    <div className="space-y-1.5">
      <Label>Imagen del mensaje</Label>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_IMAGEN}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="imagen-mensaje-input"
        onChange={(e) => {
          elegir(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <figure
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          elegir(e.dataTransfer.files[0]);
        }}
        className={cn(
          'overflow-hidden rounded-lg border bg-card transition-colors duration-150 ease-out',
          arrastrando ? 'border-primary' : 'border-border',
        )}
      >
        <img
          key={src}
          src={src}
          alt={personalizada ? 'Imagen elegida para este envío' : 'Imagen por defecto de la plantilla'}
          className="aspect-[1.91/1] w-full bg-muted object-cover motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
        />
        <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
          <span className="min-w-0 flex-1 text-sm" aria-live="polite">
            <span className="block font-medium text-foreground">
              {personalizada ? 'Imagen personalizada' : 'Imagen por defecto'}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {valor
                ? `${valor.name} (${formatearTamano(valor.size)}), solo para este envío`
                : 'La que se aprobó con la plantilla'}
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            className={PULSABLE}
          >
            Cambiar imagen
          </Button>
          {personalizada ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setError(null);
                onChange(null);
              }}
              className={PULSABLE}
            >
              Restaurar imagen por defecto
            </Button>
          ) : null}
        </figcaption>
      </figure>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {aviso}
    </div>
  );
}
