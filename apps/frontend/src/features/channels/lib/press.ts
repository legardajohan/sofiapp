/**
 * Respuesta al presionar los botones de la pantalla. Lista las propiedades en vez de reemplazar
 * `transition-colors` del `Button` de shadcn: si no, el hover perdería su transición de color.
 */
export const PRESS = 'transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.97]';
