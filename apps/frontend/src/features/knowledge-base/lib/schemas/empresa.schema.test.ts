import { describe, it, expect } from 'vitest';
import type { KbEstructura, KbFieldValue } from '../../types/index.js';
import {
  camposFaltantes,
  emptyEstructura,
  esVisible,
  limiteDeCampo,
  maxItemsDeCampo,
  todosLosCampos,
  type KbFieldDef,
} from '../kb-schemas.js';
import { serializeEstructura, serializedLength } from '../kb-serialize.js';
import { EMPRESA_SCHEMA } from './empresa.schema.js';

/**
 * Tope global del contenido, espejo de `CONTENIDO_MAX` en `apps/backend/src/features/kb/kb.validation.ts`.
 * Si allá sube o baja, este test es el que avisa de que el formulario dejó de caber.
 */
const CONTENIDO_MAX = 10_000;

/**
 * Los ids del schema, congelados. **Este test es el candado**: renombrar un campo deja huérfano el
 * dato ya guardado por los tenants (dejaría de serializarse bajo su etiqueta y pasaría a «Otros
 * datos»). Si este test falla por un renombre, la respuesta correcta casi siempre es deshacerlo y
 * cambiar la `etiqueta` en su lugar.
 */
const IDS_CONGELADOS = [
  'nombre_comercial',
  'razon_social',
  'descripcion',
  'anio_fundacion',
  'mision',
  'vision',
  'valores',
  'clientes_objetivo',
  'zonas_cobertura',
  'diferenciadores',
  'parte_de_grupo',
  'grupo_empresarial',
  'certificaciones',
] as const;

const campo = (id: string): KbFieldDef => {
  const encontrado = todosLosCampos(EMPRESA_SCHEMA).find((c) => c.id === id);
  if (!encontrado) throw new Error(`El campo ${id} no existe en EMPRESA_SCHEMA`);
  return encontrado;
};

function estructura(campos: Record<string, KbFieldValue>, adicional = ''): KbEstructura {
  return { schemaVersion: EMPRESA_SCHEMA.version, schemaId: 'empresa', campos, adicional };
}

describe('forma del schema', () => {
  it('se identifica como `empresa` en su versión 1', () => {
    expect(EMPRESA_SCHEMA.id).toBe('empresa');
    expect(EMPRESA_SCHEMA.version).toBe(1);
  });

  it('tiene las 3 secciones en orden', () => {
    expect(EMPRESA_SCHEMA.secciones.map((s) => s.id)).toEqual([
      'identidad',
      'proposito',
      'alcance',
    ]);
  });

  it('los ids de campo son exactamente los congelados, en orden canónico', () => {
    expect(todosLosCampos(EMPRESA_SCHEMA).map((c) => c.id)).toEqual([...IDS_CONGELADOS]);
  });

  it('ningún id se repite', () => {
    const ids = todosLosCampos(EMPRESA_SCHEMA).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ningún campo se llama «Información adicional»: esa vía es el `adicional` del sobre', () => {
    const etiquetas = todosLosCampos(EMPRESA_SCHEMA).map((c) => c.etiqueta.toLowerCase());
    expect(etiquetas).not.toContain('información adicional');
  });

  it('no usa `horario` ni `repetible`: esta categoría no tiene agendas ni filas con columnas', () => {
    const kinds = todosLosCampos(EMPRESA_SCHEMA).map((c) => c.kind);
    expect(kinds).not.toContain('horario');
    expect(kinds).not.toContain('repetible');
  });
});

describe('exigencia de los campos', () => {
  it('solo `nombre_comercial` y `descripcion` son obligatorios', () => {
    const obligatorios = todosLosCampos(EMPRESA_SCHEMA)
      .filter((c) => c.requisito === 'obligatorio')
      .map((c) => c.id);

    expect(obligatorios).toEqual(['nombre_comercial', 'descripcion']);
  });

  it('la estructura vacía reclama exactamente esos dos', () => {
    const faltan = camposFaltantes(EMPRESA_SCHEMA, emptyEstructura(EMPRESA_SCHEMA));
    expect(faltan.map((c) => c.id)).toEqual(['nombre_comercial', 'descripcion']);
  });

  it('con los dos llenos se puede guardar, con todos los opcionales en blanco', () => {
    const faltan = camposFaltantes(
      EMPRESA_SCHEMA,
      estructura({
        nombre_comercial: { tipo: 'texto', valor: 'Acme' },
        descripcion: { tipo: 'texto', valor: 'Distribuimos insumos de panadería.' },
      }),
    );
    expect(faltan).toHaveLength(0);
  });

  it('`anio_fundacion` se acota a 30: un año no es una biografía', () => {
    expect(limiteDeCampo(campo('anio_fundacion'))).toBe(30);
  });

  it('las listas llevan su propio tope de ítems', () => {
    expect(maxItemsDeCampo(campo('valores'))).toBe(6);
    expect(maxItemsDeCampo(campo('zonas_cobertura'))).toBe(12);
    expect(maxItemsDeCampo(campo('diferenciadores'))).toBe(6);
    expect(maxItemsDeCampo(campo('certificaciones'))).toBe(6);
  });
});

describe('el condicional `grupo_empresarial`', () => {
  const conRespuesta = (valor: 'si' | 'no' | 'na') =>
    estructura({ parte_de_grupo: { tipo: 'triestado', valor } });

  it('está oculto mientras no se responda «Sí»', () => {
    expect(esVisible(campo('grupo_empresarial'), {})).toBe(false);
    expect(esVisible(campo('grupo_empresarial'), conRespuesta('na').campos)).toBe(false);
    expect(esVisible(campo('grupo_empresarial'), conRespuesta('no').campos)).toBe(false);
  });

  it('aparece al responder «Sí»', () => {
    expect(esVisible(campo('grupo_empresarial'), conRespuesta('si').campos)).toBe(true);
  });

  it('visible y vacío, bloquea el guardado', () => {
    const faltan = camposFaltantes(
      EMPRESA_SCHEMA,
      estructura({
        nombre_comercial: { tipo: 'texto', valor: 'Acme' },
        descripcion: { tipo: 'texto', valor: 'Algo' },
        parte_de_grupo: { tipo: 'triestado', valor: 'si' },
      }),
    );
    expect(faltan.map((c) => c.id)).toEqual(['grupo_empresarial']);
  });

  it('al volver a ocultarse deja de exigirse', () => {
    const faltan = camposFaltantes(
      EMPRESA_SCHEMA,
      estructura({
        nombre_comercial: { tipo: 'texto', valor: 'Acme' },
        descripcion: { tipo: 'texto', valor: 'Algo' },
        parte_de_grupo: { tipo: 'triestado', valor: 'no' },
      }),
    );
    expect(faltan).toHaveLength(0);
  });
});

describe('el texto que llega a la IA', () => {
  it('saca las secciones en orden canónico y «Información adicional» al final', () => {
    const texto = serializeEstructura(
      estructura(
        {
          nombre_comercial: { tipo: 'texto', valor: 'Acme S.A.S.' },
          descripcion: { tipo: 'texto', valor: 'Distribuimos insumos de panadería en Bogotá.' },
          valores: { tipo: 'lista', valores: ['Cumplimiento', 'Cercanía'] },
          parte_de_grupo: { tipo: 'triestado', valor: 'si' },
          grupo_empresarial: { tipo: 'texto', valor: 'Grupo Panadero Nacional' },
        },
        'Cerramos la última semana de diciembre.',
      ),
      EMPRESA_SCHEMA,
    );

    expect(texto).toBe(
      [
        '## Identidad',
        'Nombre comercial: Acme S.A.S.',
        '¿A qué se dedica?: Distribuimos insumos de panadería en Bogotá.',
        '',
        '## Propósito y valores',
        'Valores:',
        '- Cumplimiento',
        '- Cercanía',
        '',
        '## Alcance y respaldo',
        '¿Hace parte de un grupo o casa matriz?: Sí',
        'Nombre del grupo: Grupo Panadero Nacional',
        '',
        '## Información adicional',
        'Cerramos la última semana de diciembre.',
      ].join('\n'),
    );
  });

  it('un formulario a medias no deja secciones ni etiquetas huérfanas', () => {
    const texto = serializeEstructura(
      estructura({
        nombre_comercial: { tipo: 'texto', valor: 'Acme' },
        descripcion: { tipo: 'texto', valor: 'Algo' },
      }),
      EMPRESA_SCHEMA,
    );

    expect(texto).not.toContain('## Propósito y valores');
    expect(texto).not.toContain('## Alcance y respaldo');
    expect(texto).not.toContain('Razón social');
  });

  it('el grupo NO llega al texto si la respuesta dejó de ser «Sí»', () => {
    const texto = serializeEstructura(
      estructura({
        nombre_comercial: { tipo: 'texto', valor: 'Acme' },
        descripcion: { tipo: 'texto', valor: 'Algo' },
        parte_de_grupo: { tipo: 'triestado', valor: 'no' },
        grupo_empresarial: { tipo: 'texto', valor: 'Grupo que ya no aplica' },
      }),
      EMPRESA_SCHEMA,
    );

    expect(texto).toContain('¿Hace parte de un grupo o casa matriz?: No');
    expect(texto).not.toContain('Grupo que ya no aplica');
  });
});

describe('presupuesto de caracteres', () => {
  /** Llena TODOS los campos hasta su tope, incluidas las listas hasta `maxItems`. */
  function estructuraAlTope(): KbEstructura {
    const campos: Record<string, KbFieldValue> = {};

    for (const def of todosLosCampos(EMPRESA_SCHEMA)) {
      const max = limiteDeCampo(def);
      switch (def.kind) {
        case 'lista':
          campos[def.id] = {
            tipo: 'lista',
            valores: Array.from({ length: maxItemsDeCampo(def) }, () => 'x'.repeat(max)),
          };
          break;
        case 'triestado':
          // «Sí» además hace visible a `grupo_empresarial`: el peor caso de verdad.
          campos[def.id] = { tipo: 'triestado', valor: 'si', detalle: 'x'.repeat(max) };
          break;
        default:
          campos[def.id] = { tipo: 'texto', valor: 'x'.repeat(max) };
      }
    }

    return estructura(campos, 'x'.repeat(1500));
  }

  it('con todo al tope, el texto serializado cabe en CONTENIDO_MAX', () => {
    const total = serializedLength(estructuraAlTope(), EMPRESA_SCHEMA);

    expect(total).toBeLessThanOrEqual(CONTENIDO_MAX);
  });

  it('el condicional visible cuenta en el peor caso', () => {
    // Si `grupo_empresarial` no estuviera visible, el peor caso mediría de menos y el test de
    // arriba pasaría por la razón equivocada.
    const texto = serializeEstructura(estructuraAlTope(), EMPRESA_SCHEMA);
    expect(texto).toContain('Nombre del grupo:');
  });
});
