import iconSvg from '@/assets/sofiapp-v1.svg';
import nameSvg from '@/assets/sofiapp-name.svg';
import './SidebarLogo.css';

export function SidebarLogo(): React.ReactElement {
  return (
    <div
      role="img"
      aria-label="SofiApp"
      className="flex min-w-0 items-center gap-2"
      style={
        {
          '--sidebar-logo-icon-mask': `url("${iconSvg}")`,
          '--sidebar-logo-name-mask': `url("${nameSvg}")`,
        } as React.CSSProperties
      }
    >
      <div className="sidebar-logo__icon" aria-hidden="true">
        <img src={iconSvg} alt="" className="sidebar-logo__icon-img" draggable={false} />
        <div className="sidebar-logo__icon-sheen" />
      </div>
      <div
        aria-hidden="true"
        className="sidebar-logo__name w-[7.6rem] opacity-100 transition-[width,opacity,margin] duration-200 ease-linear group-data-[collapsible=icon]:-ml-2 group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0"
      >
        {/* Light: colores propios del SVG, intactos. Dark: degradado azul→púrpura del ícono. */}
        <img src={nameSvg} alt="" className="sidebar-logo__name-native block dark:hidden" draggable={false} />
        <div className="sidebar-logo__name-fill hidden dark:block" />
        <div className="sidebar-logo__name-sheen" />
      </div>
    </div>
  );
}
