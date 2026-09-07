import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { avanzar } from './flow.engine.js';
import type { IArista, IFlow, IFlowState, INodo, IRamaCondicion } from './flow.types.js';

const tenantId = new Types.ObjectId();

function flow(nodos: INodo[], aristas: IArista[], entrada: string): IFlow {
  return {
    tenantId,
    nombre: 'Test',
    nodos,
    aristas,
    entrada,
    version: 1,
    estado: 'publicado',
    activo: true,
  };
}

function estado(nodoActualId: string, variables: Record<string, unknown> = {}): IFlowState {
  return {
    tenantId,
    clienteId: new Types.ObjectId(),
    flowId: new Types.ObjectId(),
    nodoActualId,
    variables,
    esperandoRespuesta: false,
    actualizadoAt: new Date(),
  };
}

describe('flow.engine — Definition of Done de HU-FLOW-01', () => {
  it('un flujo con dos ramas: dos respuestas distintas del cliente terminan en nodos distintos', () => {
    const f = flow(
      [
        {
          id: 'n1',
          posicion: { x: 0, y: 0 },
          tipo: 'condicion',
          config: {
            tipo: 'condicion',
            variable: 'ultimo_mensaje',
            ramas: [{ operador: 'igual_a', valor: 'si', nodoDestino: 'n2' }],
            ramaPorDefecto: 'n3',
          },
        },
        { id: 'n2', posicion: { x: 0, y: 0 }, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'Rama SI' } },
        { id: 'n3', posicion: { x: 0, y: 0 }, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'Rama NO' } },
      ],
      [],
      'n1',
    );

    const salidaSi = avanzar({ flow: f, state: null, mensaje: 'Sí' });
    const salidaNo = avanzar({ flow: f, state: null, mensaje: 'No' });

    expect(salidaSi.efectos[0]).toMatchObject({ tipo: 'enviar_mensaje', texto: 'Rama SI' });
    expect(salidaNo.efectos[0]).toMatchObject({ tipo: 'enviar_mensaje', texto: 'Rama NO' });
    expect(salidaSi.efectos[0]).not.toEqual(salidaNo.efectos[0]);
  });
});

describe('flow.engine — operadores de condición', () => {
  // Cada destino es un nodo `mensaje` terminal (sin arista saliente) con texto propio: así se
  // verifica la rama tomada por el EFECTO que produce, igual que el test del DoD.
  const nodoCondicion = (ramas: IRamaCondicion[]): INodo => ({
    id: 'n1',
    posicion: { x: 0, y: 0 },
    tipo: 'condicion',
    config: { tipo: 'condicion', variable: 'ultimo_mensaje', ramas, ramaPorDefecto: 'default' },
  });

  const destino = (id: string): INodo => ({
    id,
    posicion: { x: 0, y: 0 },
    tipo: 'mensaje',
    config: { tipo: 'mensaje', texto: id },
  });

  function textoResultante(f: IFlow, mensaje: string): string | undefined {
    const salida = avanzar({ flow: f, state: null, mensaje });
    return (salida.efectos[0] as { texto?: string } | undefined)?.texto;
  }

  it('igual_a casa ignorando mayúsculas y tildes', () => {
    const f = flow(
      [nodoCondicion([{ operador: 'igual_a', valor: 'sí', nodoDestino: 'match' }]), destino('match')],
      [],
      'n1',
    );
    expect(textoResultante(f, 'SI')).toBe('match');
  });

  it('contiene casa con una subcadena', () => {
    const f = flow(
      [nodoCondicion([{ operador: 'contiene', valor: 'precio', nodoDestino: 'match' }]), destino('match')],
      [],
      'n1',
    );
    expect(textoResultante(f, '¿Cuál es el precio del plan?')).toBe('match');
  });

  it('opcion_elegida casa por índice ("2") o por el texto de la opción', () => {
    const f = flow(
      [
        nodoCondicion([
          { operador: 'opcion_elegida', valor: 'Plan básico', nodoDestino: 'basico' },
          { operador: 'opcion_elegida', valor: 'Plan pro', nodoDestino: 'pro' },
        ]),
        destino('basico'),
        destino('pro'),
      ],
      [],
      'n1',
    );
    expect(textoResultante(f, '2')).toBe('pro');
    expect(textoResultante(f, 'Plan básico')).toBe('basico');
  });

  it('respuesta que no casa con nada cae en la rama por defecto sin lanzar', () => {
    const f = flow(
      [nodoCondicion([{ operador: 'igual_a', valor: 'si', nodoDestino: 'match' }]), destino('default')],
      [],
      'n1',
    );
    expect(() => avanzar({ flow: f, state: null, mensaje: 'algo totalmente distinto' })).not.toThrow();
    expect(textoResultante(f, 'algo totalmente distinto')).toBe('default');
  });
});

describe('flow.engine — encadenado y ciclos', () => {
  it('mensaje → condicion → mensaje se resuelve en una sola invocación', () => {
    const f = flow(
      [
        { id: 'saludo', posicion: { x: 0, y: 0 }, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'Hola' } },
        {
          id: 'cond',
          posicion: { x: 0, y: 0 },
          tipo: 'condicion',
          config: {
            tipo: 'condicion',
            variable: 'ultimo_mensaje',
            ramas: [{ operador: 'igual_a', valor: 'si', nodoDestino: 'fin' }],
            ramaPorDefecto: 'fin',
          },
        },
        { id: 'fin', posicion: { x: 0, y: 0 }, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'Gracias' } },
      ],
      [{ id: 'a1', from: 'saludo', to: 'cond' }],
      'saludo',
    );

    const salida = avanzar({ flow: f, state: null, mensaje: 'si' });
    expect(salida.efectos.map((e) => (e as { texto?: string }).texto)).toEqual(['Hola', 'Gracias']);
    expect(salida.nodoSiguiente).toBeNull();
  });

  it('un flujo con ciclo corta en el tope de saltos y devuelve un efecto de error', () => {
    const f = flow(
      [
        { id: 'a', posicion: { x: 0, y: 0 }, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'a' } },
        { id: 'b', posicion: { x: 0, y: 0 }, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'b' } },
      ],
      [
        { id: 'a1', from: 'a', to: 'b' },
        { id: 'a2', from: 'b', to: 'a' },
      ],
      'a',
    );

    const salida = avanzar({ flow: f, state: null, mensaje: 'hola' });
    expect(salida.efectos.some((e) => e.tipo === 'error')).toBe(true);
    expect(salida.nodoSiguiente).toBeNull();
  });
});

describe('flow.engine — nodo kb', () => {
  const flowKb = flow(
    [
      {
        id: 'kb1',
        posicion: { x: 0, y: 0 },
        tipo: 'kb',
        config: { tipo: 'kb', pregunta: 'ultimo_mensaje', siNoHayRespuesta: 'No tengo esa información.' },
      },
    ],
    [],
    'kb1',
  );

  it('pide la resolución a la KB y no produce texto por sí mismo', () => {
    const salida = avanzar({ flow: flowKb, state: null, mensaje: '¿Tienen envíos a Cali?' });
    expect(salida.requiere).toEqual({
      tipo: 'kb',
      pregunta: '¿Tienen envíos a Cali?',
      kSobrescrito: undefined,
    });
    expect(salida.efectos).toHaveLength(0);
  });

  it('usa siNoHayRespuesta cuando resueltos.respuestaKb viene vacío', () => {
    const salida = avanzar({
      flow: flowKb,
      state: estado('kb1'),
      mensaje: '¿Tienen envíos a Cali?',
      resueltos: { respuestaKb: '' },
    });
    expect(salida.efectos[0]).toMatchObject({ tipo: 'enviar_mensaje', texto: 'No tengo esa información.' });
  });
});

describe('flow.engine — nodo espera (HU-FLOW-02)', () => {
  const flowEspera = flow(
    [
      { id: 'esp1', posicion: { x: 0, y: 0 }, tipo: 'espera', config: { tipo: 'espera', minutos: 30 } },
      { id: 'fin', posicion: { x: 0, y: 0 }, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'Ya volviste' } },
    ],
    [{ id: 'a1', from: 'esp1', to: 'fin' }],
    'esp1',
  );

  it('primera llegada: pide programar_espera y se queda en el mismo nodo esperando', () => {
    const salida = avanzar({ flow: flowEspera, state: null, mensaje: 'hola' });

    expect(salida.efectos).toEqual([{ tipo: 'programar_espera', minutos: 30 }]);
    expect(salida.nodoSiguiente).toBe('esp1');
    expect(salida.esperandoRespuesta).toBe(true);
  });

  it('el job diferido despierta (resueltos.esperaCumplida): avanza al destino sin reprogramar', () => {
    const salida = avanzar({
      flow: flowEspera,
      state: estado('esp1'),
      mensaje: '',
      resueltos: { esperaCumplida: true },
    });

    expect(salida.efectos).toHaveLength(1);
    expect(salida.efectos[0]).toMatchObject({ tipo: 'enviar_mensaje', texto: 'Ya volviste' });
    expect(salida.nodoSiguiente).toBeNull();
  });

  it('el cliente responde mientras espera: su respuesta manda y NO encola una segunda espera', () => {
    const salida = avanzar({ flow: flowEspera, state: estado('esp1'), mensaje: 'ya volví' });

    expect(salida.efectos.some((e) => e.tipo === 'programar_espera')).toBe(false);
    expect(salida.efectos[0]).toMatchObject({ tipo: 'enviar_mensaje', texto: 'Ya volviste' });
    expect(salida.nodoSiguiente).toBeNull();
  });
});

describe('flow.engine — nodo ia (HU-FLOW-03)', () => {
  const flowIa = flow(
    [
      {
        id: 'ia1',
        posicion: { x: 0, y: 0 },
        tipo: 'ia',
        config: {
          tipo: 'ia',
          objetivo: 'Averiguar si el cliente quiere comprar o solo está curioseando.',
          salidas: [
            { etiqueta: 'quiere_comprar', descripcion: 'El cliente confirma intención de compra', nodoDestino: 'compra' },
            { etiqueta: 'solo_curiosea', descripcion: 'El cliente no tiene intención de compra', nodoDestino: 'curiosea' },
          ],
          ramaPorDefecto: 'default',
          maxTurnos: 3,
          usarKb: false,
        },
      },
      { id: 'compra', posicion: { x: 0, y: 0 }, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'Vamos a comprar' } },
      { id: 'curiosea', posicion: { x: 0, y: 0 }, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'Gracias por curiosear' } },
      { id: 'default', posicion: { x: 0, y: 0 }, tipo: 'mensaje', config: { tipo: 'mensaje', texto: 'Se acabaron los turnos' } },
    ],
    [],
    'ia1',
  );

  it('sin resueltos.ia: pide requiere de tipo ia y no emite efectos', () => {
    const salida = avanzar({ flow: flowIa, state: null, mensaje: 'hola' });
    expect(salida.requiere).toEqual({
      tipo: 'ia',
      objetivo: 'Averiguar si el cliente quiere comprar o solo está curioseando.',
      salidas: [
        { etiqueta: 'quiere_comprar', descripcion: 'El cliente confirma intención de compra', nodoDestino: 'compra' },
        { etiqueta: 'solo_curiosea', descripcion: 'El cliente no tiene intención de compra', nodoDestino: 'curiosea' },
      ],
      usarKb: false,
    });
    expect(salida.efectos).toHaveLength(0);
  });

  it('salida que coincide con una etiqueta: avanza al nodoDestino y NO envía la respuesta de ese turno (criterio 2)', () => {
    // `compra` es un nodo `mensaje` terminal (sin arista saliente): el motor puro encadena hacia
    // él dentro de la MISMA invocación y `nodoSiguiente` termina en `null` — el efecto es la
    // prueba de que salió por esa rama, no `nodoSiguiente` (que solo importaría si `compra`
    // tuviera más pasos después).
    const salida = avanzar({
      flow: flowIa,
      state: estado('ia1'),
      mensaje: 'sí, quiero comprar',
      resueltos: { ia: { respuesta: 'Perfecto, vamos con la compra', salida: 'quiere_comprar' } },
    });
    expect(salida.efectos.map((e) => (e as { texto?: string }).texto)).toEqual(['Vamos a comprar']);
  });

  it('salida que no coincide con ninguna etiqueta: avanza por ramaPorDefecto', () => {
    const salida = avanzar({
      flow: flowIa,
      state: estado('ia1'),
      mensaje: 'algo raro',
      resueltos: { ia: { respuesta: 'No entendí', salida: 'etiqueta_inexistente' } },
    });
    expect(salida.efectos.map((e) => (e as { texto?: string }).texto)).toEqual(['Se acabaron los turnos']);
  });

  it('salida: null → envía la respuesta, se queda en el nodo y esperandoRespuesta: true (criterio 3)', () => {
    const salida = avanzar({
      flow: flowIa,
      state: estado('ia1'),
      mensaje: 'cuéntame más',
      resueltos: { ia: { respuesta: '¿Qué presupuesto manejas?', salida: null } },
    });
    expect(salida.efectos).toEqual([{ tipo: 'enviar_mensaje', texto: '¿Qué presupuesto manejas?' }]);
    expect(salida.nodoSiguiente).toBe('ia1');
    expect(salida.esperandoRespuesta).toBe(true);
    expect(salida.variables['_ia:ia1:turnos']).toBe(1);
  });

  it('el contador sube un turno por respuesta y desaparece de variables al salir por cualquier rama', () => {
    const conUnTurno = estado('ia1', { '_ia:ia1:turnos': 1 });
    const sigueConversando = avanzar({
      flow: flowIa,
      state: conUnTurno,
      mensaje: 'mmm',
      resueltos: { ia: { respuesta: '¿Y tu presupuesto?', salida: null } },
    });
    expect(sigueConversando.variables['_ia:ia1:turnos']).toBe(2);

    const sale = avanzar({
      flow: flowIa,
      state: conUnTurno,
      mensaje: 'ok compro',
      resueltos: { ia: { respuesta: '', salida: 'quiere_comprar' } },
    });
    expect(sale.variables['_ia:ia1:turnos']).toBeUndefined();
  });

  it('alcanzado maxTurnos: sale por ramaPorDefecto y NO devuelve requiere (criterio 4)', () => {
    const conTope = estado('ia1', { '_ia:ia1:turnos': 3 });
    const salida = avanzar({ flow: flowIa, state: conTope, mensaje: 'otra vez' });
    expect(salida.efectos.map((e) => (e as { texto?: string }).texto)).toEqual(['Se acabaron los turnos']);
    expect(salida.requiere).toBeUndefined();
  });

  it('un resueltos.ia que llega justo con el contador en el tope se atiende igual (no se descarta una respuesta ya generada)', () => {
    const conTope = estado('ia1', { '_ia:ia1:turnos': 3 });
    const salida = avanzar({
      flow: flowIa,
      state: conTope,
      mensaje: 'listo compro',
      resueltos: { ia: { respuesta: 'Genial', salida: 'quiere_comprar' } },
    });
    expect(salida.efectos.map((e) => (e as { texto?: string }).texto)).toEqual(['Vamos a comprar']);
  });
});
