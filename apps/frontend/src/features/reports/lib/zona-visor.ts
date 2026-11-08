/**
 * Zona IANA del navegador: «hoy» y los cortes de día de los reportes por hora local son los de
 * quien mira (HU-REP-04, HU-REP-06). `undefined` si el runtime no la expone: el backend usa UTC.
 */
export const ZONA_DEL_VISOR = ((): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
})();
