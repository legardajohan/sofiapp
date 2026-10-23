import {
  BookOpen,
  Clock,
  GitBranch,
  MessageSquare,
  Sparkles,
  Target,
  TextCursorInput,
  UserCheck,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { OPERADOR_LABEL, type INodo, type TipoNodo } from '../types.js';

export interface NodeVisual {
  icon: LucideIcon;
  label: string;
  /** Nodo de control de flujo (`condicion`/`intencion`): icono con tinte primario para que
   *  destaque al escanear el grafo — es donde se decide el camino. El resto queda neutro. */
  destacado?: boolean;
}

export const NODE_VISUALS: Record<TipoNodo, NodeVisual> = {
  mensaje: { icon: MessageSquare, label: 'Mensaje' },
  captura: { icon: TextCursorInput, label: 'Captura' },
  condicion: { icon: GitBranch, label: 'Condición', destacado: true },
  intencion: { icon: Target, label: 'Intención', destacado: true },
  kb: { icon: BookOpen, label: 'Base de conocimiento' },
  accion: { icon: Zap, label: 'Acción' },
  handoff: { icon: UserCheck, label: 'Transferir a humano' },
  espera: { icon: Clock, label: 'Espera' },
  ia: { icon: Sparkles, label: 'Asistente IA', destacado: true },
};

/** Qué hace cada nodo, en una o dos líneas y con un ejemplo. Es el texto del tooltip de "Agregar
 *  nodo": el nombre solo ("Intención", "Captura") no le dice a quien arma el flujo cuándo usarlo. */
export const NODE_DESCRIPCION: Record<TipoNodo, string> = {
  mensaje: 'Envía un texto o una plantilla al cliente. Ej.: «Hola, ¿en qué te ayudo?»',
  captura: 'Hace una pregunta y guarda la respuesta (nombre, correo…). Ej.: «¿Cuál es tu correo?»',
  condicion: 'Elige el camino según lo que escribió el cliente. Ej.: si contiene «asesor», pasa a un humano.',
  intencion: 'La IA entiende qué quiere el cliente (precio, horario, comprar…) y sigue por esa rama.',
  kb: 'Responde con tu base de conocimiento. Ej.: «¿Cuánto cuesta el curso?»',
  accion: 'Hace algo en el CRM sin escribirle al cliente: crear lead, cambiar etapa, etiquetar o asignar asesor.',
  handoff: 'Apaga la IA y deja la conversación a un asesor humano. Cierra el flujo.',
  espera: 'Pausa el flujo unos minutos y luego continúa. Útil para hacer seguimiento.',
  ia: 'Un asistente conversa con el cliente hasta cumplir un objetivo y elige por qué salida continuar.',
};

/** Tipos cuyo "siguiente" nodo lo decide una arista genérica del canvas (un único handle de
 *  salida). `condicion`/`intencion`/`ia` ramifican desde su propia configuración y pintan un
 *  handle por rama vía `filasDeRama`; `handoff` es siempre terminal y no tiene salida alguna. */
export function tieneSalidaLineal(tipo: TipoNodo): boolean {
  return tipo !== 'condicion' && tipo !== 'intencion' && tipo !== 'ia' && tipo !== 'handoff';
}

export interface FilaRama {
  /** Id estable del `Handle` de React Flow — también el `sourceHandle` que llega a `onConnect`. */
  handleId: string;
  label: string;
  /** `nodoDestino` (o `ramaPorDefecto`) de esta rama; vacío si aún no se ha elegido destino. */
  destino: string;
}

/**
 * Una fila por rama/etiqueta de un nodo `condicion`/`intencion`, cada una con su propio punto de
 * conexión — es lo que hace visible en el canvas lo que antes solo vivía en el `<Select>` del
 * inspector. La última fila es siempre la rama por defecto. Vacío para cualquier otro tipo (nada
 * que ramifique).
 */
export function filasDeRama(nodo: INodo): FilaRama[] {
  if (nodo.config.tipo === 'condicion') {
    return [
      ...nodo.config.ramas.map((rama, i) => ({
        handleId: `rama-${i}`,
        label: `${OPERADOR_LABEL[rama.operador]} "${rama.valor || '…'}"`,
        destino: rama.nodoDestino,
      })),
      { handleId: 'default', label: 'Si ninguna coincide', destino: nodo.config.ramaPorDefecto },
    ];
  }
  if (nodo.config.tipo === 'intencion') {
    return [
      ...nodo.config.etiquetas.map((etiqueta, i) => ({
        handleId: `etiqueta-${i}`,
        label: etiqueta.etiqueta || 'Sin nombre',
        destino: etiqueta.nodoDestino,
      })),
      { handleId: 'default', label: 'Si no reconoce ninguna', destino: nodo.config.ramaPorDefecto },
    ];
  }
  if (nodo.config.tipo === 'ia') {
    return [
      ...nodo.config.salidas.map((salida, i) => ({
        handleId: `salida-${i}`,
        label: salida.etiqueta || 'Sin nombre',
        destino: salida.nodoDestino,
      })),
      { handleId: 'default', label: 'Si no resuelve', destino: nodo.config.ramaPorDefecto },
    ];
  }
  return [];
}

/**
 * Devuelve un `ConfigNodo` nuevo con el `nodoDestino` (o `ramaPorDefecto`) del handle indicado ya
 * actualizado. La usan tanto el `<Select>` del inspector como soltar una conexión sobre ese handle
 * en el canvas — mismo dato, misma función, así que las dos vías quedan en sync sin código extra.
 */
export function configConDestino(config: INodo['config'], handleId: string, destino: string): INodo['config'] {
  if (config.tipo === 'condicion') {
    if (handleId === 'default') return { ...config, ramaPorDefecto: destino };
    const i = Number(handleId.split('-')[1]);
    return {
      ...config,
      ramas: config.ramas.map((r, idx) => (idx === i ? { ...r, nodoDestino: destino } : r)),
    };
  }
  if (config.tipo === 'intencion') {
    if (handleId === 'default') return { ...config, ramaPorDefecto: destino };
    const i = Number(handleId.split('-')[1]);
    return {
      ...config,
      etiquetas: config.etiquetas.map((e, idx) => (idx === i ? { ...e, nodoDestino: destino } : e)),
    };
  }
  if (config.tipo === 'ia') {
    if (handleId === 'default') return { ...config, ramaPorDefecto: destino };
    const i = Number(handleId.split('-')[1]);
    return {
      ...config,
      salidas: config.salidas.map((s, idx) => (idx === i ? { ...s, nodoDestino: destino } : s)),
    };
  }
  return config;
}

/**
 * Frase que explica por qué el flujo pasa de `origen` a `destino` por la línea de `handleId`
 * (`null` = la salida lineal de un nodo sin ramas). Es el contenido del tooltip del conector: el
 * texto corto de la línea («contiene asesor») dice QUÉ se evalúa, esto dice qué ocurre.
 */
export function describirRelacion(origen: INodo, handleId: string | null, destino: INodo | undefined): string {
  const aDestino = destino ? `sigue a «${NODE_VISUALS[destino.tipo].label}»` : 'termina';
  const indice = handleId ? Number(handleId.split('-')[1]) : -1;
  const config = origen.config;

  if (config.tipo === 'condicion') {
    if (handleId === 'default') return `Si ninguna condición coincide, ${aDestino}.`;
    const rama = config.ramas[indice];
    if (!rama) return `Si se cumple la condición, ${aDestino}.`;
    const sujeto = config.variable.startsWith('var:')
      ? `«${config.variable.slice(4)}»`
      : 'el mensaje del cliente';
    const valor = rama.valor || '…';
    if (rama.operador === 'contiene') return `Si ${sujeto} contiene «${valor}», ${aDestino}.`;
    if (rama.operador === 'igual_a') return `Si ${sujeto} es exactamente «${valor}», ${aDestino}.`;
    return `Si el cliente elige la opción «${valor}» (o su número), ${aDestino}.`;
  }

  if (config.tipo === 'intencion') {
    if (handleId === 'default') return `Si la IA no reconoce ninguna intención, ${aDestino}.`;
    const etiqueta = config.etiquetas[indice]?.etiqueta || 'esta intención';
    return `Si la IA entiende que el cliente quiere «${etiqueta}», ${aDestino}.`;
  }

  if (config.tipo === 'ia') {
    if (handleId === 'default') {
      return `Si el asistente no lo resuelve en ${config.maxTurnos} turnos, ${aDestino}.`;
    }
    const etiqueta = config.salidas[indice]?.etiqueta || 'esta salida';
    return `Si el asistente da por cumplida «${etiqueta}», ${aDestino}.`;
  }

  return `Al terminar «${NODE_VISUALS[origen.tipo].label}», ${aDestino}.`;
}

const EFECTO_LABEL: Record<string, string> = {
  cambiar_estado: 'Cambiar estado',
  aplicar_etiquetas: 'Aplicar etiquetas',
  crear_lead: 'Crear lead',
  asignar_asesor: 'Asignar asesor',
};

/** Resumen de una línea del `config` para que el nodo diga algo sin abrir el inspector (y para
 *  identificarlo en los selectores de destino del `ConditionEditor`). */
export function resumenConfig(nodo: INodo): string {
  switch (nodo.config.tipo) {
    case 'mensaje':
      return nodo.config.texto || (nodo.config.templateId ? 'Plantilla' : 'Sin texto aún');
    case 'captura':
      return nodo.config.pregunta || 'Sin pregunta aún';
    case 'condicion':
      return `${nodo.config.ramas.length} rama${nodo.config.ramas.length === 1 ? '' : 's'}`;
    case 'intencion':
      return `${nodo.config.etiquetas.length} etiqueta${nodo.config.etiquetas.length === 1 ? '' : 's'}`;
    case 'kb':
      return nodo.config.pregunta === 'ultimo_mensaje' ? 'Responde con la KB' : nodo.config.pregunta;
    case 'accion':
      return EFECTO_LABEL[nodo.config.efecto.tipo] ?? nodo.config.efecto.tipo;
    case 'handoff':
      return nodo.config.motivo || 'Pasa la conversación a un asesor';
    case 'espera':
      return `${nodo.config.minutos} min`;
    case 'ia':
      return `${nodo.config.salidas.length} salida${nodo.config.salidas.length === 1 ? '' : 's'} · máx. ${nodo.config.maxTurnos} turnos`;
  }
}

/** Config mínima y válida para un nodo recién creado de este tipo. */
export function configPorDefecto(tipo: TipoNodo): INodo['config'] {
  switch (tipo) {
    case 'mensaje':
      return { tipo, texto: '' };
    case 'captura':
      return { tipo, campo: '', descripcion: '', tipoDato: 'texto', pregunta: '', reintentos: 1 };
    case 'condicion':
      return { tipo, variable: 'ultimo_mensaje', ramas: [], ramaPorDefecto: '' };
    case 'intencion':
      return { tipo, etiquetas: [], ramaPorDefecto: '' };
    case 'kb':
      return { tipo, pregunta: 'ultimo_mensaje', siNoHayRespuesta: '' };
    case 'accion':
      return { tipo, efecto: { tipo: 'crear_lead' } };
    case 'handoff':
      return { tipo };
    case 'espera':
      return { tipo, minutos: 5 };
    case 'ia':
      return { tipo, objetivo: '', salidas: [], ramaPorDefecto: '', maxTurnos: 3, usarKb: true };
  }
}
