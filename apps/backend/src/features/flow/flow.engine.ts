import type {
  ConfigNodo,
  Efecto,
  EntradaMotor,
  IArista,
  INodo,
  IRamaCondicion,
  SalidaMotor,
} from './flow.types.js';

/** Tope de saltos sin espera en una sola invocación. Corta un flujo mal diseñado con un ciclo en
 *  vez de colgar el worker — es la única defensa del motor contra un grafo que se muerde la cola. */
const TOPE_SALTOS = 25;

function normalizar(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function encontrarNodo(nodos: INodo[], id: string): INodo | undefined {
  return nodos.find((n) => n.id === id);
}

/** Único destino saliente de un nodo lineal (`mensaje`, `captura`, `accion`, `kb` ya resuelto). Los
 *  nodos que ramifican (`condicion`, `intencion`) resuelven su destino desde su propio `config`, no
 *  desde aquí. */
function siguienteLineal(aristas: IArista[], nodoId: string): string | null {
  return aristas.find((a) => a.from === nodoId)?.to ?? null;
}

function evaluarRama(mensaje: string, rama: IRamaCondicion, indice: number): boolean {
  switch (rama.operador) {
    case 'igual_a':
      return normalizar(mensaje) === normalizar(rama.valor);
    case 'contiene':
      return normalizar(mensaje).includes(normalizar(rama.valor));
    case 'opcion_elegida': {
      const texto = mensaje.trim();
      if (texto === String(indice + 1)) return true;
      return normalizar(texto) === normalizar(rama.valor);
    }
  }
}

/** Ejecuta un solo nodo y produce su efecto/transición. `null` en `siguiente` con `pendiente: true`
 *  significa "el motor pide algo al runtime y hay que volver a entrar aquí". */
interface ResultadoNodo {
  efectos: Efecto[];
  siguiente: string | null;
  variables: Record<string, unknown>;
  esperandoRespuesta: boolean;
  requiere?: SalidaMotor['requiere'];
}

function ejecutarNodo(
  nodo: INodo,
  config: ConfigNodo,
  entrada: EntradaMotor,
  variables: Record<string, unknown>,
  aristas: IArista[],
): ResultadoNodo {
  switch (config.tipo) {
    case 'mensaje':
      return {
        efectos: [
          {
            tipo: 'enviar_mensaje',
            texto: config.texto,
            templateId: config.templateId,
            parametros: config.parametros,
          },
        ],
        siguiente: siguienteLineal(aristas, nodo.id),
        variables,
        esperandoRespuesta: false,
      };

    case 'captura': {
      if (entrada.resueltos?.capturado !== undefined) {
        return {
          efectos: [],
          siguiente: siguienteLineal(aristas, nodo.id),
          variables: { ...variables, [config.campo]: entrada.resueltos.capturado },
          esperandoRespuesta: false,
        };
      }
      // Primer paso al nodo: hace la pregunta y se queda esperando la respuesta del cliente.
      if (entrada.state?.nodoActualId !== nodo.id) {
        return {
          efectos: [{ tipo: 'enviar_mensaje', texto: config.pregunta }],
          siguiente: nodo.id,
          variables,
          esperandoRespuesta: true,
        };
      }
      // Ya esperábamos aquí y llegó la respuesta: se la pide extraída al runtime.
      return {
        efectos: [],
        siguiente: nodo.id,
        variables,
        esperandoRespuesta: true,
        requiere: {
          tipo: 'captura',
          spec: {
            campo: config.campo,
            descripcion: config.descripcion,
            tipo: config.tipoDato,
            requerido: true,
          },
        },
      };
    }

    case 'condicion': {
      const valorCliente =
        config.variable === 'ultimo_mensaje'
          ? entrada.mensaje
          : String(variables[config.variable.slice(4)] ?? '');
      const match = config.ramas.find((rama, i) => evaluarRama(valorCliente, rama, i));
      const destino = match?.nodoDestino ?? config.ramaPorDefecto;
      return { efectos: [], siguiente: destino, variables, esperandoRespuesta: false };
    }

    case 'intencion': {
      if (entrada.resueltos?.intencion !== undefined) {
        const etiqueta = config.etiquetas.find((e) => e.etiqueta === entrada.resueltos?.intencion);
        const destino = etiqueta?.nodoDestino ?? config.ramaPorDefecto;
        return { efectos: [], siguiente: destino, variables, esperandoRespuesta: false };
      }
      return {
        efectos: [],
        siguiente: nodo.id,
        variables,
        esperandoRespuesta: false,
        requiere: { tipo: 'intencion', etiquetas: config.etiquetas.map((e) => e.etiqueta) },
      };
    }

    case 'kb': {
      if (entrada.resueltos?.respuestaKb !== undefined) {
        const texto = entrada.resueltos.respuestaKb || config.siNoHayRespuesta;
        return {
          efectos: [{ tipo: 'enviar_mensaje', texto }],
          siguiente: siguienteLineal(aristas, nodo.id),
          variables,
          esperandoRespuesta: false,
        };
      }
      const pregunta = config.pregunta === 'ultimo_mensaje' ? entrada.mensaje : config.pregunta;
      return {
        efectos: [],
        siguiente: nodo.id,
        variables,
        esperandoRespuesta: false,
        requiere: { tipo: 'kb', pregunta, kSobrescrito: config.kSobrescrito },
      };
    }

    case 'accion':
      return {
        efectos: [config.efecto],
        siguiente: siguienteLineal(aristas, nodo.id),
        variables,
        esperandoRespuesta: false,
      };

    case 'handoff':
      return {
        efectos: [{ tipo: 'handoff', motivo: config.motivo, notificarAsesorId: config.notificarAsesorId }],
        siguiente: null,
        variables,
        esperandoRespuesta: false,
      };

    case 'espera': {
      const destino = siguienteLineal(aristas, nodo.id);

      // 1. El job diferido despertó tras el plazo: seguimos adelante.
      if (entrada.resueltos?.esperaCumplida) {
        return { efectos: [], siguiente: destino, variables, esperandoRespuesta: false };
      }

      // 2. El cliente respondió mientras el flujo esperaba aquí: su respuesta manda y NO se
      //    encola una segunda espera. El token se regenera al persistir (flow.runtime.service.ts),
      //    lo que anula el job diferido pendiente sin tener que cancelarlo en BullMQ.
      if (entrada.state?.nodoActualId === nodo.id) {
        return { efectos: [], siguiente: destino, variables, esperandoRespuesta: false };
      }

      // 3. Primera llegada al nodo: pide la espera al runtime y se queda aquí.
      return {
        efectos: [{ tipo: 'programar_espera', minutos: config.minutos }],
        siguiente: nodo.id,
        variables,
        esperandoRespuesta: true,
      };
    }
  }
}

/**
 * Motor de ejecución del flujo. Función PURA: nunca toca Mongo, Redis ni la Graph API — recibe
 * datos, devuelve datos. Cuando necesita una operación asíncrona (clasificar intención, consultar
 * la KB, extraer una captura) la describe en `requiere` y cede el control; el runtime la resuelve y
 * vuelve a llamar con `resueltos` relleno.
 */
export function avanzar(entrada: EntradaMotor): SalidaMotor {
  const { flow } = entrada;
  let nodoActualId = entrada.state?.nodoActualId ?? flow.entrada;
  let variables = { ...(entrada.state?.variables ?? {}) };
  const efectos: Efecto[] = [];

  for (let saltos = 0; saltos < TOPE_SALTOS; saltos += 1) {
    const nodo = encontrarNodo(flow.nodos, nodoActualId);
    if (!nodo) {
      return {
        nodoSiguiente: null,
        efectos: [...efectos, { tipo: 'error', mensaje: `Nodo inexistente: ${nodoActualId}` }],
        variables,
        esperandoRespuesta: false,
      };
    }

    const resultado = ejecutarNodo(nodo, nodo.config, entrada, variables, flow.aristas);
    efectos.push(...resultado.efectos);
    variables = resultado.variables;

    if (resultado.requiere) {
      return {
        nodoSiguiente: resultado.siguiente,
        efectos,
        variables,
        esperandoRespuesta: resultado.esperandoRespuesta,
        requiere: resultado.requiere,
      };
    }

    if (resultado.esperandoRespuesta || resultado.siguiente === null) {
      return {
        nodoSiguiente: resultado.siguiente,
        efectos,
        variables,
        esperandoRespuesta: resultado.esperandoRespuesta,
      };
    }

    nodoActualId = resultado.siguiente;
  }

  return {
    nodoSiguiente: null,
    efectos: [...efectos, { tipo: 'error', mensaje: 'Flujo detenido: posible ciclo (tope de saltos).' }],
    variables,
    esperandoRespuesta: false,
  };
}
