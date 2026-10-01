/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** App de Meta de SofiApp (HT-WA-03). Sin ella, el botón «Conectar con Facebook» se desactiva. */
  readonly VITE_META_APP_ID?: string;
  /** Configuración de *Facebook Login for Business* de tipo WhatsApp Embedded Signup. */
  readonly VITE_META_CONFIG_ID?: string;
  readonly VITE_META_GRAPH_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
