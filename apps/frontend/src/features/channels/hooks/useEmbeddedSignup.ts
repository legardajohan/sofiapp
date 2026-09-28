import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  getMetaSignupConfig,
  loadFacebookSdk,
  type FacebookSdk,
  type MetaSignupConfig,
} from '@/lib/facebook-sdk';
import { activateWhatsApp, connectEmbeddedSignup, type IChannelStatusResponse } from '../api.js';
import { CHANNEL_STATUS_KEY } from './useChannelStatus.js';

/**
 * Fases del Embedded Signup vistas por la persona:
 *
 * - `autorizando`: el popup de Meta está abierto (inicia sesión, elige la cuenta y el número).
 * - `activando`: el popup cerró bien y el backend canjea el code, suscribe y registra el número.
 * - `pin`: el número ya tenía verificación en dos pasos y Meta pide ese PIN. Es el único caso en el
 *   que la persona ve algo técnico, y solo porque el PIN lo eligió ella en otro sitio.
 */
export type SignupPhase = 'idle' | 'autorizando' | 'activando' | 'pin';

export interface UseEmbeddedSignup {
  /** `false` si el entorno no trae la configuración de Meta: solo queda la conexión manual. */
  disponible: boolean;
  /** El SDK ya cargó: abrir el popup debe ocurrir en el mismo tick del clic o el navegador lo bloquea. */
  listo: boolean;
  fase: SignupPhase;
  error: string | null;
  iniciar: () => void;
  /** Reintenta la activación sin volver al popup; con `pin` cuando Meta pidió el del número. */
  activar: (pin?: string) => void;
  activando: boolean;
}

interface SessionInfo {
  wabaId: string;
  phoneNumberId: string;
}

interface EmbeddedSignupMessage {
  type?: string;
  event?: string;
  data?: { phone_number_id?: string; waba_id?: string; error_message?: string };
}

function isFacebookOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === 'https:' && (hostname === 'facebook.com' || hostname.endsWith('.facebook.com'));
  } catch {
    return false;
  }
}

function parseMessage(raw: unknown): EmbeddedSignupMessage | null {
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof value !== 'object' || value === null) return null;
    const msg = value as EmbeddedSignupMessage;
    return msg.type === 'WA_EMBEDDED_SIGNUP' ? msg : null;
  } catch {
    // El SDK también publica mensajes propios que no son JSON: no son para nosotros.
    return null;
  }
}

function backendMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') {
      return 'Meta está tardando más de lo normal. Revisa el estado en unos minutos antes de reintentar.';
    }
    const data = error.response?.data as { message?: unknown } | undefined;
    if (typeof data?.message === 'string') return data.message;
  }
  return fallback;
}

function isPinRequired(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 422) return false;
  const data = error.response.data as { reason?: unknown } | undefined;
  return data?.reason === 'pin_required';
}

export function useEmbeddedSignup(onConnected: (status: IChannelStatusResponse) => void): UseEmbeddedSignup {
  const queryClient = useQueryClient();
  const [config] = useState<MetaSignupConfig | null>(getMetaSignupConfig);
  const [sdk, setSdk] = useState<FacebookSdk | null>(null);
  const [fase, setFase] = useState<SignupPhase>('idle');
  const [error, setError] = useState<string | null>(null);

  // El code (callback de FB.login) y los ids (postMessage) llegan por canales distintos y sin orden
  // garantizado: se guardan en refs y se envía cuando están los dos.
  const codeRef = useRef<string | null>(null);
  const sessionRef = useRef<SessionInfo | null>(null);
  const enviadoRef = useRef(false);

  const finalizar = useCallback(
    (status: IChannelStatusResponse) => {
      queryClient.setQueryData(CHANNEL_STATUS_KEY, status);
      void queryClient.invalidateQueries({ queryKey: CHANNEL_STATUS_KEY });
      setFase('idle');
      setError(null);
      onConnected(status);
    },
    [onConnected, queryClient],
  );

  const fallar = useCallback(
    (err: unknown, fallback: string) => {
      // La integración pudo quedar guardada a medias (`activo:false`): refrescar el estado hace
      // aparecer el aviso «Termina de activar tu número».
      void queryClient.invalidateQueries({ queryKey: CHANNEL_STATUS_KEY });
      if (isPinRequired(err)) {
        setFase('pin');
        setError(null);
        return;
      }
      setFase('idle');
      setError(backendMessage(err, fallback));
    },
    [queryClient],
  );

  const conectar = useMutation({
    mutationFn: connectEmbeddedSignup,
    onSuccess: finalizar,
    onError: (err) => fallar(err, 'No pudimos terminar la conexión con WhatsApp. Inténtalo de nuevo.'),
  });

  const activar = useMutation({
    mutationFn: activateWhatsApp,
    onSuccess: finalizar,
    onError: (err) => {
      if (isPinRequired(err)) {
        // Si ya estábamos pidiendo el PIN, el que escribió no coincide; si no, Meta lo pide ahora.
        setError(fase === 'pin' ? 'Ese PIN no coincide con el del número. Revísalo e inténtalo de nuevo.' : null);
        setFase('pin');
        return;
      }
      fallar(err, 'No pudimos activar el número. Inténtalo de nuevo.');
    },
  });

  const intentarEnviar = useCallback(() => {
    const code = codeRef.current;
    const session = sessionRef.current;
    if (!code || !session || enviadoRef.current) return;
    enviadoRef.current = true;
    setFase('activando');
    conectar.mutate({ code, ...session });
  }, [conectar]);

  useEffect(() => {
    if (!config) return;
    let vivo = true;
    loadFacebookSdk(config)
      .then((fb) => {
        if (vivo) setSdk(fb);
      })
      .catch(() => {
        if (vivo) {
          setError(
            'No se pudo cargar Facebook. Si usas un bloqueador de anuncios, desactívalo para esta página y recarga.',
          );
        }
      });
    return () => {
      vivo = false;
    };
  }, [config]);

  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      if (!isFacebookOrigin(event.origin)) return;
      const msg = parseMessage(event.data);
      if (!msg) return;

      if (msg.event === 'CANCEL') {
        // Cerrar el popup es una decisión, no un error: se vuelve al inicio sin alarmar.
        setFase('idle');
        return;
      }
      if (msg.event === 'ERROR') {
        setFase('idle');
        setError(msg.data?.error_message ?? 'Meta interrumpió la conexión. Inténtalo de nuevo.');
        return;
      }
      if (msg.event === 'FINISH_ONLY_WABA') {
        setFase('idle');
        setError('Conectaste la cuenta, pero falta elegir un número de teléfono. Vuelve a conectar y selecciona uno.');
        return;
      }
      const wabaId = msg.data?.waba_id;
      const phoneNumberId = msg.data?.phone_number_id;
      if (msg.event?.startsWith('FINISH') && wabaId && phoneNumberId) {
        sessionRef.current = { wabaId, phoneNumberId };
        intentarEnviar();
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [intentarEnviar]);

  const iniciar = useCallback(() => {
    if (!sdk || !config) return;
    codeRef.current = null;
    sessionRef.current = null;
    enviadoRef.current = false;
    setError(null);
    setFase('autorizando');

    // Sin `await` antes de esta línea: el popup tiene que abrirse dentro del gesto del clic.
    sdk.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          // Cerró el popup sin terminar. Si llegó un CANCEL, ya se volvió a `idle`.
          if (!enviadoRef.current) setFase('idle');
          return;
        }
        codeRef.current = code;
        intentarEnviar();
      },
      {
        config_id: config.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, sessionInfoVersion: '3' },
      },
    );
  }, [config, intentarEnviar, sdk]);

  const reintentar = useCallback(
    (pin?: string) => {
      setError(null);
      activar.mutate(pin);
    },
    [activar],
  );

  return {
    disponible: config !== null,
    listo: sdk !== null,
    fase,
    error,
    iniciar,
    activar: reintentar,
    activando: activar.isPending,
  };
}
