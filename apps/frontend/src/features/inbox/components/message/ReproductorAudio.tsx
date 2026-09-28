import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Mic, Pause, Play } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useAudioActivo } from '../../hooks/useAudioActivo.js';
import { formatearDuracion, ondaDecorativa } from '../../lib/audio.js';

const BARRAS = 32;
const VELOCIDADES = [1, 1.5, 2] as const;

/**
 * Dónde se pinta: cada fondo pide su propia paleta. `saliente` va sobre `bg-primary`, `entrante`
 * sobre `bg-card`, y `composer` es la previsualización de una grabación antes de enviarla.
 */
export type TonoReproductor = 'entrante' | 'saliente' | 'composer';

interface Props {
  /** Identidad para "un solo audio a la vez" y semilla de la onda. */
  id: string;
  src: string;
  /** La del servidor; si es `null` se toma de los metadatos del `<audio>`. */
  duracionSegundos: number | null;
  esNotaDeVoz: boolean;
  tono: TonoReproductor;
}

const PALETA: Record<
  TonoReproductor,
  { boton: string; escuchada: string; pendiente: string; texto: string; pulgar: string }
> = {
  entrante: {
    boton: 'bg-nota-voz text-nota-voz-foreground',
    escuchada: 'bg-nota-voz',
    pendiente: 'bg-muted-foreground/30',
    texto: 'text-muted-foreground',
    pulgar: 'border-nota-voz bg-nota-voz',
  },
  saliente: {
    boton: 'bg-primary-foreground/15 text-primary-foreground',
    escuchada: 'bg-primary-foreground',
    pendiente: 'bg-primary-foreground/35',
    texto: 'text-primary-foreground/80',
    pulgar: 'border-primary-foreground bg-primary-foreground',
  },
  composer: {
    boton: 'bg-primary text-primary-foreground',
    escuchada: 'bg-primary',
    pendiente: 'bg-muted-foreground/30',
    texto: 'text-muted-foreground',
    pulgar: 'border-primary bg-primary',
  },
};

/**
 * Reproductor de audio con controles propios (HU-OMNI-07): reproducir/pausar, onda desplazable,
 * tiempo y velocidad. Sustituye al `<audio controls>` nativo de HU-OMNI-06, que no dejaba ver la
 * duración de un vistazo, no se parecía a una nota de voz y ocupaba el ancho entero de la burbuja.
 *
 * La accesibilidad la da el `Slider` de Radix montado encima de la onda: rol `slider`, flechas
 * (1 s) y Shift+flechas (10 s), y un `aria-valuetext` legible. La onda es solo la forma visible
 * del mismo valor.
 */
export function ReproductorAudio({
  id,
  src,
  duracionSegundos,
  esNotaDeVoz,
  tono,
}: Props): React.ReactElement {
  const audioRef = useRef<HTMLAudioElement>(null);
  const frameRef = useRef<number | null>(null);
  const [sonando, setSonando] = useState(false);
  const [actual, setActual] = useState(0);
  const [duracionMedida, setDuracionMedida] = useState<number | null>(null);
  const [velocidad, setVelocidad] = useState<(typeof VELOCIDADES)[number]>(1);
  const [error, setError] = useState(false);

  const activo = useAudioActivo((s) => s.activo);
  const setActivo = useAudioActivo((s) => s.setActivo);

  const duracion = duracionSegundos ?? duracionMedida ?? 0;
  const progreso = duracion > 0 ? Math.min(actual / duracion, 1) : 0;
  const onda = useMemo(() => ondaDecorativa(id, BARRAS), [id]);
  const paleta = PALETA[tono];

  // Otro reproductor tomó el turno: este se pausa (un solo audio a la vez).
  useEffect(() => {
    if (activo !== id && sonando) audioRef.current?.pause();
  }, [activo, id, sonando]);

  // `timeupdate` llega ~4 veces por segundo: la onda avanzaría a saltos. Mientras suena se lee el
  // tiempo en cada frame; en pausa no hay bucle.
  useEffect(() => {
    if (!sonando) return;
    const tick = (): void => {
      if (audioRef.current) setActual(audioRef.current.currentTime);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [sonando]);

  // Al desmontar (cambio de conversación) suelta el turno para no dejar a otro esperando.
  useEffect(
    () => () => {
      if (useAudioActivo.getState().activo === id) setActivo(null);
    },
    [id, setActivo],
  );

  async function alternar(): Promise<void> {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    setActivo(id);
    try {
      audio.playbackRate = velocidad;
      await audio.play();
      setError(false);
    } catch {
      setError(true);
    }
  }

  function buscar(segundos: number): void {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = segundos;
    setActual(segundos);
  }

  function cambiarVelocidad(): void {
    const siguiente = VELOCIDADES[(VELOCIDADES.indexOf(velocidad) + 1) % VELOCIDADES.length]!;
    setVelocidad(siguiente);
    if (audioRef.current) audioRef.current.playbackRate = siguiente;
  }

  // En reposo se muestra la duración total; mientras suena o tras avanzar, lo transcurrido.
  const tiempo = sonando || actual > 0 ? actual : duracion;
  const etiqueta = esNotaDeVoz ? 'nota de voz' : 'audio';

  return (
    <div className="flex w-64 max-w-full items-center gap-3 py-0.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          // Chrome da `Infinity` para un webm sin índice: no es una duración, se ignora.
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuracionMedida(d);
        }}
        onPlay={() => setSonando(true)}
        onPause={() => setSonando(false)}
        onEnded={() => {
          setSonando(false);
          setActual(0);
          if (audioRef.current) audioRef.current.currentTime = 0;
        }}
        onError={() => setError(true)}
      />

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => void alternar()}
          aria-label={sonando ? `Pausar ${etiqueta}` : `Reproducir ${etiqueta}`}
          className={cn(
            'flex size-10 items-center justify-center rounded-full transition-transform duration-150 ease-out active:scale-[0.94]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            paleta.boton,
          )}
        >
          {sonando ? (
            <Pause className="size-4 fill-current" aria-hidden="true" />
          ) : (
            <Play className="ml-0.5 size-4 fill-current" aria-hidden="true" />
          )}
        </button>
        {/* Qué es, sin palabras: el micrófono de WhatsApp para una nota de voz, una onda para un
            archivo de audio. */}
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full ring-2',
            tono === 'saliente' ? 'bg-primary text-primary-foreground ring-primary' : 'bg-card text-nota-voz ring-card',
          )}
          aria-hidden="true"
        >
          {esNotaDeVoz ? <Mic className="size-2.5" /> : <AudioLines className="size-2.5" />}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative h-7">
          <div className="pointer-events-none absolute inset-0 flex items-center gap-[2px]" aria-hidden="true">
            {onda.map((altura, i) => (
              <span
                key={i}
                className={cn(
                  'flex-1 rounded-full',
                  (i + 0.5) / BARRAS <= progreso ? paleta.escuchada : paleta.pendiente,
                )}
                style={{ height: `${Math.round(altura * 100)}%` }}
              />
            ))}
          </div>
          <Slider
            variant="transparente"
            className="absolute inset-0 h-full cursor-pointer"
            thumbClassName={cn('h-3 w-3 shadow-sm', paleta.pulgar)}
            min={0}
            max={duracion > 0 ? duracion : 1}
            step={1}
            value={[Math.min(actual, duracion > 0 ? duracion : 0)]}
            onValueChange={([v]) => v !== undefined && buscar(v)}
            disabled={duracion <= 0 || error}
            thumbAriaLabel={`Posición de la ${etiqueta}`}
            thumbAriaValueText={`${formatearDuracion(actual)} de ${formatearDuracion(duracion)}`}
          />
        </div>

        <div className={cn('mt-0.5 flex items-center justify-between text-[11px] tabular-nums', paleta.texto)}>
          {error ? (
            <span role="alert">No se pudo reproducir</span>
          ) : (
            <span>{formatearDuracion(tiempo)}</span>
          )}
          <button
            type="button"
            onClick={cambiarVelocidad}
            aria-label={`Velocidad de reproducción ${velocidad}×. Cambiar`}
            className={cn(
              'rounded-full px-1.5 font-medium transition-transform duration-150 ease-out active:scale-[0.94]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              velocidad !== 1 && (tono === 'saliente' ? 'bg-primary-foreground/20' : 'bg-muted'),
            )}
          >
            {velocidad}×
          </button>
        </div>
      </div>
    </div>
  );
}
