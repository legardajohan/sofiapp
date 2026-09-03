import {
  BookOpen,
  Clock,
  GitBranch,
  MessageSquare,
  Target,
  TextCursorInput,
  UserCheck,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { INodo, TipoNodo } from '../types.js';

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
};

/** Tipos cuyo "siguiente" nodo lo decide una arista genérica del canvas. `condicion`/`intencion`
 *  ramifican desde su propia configuración (el inspector), no desde una arista; `handoff` es
 *  siempre terminal. Mostrarles un handle de salida sería una afordancia que no hace nada. */
export function tieneSalidaLineal(tipo: TipoNodo): boolean {
  return tipo !== 'condicion' && tipo !== 'intencion' && tipo !== 'handoff';
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
  }
}
