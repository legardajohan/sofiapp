/**
 * Deriva los colores de un chip a partir del hex que eligió el administrador.
 *
 * El color de una etiqueta es **dato del tenant**, no un token de diseño, así que no puede vivir en
 * `index.css`. Pero un hex libre no garantiza nada: `#1E3A8A` sobre fondo oscuro es ilegible y
 * `#FFFF00` sobre fondo claro también. Esta función resuelve eso: compone el fondo del chip con la
 * superficie real del tema y luego **ajusta la luminosidad del texto hasta alcanzar 4.5:1 (WCAG AA)**.
 *
 * Es pura y determinista a propósito: el criterio de contraste del spec se verifica con tests.
 */

export type Theme = 'light' | 'dark';

export interface TagColors {
  /** Fondo del chip: el color de la etiqueta ya compuesto sobre la superficie (opaco). */
  bg: string;
  /** Color del texto, con contraste garantizado contra `bg`. */
  fg: string;
  border: string;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Superficie sobre la que se pinta el chip: `--card` de cada tema, en RGB. */
const SUPERFICIE: Record<Theme, Rgb> = {
  light: { r: 255, g: 255, b: 255 },
  dark: { r: 28, g: 30, b: 39 },
};

/** Cuánto color deja pasar el fondo del chip. En oscuro necesita algo más para no desaparecer. */
const ALFA_FONDO: Record<Theme, number> = { light: 0.16, dark: 0.24 };
const ALFA_BORDE: Record<Theme, number> = { light: 0.32, dark: 0.4 };

const CONTRASTE_MINIMO = 4.5;

const FALLBACK: Record<Theme, TagColors> = {
  light: { bg: 'hsl(248 40% 96.1%)', fg: 'hsl(231 7.6% 30%)', border: 'hsl(235 25% 88%)' },
  dark: { bg: 'hsl(228 16% 18%)', fg: 'hsl(250 20% 88%)', border: 'hsl(228 14% 26%)' },
};

function parseHex(hex: string): Rgb | null {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function toCss({ r, g, b }: Rgb): string {
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
}

/** Composición alfa sobre un fondo opaco: devuelve el color resultante, ya sin transparencia. */
function componer(color: Rgb, fondo: Rgb, alfa: number): Rgb {
  return {
    r: color.r * alfa + fondo.r * (1 - alfa),
    g: color.g * alfa + fondo.g * (1 - alfa),
    b: color.b * alfa + fondo.b * (1 - alfa),
  };
}

/** Luminancia relativa según WCAG 2.1. */
function luminancia({ r, g, b }: Rgb): number {
  const canal = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Ratio de contraste WCAG entre dos colores opacos. De 1:1 a 21:1. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const claro = Math.max(la, lb);
  const oscuro = Math.min(la, lb);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Mezcla lineal hacia negro (`t < 0`) o hacia blanco (`t > 0`). */
function desplazar(color: Rgb, t: number): Rgb {
  const destino = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  return {
    r: color.r + (destino - color.r) * k,
    g: color.g + (destino - color.g) * k,
    b: color.b + (destino - color.b) * k,
  };
}

/**
 * Empuja el color hacia negro (tema claro) o hacia blanco (oscuro) hasta cumplir el mínimo.
 * Devuelve el primer paso que lo consigue, para conservar el tono lo máximo posible.
 */
function textoLegible(color: Rgb, fondo: Rgb, theme: Theme): Rgb {
  if (contrastRatio(color, fondo) >= CONTRASTE_MINIMO) return color;

  const direccion = theme === 'light' ? -1 : 1;
  for (let paso = 1; paso <= 20; paso += 1) {
    const candidato = desplazar(color, direccion * (paso / 20));
    if (contrastRatio(candidato, fondo) >= CONTRASTE_MINIMO) return candidato;
  }
  // Extremo: negro puro o blanco puro contra un fondo casi idéntico. Nunca ocurre con los alfas de
  // arriba, pero devolver el extremo es preferible a devolver algo ilegible.
  return theme === 'light' ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
}

export function tagColors(hex: string, theme: Theme): TagColors {
  const color = parseHex(hex);
  if (!color) return FALLBACK[theme];

  const superficie = SUPERFICIE[theme];
  const bg = componer(color, superficie, ALFA_FONDO[theme]);
  const border = componer(color, superficie, ALFA_BORDE[theme]);
  const fg = textoLegible(color, bg, theme);

  return { bg: toCss(bg), fg: toCss(fg), border: toCss(border) };
}

/** Expuesto para los tests: permite comprobar el contraste real del par que se va a pintar. */
export function tagContrast(hex: string, theme: Theme): number {
  const color = parseHex(hex);
  if (!color) return 21;
  const bg = componer(color, SUPERFICIE[theme], ALFA_FONDO[theme]);
  return contrastRatio(textoLegible(color, bg, theme), bg);
}
