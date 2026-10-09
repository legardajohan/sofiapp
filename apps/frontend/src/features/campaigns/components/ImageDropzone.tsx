import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatearTamano } from '@/features/inbox/lib/media';
import { cn } from '@/lib/utils';
import { ACCEPT_IMAGEN, validarImagen } from '../lib/programacion.js';

interface Props {
  /** Archivo elegido en esta sesión del formulario. */
  valor: File | null;
  onChange: (archivo: File | null) => void;
  /** Imagen ya guardada (al reprogramar): se muestra mientras no se elija otra. */
  urlExistente?: string | null;
  /** Oculta «Quitar» cuando la plantilla exige imagen y no tiene sentido quedarse sin ella. */
  obligatoria?: boolean;
}

const PULSABLE =
  'transition-[transform,color,background-color] duration-150 ease-out motion-safe:active:scale-[0.98]';

/**
 * La imagen que va encima del mensaje.
 *
 * Una zona grande para soltar o elegir, que al llenarse se convierte en la propia imagen con sus
 * datos debajo: el estado lleno no necesita explicarse, se ve. El error de tipo o tamaño se dice
 * aquí mismo y no en un toast, porque es algo que se corrige en este control y en ningún otro.
 */
export function ImageDropzone({
  valor,
  onChange,
  urlExistente = null,
  obligatoria = false,
}: Props): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [arrastrando, setArrastrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);

  // La URL de objeto se crea y se revoca con el archivo: sin el `revoke`, cada imagen elegida
  // quedaría retenida en memoria hasta cerrar la pestaña.
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

  function abrirSelector(): void {
    inputRef.current?.click();
  }

  const src = previa ?? urlExistente;

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_IMAGEN}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="imagen-input"
        onChange={(e) => {
          elegir(e.target.files?.[0]);
          // Se limpia para que volver a elegir el mismo archivo tras quitarlo dispare `change`.
          e.target.value = '';
        }}
      />

      {src ? (
        <figure className="overflow-hidden rounded-lg border border-border bg-card">
          <img
            key={src}
            src={src}
            alt="Imagen de la campaña"
            className="aspect-[1.91/1] w-full bg-muted object-cover motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-[0.98] motion-safe:duration-200"
          />
          <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {valor ? `${valor.name} (${formatearTamano(valor.size)})` : 'Imagen actual'}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={abrirSelector} className={PULSABLE}>
              Cambiar
            </Button>
            {!obligatoria && valor ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(null)}
                className={PULSABLE}
              >
                Quitar
              </Button>
            ) : null}
          </figcaption>
        </figure>
      ) : (
        <button
          type="button"
          onClick={abrirSelector}
          aria-describedby={hintId}
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
            'flex aspect-[1.91/1] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 text-center',
            'transition-colors duration-150 ease-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            arrastrando
              ? 'border-primary bg-primary/5 text-foreground'
              : 'border-border bg-muted/30 text-muted-foreground hover:border-foreground/30 hover:text-foreground',
            error ? 'border-destructive' : null,
          )}
        >
          <ImagePlus className="h-6 w-6" aria-hidden />
          <span className="text-sm font-medium">
            {arrastrando ? 'Suelta la imagen aquí' : 'Arrastra una imagen o elígela'}
          </span>
          <span id={hintId} className="text-xs text-muted-foreground">
            JPG o PNG, hasta 5 MB. Se ve mejor en horizontal.
          </span>
        </button>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
