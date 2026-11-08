import { describe, it, expect } from 'vitest';
import { analizarGrafo, nombreDeNodo, type ConfigGrafo, type NodoGrafo } from '@sofiapp/shared';
import { configNodoEstricto } from './flow.validation.js';

const msg = (id: string, texto = 'Hola', nombre?: string): NodoGrafo => ({
  id,
  ...(nombre ? { nombre } : {}),
  config: { tipo: 'mensaje', texto },
});

const iaCompleta = (destino: string, extra: Partial<Extract<ConfigGrafo, { tipo: 'ia' }>> = {}): NodoGrafo => ({
  id: 'ia1',
  config: {
    tipo: 'ia',
    objetivo: 'Asesora al cliente con amabilidad.',
    salidas: [{ etiqueta: 'listo', descripcion: 'El cliente terminó.', nodoDestino: destino }],
    ramaPorDefecto: destino,
    ...extra,
  },
});

const codigos = (nodos: NodoGrafo[], aristas: Array<{ from: string; to: string }>, entrada: string): string[] =>
  analizarGrafo(nodos, aristas, entrada).map((e) => e.codigo);

describe('analizarGrafo — conexión', () => {
  it('un flujo sano no reporta nada', () => {
    expect(codigos([msg('a'), msg('b')], [{ from: 'a', to: 'b' }], 'a')).toEqual([]);
  });

  it('un nodo sin conexión de entrada (y que no es la entrada) es NODO_HUERFANO', () => {
    const errores = analizarGrafo([msg('a'), msg('suelto')], [], 'a');
    expect(errores).toEqual([expect.objectContaining({ nodoId: 'suelto', codigo: 'NODO_HUERFANO' })]);
  });

  it('el nodo de entrada nunca es huérfano', () => {
    expect(codigos([msg('a')], [], 'a')).toEqual([]);
  });

  it('un nodo alcanzable solo desde una salida de ia no es huérfano', () => {
    expect(codigos([iaCompleta('solo-ia'), msg('solo-ia')], [], 'ia1')).toEqual([]);
  });

  it('una rama sin destino es DESTINO_VACIO y NO cuenta como conexión entrante', () => {
    const nodos: NodoGrafo[] = [
      { id: 'c', config: { tipo: 'condicion', ramas: [{ valor: 'si', nodoDestino: '' }], ramaPorDefecto: 'b' } },
      msg('b'),
      msg('x'),
    ];
    const cods = codigos(nodos, [], 'c');
    expect(cods).toContain('DESTINO_VACIO');
    expect(cods).toContain('NODO_HUERFANO'); // 'x' nadie lo apunta
  });

  it('una rama que apunta a un nodo borrado es DESTINO_INEXISTENTE', () => {
    const nodos: NodoGrafo[] = [
      { id: 'c', config: { tipo: 'condicion', ramas: [{ valor: 'si', nodoDestino: 'borrado' }], ramaPorDefecto: 'b' } },
      msg('b'),
    ];
    expect(codigos(nodos, [], 'c')).toEqual(['DESTINO_INEXISTENTE']);
  });

  it('una arista hacia un nodo inexistente es DESTINO_INEXISTENTE sobre el nodo de origen', () => {
    const errores = analizarGrafo([msg('a')], [{ from: 'a', to: 'borrado' }], 'a');
    expect(errores).toEqual([expect.objectContaining({ nodoId: 'a', codigo: 'DESTINO_INEXISTENTE' })]);
  });

  it('el ramaPorDefecto vacío de intencion e ia también se reporta', () => {
    const nodos: NodoGrafo[] = [
      { id: 'i', config: { tipo: 'intencion', etiquetas: [{ etiqueta: 'x', descripcion: 'y', nodoDestino: 'b' }], ramaPorDefecto: '' } },
      msg('b'),
    ];
    expect(codigos(nodos, [], 'i')).toEqual(['DESTINO_VACIO']);
    expect(codigos([iaCompleta('b', { ramaPorDefecto: '' }), msg('b')], [], 'ia1')).toEqual(['DESTINO_VACIO']);
  });
});

describe('analizarGrafo — contenido incompleto', () => {
  const faltante = (config: ConfigGrafo): string | undefined => {
    const [error] = analizarGrafo([{ id: 'n', config }, msg('fin')], [{ from: 'n', to: 'fin' }], 'n').filter(
      (e) => e.codigo === 'CONTENIDO_INCOMPLETO',
    );
    return error?.mensaje;
  };

  it('explica QUÉ falta en cada tipo de nodo', () => {
    expect(faltante({ tipo: 'mensaje', texto: '  ' })).toContain('el texto del mensaje');
    expect(faltante({ tipo: 'captura', campo: '', descripcion: '', pregunta: '' })).toContain('la pregunta');
    expect(faltante({ tipo: 'condicion', ramas: [], ramaPorDefecto: 'fin' })).toContain('al menos una rama');
    expect(faltante({ tipo: 'intencion', etiquetas: [], ramaPorDefecto: 'fin' })).toContain('al menos una intención');
    expect(faltante({ tipo: 'kb', pregunta: 'ultimo_mensaje', siNoHayRespuesta: '' })).toContain('el texto de respaldo');
    expect(faltante({ tipo: 'accion', efecto: { tipo: 'aplicar_etiquetas', tagIds: [] } })).toContain('al menos una etiqueta');
    expect(faltante({ tipo: 'accion', efecto: { tipo: 'asignar_asesor', asesorId: '' } })).toContain('el asesor');
    expect(faltante({ tipo: 'ia', objetivo: 'corto', salidas: [], ramaPorDefecto: 'fin' })).toContain('mínimo 10 caracteres');
  });

  it('un mensaje con plantilla (sin texto) está completo', () => {
    expect(faltante({ tipo: 'mensaje', templateId: 'tpl_1' })).toBeUndefined();
  });

  it('handoff, espera y crear_lead no tienen contenido que completar', () => {
    expect(faltante({ tipo: 'handoff' })).toBeUndefined();
    expect(faltante({ tipo: 'espera', minutos: 2 })).toBeUndefined();
    expect(faltante({ tipo: 'accion', efecto: { tipo: 'crear_lead' } })).toBeUndefined();
  });
});

describe('analizarGrafo — nombres', () => {
  it('el mensaje usa el nombre del nodo si lo tiene, y el título del tipo si no', () => {
    const [conNombre] = analizarGrafo([msg('a'), msg('suelto', 'x', 'Saludo inicial')], [], 'a');
    expect(conNombre?.mensaje).toBe('«Saludo inicial» no tiene conexión de entrada.');
    const [sinNombre] = analizarGrafo([msg('a'), msg('suelto')], [], 'a');
    expect(sinNombre?.mensaje).toBe('«Mensaje» no tiene conexión de entrada.');
  });

  it('nombreDeNodo recorta espacios y cae al título del tipo', () => {
    expect(nombreDeNodo({ nombre: '  ', config: { tipo: 'ia', objetivo: '', salidas: [], ramaPorDefecto: '' } })).toBe(
      'Asistente IA',
    );
    expect(nombreDeNodo({ nombre: ' Cierre ', config: { tipo: 'handoff' } })).toBe('Cierre');
  });
});

/**
 * Criterio 25: hay UNA fuente de reglas. `analizarGrafo` (editor y servidor) y el esquema estricto de
 * Zod (red de seguridad al activar) deben dar el mismo veredicto sobre el contenido de un nodo; si
 * alguien cambia una regla en un lado y no en el otro, este test lo caza.
 */
describe('consistencia analizarGrafo ⇔ configNodoEstricto', () => {
  const casos: Array<[string, Record<string, unknown>]> = [
    ['mensaje con texto', { tipo: 'mensaje', texto: 'Hola' }],
    ['mensaje con plantilla', { tipo: 'mensaje', templateId: 'tpl_1' }],
    ['mensaje vacío', { tipo: 'mensaje', texto: '' }],
    ['captura completa', { tipo: 'captura', campo: 'grado', descripcion: 'Grado', tipoDato: 'texto', pregunta: '¿Grado?', reintentos: 1 }],
    ['captura sin pregunta', { tipo: 'captura', campo: 'grado', descripcion: 'Grado', tipoDato: 'texto', pregunta: '', reintentos: 1 }],
    ['captura sin campo', { tipo: 'captura', campo: '', descripcion: 'Grado', tipoDato: 'texto', pregunta: '¿?', reintentos: 1 }],
    ['captura a campo personalizado completa', { tipo: 'captura', campo: 'colegio', descripcion: 'Colegio', tipoDato: 'texto', pregunta: '¿Colegio?', reintentos: 1, destino: { tipo: 'atributo', key: 'colegio' } }],
    ['captura a campo personalizado sin elegir', { tipo: 'captura', campo: 'colegio', descripcion: 'Colegio', tipoDato: 'texto', pregunta: '¿Colegio?', reintentos: 1, destino: { tipo: 'atributo', key: '' } }],
    ['captura a campo fijo', { tipo: 'captura', campo: 'nombre', descripcion: 'Nombre', tipoDato: 'texto', pregunta: '¿Nombre?', reintentos: 1, destino: { tipo: 'contacto', campo: 'nombre' } }],
    ['condicion completa', { tipo: 'condicion', variable: 'ultimo_mensaje', ramas: [{ operador: 'contiene', valor: 'si', nodoDestino: 'fin' }], ramaPorDefecto: 'fin' }],
    ['condicion sin ramas', { tipo: 'condicion', variable: 'ultimo_mensaje', ramas: [], ramaPorDefecto: 'fin' }],
    ['condicion con rama sin valor', { tipo: 'condicion', variable: 'ultimo_mensaje', ramas: [{ operador: 'contiene', valor: '', nodoDestino: 'fin' }], ramaPorDefecto: 'fin' }],
    ['intencion completa', { tipo: 'intencion', etiquetas: [{ etiqueta: 'x', descripcion: 'y', nodoDestino: 'fin' }], ramaPorDefecto: 'fin' }],
    ['intencion sin etiquetas', { tipo: 'intencion', etiquetas: [], ramaPorDefecto: 'fin' }],
    ['intencion con etiqueta sin descripción', { tipo: 'intencion', etiquetas: [{ etiqueta: 'x', descripcion: '', nodoDestino: 'fin' }], ramaPorDefecto: 'fin' }],
    ['kb completa', { tipo: 'kb', pregunta: 'ultimo_mensaje', siNoHayRespuesta: 'No sé.' }],
    ['kb sin respaldo', { tipo: 'kb', pregunta: 'ultimo_mensaje', siNoHayRespuesta: '' }],
    ['accion crear_lead', { tipo: 'accion', efecto: { tipo: 'crear_lead' } }],
    ['accion etiquetas completa', { tipo: 'accion', efecto: { tipo: 'aplicar_etiquetas', tagIds: ['64b000000000000000000001'] } }],
    ['accion etiquetas vacía', { tipo: 'accion', efecto: { tipo: 'aplicar_etiquetas', tagIds: [] } }],
    ['accion asesor completa', { tipo: 'accion', efecto: { tipo: 'asignar_asesor', asesorId: '64b000000000000000000002' } }],
    ['accion asesor vacía', { tipo: 'accion', efecto: { tipo: 'asignar_asesor', asesorId: '' } }],
    ['accion estado', { tipo: 'accion', efecto: { tipo: 'cambiar_estado', estado: 'en_gestion' } }],
    ['handoff', { tipo: 'handoff' }],
    ['espera', { tipo: 'espera', minutos: 5 }],
    ['ia completa', { tipo: 'ia', objetivo: 'Asesora con amabilidad.', salidas: [{ etiqueta: 'listo', descripcion: 'Terminó', nodoDestino: 'fin' }], ramaPorDefecto: 'fin', maxTurnos: 3, usarKb: true }],
    ['ia objetivo de 9 caracteres', { tipo: 'ia', objetivo: '123456789', salidas: [{ etiqueta: 'listo', descripcion: 'Terminó', nodoDestino: 'fin' }], ramaPorDefecto: 'fin', maxTurnos: 3, usarKb: true }],
    ['ia objetivo de 10 caracteres', { tipo: 'ia', objetivo: '1234567890', salidas: [{ etiqueta: 'listo', descripcion: 'Terminó', nodoDestino: 'fin' }], ramaPorDefecto: 'fin', maxTurnos: 3, usarKb: true }],
    ['ia sin salidas', { tipo: 'ia', objetivo: 'Asesora con amabilidad.', salidas: [], ramaPorDefecto: 'fin', maxTurnos: 3, usarKb: true }],
    ['ia con salida sin descripción', { tipo: 'ia', objetivo: 'Asesora con amabilidad.', salidas: [{ etiqueta: 'listo', descripcion: '', nodoDestino: 'fin' }], ramaPorDefecto: 'fin', maxTurnos: 3, usarKb: true }],
    ['ia recién creada', { tipo: 'ia', objetivo: '', salidas: [], ramaPorDefecto: '', maxTurnos: 3, usarKb: true }],
  ];

  it.each(casos)('%s', (_titulo, config) => {
    const completoSegunGrafo =
      analizarGrafo([{ id: 'n', config: config as unknown as ConfigGrafo }, msg('fin')], [{ from: 'n', to: 'fin' }], 'n').filter(
        (e) => e.codigo === 'CONTENIDO_INCOMPLETO',
      ).length === 0;
    const completoSegunZod = configNodoEstricto.safeParse(config).success;
    expect(completoSegunGrafo).toBe(completoSegunZod);
  });
});
