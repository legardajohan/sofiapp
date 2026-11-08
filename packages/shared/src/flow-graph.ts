/**
 * Análisis del grafo de un flujo (HU-FLOW-05). Función PURA y sin dependencias: la usan el backend
 * (al guardar y al activar un flujo) y el editor (en vivo, para pintar cada nodo en rojo o verde),
 * así que las reglas viven en un solo lugar.
 *
 * Distingue dos clases de problemas que NO bloquean guardar pero SÍ bloquean activar:
 *  - de **conexión**: nodo huérfano, rama sin destino o con destino inexistente;
 *  - de **contenido**: el nodo está a medias (pregunta vacía, objetivo corto, sin salidas…).
 *
 * Los errores de **forma** (ids repetidos, tipos inválidos, campos no permitidos) no se reportan
 * aquí: los rechaza el esquema Zod del backend porque no se pueden persistir.
 */

export type CodigoErrorGrafo =
  | 'NODO_HUERFANO'
  | 'DESTINO_VACIO'
  | 'DESTINO_INEXISTENTE'
  | 'CONTENIDO_INCOMPLETO';

export interface ErrorGrafo {
  nodoId: string;
  codigo: CodigoErrorGrafo;
  mensaje: string;
}

interface DestinoGrafo {
  nodoDestino: string;
}

/** Forma mínima de la config de cada tipo de nodo. Los campos de texto son `string` (no `min(1)`):
 *  un borrador puede tenerlos vacíos y justamente eso es lo que este análisis detecta. */
export type ConfigGrafo =
  | { tipo: 'mensaje'; texto?: string; templateId?: string }
  | {
      tipo: 'captura';
      campo: string;
      descripcion: string;
      pregunta: string;
      /** HU-FLOW-05: con `atributo`, la `key` del campo personalizado es obligatoria. */
      destino?: { tipo: string; key?: string };
    }
  | { tipo: 'condicion'; ramas: Array<DestinoGrafo & { valor: string }>; ramaPorDefecto: string }
  | {
      tipo: 'intencion';
      etiquetas: Array<DestinoGrafo & { etiqueta: string; descripcion: string }>;
      ramaPorDefecto: string;
    }
  | { tipo: 'kb'; pregunta: string; siNoHayRespuesta: string }
  | { tipo: 'accion'; efecto: { tipo: string; tagIds?: string[]; asesorId?: string; estado?: string } }
  | { tipo: 'handoff' }
  | { tipo: 'espera'; minutos: number }
  | {
      tipo: 'ia';
      objetivo: string;
      salidas: Array<DestinoGrafo & { etiqueta: string; descripcion: string }>;
      ramaPorDefecto: string;
    };

export interface NodoGrafo {
  id: string;
  /** Nombre que le puso el usuario (opcional). Sin él se usa el título del tipo. */
  nombre?: string;
  config: ConfigGrafo;
}

export interface AristaGrafo {
  from: string;
  to: string;
}

/** Mínimo de caracteres del objetivo de un nodo `ia` (igual que el esquema estricto del backend). */
export const MIN_OBJETIVO_IA = 10;

const TITULO_POR_TIPO: Record<ConfigGrafo['tipo'], string> = {
  mensaje: 'Mensaje',
  captura: 'Captura',
  condicion: 'Condición',
  intencion: 'Intención',
  kb: 'Base de conocimiento',
  accion: 'Acción',
  handoff: 'Transferir a humano',
  espera: 'Espera',
  ia: 'Asistente IA',
};

/** Nombre que se muestra del nodo: el que puso el usuario o, si no, el título de su tipo. */
export function nombreDeNodo(nodo: Pick<NodoGrafo, 'nombre' | 'config'>): string {
  return nodo.nombre?.trim() || TITULO_POR_TIPO[nodo.config.tipo];
}

const vacio = (valor: string | undefined): boolean => !valor || valor.trim().length === 0;

/** Destinos declarados por las ramas del nodo, con una etiqueta legible de cada una. */
function destinosDeRamas(config: ConfigGrafo): Array<{ etiqueta: string; destino: string }> {
  switch (config.tipo) {
    case 'condicion':
      return [
        ...config.ramas.map((r, i) => ({ etiqueta: `rama ${i + 1}`, destino: r.nodoDestino })),
        { etiqueta: 'rama por defecto', destino: config.ramaPorDefecto },
      ];
    case 'intencion':
      return [
        ...config.etiquetas.map((e) => ({ etiqueta: `intención «${e.etiqueta || '…'}»`, destino: e.nodoDestino })),
        { etiqueta: 'rama por defecto', destino: config.ramaPorDefecto },
      ];
    case 'ia':
      return [
        ...config.salidas.map((s) => ({ etiqueta: `salida «${s.etiqueta || '…'}»`, destino: s.nodoDestino })),
        { etiqueta: 'si no resuelve', destino: config.ramaPorDefecto },
      ];
    default:
      return [];
  }
}

/** Qué le falta a la configuración del nodo para poder activarse. Vacío = completo. */
function faltantesDeContenido(config: ConfigGrafo): string[] {
  const faltan: string[] = [];
  switch (config.tipo) {
    case 'mensaje':
      if (vacio(config.texto) && vacio(config.templateId)) faltan.push('el texto del mensaje');
      break;
    case 'captura':
      if (vacio(config.pregunta)) faltan.push('la pregunta');
      if (vacio(config.campo)) faltan.push('el nombre del dato');
      if (vacio(config.descripcion)) faltan.push('qué se espera del cliente');
      if (config.destino?.tipo === 'atributo' && vacio(config.destino.key)) faltan.push('el campo personalizado donde guardar el dato');
      break;
    case 'condicion':
      if (config.ramas.length === 0) faltan.push('al menos una rama');
      if (config.ramas.some((r) => vacio(r.valor))) faltan.push('el valor de cada rama');
      break;
    case 'intencion':
      if (config.etiquetas.length === 0) faltan.push('al menos una intención');
      if (config.etiquetas.some((e) => vacio(e.etiqueta) || vacio(e.descripcion))) {
        faltan.push('el nombre y la descripción de cada intención');
      }
      break;
    case 'kb':
      if (vacio(config.pregunta)) faltan.push('la pregunta');
      if (vacio(config.siNoHayRespuesta)) faltan.push('el texto de respaldo');
      break;
    case 'accion':
      if (config.efecto.tipo === 'aplicar_etiquetas' && (config.efecto.tagIds ?? []).length === 0) {
        faltan.push('al menos una etiqueta');
      }
      if (config.efecto.tipo === 'asignar_asesor' && vacio(config.efecto.asesorId)) faltan.push('el asesor');
      if (config.efecto.tipo === 'cambiar_estado' && vacio(config.efecto.estado)) faltan.push('el estado');
      break;
    case 'ia':
      if (config.objetivo.trim().length < MIN_OBJETIVO_IA) {
        faltan.push(`el objetivo (mínimo ${MIN_OBJETIVO_IA} caracteres)`);
      }
      if (config.salidas.length === 0) faltan.push('al menos una salida');
      if (config.salidas.some((s) => vacio(s.etiqueta) || vacio(s.descripcion))) {
        faltan.push('el nombre y la descripción de cada salida');
      }
      break;
    case 'handoff':
    case 'espera':
      break;
  }
  return faltan;
}

/**
 * Devuelve los errores de conexión y de contenido del grafo, en el orden de los nodos. Lista vacía =
 * el flujo se puede activar. Un destino vacío NO cuenta como conexión entrante.
 */
export function analizarGrafo(
  nodos: readonly NodoGrafo[],
  aristas: readonly AristaGrafo[],
  entrada: string,
): ErrorGrafo[] {
  const errores: ErrorGrafo[] = [];
  const porId = new Map(nodos.map((n) => [n.id, n]));
  const conEntrada = new Set<string>();

  const titulo = (id: string): string => {
    const nodo = porId.get(id);
    return nodo ? `«${nombreDeNodo(nodo)}»` : `«${id}»`;
  };

  for (const a of aristas) {
    if (!porId.has(a.to)) {
      errores.push({
        nodoId: porId.has(a.from) ? a.from : a.to,
        codigo: 'DESTINO_INEXISTENTE',
        mensaje: `${titulo(a.from)} apunta a un nodo que ya no existe.`,
      });
    } else if (porId.has(a.from)) {
      conEntrada.add(a.to);
    }
  }

  for (const nodo of nodos) {
    for (const { etiqueta, destino } of destinosDeRamas(nodo.config)) {
      if (destino === '') {
        errores.push({
          nodoId: nodo.id,
          codigo: 'DESTINO_VACIO',
          mensaje: `${titulo(nodo.id)}: la ${etiqueta} no tiene destino.`,
        });
      } else if (!porId.has(destino)) {
        errores.push({
          nodoId: nodo.id,
          codigo: 'DESTINO_INEXISTENTE',
          mensaje: `${titulo(nodo.id)}: la ${etiqueta} apunta a un nodo que ya no existe.`,
        });
      } else {
        conEntrada.add(destino);
      }
    }
  }

  for (const nodo of nodos) {
    if (nodo.id !== entrada && !conEntrada.has(nodo.id)) {
      errores.push({
        nodoId: nodo.id,
        codigo: 'NODO_HUERFANO',
        mensaje: `${titulo(nodo.id)} no tiene conexión de entrada.`,
      });
    }
    const faltan = faltantesDeContenido(nodo.config);
    if (faltan.length > 0) {
      errores.push({
        nodoId: nodo.id,
        codigo: 'CONTENIDO_INCOMPLETO',
        mensaje: `${titulo(nodo.id)}: falta ${faltan.join(', ')}.`,
      });
    }
  }

  return errores;
}
