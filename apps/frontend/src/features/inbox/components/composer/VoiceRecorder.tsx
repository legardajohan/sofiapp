import { useEffect, useRef } from 'react';
import { Loader2, Mic, RotateCcw, Send, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { Grabadora, MotivoErrorGrabacion } from '../../hooks/useGrabadora.js';
import { formatearDuracion } from '../../lib/audio.js';
import { ReproductorAudio } from '../message/ReproductorAudio.js';

/**
 * Qué decir cuando no se puede grabar. Cada texto dice qué pasó y qué hacer: un "error" a secas
 * deja al asesor sin saber si el problema es su navegador, su micrófono o el CRM.
 */
const MENSAJE_ERROR: Record<MotivoErrorGrabacion, string> = {
  'sin-permiso':
    'El navegador bloqueó el micrófono. Permite el acceso desde el candado de la barra de direcciones y vuelve a intentarlo.',
  'sin-microfono': 'No se encontró ningún micrófono. Conecta uno y vuelve a intentarlo.',
  'no-soportado':
    'Este navegador no puede grabar audio. Usa una versión reciente de Chrome, Edge, Firefox o Safari.',
  'muy-corta': 'La nota de voz fue muy corta. Graba al menos un segundo.',
};

interface Props {
  grabadora: Grabadora;
  maxDuracionSegundos: number;
  /** 0–100 mientras sube; `null` si no hay envío en curso. */
  progreso: number | null;
  onEnviar: (grabacion: Blob, duracionSegundos: number) => void;
}

const BOTON_ICONO = 'shrink-0 transition-transform duration-150 ease-out active:scale-[0.94]';

/**
 * Barra de grabación del composer (HU-OMNI-07). Ocupa el sitio del campo de texto mientras hay una
 * grabación en curso o por revisar, como en WhatsApp: no se puede escribir y grabar a la vez.
 *
 * Teclado: Esc descarta siempre; en la previsualización el foco queda en «Enviar», así que Enter
 * envía. Ninguna de las dos anima nada: son acciones que se repiten decenas de veces al día.
 */
export function VoiceRecorder({
  grabadora,
  maxDuracionSegundos,
  progreso,
  onEnviar,
}: Props): React.ReactElement | null {
  const { estado, segundos, nivel, detener, descartar, regrabar } = grabadora;
  const principalRef = useRef<HTMLButtonElement>(null);
  const enviando = progreso !== null;

  // El foco sigue a la acción principal de cada fase: detener mientras graba, enviar al revisar.
  // Así Enter y Espacio hacen lo esperable sin que el asesor tenga que buscar el botón.
  useEffect(() => {
    principalRef.current?.focus();
  }, [estado.fase]);

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape' && !enviando) {
      e.preventDefault();
      descartar();
    }
  }

  if (estado.fase === 'inactivo') return null;

  if (estado.fase === 'error') {
    return (
      <div
        role="alert"
        onKeyDown={onKeyDown}
        className="flex min-h-10 flex-1 items-center gap-3 rounded-md border border-border bg-destructive-subtle px-3 py-2"
      >
        <Mic className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        <p className="flex-1 text-xs leading-relaxed text-foreground">{MENSAJE_ERROR[estado.motivo]}</p>
        <Button
          ref={principalRef}
          type="button"
          variant="ghost"
          size="sm"
          onClick={descartar}
          className="h-7 shrink-0 text-xs"
        >
          Cerrar
        </Button>
      </div>
    );
  }

  if (estado.fase === 'pidiendo-permiso') {
    return (
      <div className="flex min-h-10 flex-1 items-center gap-2 px-1 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Permite el acceso al micrófono para grabar…
        <Button type="button" variant="ghost" size="sm" onClick={descartar} className="ml-auto h-7 text-xs">
          Cancelar
        </Button>
      </div>
    );
  }

  if (estado.fase === 'grabando') {
    const restante = Math.max(0, maxDuracionSegundos - segundos);
    const cercaDelLimite = restante <= 10;
    return (
      <div onKeyDown={onKeyDown} className="flex min-h-10 flex-1 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={descartar}
          aria-label="Descartar grabación"
          className={cn(BOTON_ICONO, 'text-muted-foreground hover:text-destructive')}
        >
          <Trash2 />
        </Button>

        <div className="flex flex-1 items-center gap-2.5 rounded-full bg-muted px-3.5 py-2" role="status" aria-live="off">
          {/* Punto de "grabando": pulso de opacidad, no de escala, y quieto con reduced-motion. */}
          <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-grabacion motion-reduce:animate-none" aria-hidden="true" />
          <span className="text-sm font-medium tabular-nums text-foreground">{formatearDuracion(segundos)}</span>
          {/* Nivel de entrada: confirma que el micrófono de verdad está oyendo algo. */}
          <span className="flex h-4 flex-1 items-center gap-[3px]" aria-hidden="true">
            {Array.from({ length: 14 }, (_, i) => {
              const umbral = (i + 1) / 14;
              return (
                <span
                  key={i}
                  className={cn('h-full w-[3px] rounded-full', nivel >= umbral ? 'bg-grabacion' : 'bg-muted-foreground/25')}
                  style={{ height: `${35 + ((i * 37) % 65)}%` }}
                />
              );
            })}
          </span>
          <span className={cn('text-xs tabular-nums', cercaDelLimite ? 'font-medium text-grabacion' : 'text-muted-foreground')}>
            {cercaDelLimite ? `Quedan ${Math.ceil(restante)} s` : `máx. ${formatearDuracion(maxDuracionSegundos)}`}
          </span>
        </div>

        <Button
          ref={principalRef}
          type="button"
          size="icon"
          onClick={detener}
          aria-label="Detener grabación"
          className={cn(BOTON_ICONO, 'rounded-full bg-grabacion text-primary-foreground hover:bg-grabacion/90')}
        >
          <Square className="size-3.5 fill-current" />
        </Button>
      </div>
    );
  }

  // Previsualización: escuchar, descartar, regrabar o enviar. Nada ha salido del navegador todavía.
  return (
    // Enter envía porque el foco aterriza en «Enviar» (ver el efecto de arriba): no hace falta un
    // atajo propio que compita con el Enter del botón que tenga el foco.
    <div onKeyDown={onKeyDown} className="flex min-h-10 flex-1 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={descartar}
          disabled={enviando}
          aria-label="Descartar nota de voz"
          className={cn(BOTON_ICONO, 'text-muted-foreground hover:text-destructive')}
        >
          <Trash2 />
        </Button>

        <div className="flex flex-1 items-center rounded-full bg-muted px-3 py-1">
          <ReproductorAudio
            id={`grabacion-${estado.url}`}
            src={estado.url}
            duracionSegundos={estado.duracionSegundos}
            esNotaDeVoz
            tono="composer"
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void regrabar()}
          disabled={enviando}
          aria-label="Volver a grabar"
          className={cn(BOTON_ICONO, 'text-muted-foreground')}
        >
          <RotateCcw />
        </Button>

        <Button
          ref={principalRef}
          type="button"
          size="icon"
          onClick={() => onEnviar(estado.grabacion, estado.duracionSegundos)}
          disabled={enviando}
          aria-label="Enviar nota de voz"
          className={BOTON_ICONO}
        >
          {enviando ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Send />}
        </Button>
      </div>

      {estado.cortadaPorLimite && !enviando && (
        <p className="px-12 text-xs text-muted-foreground">
          La grabación se detuvo al llegar al máximo de {formatearDuracion(maxDuracionSegundos)}.
        </p>
      )}
      {enviando && (
        <div className="px-12">
          <Progress value={progreso} className="h-1" aria-label="Enviando nota de voz" />
        </div>
      )}
    </div>
  );
}
