/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** App de Meta de SofiApp (HT-WA-03). Sin ella, el botón «Conectar con Facebook» se desactiva. */
  readonly VITE_META_APP_ID?: string;
  /** Configuración de *Facebook Login for Business* de tipo WhatsApp Embedded Signup. */
  readonly VITE_META_CONFIG_ID?: string;
  readonly VITE_META_GRAPH_VERSION?: string;
  /**
   * Llave PÚBLICA de Wompi (HT-PAY-05), contraparte de `WOMPI_PUBLIC_KEY` del backend. Es la única
   * variable de Wompi que puede existir aquí: `scripts/check-bundle-secrets.mjs` rompe el build si
   * hay una `VITE_*` con nombre de secreto o un secreto dentro del bundle.
   */
  readonly VITE_WOMPI_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
