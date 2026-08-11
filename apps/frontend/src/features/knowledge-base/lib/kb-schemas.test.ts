import { describe, it, expect } from 'vitest';
import type { IKbDocument, KbEstructura, KbFieldValue } from '../types/index.js';
import {
  KB_SCHEMAS,
  LIMITE_POR_KIND,
  MAX_ITEMS_DEFAULT,
  camposFaltantes,
  emptyEstructura,
  esVisible,
  limiteDeCampo,
  maxItemsDeCampo,
  modoEditor,
  schemaDeDocumento,
  schemaParaTitulo,
  todosLosCampos,
  valorInicial,
  valorVacio,
  type KbFieldDef,
  type KbSchemaDef,
} from './kb-schemas.js';

/** Schema de laboratorio: ejercita el contrato sin depender de los que traerán HU-KB-08..11. */
const SCHEMA_PRUEBA: KbSchemaDef = {
  id: 'generico',
  version: 3,
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
      id: 'envios',
      titulo: 'Envíos',
      campos: [
        { id: 'hace_envios', etiqueta: '¿Hacen envíos?', kind: 'triestado', requisito: 'obligatorio' },
        {
          id: 'zonas',
          etiqueta: 'Zonas de cobertura',
          kind: 'lista',
          requisito: 'condicional',
          visibleSi: (campos) => {
            const v = campos.hace_envios;
            return v?.tipo === 'triestado' && v.valor === 'si';
          },
        },
      ],
    },
  ],
};

function estructuraCon(campos: Record<string, KbFieldValue>): KbEstructura {
  return { schemaVersion: 3, schemaId: 'generico', campos, adicional: '' };
}

const campoPorId = (id: string): KbFieldDef => {
  const campo = todosLosCampos(SCHEMA_PRUEBA).find((c) => c.id === id);
  if (!campo) throw new Error(`Campo ${id} no existe en el schema de prueba`);
  return campo;
};

describe('el tipo acopla requisito y visibleSi', () => {
  it('un condicional SIN visibleSi no compila', () => {
    // @ts-expect-error `condicional` exige `visibleSi`: sin él sería un obligatorio permanente
    // disfrazado, y el despiste no se notaría hasta toparse con un Guardar bloqueado.
    const invalido: KbFieldDef = { id: 'x', etiqueta: 'X', kind: 'texto-corto', requisito: 'condicional' };
    expect(invalido.requisito).toBe('condicional');
  });

  it('obligatorio y opcional aceptan visibleSi, pero no lo exigen', () => {
    const sinPredicado: KbFieldDef = { id: 'a', etiqueta: 'A', kind: 'texto-corto', requisito: 'obligatorio' };
    const conPredicado: KbFieldDef = {
      id: 'b',
      etiqueta: 'B',
      kind: 'texto-corto',
      requisito: 'opcional',
      visibleSi: () => false,
    };
    expect(esVisible(sinPredicado, {})).toBe(true);
    expect(esVisible(conPredicado, {})).toBe(false);
  });

  it('un obligatorio oculto no bloquea: es sinónimo de condicional', () => {
    const schema: KbSchemaDef = {
      id: 'generico',
      version: 1,
      secciones: [
        {
          id: 's',
          titulo: 'S',
          campos: [
            { id: 'oculto', etiqueta: 'Oculto', kind: 'texto-corto', requisito: 'obligatorio', visibleSi: () => false },
          ],
        },
      ],
    };
    expect(camposFaltantes(schema, estructuraCon({}))).toHaveLength(0);
  });
});

describe('schemaParaTitulo', () => {
  it('resuelve «Información Complementaria» al schema generico', () => {
    expect(schemaParaTitulo('Información Complementaria')).toBe(KB_SCHEMAS.generico);
  });

  it('normaliza el título: distinta capitalización y espacios resuelven igual', () => {
    expect(schemaParaTitulo('  información complementaria  ')).toBe(KB_SCHEMAS.generico);
  });

  it('resuelve «Información de la empresa» al schema empresa (HU-KB-08)', () => {
    expect(schemaParaTitulo('Información de la empresa')).toBe(KB_SCHEMAS.empresa);
    expect(schemaParaTitulo('  INFORMACIÓN DE LA EMPRESA  ')).toBe(KB_SCHEMAS.empresa);
  });

  it('resuelve «Productos y servicios» al schema productos (HU-KB-09)', () => {
    expect(schemaParaTitulo('Productos y servicios')).toBe(KB_SCHEMAS.productos);
    expect(schemaParaTitulo('  productos y servicios  ')).toBe(KB_SCHEMAS.productos);
  });

  it('resuelve «Horarios y ubicación» al schema horarios (HU-KB-10)', () => {
    expect(schemaParaTitulo('Horarios y ubicación')).toBe(KB_SCHEMAS.horarios);
    expect(schemaParaTitulo('  HORARIOS Y UBICACIÓN  ')).toBe(KB_SCHEMAS.horarios);
  });

  it('«Políticas y términos» es la única categoría sin schema (llega en HU-KB-11)', () => {
    expect(schemaParaTitulo('Políticas y términos')).toBeUndefined();
  });

  it('un título libre cualquiera no tiene schema', () => {
    expect(schemaParaTitulo('Convenios con empresas')).toBeUndefined();
  });
});

describe('modoEditor y schemaDeDocumento', () => {
  const doc = (over: Partial<IKbDocument> & { titulo: string }): IKbDocument => ({
    id: 'id-1',
    contenido: '',
    estadoIndexacion: 'pendiente',
    version: 1,
    chunkCount: 0,
    isPreset: false,
    obligatorio: false,
    oculto: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  const conEstructura: KbEstructura = {
    schemaVersion: 1,
    schemaId: 'generico',
    campos: {},
    adicional: 'algo',
  };

  it('con estructura guardada → estructurado', () => {
    expect(modoEditor(doc({ titulo: 'Lo que sea', estructura: conEstructura }))).toBe('estructurado');
  });

  it('sin estructura pero CON texto → legado, aunque su título tenga schema', () => {
    expect(
      modoEditor(doc({ titulo: 'Información Complementaria', contenido: 'Texto a mano' })),
    ).toBe('legado');
  });

  it('sin estructura y sin texto, con schema registrado → nace estructurado', () => {
    expect(modoEditor(doc({ titulo: 'Información Complementaria' }))).toBe('estructurado');
  });

  it('sin estructura y sin texto, sin schema → legado', () => {
    expect(modoEditor(doc({ titulo: 'Políticas y términos' }))).toBe('legado');
  });

  it('«Horarios y ubicación» vacía nace estructurada; con texto libre sigue legada', () => {
    expect(modoEditor(doc({ titulo: 'Horarios y ubicación' }))).toBe('estructurado');
    expect(
      modoEditor(doc({ titulo: 'Horarios y ubicación', contenido: 'Abrimos de 8 a 6.' })),
    ).toBe('legado');
  });

  it('«Información de la empresa» vacía nace estructurada; con texto libre sigue legada', () => {
    expect(modoEditor(doc({ titulo: 'Información de la empresa' }))).toBe('estructurado');
    expect(
      modoEditor(doc({ titulo: 'Información de la empresa', contenido: 'Somos Acme.' })),
    ).toBe('legado');
  });

  it('«Productos y servicios» vacía nace estructurada; con texto libre sigue legada', () => {
    expect(modoEditor(doc({ titulo: 'Productos y servicios' }))).toBe('estructurado');
    expect(
      modoEditor(doc({ titulo: 'Productos y servicios', contenido: 'Vendemos harina.' })),
    ).toBe('legado');
  });

  it('creación libre (sin documento) → legado', () => {
    expect(modoEditor(undefined)).toBe('legado');
  });

  it('un documento con estructura resuelve su schema por `schemaId`, NO por título', () => {
    // Su título no está en el registry; sin esta regla caería a legado y al guardar dejaría la
    // estructura huérfana.
    const suyo = doc({ titulo: 'Convenios con empresas', estructura: conEstructura });
    expect(schemaDeDocumento(suyo)).toBe(KB_SCHEMAS.generico);
    expect(modoEditor(suyo)).toBe('estructurado');
  });

  it('un `schemaId` desconocido cae a generico en vez de dejar el documento sin formulario', () => {
    const retirado = doc({
      titulo: 'X',
      estructura: { ...conEstructura, schemaId: 'schema-que-ya-no-existe' },
    });
    expect(schemaDeDocumento(retirado)).toBe(KB_SCHEMAS.generico);
    expect(modoEditor(retirado)).toBe('estructurado');
  });
});

describe('el schema generico', () => {
  it('no tiene secciones: su único contenido es «Información adicional», que va en el sobre', () => {
    expect(KB_SCHEMAS.generico.secciones).toHaveLength(0);
    expect(todosLosCampos(KB_SCHEMAS.generico)).toHaveLength(0);
  });

  it('no declara ningún campo obligatorio, así que nunca bloquea el guardado', () => {
    const vacia = emptyEstructura(KB_SCHEMAS.generico);
    expect(camposFaltantes(KB_SCHEMAS.generico, vacia)).toHaveLength(0);
  });
});

describe('emptyEstructura', () => {
  it('produce un sobre válido, con campos vacío y adicional en cadena vacía', () => {
    expect(emptyEstructura(SCHEMA_PRUEBA)).toEqual({
      schemaVersion: 3,
      schemaId: 'generico',
      campos: {},
      adicional: '',
    });
  });

  it('copia la versión del schema, no una constante', () => {
    expect(emptyEstructura(KB_SCHEMAS.generico).schemaVersion).toBe(1);
    expect(emptyEstructura(SCHEMA_PRUEBA).schemaVersion).toBe(3);
  });
});

describe('límites por campo', () => {
  it('cada kind tiene su tope y el campo puede pisarlo', () => {
    expect(limiteDeCampo(campoPorId('nombre'))).toBe(LIMITE_POR_KIND['texto-corto']);
    expect(limiteDeCampo({ ...campoPorId('nombre'), maxLength: 40 })).toBe(40);
  });

  it('los ítems caen al tope por defecto salvo que el campo fije el suyo', () => {
    expect(maxItemsDeCampo(campoPorId('zonas'))).toBe(MAX_ITEMS_DEFAULT);
    expect(maxItemsDeCampo({ ...campoPorId('zonas'), maxItems: 3 })).toBe(3);
  });

  it('texto-largo es el más generoso: es el que usa «Información adicional»', () => {
    expect(LIMITE_POR_KIND['texto-largo']).toBeGreaterThan(LIMITE_POR_KIND['texto-medio']);
    expect(LIMITE_POR_KIND['texto-medio']).toBeGreaterThan(LIMITE_POR_KIND['texto-corto']);
  });
});

describe('valorInicial', () => {
  it('da a cada kind un valor de su propio tipo', () => {
    expect(valorInicial(campoPorId('nombre'))).toEqual({ tipo: 'texto', valor: '' });
    expect(valorInicial(campoPorId('zonas'))).toEqual({ tipo: 'lista', valores: [] });
    expect(valorInicial(campoPorId('hace_envios'))).toEqual({ tipo: 'triestado', valor: 'na' });
  });
});

describe('valorVacio', () => {
  it('un campo ausente está vacío', () => {
    expect(valorVacio(undefined)).toBe(true);
  });

  it('texto: solo espacios cuenta como vacío', () => {
    expect(valorVacio({ tipo: 'texto', valor: '   ' })).toBe(true);
    expect(valorVacio({ tipo: 'texto', valor: 'Acme' })).toBe(false);
  });

  it('lista: sin ítems, o con todos en blanco, está vacía', () => {
    expect(valorVacio({ tipo: 'lista', valores: [] })).toBe(true);
    expect(valorVacio({ tipo: 'lista', valores: ['', '  '] })).toBe(true);
    expect(valorVacio({ tipo: 'lista', valores: ['', 'Norte'] })).toBe(false);
  });

  it('triestado presente nunca está vacío: «No aplica» es una respuesta', () => {
    expect(valorVacio({ tipo: 'triestado', valor: 'na' })).toBe(false);
    expect(valorVacio({ tipo: 'triestado', valor: 'no' })).toBe(false);
  });

  it('horario: un día marcado «Cerrado» es información, no un hueco', () => {
    expect(valorVacio({ tipo: 'horario', dias: [] })).toBe(true);
    expect(
      valorVacio({ tipo: 'horario', dias: [{ dia: 'lunes', cerrado: false, intervalos: [] }] }),
    ).toBe(true);
    expect(
      valorVacio({ tipo: 'horario', dias: [{ dia: 'domingo', cerrado: true, intervalos: [] }] }),
    ).toBe(false);
    expect(
      valorVacio({
        tipo: 'horario',
        dias: [{ dia: 'lunes', cerrado: false, intervalos: [{ desde: '08:00', hasta: '12:00' }] }],
      }),
    ).toBe(false);
  });

  it('repetible: ítems con todos sus subcampos en blanco cuentan como vacío', () => {
    expect(valorVacio({ tipo: 'repetible', items: [] })).toBe(true);
    expect(valorVacio({ tipo: 'repetible', items: [{ nombre: '', precio: '  ' }] })).toBe(true);
    expect(valorVacio({ tipo: 'repetible', items: [{ nombre: 'Plan', precio: '' }] })).toBe(false);
  });
});

describe('esVisible', () => {
  it('un campo sin visibleSi siempre se muestra', () => {
    expect(esVisible(campoPorId('nombre'), {})).toBe(true);
  });

  it('un condicional se muestra solo cuando su predicado se cumple', () => {
    expect(esVisible(campoPorId('zonas'), {})).toBe(false);
    expect(
      esVisible(campoPorId('zonas'), { hace_envios: { tipo: 'triestado', valor: 'no' } }),
    ).toBe(false);
    expect(
      esVisible(campoPorId('zonas'), { hace_envios: { tipo: 'triestado', valor: 'si' } }),
    ).toBe(true);
  });
});

describe('camposFaltantes', () => {
  it('lista los obligatorios sin llenar', () => {
    const faltan = camposFaltantes(SCHEMA_PRUEBA, estructuraCon({}));
    expect(faltan.map((c) => c.id)).toEqual(['nombre', 'hace_envios']);
  });

  it('ignora los opcionales, estén llenos o no', () => {
    const faltan = camposFaltantes(
      SCHEMA_PRUEBA,
      estructuraCon({
        nombre: { tipo: 'texto', valor: 'Acme' },
        hace_envios: { tipo: 'triestado', valor: 'no' },
      }),
    );
    expect(faltan).toHaveLength(0); // `lema` es opcional y sigue vacío
  });

  it('un condicional oculto no bloquea el guardado', () => {
    const faltan = camposFaltantes(
      SCHEMA_PRUEBA,
      estructuraCon({
        nombre: { tipo: 'texto', valor: 'Acme' },
        hace_envios: { tipo: 'triestado', valor: 'no' }, // «zonas» queda oculto
      }),
    );
    expect(faltan.map((c) => c.id)).not.toContain('zonas');
  });

  it('el mismo condicional sí bloquea en cuanto se vuelve visible', () => {
    const faltan = camposFaltantes(
      SCHEMA_PRUEBA,
      estructuraCon({
        nombre: { tipo: 'texto', valor: 'Acme' },
        hace_envios: { tipo: 'triestado', valor: 'si' },
      }),
    );
    expect(faltan.map((c) => c.id)).toEqual(['zonas']);
  });

  it('se vacía en cuanto el condicional visible se llena', () => {
    const faltan = camposFaltantes(
      SCHEMA_PRUEBA,
      estructuraCon({
        nombre: { tipo: 'texto', valor: 'Acme' },
        hace_envios: { tipo: 'triestado', valor: 'si' },
        zonas: { tipo: 'lista', valores: ['Norte'] },
      }),
    );
    expect(faltan).toHaveLength(0);
  });
});

describe('todosLosCampos', () => {
  it('aplana en el orden canónico: sección a sección, campo a campo', () => {
    expect(todosLosCampos(SCHEMA_PRUEBA).map((c) => c.id)).toEqual([
      'nombre',
      'lema',
      'hace_envios',
      'zonas',
    ]);
  });
});
