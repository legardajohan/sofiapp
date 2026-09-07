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
