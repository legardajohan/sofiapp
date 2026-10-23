import { normalizar } from './flow.engine.js';
import type { IHorarioTrigger, ITriggerFlow } from './flow.types.js';

/** Lo que `evaluarTrigger` necesita saber del mensaje. Todo viene resuelto por el runtime: esta
 *  función es pura y no toca Mongo ni el reloj. */
export interface ContextoTrigger {
  texto: string;
  /** El cliente no tenía mensajes suyos previos a este. */
  esPrimerMensaje: boolean;
  ahora: Date;
}

const DIAS_SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Día de la semana (0 = domingo) y hora `HH:mm` de `ahora` en la zona dada. `Intl` y no aritmética
 *  de offsets: respeta los cambios de horario de verano de cada zona. */
function momentoLocal(ahora: Date, zonaHoraria: string): { dia: number; hora: string } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zonaHoraria,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora);
  const valor = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? '';
  return { dia: DIAS_SEMANA[valor('weekday')] ?? -1, hora: `${valor('hour')}:${valor('minute')}` };
}

function dentroDeHorario(horario: IHorarioTrigger, ahora: Date): boolean {
  const { dia, hora } = momentoLocal(ahora, horario.zonaHoraria);
  return horario.dias.includes(dia) && hora >= horario.desde && hora < horario.hasta;
}

/**
 * ¿Debe arrancar este flow para este mensaje? Se llama SOLO al iniciar: un cliente con el flow ya
 * en curso sigue por el motor sin pasar por aquí. Un trigger ausente o malformado (dato que Zod ya
 * debió rechazar) abre en vez de cerrar: perder un cliente por un campo corrupto es peor que un
 * flow que arranca de más.
 */
export function evaluarTrigger(trigger: ITriggerFlow | undefined, ctx: ContextoTrigger): boolean {
  if (!trigger) return true;

  switch (trigger.tipo) {
    case 'siempre':
      return true;
    case 'primer_mensaje':
      return ctx.esPrimerMensaje;
    case 'palabra_clave': {
      const texto = normalizar(ctx.texto);
      return (trigger.palabras ?? []).some((p) => {
        const palabra = normalizar(p);
        return palabra.length > 0 && texto.includes(palabra);
      });
    }
    case 'horario':
      return trigger.horario ? dentroDeHorario(trigger.horario, ctx.ahora) : true;
  }
}
