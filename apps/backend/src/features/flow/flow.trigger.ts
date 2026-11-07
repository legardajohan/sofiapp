import { normalizar } from './flow.engine.js';
import type { IHorarioTrigger, ITriggerFlow } from './flow.types.js';
import { momentoLocal } from '../../utils/zona-horaria.util.js';

/** Lo que `evaluarTrigger` necesita saber del mensaje. Todo viene resuelto por el runtime: esta
 *  función es pura y no toca Mongo ni el reloj. */
export interface ContextoTrigger {
  texto: string;
  /** El cliente no tenía mensajes suyos previos a este. */
  esPrimerMensaje: boolean;
  ahora: Date;
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
