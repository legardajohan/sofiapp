import { useCallback, useEffect, useRef, useState } from 'react';
import { elegirFormatoGrabacion } from '../lib/audio.js';

/** Por qué no se pudo grabar. Cada uno tiene su propio texto en la UI: todos piden algo distinto. */
export type MotivoErrorGrabacion = 'sin-permiso' | 'sin-microfono' | 'no-soportado' | 'muy-corta';

export type EstadoGrabadora =
  | { fase: 'inactivo' }
  | { fase: 'pidiendo-permiso' }
  | { fase: 'grabando' }
  | {
      fase: 'previsualizando';
      grabacion: Blob;
      /** Object URL de la grabación; se revoca al descartar, regrabar, enviar o desmontar. */
      url: string;
      duracionSegundos: number;
      /** `true` si se detuvo sola al llegar al máximo del tenant. */
      cortadaPorLimite: boolean;
    }
  | { fase: 'error'; motivo: MotivoErrorGrabacion };

export interface Grabadora {
  estado: EstadoGrabadora;
  /** Segundos transcurridos mientras se graba. */
  segundos: number;
  /** Nivel de entrada 0–1, decorativo. Queda en 0 con `prefers-reduced-motion`. */
  nivel: number;
  iniciar: () => Promise<void>;
  detener: () => void;
  /** Tira la grabación (o el error) y vuelve a reposo. */
  descartar: () => void;
  /** Descarta y vuelve a grabar de inmediato. */
  regrabar: () => Promise<void>;
}

/** WhatsApp descarta las notas de menos de un segundo: casi siempre son un toque accidental. */
const MINIMO_SEGUNDOS = 1;
const TICK_MS = 100;

function motivoDe(error: unknown): MotivoErrorGrabacion {
  const nombre = error instanceof DOMException ? error.name : '';
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError') return 'sin-permiso';
  return 'sin-microfono';
}

function prefiereMenosMovimiento(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Grabación de notas de voz con `MediaRecorder` (HU-OMNI-07).
 *
 * Invariante que no se negocia: **el micrófono se libera siempre** —al detener, al descartar, al
 * fallar y al desmontar—. Si una pista queda viva, el navegador sigue mostrando el indicador de
 * "micrófono en uso" y el asesor, con razón, deja de fiarse de la bandeja.
 */
export function useGrabadora(maxDuracionSegundos: number): Grabadora {
  const [estado, setEstado] = useState<EstadoGrabadora>({ fase: 'inactivo' });
  const [segundos, setSegundos] = useState(0);
  const [nivel, setNivel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const trozosRef = useRef<Blob[]>([]);
  const inicioRef = useRef(0);
  const intervaloRef = useRef<number | null>(null);
  const contextoRef = useRef<AudioContext | null>(null);
  const analizadorRef = useRef<AnalyserNode | null>(null);
  const cortadaRef = useRef(false);
  const urlRef = useRef<string | null>(null);
  // El intervalo lee el máximo por ref: si la config llega (o cambia) a mitad de una grabación, el
  // corte usa el valor vigente sin reiniciar nada.
  const maxRef = useRef(maxDuracionSegundos);
  useEffect(() => {
    maxRef.current = maxDuracionSegundos;
  }, [maxDuracionSegundos]);

  const liberarMicrofono = useCallback((): void => {
    if (intervaloRef.current !== null) {
      window.clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void contextoRef.current?.close().catch(() => undefined);
    contextoRef.current = null;
    analizadorRef.current = null;
    setNivel(0);
  }, []);

  const revocarUrl = useCallback((): void => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  const detener = useCallback((): void => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }, []);

  const iniciar = useCallback(async (): Promise<void> => {
    revocarUrl();
    const formato = elegirFormatoGrabacion();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined' || !formato) {
      setEstado({ fase: 'error', motivo: 'no-soportado' });
      return;
    }

    setEstado({ fase: 'pidiendo-permiso' });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch (error: unknown) {
      setEstado({ fase: 'error', motivo: motivoDe(error) });
      return;
    }
    streamRef.current = stream;

    const recorder = new MediaRecorder(stream, { mimeType: formato, audioBitsPerSecond: 32_000 });
    recorderRef.current = recorder;
    trozosRef.current = [];
    cortadaRef.current = false;

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) trozosRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const duracionSegundos = (performance.now() - inicioRef.current) / 1000;
      liberarMicrofono();
      recorderRef.current = null;

      const grabacion = new Blob(trozosRef.current, { type: recorder.mimeType || formato });
      trozosRef.current = [];
      if (grabacion.size === 0 || duracionSegundos < MINIMO_SEGUNDOS) {
        setEstado({ fase: 'error', motivo: 'muy-corta' });
        return;
      }

      const url = URL.createObjectURL(grabacion);
      urlRef.current = url;
      setEstado({
        fase: 'previsualizando',
        grabacion,
        url,
        duracionSegundos,
        cortadaPorLimite: cortadaRef.current,
      });
    };

    // Nivel de entrada: solo decoración, así que se omite si el usuario pidió menos movimiento o si
    // el navegador no tiene Web Audio. La grabación no depende de ello.
    if (!prefiereMenosMovimiento() && typeof AudioContext !== 'undefined') {
      try {
        const contexto = new AudioContext();
        const analizador = contexto.createAnalyser();
        analizador.fftSize = 256;
        contexto.createMediaStreamSource(stream).connect(analizador);
        contextoRef.current = contexto;
        analizadorRef.current = analizador;
      } catch {
        // Sin nivel, pero se graba igual.
      }
    }

    inicioRef.current = performance.now();
    setSegundos(0);
    // `timeslice`: entrega trozos cada segundo en vez de uno al final. Si la pestaña muere a mitad
    // no cambia nada, pero en Safari evita que un `stop` temprano llegue sin ningún dato.
    recorder.start(1000);
    setEstado({ fase: 'grabando' });

    const muestras = new Uint8Array(128);
    intervaloRef.current = window.setInterval(() => {
      const transcurrido = (performance.now() - inicioRef.current) / 1000;
      setSegundos(transcurrido);

      const analizador = analizadorRef.current;
      if (analizador) {
        analizador.getByteTimeDomainData(muestras);
        let suma = 0;
        for (const m of muestras) suma += ((m - 128) / 128) ** 2;
        setNivel(Math.min(1, Math.sqrt(suma / muestras.length) * 3));
      }

      if (transcurrido >= maxRef.current) {
        cortadaRef.current = true;
        detener();
      }
    }, TICK_MS);
  }, [detener, liberarMicrofono, revocarUrl]);

  const descartar = useCallback((): void => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      // Parar sin conservar nada: se anula `onstop` para que no aparezca la previsualización.
      recorder.onstop = null;
      recorder.stop();
    }
    recorderRef.current = null;
    trozosRef.current = [];
    liberarMicrofono();
    revocarUrl();
    setSegundos(0);
    setEstado({ fase: 'inactivo' });
  }, [liberarMicrofono, revocarUrl]);

  const regrabar = useCallback(async (): Promise<void> => {
    descartar();
    await iniciar();
  }, [descartar, iniciar]);

  // Desmontar (cambiar de conversación a mitad de una grabación) no puede dejar el micro abierto.
  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
      }
      liberarMicrofono();
      revocarUrl();
    },
    [liberarMicrofono, revocarUrl],
  );

  return { estado, segundos, nivel, iniciar, detener, descartar, regrabar };
}
