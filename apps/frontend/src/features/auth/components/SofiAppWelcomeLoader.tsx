import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import lockupSvg from '../../../assets/sofiapp-lockup.svg';
import './SofiAppWelcomeLoader.css';
import './rainbow-fill.css';

export interface SofiAppWelcomeLoaderProps {
  width?: string;
  accentColor?: string;
  tagline?: string;
  durationMs?: number;
  onComplete?: () => void;
}

const DEFAULT_TAGLINE = 'Preparando tu entorno…';
const DEFAULT_DURATION_MS = 2200;

export function SofiAppWelcomeLoader({
  width,
  accentColor,
  tagline = DEFAULT_TAGLINE,
  durationMs = DEFAULT_DURATION_MS,
  onComplete,
}: SofiAppWelcomeLoaderProps): React.ReactElement {
  useEffect(() => {
    const timer = setTimeout(() => onComplete?.(), durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onComplete]);

  const style: CSSProperties & Record<string, string> = {
    '--sofia-welcome-duration': `${durationMs}ms`,
  };
  if (width) style['--sofia-welcome-width'] = width;
  if (accentColor) style['--sofia-welcome-tint'] = accentColor;

  return (
    <div id="sofiapp-loader-wrapper" style={style}>
      <div className="boot-overlay">
        <div className="boot-overlay__logo" role="img" aria-label="Sofiapp">
          {/* Light: colores nativos del SVG. Dark: relleno con degradado que se desplaza
              de púrpura a azul mientras el overlay está visible. */}
          <div className="boot-overlay__aura sofia-rainbow-fill" aria-hidden="true" />
          <img className="boot-overlay__art" src={lockupSvg} alt="" draggable={false} />
          <div className="boot-overlay__fill sofia-rainbow-fill" aria-hidden="true" />
          <div className="boot-overlay__sheen" />
        </div>
        <p className="boot-overlay__tagline">{tagline}</p>
        <div className="boot-overlay__progress">
          <span />
        </div>
      </div>
    </div>
  );
}
