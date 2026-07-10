import type { CSSProperties } from 'react';
import lockupSvg from '../../../assets/sofiapp-lockup.svg';
import './SofiAppLogin.css';
import './rainbow-fill.css';

export interface SofiAppLoginProps {
  width?: string;
  accentColor?: string;
  className?: string;
}

export function SofiAppLogin({ width, accentColor, className }: SofiAppLoginProps): React.ReactElement {
  const style: CSSProperties & Record<string, string> = {};
  if (width) style['--sofia-login-width'] = width;
  if (accentColor) style['--sofia-login-tint'] = accentColor;

  return (
    <div id="sofiapp-login-wrapper" style={style} className={className}>
      <div className="logo-wrap">
        <div className="logo" role="img" aria-label="Sofiapp">
          {/* Light: colores nativos del SVG. Dark: aura arcoíris difusa (detrás) + relleno
              arcoíris nítido (misma silueta y misma animación → el halo coincide con el
              color que pasa en cada punto), con el barrido de luz encima. */}
          <div className="logo__aura sofia-rainbow-fill" aria-hidden="true" />
          <img className="logo__art" src={lockupSvg} alt="" draggable={false} />
          <div className="logo__fill sofia-rainbow-fill" aria-hidden="true" />
          <div className="logo__sheen" />
        </div>
      </div>
    </div>
  );
}
