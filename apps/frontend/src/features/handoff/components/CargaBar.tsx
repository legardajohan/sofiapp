interface CargaBarProps {
  valor: number;
  /** Carga del asesor más ocupado. La escala es compartida: es lo que permite comparar filas. */
  maximo: number;
}

/**
 * Barra de carga de un asesor (HU-IA-07). CSS puro, sin librería de gráficos.
 *
 * **Proporcional al máximo, no al total.** La pregunta que trae a alguien a este panel es «quién
 * está más cargado», que es comparativa: contra el total, con diez asesores todas las barras serían
 * igual de cortas y no dirían nada.
 *
 * **Decorativa** (`aria-hidden`): el valor accesible es el número que va al lado en la tabla. Un
 * lector de pantalla lee la cifra, no la longitud de un `div`.
 */
export function CargaBar({ valor, maximo }: CargaBarProps): React.ReactElement {
  // Un mínimo visible cuando hay algo: una barra de 1 sobre 40 sería invisible y parecería un cero.
  const porcentaje = maximo > 0 && valor > 0 ? Math.max(4, (valor / maximo) * 100) : 0;

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div className="h-full rounded-full bg-primary" style={{ width: `${porcentaje}%` }} />
    </div>
  );
}
