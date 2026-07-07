# DSN-02 — Plan técnico (CÓMO)

> No reinventa la lógica de `AUTH-01`; solo añade UI. Cero cambios en `apps/backend`.

## Archivos a crear / tocar

```
apps/frontend/src/
├── assets/
│   └── sofiapp-lockup.svg                      # (crear) copia de docs/ui-components/.../sofiapp-lg-v1.svg
├── features/auth/
│   ├── components/
│   │   ├── SofiAppLogin.tsx                    # (crear)
│   │   ├── SofiAppLogin.css                    # (crear) porteado de styles.css, escopado a #sofiapp-login-wrapper
│   │   ├── SofiAppWelcomeLoader.tsx            # (crear)
│   │   └── SofiAppWelcomeLoader.css            # (crear) porteado de loading.css, escopado a #sofiapp-loader-wrapper
│   ├── LoginView.tsx                           # (crear) gate raíz: muestra SofiAppWelcomeLoader tras login exitoso
│   ├── LoginPage.tsx                           # (editar) solo líneas 66-67 + imports
│   └── index.ts                                # (editar) + export LoginView
└── router.tsx                                  # (editar) envolver el elemento raíz con <LoginView/>
```

## Contratos

### `SofiAppLogin.tsx`

```ts
interface SofiAppLoginProps {
  width?: string;        // CSS length → --sofia-login-width (default: clamp(140px, 20vw, 220px))
  accentColor?: string;  // "R, G, B" → --sofia-login-tint (default: "88, 45, 203")
  className?: string;    // passthrough para layout del padre
}
export function SofiAppLogin(props: SofiAppLoginProps): React.ReactElement
```

- Markup (adaptado de `index.html`, solo la porción del lockup — sin `.stage`/`.tagline`):
  ```html
  <div id="sofiapp-login-wrapper" style={vars} className={className}>
    <div className="logo-wrap">
      <div className="logo" role="img" aria-label="Sofiapp">
        <img className="logo__art" src={lockupSvg} alt="" draggable="false" />
        <div className="logo__sheen" />
      </div>
    </div>
  </div>
  ```
  > **Ajuste post-implementación** (feedback visual del usuario): se eliminó `.logo__shadow`
  > (sombra de contacto elíptica bajo el lockup) — dentro de la tarjeta de login, junto al
  > formulario, se leía como un manchón flotante en vez de aportar sensación de "objeto real".
  > El ancho por defecto en `LoginPage.tsx` subió de `180px` a `220px` para compensar el peso
  > visual que perdía el componente sin la sombra.
- `style={{ '--sofia-login-width': width, '--sofia-login-tint': accentColor }}` — solo se
  inyectan las que vengan definidas (`undefined` deja el `var(--x, fallback)` del CSS).
- Importa `./SofiAppLogin.css` (side-effect import, sin CSS Modules — no hay esa
  infraestructura en el repo; el escopado es 100% por ID como pide la regla del usuario).

### `SofiAppLogin.css`

- Todo bajo `#sofiapp-login-wrapper` (o `#sofiapp-login-wrapper .clase`).
- Reglas portadas: `.logo-wrap`, `.logo` (usa `var(--sofia-login-width, clamp(140px, 20vw,
  220px))` en `width`), `.logo__art` (drop-shadow usa `var(--sofia-login-tint, 88, 45, 203)`),
  `.logo__sheen` + `::before` (mask data-URI sin tocar), hover/active,
  `@media (prefers-reduced-motion: reduce)`. `.logo__shadow` se descartó (ver nota de ajuste
  post-implementación arriba).
- Descartadas: `:root`, `*`, `html,body`, `body`, `.stage`, `.tagline` (no aplican fuera de una
  página standalone; la tagline del login sigue siendo el párrafo ya existente en
  `LoginPage.tsx`).
- `@keyframes sweep` → `sofiaLogin-sweep` (prefijo para no colisionar con el de
  `SofiAppWelcomeLoader.css`).

### `SofiAppWelcomeLoader.tsx`

```ts
interface SofiAppWelcomeLoaderProps {
  width?: string;         // → --sofia-welcome-width (default: clamp(200px, 26vw, 340px))
  accentColor?: string;   // "R, G, B" → --sofia-welcome-tint (default: "88, 45, 203")
  tagline?: string;       // default: "Preparando tu tienda…"
  durationMs?: number;    // default: 2200 — tiempo total visible antes de onComplete
  onComplete?: () => void;
}
export function SofiAppWelcomeLoader(props): React.ReactElement
```

- Markup (adaptado de `loading.html`, solo `.boot-overlay*` — sin `.login-mock`):
  ```html
  <div id="sofiapp-loader-wrapper" style={vars}>
    <div className="boot-overlay">
      <div className="boot-overlay__logo" role="img" aria-label="Sofiapp">
        <img className="boot-overlay__art" src={lockupSvg} alt="" draggable="false" />
        <div className="boot-overlay__sheen" />
      </div>
      <p className="boot-overlay__tagline">{tagline}</p>
      <div className="boot-overlay__progress"><span /></div>
    </div>
  </div>
  ```
- `useEffect` interno: `setTimeout(() => onComplete?.(), durationMs)`, limpiado al desmontar.
  El componente es responsable de **cuánto dura**; quien lo monta (`LoginView`) decide
  **cuándo** montarlo/desmontarlo.
- Inyecta `--sofia-welcome-duration: ${durationMs}ms` para que el fade-out CSS de salida quede
  sincronizado con el `durationMs` real (evita que JS y CSS se desincronicen).

### `SofiAppWelcomeLoader.css`

- Todo bajo `#sofiapp-loader-wrapper`; `.boot-overlay` usa `position: fixed; inset: 0; z-index:
  9999;` (antes era `position:absolute` dentro de `.stage` de la demo — aquí necesita cubrir
  toda la SPA, no un contenedor local).
- Reglas portadas: `.boot-overlay`, `.boot-overlay__logo/__art/__sheen/__sheen::before`,
  `.boot-overlay__tagline`, `.boot-overlay__progress` + `span`, `@media
  (prefers-reduced-motion: reduce)`.
- Descartadas: `:root` (recreado como custom properties del wrapper), `*`, `html,body`, `body`,
  `.stage`, todo `.login-mock*` y `@keyframes overlayLifecycle`/`cardSharpen` (eran solo para
  simular el login "detrás" en la demo standalone; en producción el destino real ya está
  montado detrás por el router).
- **Timing convertido de porcentaje-de-loop a duraciones fijas** (el archivo fuente lo pide
  explícitamente: "en producción no existe el loop: el overlay se retira una sola vez"):
  `logoIn` ~500ms ease-out forwards, `singleSweep` ~900ms (delay ~400ms) forwards, `tagIn`
  ~400ms (delay ~500ms) forwards, `progressSlide` 1.3s **infinite** (barra indeterminada, se
  mantiene igual que el original), y una animación de salida `sofiaWelcome-fadeOut` con
  `animation-delay: var(--sofia-welcome-duration)`.
- `@keyframes singleSweep` etc. → prefijo `sofiaWelcome-*`.

### `LoginView.tsx`

```ts
const WELCOME_DURATION_MS = 2200;

export function LoginView(): React.ReactElement | null {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  const prevStatusRef = useRef(status);
  const wasOnLoginRef = useRef(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (location.pathname === '/login') wasOnLoginRef.current = true;
  }, [location.pathname]);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev !== 'authenticated' && status === 'authenticated' && wasOnLoginRef.current) {
      wasOnLoginRef.current = false;
      setVisible(true);
    }
  }, [status]);

  if (!visible) return null;
  return (
    <SofiAppWelcomeLoader
      durationMs={WELCOME_DURATION_MS}
      onComplete={() => setVisible(false)}
    />
  );
}
```

- Se monta como **hermano** de `AuthBootstrap` en la raíz del router (no lo envuelve, no
  reemplaza la ruta `/login`) — ver razonamiento en "Notas" más abajo.
- No navega: solo decide cuándo mostrar/ocultar el overlay. La navegación real la sigue
  haciendo `LoginPage.tsx` exactamente como hoy (inmediata, sin esperar el overlay) — el
  overlay simplemente se superpone (z-index 9999) mientras el destino carga detrás.

### `LoginPage.tsx` (diff mínimo)

- Reemplazar:
  ```tsx
  <img src={sofiappIcon} alt="" className="h-20 w-auto drop-shadow-md" />
  <img src={sofiappName} alt="SofiApp" className="h-16 w-auto drop-shadow-lg" />
  ```
  por:
  ```tsx
  <SofiAppLogin width="220px" />
  ```
- Quitar los imports `sofiappIcon`/`sofiappName` (ya no se usan); añadir
  `import { SofiAppLogin } from './components/SofiAppLogin.js';`. `loginBg` se mantiene (sigue
  usado por la ilustración inferior).
- Ninguna otra línea del archivo cambia.

### `router.tsx` (diff mínimo)

```tsx
import { LoginView } from './features/auth/index.js';
// ...
export const router = createBrowserRouter([
  {
    element: (
      <>
        <LoginView />
        <AuthBootstrap />
      </>
    ),
    children: [ /* sin cambios */ ],
  },
]);
```

### `features/auth/index.ts`

- Añadir: `export { LoginView } from './LoginView.js';`

## Notas

- **Estrategia de aislamiento CSS:** especificidad de ID (`#wrapper .clase`) contra los
  selectores de baja especificidad de Tailwind Preflight — sin `!important`, sin CSS Modules
  (no existen en el toolchain actual). `index.css` usa `@tailwind base` (Preflight) con
  selectores de baja especificidad (`img{...}`, `*{...}`); cualquier regla anidada bajo
  `#sofiapp-login-wrapper .clase` (especificidad 0,1,1+) gana automáticamente. Se descartan las
  reglas de página (`:root`, `*`, `html,body`, `body`, `.stage`) por ser del contexto HTML
  standalone; `* { box-sizing: border-box }` se omite porque Preflight ya lo garantiza
  globalmente. Los `@keyframes` no se auto-escopan por anidamiento (a diferencia de las clases)
  — se renombran con prefijo (`sofiaLogin-*` / `sofiaWelcome-*`) para blindar contra colisiones.
- **Por qué `LoginView` vive en la raíz y no envuelve `LoginPage`:** el `onSuccess` de
  `loginMutation` en `LoginPage.tsx` llama `navigate(...)` de inmediato. Si `LoginView` fuera el
  elemento de la ruta `/login`, se desmontaría junto con `LoginPage` en el mismo instante del
  `navigate`, sin ventana de tiempo para mostrar el overlay. Por eso `LoginView` se monta como
  hermano persistente en la raíz del router, fuera del subárbol que cambia con la navegación, y
  detecta la transición `status → 'authenticated'` mientras la ruta actual es `/login`. Es la
  única forma de lograr "desmonta login, muestra welcome, luego navega" sin tocar una sola línea
  de la lógica ya probada de `LoginPage.tsx`.
- **`color`/`accentColor` no recolorea el logo real** (es un `<img>` de un SVG con gradientes
  fijos, por diseño del archivo fuente) — solo tinta el `drop-shadow` ambiental. No hay prop
  `stroke` (no aplica a este asset).

## Verificación

- `pnpm --filter frontend build` en verde.
- `pnpm --filter frontend lint` (si el gap de `eslint.config.js` de `INF-01` sigue sin
  resolverse, documentarlo igual que en `AUTH-01/tasks.md`, no bloquea el feature).
- Prueba manual con Playwright/dev server: login real → se ve el overlay a pantalla completa
  ~2.2s → aparece el destino (`/admin` o `/`); recargar la página con sesión activa **no**
  dispara el overlay; probar con `prefers-reduced-motion: reduce` activado en DevTools.
