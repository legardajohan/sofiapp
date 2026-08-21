import { useEffect, useState } from 'react';

/**
 * Devuelve `value` retrasado `delayMs`, reiniciando el temporizador en cada cambio.
 *
 * Pensado para separar lo que el usuario escribe (que debe repintarse en cada tecla) de lo que
 * dispara trabajo (filtrar, consultar). El input sigue siendo controlado por el valor inmediato;
 * este hook solo retrasa el valor que consume la lógica cara.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
