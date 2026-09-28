/**
 * Carga perezosa y única del SDK de JavaScript de Facebook (HT-WA-03).
 *
 * Solo lo necesita la pantalla de conexión de WhatsApp, así que no va en `index.html`: el resto de
 * la app no paga su peso ni su script de terceros.
 */

export interface FacebookLoginResponse {
  status?: string;
  authResponse?: { code?: string } | null;
}

export interface FacebookLoginOptions {
  config_id: string;
  response_type: 'code';
  override_default_response_type: true;
  extras: Record<string, unknown>;
}

export interface FacebookSdk {
  init(params: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(callback: (response: FacebookLoginResponse) => void, options: FacebookLoginOptions): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

const SDK_URL = 'https://connect.facebook.net/es_LA/sdk.js';

export interface MetaSignupConfig {
  appId: string;
  configId: string;
  graphVersion: string;
}

/** `null` si el entorno no trae la App ID o la configuración: la UI ofrece la conexión manual. */
export function getMetaSignupConfig(): MetaSignupConfig | null {
  const appId = import.meta.env.VITE_META_APP_ID;
  const configId = import.meta.env.VITE_META_CONFIG_ID;
  if (!appId || !configId) return null;
  return { appId, configId, graphVersion: import.meta.env.VITE_META_GRAPH_VERSION ?? 'v26.0' };
}

let sdkPromise: Promise<FacebookSdk> | null = null;

export function loadFacebookSdk(config: MetaSignupConfig): Promise<FacebookSdk> {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    if (window.FB) {
      resolve(window.FB);
      return;
    }

    window.fbAsyncInit = () => {
      const fb = window.FB;
      if (!fb) {
        reject(new Error('El SDK de Facebook no se inicializó.'));
        return;
      }
      fb.init({ appId: config.appId, autoLogAppEvents: true, xfbml: false, version: config.graphVersion });
      resolve(fb);
    };

    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onerror = () => {
      // Un bloqueador de anuncios o una red corporativa: se permite reintentar al volver a montar.
      sdkPromise = null;
      script.remove();
      reject(new Error('No se pudo cargar el SDK de Facebook.'));
    };
    document.body.appendChild(script);
  });

  return sdkPromise;
}
