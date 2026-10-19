/** Días elegidos en los inputs `type="date"` (`YYYY-MM-DD`); `''` = sin límite por ese lado. */
export interface RangoFechas {
  desde: string;
  hasta: string;
}

/** Lo que viaja al API: instantes ISO. `hasta` es exclusivo (HU-REP-05-V2, D4). */
export interface RangoInstantes {
  desde?: string;
  hasta?: string;
}

export const SIN_FECHAS: RangoFechas = { desde: '', hasta: '' };

/** Medianoche LOCAL del día `YYYY-MM-DD` desplazado `dias`. `new Date(y, m, d)` respeta la zona y el DST. */
function medianocheLocal(dia: string, dias = 0): Date {
  const [y, m, d] = dia.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d + dias);
}

/** Ambas fechas puestas y la inicial después de la final. Comparar `YYYY-MM-DD` como texto es exacto. */
export function rangoInvertido({ desde, hasta }: RangoFechas): boolean {
  return desde !== '' && hasta !== '' && desde > hasta;
}

/**
 * Convierte los días del visor en instantes, con SU zona horaria: "hasta el 3" se envía como la
 * medianoche local del 4, así el día 3 entra completo (también en días con cambio de horario) y el
 * backend no necesita saber de zonas. Un rango invertido no se envía: la UI ya lo señala.
 */
export function diasLocalesAInstantes(rango: RangoFechas): RangoInstantes {
  if (rangoInvertido(rango)) return {};
  return {
    ...(rango.desde ? { desde: medianocheLocal(rango.desde).toISOString() } : {}),
    ...(rango.hasta ? { hasta: medianocheLocal(rango.hasta, 1).toISOString() } : {}),
  };
}
