import type { KbEstructura, KbScheduleDay, KbScheduleInterval } from '../types/index.js';

/**
 * Lógica pura del horario de atención (HU-KB-12).
 *
 * Vive fuera de los componentes porque tiene dos consumidores que no comparten árbol: el editor
 * semanal, que pinta los errores, y `KnowledgeUploadEditor`, que decide si se puede guardar.
 *
 * **Las horas se comparan como texto, a propósito.** Un `'HH:mm'` de dos dígitos es
 * lexicográficamente ordenable —`'08:00' < '14:00'` es verdad como string—, así que parsear a
 * minutos no aportaría nada y sí añadiría un `NaN` posible. Si alguien siente la tentación de meter
 * un `parseInt` aquí, esta nota es la respuesta.
 */

/**
 * En qué estado está un tramo. Son **tres** y no un booleano porque «me falta escribir la hora de
 * cierre» y «cierro antes de abrir» piden respuestas opuestas: el primero es un paso natural
 * mientras se teclea y solo merece un aviso; el segundo es un dato que el admin da por guardado y
 * que no se va a guardar, así que tiene que bloquear.
 */
export type EstadoIntervalo = 'ok' | 'incompleto' | 'invertido';

export function estadoIntervalo(intervalo: KbScheduleInterval): EstadoIntervalo {
  const desde = intervalo.desde.trim();
  const hasta = intervalo.hasta.trim();

  if (desde.length === 0 || hasta.length === 0) return 'incompleto';
  // `desde === hasta` cuenta como invertido: un tramo de duración cero no describe una franja de
  // atención, describe un descuido al teclear.
  return desde < hasta ? 'ok' : 'invertido';
}

/** Atajo de `estadoIntervalo(i) === 'ok'`. Es el filtro estricto de la serialización. */
export function intervaloValido(intervalo: KbScheduleInterval): boolean {
  return estadoIntervalo(intervalo) === 'ok';
}

/**
 * Los intervalos que un día abierto aporta de verdad. Vacío ⇒ el día no dice nada y se omite del
 * texto, igual que ya pasaba con un día abierto sin tramos.
 */
export function intervalosUtiles(dia: KbScheduleDay): KbScheduleInterval[] {
  return dia.cerrado ? [] : dia.intervalos.filter(intervaloValido);
}

/**
 * `true` si algún día **abierto** tiene un tramo invertido. Es lo **único** que bloquea el guardado:
 * los `incompleto` no cuentan nunca (ver `EstadoIntervalo`).
 *
 * Un día cerrado no se mira: sus tramos se conservan por si vuelve a abrirse, pero no llegan al
 * texto, así que un error ahí no engaña a nadie.
 */
export function hayIntervalosInvertidos(dias: KbScheduleDay[]): boolean {
  return dias.some(
    (dia) => !dia.cerrado && dia.intervalos.some((i) => estadoIntervalo(i) === 'invertido'),
  );
}

/** `true` si algún campo `horario` de la estructura tiene tramos invertidos. */
export function estructuraConHorarioInvertido(estructura: KbEstructura): boolean {
  return Object.values(estructura.campos).some(
    (valor) => valor.tipo === 'horario' && hayIntervalosInvertidos(valor.dias),
  );
}

/**
 * Copia los tramos de `origen` a `destinos`.
 *
 * Dos reglas que no son negociables:
 *  - **los días cerrados no se tocan**. Cerrar un día es una decisión explícita del admin y un
 *    copiado masivo no puede deshacerla en silencio. Quien llama ya debería impedir elegirlos, pero
 *    esto es la red por si algún día se llama desde otro sitio.
 *  - **se copia por valor**, con la `descripcion` incluida: si el lunes dice «solo recepción de
 *    pedidos», el martes tiene que decir lo mismo — era el motivo de copiar. Clonar cada intervalo
 *    evita que editar el martes mute también el lunes.
 */
export function copiarHorario(
  dias: KbScheduleDay[],
  origen: string,
  destinos: readonly string[],
): KbScheduleDay[] {
  const diaOrigen = dias.find((d) => d.dia === origen);
  if (diaOrigen === undefined) return dias;

  const objetivos = new Set(destinos);
  return dias.map((dia) => {
    if (dia.dia === origen || !objetivos.has(dia.dia) || dia.cerrado) return dia;
    return { ...dia, intervalos: diaOrigen.intervalos.map((i) => ({ ...i })) };
  });
}
