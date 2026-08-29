import { describe, it, expect } from 'vitest';
import type { KbEstructura, KbFieldValue } from '../types/index.js';
import { migrarLegadoAEstructura, serializeEstructura, serializedLength } from './kb-serialize.js';
import { KB_SCHEMAS, type KbSchemaDef } from './kb-schemas.js';

/**
 * Schema de laboratorio con los 5 tipos de valor y un condicional, para ejercitar el contrato de
 * serialización sin depender de los schemas que traerán HU-KB-08..11.
 */
const SCHEMA: KbSchemaDef = {
  id: 'generico',
  version: 1,
  secciones: [
    {
      id: 'identidad',
      titulo: 'Identidad',
      campos: [
        { id: 'nombre', etiqueta: 'Nombre', kind: 'texto-corto', requisito: 'obligatorio' },
        { id: 'lema', etiqueta: 'Lema', kind: 'texto-medio', requisito: 'opcional' },
      ],
    },
    {
      id: 'operacion',
      titulo: 'Operación',
      campos: [
        { id: 'zonas', etiqueta: 'Zonas', kind: 'lista', requisito: 'opcional' },
        { id: 'horario', etiqueta: 'Horarios', kind: 'horario', requisito: 'opcional' },
        { id: 'planes', etiqueta: 'Planes', kind: 'repetible', requisito: 'opcional' },
      ],
    },
    {
      id: 'politicas',
      titulo: 'Políticas',
      campos: [
        { id: 'devoluciones', etiqueta: '¿Aceptan devoluciones?', kind: 'triestado', requisito: 'obligatorio' },
        {
          id: 'plazo',
          etiqueta: 'Plazo',
          kind: 'texto-corto',
          requisito: 'condicional',
          visibleSi: (campos) => {
            const v = campos.devoluciones;
            return v?.tipo === 'triestado' && v.valor === 'si';
          },
        },
      ],
    },
  ],
};

function estructura(
  campos: Record<string, KbFieldValue>,
  adicional = '',
): KbEstructura {
  return { schemaVersion: 1, schemaId: 'generico', campos, adicional };
}

describe('determinismo', () => {
  it('el mismo input produce el mismo output byte a byte', () => {
    const dato = estructura(
      {
        nombre: { tipo: 'texto', valor: 'Acme' },
        zonas: { tipo: 'lista', valores: ['Norte', 'Sur'] },
        devoluciones: { tipo: 'triestado', valor: 'no' },
      },
      'Notas',
    );

    expect(serializeEstructura(dato, SCHEMA)).toBe(serializeEstructura(dato, SCHEMA));
  });

  it('no depende del orden de las claves del objeto `campos`', () => {
    const enOrden = estructura({
      nombre: { tipo: 'texto', valor: 'Acme' },
      lema: { tipo: 'texto', valor: 'Siempre a tiempo' },
      devoluciones: { tipo: 'triestado', valor: 'no' },
    });
    const alReves = estructura({
      devoluciones: { tipo: 'triestado', valor: 'no' },
      lema: { tipo: 'texto', valor: 'Siempre a tiempo' },
      nombre: { tipo: 'texto', valor: 'Acme' },
    });

    expect(serializeEstructura(alReves, SCHEMA)).toBe(serializeEstructura(enOrden, SCHEMA));
  });

  it('sale en el orden del schema, no en el de escritura', () => {
    const texto = serializeEstructura(
      estructura({
        devoluciones: { tipo: 'triestado', valor: 'no' },
        nombre: { tipo: 'texto', valor: 'Acme' },
      }),
      SCHEMA,
    );

    expect(texto.indexOf('Nombre:')).toBeLessThan(texto.indexOf('¿Aceptan devoluciones?:'));
  });

  it('no mete fechas ni nada dependiente del reloj', () => {
    const dato = estructura({ nombre: { tipo: 'texto', valor: 'Acme' } });
    const primera = serializeEstructura(dato, SCHEMA);
    const anio = String(new Date().getFullYear());

    expect(primera).not.toContain(anio);
  });
});

describe('formato por tipo de valor', () => {
  it('texto: «Etiqueta: valor», recortado', () => {
    expect(serializeEstructura(estructura({ nombre: { tipo: 'texto', valor: '  Acme  ' } }), SCHEMA)).toBe(
      '## Identidad\nNombre: Acme',
    );
  });

  it('lista: encabezado y un guion por ítem, en el orden ingresado', () => {
    const texto = serializeEstructura(
      estructura({ zonas: { tipo: 'lista', valores: ['Sur', 'Norte', 'Centro'] } }),
      SCHEMA,
    );
    expect(texto).toBe('## Operación\nZonas:\n- Sur\n- Norte\n- Centro');
  });

  it('triestado: traduce el valor y añade el detalle cuando lo hay', () => {
    expect(
      serializeEstructura(estructura({ devoluciones: { tipo: 'triestado', valor: 'na' } }), SCHEMA),
    ).toContain('¿Aceptan devoluciones?: No aplica');

    expect(
      serializeEstructura(
        estructura({ devoluciones: { tipo: 'triestado', valor: 'si', detalle: 'dentro de 30 días' } }),
        SCHEMA,
      ),
    ).toContain('¿Aceptan devoluciones?: Sí — dentro de 30 días');
  });

  it('horario: un día por línea; «cerrado» es información y se conserva', () => {
    const texto = serializeEstructura(
      estructura({
        horario: {
          tipo: 'horario',
          dias: [
            { dia: 'lunes', cerrado: false, intervalos: [{ desde: '08:00', hasta: '12:00' }, { desde: '14:00', hasta: '18:00' }] },
            { dia: 'domingo', cerrado: true, intervalos: [] },
          ],
        },
      }),
      SCHEMA,
    );

    expect(texto).toBe('## Operación\nHorarios:\n- lunes: 08:00–12:00, 14:00–18:00\n- domingo: cerrado');
  });

  it('horario: un tramo con descripción la lleva entre paréntesis', () => {
    const texto = serializeEstructura(
      estructura({
        horario: {
          tipo: 'horario',
          dias: [
            {
              dia: 'lunes',
              cerrado: false,
              intervalos: [
                { desde: '08:00', hasta: '12:00', descripcion: 'Atención presencial' },
                { desde: '14:00', hasta: '18:00', descripcion: 'Solo recepción de pedidos' },
              ],
            },
          ],
        },
      }),
      SCHEMA,
    );

    // Paréntesis y no un guion `—`: el guion ya significa otra cosa en el tri-estado.
    expect(texto).toBe(
      '## Operación\nHorarios:\n- lunes: 08:00–12:00 (Atención presencial), 14:00–18:00 (Solo recepción de pedidos)',
    );
  });

  it('horario: una descripción vacía o en blanco serializa EXACTAMENTE igual que no tenerla', () => {
    // Es el candado del determinismo (HU-KB-12): los documentos guardados antes de que existiera
    // `descripcion` no pueden cambiar de texto, o abrirlos y guardarlos crearía una versión nueva
    // sin que nadie tocara nada.
    const dias = (descripcion?: string) => [
      {
        dia: 'lunes',
        cerrado: false,
        intervalos: [{ desde: '08:00', hasta: '12:00', ...(descripcion !== undefined ? { descripcion } : {}) }],
      },
    ];

    const sinCampo = serializeEstructura(
      estructura({ horario: { tipo: 'horario', dias: dias() } }),
      SCHEMA,
    );

    expect(serializeEstructura(estructura({ horario: { tipo: 'horario', dias: dias('') } }), SCHEMA)).toBe(sinCampo);
    expect(serializeEstructura(estructura({ horario: { tipo: 'horario', dias: dias('   ') } }), SCHEMA)).toBe(sinCampo);
    expect(sinCampo).toBe('## Operación\nHorarios:\n- lunes: 08:00–12:00');
  });

  it('horario: los tramos incompletos o invertidos se omiten', () => {
    const texto = serializeEstructura(
      estructura({
        horario: {
          tipo: 'horario',
          dias: [
            {
              dia: 'lunes',
              cerrado: false,
              intervalos: [
                { desde: '08:00', hasta: '' }, // a medio llenar
                { desde: '20:00', hasta: '19:00' }, // cierra antes de abrir
                { desde: '14:00', hasta: '18:00' },
              ],
            },
          ],
        },
      }),
      SCHEMA,
    );

    // Antes de HU-KB-12, el primero emitía `08:00–` y metía una línea rota en lo que lee la IA.
    expect(texto).toBe('## Operación\nHorarios:\n- lunes: 14:00–18:00');
  });

  it('horario: un día abierto cuyos tramos son todos inservibles se omite entero', () => {
    const texto = serializeEstructura(
      estructura({
        horario: {
          tipo: 'horario',
          dias: [
            { dia: 'lunes', cerrado: false, intervalos: [{ desde: '', hasta: '' }] },
            { dia: 'domingo', cerrado: true, intervalos: [] },
          ],
        },
      }),
      SCHEMA,
    );

    expect(texto).toBe('## Operación\nHorarios:\n- domingo: cerrado');
  });

  it('repetible: un ítem por línea con sus subcampos', () => {
    const texto = serializeEstructura(
      estructura({
        planes: { tipo: 'repetible', items: [{ nombre: 'Básico', precio: '$10' }, { nombre: 'Pro', precio: '' }] },
      }),
      SCHEMA,
    );

    expect(texto).toBe('## Operación\nPlanes:\n- nombre: Básico · precio: $10\n- nombre: Pro');
  });
});

describe('omisiones', () => {
  it('un campo vacío no deja etiqueta', () => {
    const texto = serializeEstructura(
      estructura({
        nombre: { tipo: 'texto', valor: 'Acme' },
        lema: { tipo: 'texto', valor: '   ' },
      }),
      SCHEMA,
    );

    expect(texto).toBe('## Identidad\nNombre: Acme');
    expect(texto).not.toContain('Lema');
  });

  it('una sección entera vacía no deja encabezado', () => {
    const texto = serializeEstructura(estructura({ nombre: { tipo: 'texto', valor: 'Acme' } }), SCHEMA);

    expect(texto).not.toContain('## Operación');
    expect(texto).not.toContain('## Políticas');
  });

  it('una lista con todos sus ítems en blanco no aparece', () => {
    expect(serializeEstructura(estructura({ zonas: { tipo: 'lista', valores: ['', '  '] } }), SCHEMA)).toBe('');
  });

  it('un horario sin días útiles no aparece', () => {
    expect(
      serializeEstructura(
        estructura({ horario: { tipo: 'horario', dias: [{ dia: 'lunes', cerrado: false, intervalos: [] }] } }),
        SCHEMA,
      ),
    ).toBe('');
  });

  it('una estructura completamente vacía serializa a cadena vacía', () => {
    expect(serializeEstructura(estructura({}), SCHEMA)).toBe('');
  });
});

describe('campos no visibles', () => {
  const conRespuestaDescartada = estructura({
    devoluciones: { tipo: 'triestado', valor: 'no' },
    plazo: { tipo: 'texto', valor: '30 días' }, // se llenó cuando la respuesta era «Sí»
  });

  it('no llegan al texto que lee la IA aunque conserven su valor', () => {
    const texto = serializeEstructura(conRespuestaDescartada, SCHEMA);

    expect(texto).toContain('¿Aceptan devoluciones?: No');
    expect(texto).not.toContain('30 días'); // contradiría a la respuesta vigente
  });

  it('el valor sigue en la estructura: reactivar la condición lo recupera', () => {
    expect(conRespuestaDescartada.campos.plazo).toEqual({ tipo: 'texto', valor: '30 días' });

    const reactivado = estructura({
      devoluciones: { tipo: 'triestado', valor: 'si' },
      plazo: { tipo: 'texto', valor: '30 días' },
    });
    expect(serializeEstructura(reactivado, SCHEMA)).toContain('Plazo: 30 días');
  });
});

describe('campos huérfanos', () => {
  it('un campo que el schema ya no declara se conserva al final, bajo «Otros datos»', () => {
    const texto = serializeEstructura(
      estructura({
        nombre: { tipo: 'texto', valor: 'Acme' },
        campo_viejo: { tipo: 'texto', valor: 'dato de una versión anterior' },
      }),
      SCHEMA,
    );

    expect(texto).toBe(
      '## Identidad\nNombre: Acme\n\n## Otros datos\ncampo_viejo: dato de una versión anterior',
    );
  });

  it('varios huérfanos salen ordenados por id, de forma reproducible', () => {
    const texto = serializeEstructura(
      estructura({
        zzz: { tipo: 'texto', valor: 'último' },
        aaa: { tipo: 'texto', valor: 'primero' },
      }),
      SCHEMA,
    );

    expect(texto).toBe('## Otros datos\naaa: primero\nzzz: último');
  });

  it('sin schema se serializa todo por esa vía: nunca se pierde conocimiento', () => {
    const texto = serializeEstructura(
      estructura({ nombre: { tipo: 'texto', valor: 'Acme' } }, 'Notas'),
    );

    expect(texto).toBe('## Otros datos\nnombre: Acme\n\n## Información adicional\nNotas');
  });
});

describe('«Información adicional»', () => {
  it('va siempre al final, después de todo lo demás', () => {
    const texto = serializeEstructura(
      estructura({ nombre: { tipo: 'texto', valor: 'Acme' } }, 'Cerramos en Semana Santa'),
      SCHEMA,
    );

    expect(texto).toBe(
      '## Identidad\nNombre: Acme\n\n## Información adicional\nCerramos en Semana Santa',
    );
  });

  it('vacío o solo espacios no deja encabezado', () => {
    const texto = serializeEstructura(estructura({ nombre: { tipo: 'texto', valor: 'Acme' } }, '   '), SCHEMA);

    expect(texto).not.toContain('Información adicional');
  });

  it('puede ser lo único que contenga el documento (el caso del schema generico)', () => {
    const texto = serializeEstructura(estructura({}, 'Todo mi conocimiento suelto'), KB_SCHEMAS.generico);

    expect(texto).toBe('## Información adicional\nTodo mi conocimiento suelto');
  });
});

describe('serializedLength', () => {
  it('coincide con la longitud del texto serializado', () => {
    const dato = estructura({ nombre: { tipo: 'texto', valor: 'Acme' } }, 'Notas');

    expect(serializedLength(dato, SCHEMA)).toBe(serializeEstructura(dato, SCHEMA).length);
  });

  it('una estructura vacía mide 0', () => {
    expect(serializedLength(estructura({}), SCHEMA)).toBe(0);
  });
});

describe('migrarLegadoAEstructura', () => {
  it('vuelca el texto libre íntegro en «Información adicional», sin trocear', () => {
    const contenido = 'Somos Acme.\n\nAtendemos de 8 a 6.\nEnvíos a todo el país.';
    const migrada = migrarLegadoAEstructura(contenido, 'generico');

    expect(migrada.adicional).toBe(contenido);
    expect(migrada.campos).toEqual({});
    expect(migrada.schemaId).toBe('generico');
    expect(migrada.schemaVersion).toBe(KB_SCHEMAS.generico.version);
  });

  it('el texto sobrevive a un viaje de ida y vuelta por el serializer', () => {
    const contenido = 'Conocimiento que no se puede perder';
    const texto = serializeEstructura(migrarLegadoAEstructura(contenido, 'generico'), KB_SCHEMAS.generico);

    expect(texto).toContain(contenido);
  });
});
