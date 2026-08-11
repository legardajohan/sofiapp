import { describe, it, expect } from 'vitest';
import type { KbEstructura, KbFieldValue } from '../../types/index.js';
import {
  camposFaltantes,
  emptyEstructura,
  limiteDeCampo,
  maxItemsDeCampo,
  todosLosCampos,
  type KbFieldDef,
} from '../kb-schemas.js';
import { serializeEstructura, serializedLength } from '../kb-serialize.js';
import { PRODUCTOS_SCHEMA } from './productos.schema.js';

/** Espejo de `CONTENIDO_MAX` en `apps/backend/src/features/kb/kb.validation.ts`. */
const CONTENIDO_MAX = 10_000;

/**
 * Ids congelados. **Este test es el candado**: renombrar un campo deja huérfano el dato ya guardado
 * por los tenants. Si falla por un renombre, la respuesta correcta casi siempre es deshacerlo y
 * cambiar la `etiqueta` en su lugar.
 */
const IDS_CONGELADOS = [
  'resumen_oferta',
  'catalogo',
  'notas_precios',
  'formas_pago',
  'promociones',
  'modalidades_entrega',
  'tiempos_entrega',
] as const;

const campo = (id: string): KbFieldDef => {
  const encontrado = todosLosCampos(PRODUCTOS_SCHEMA).find((c) => c.id === id);
  if (!encontrado) throw new Error(`El campo ${id} no existe en PRODUCTOS_SCHEMA`);
  return encontrado;
};

function estructura(campos: Record<string, KbFieldValue>, adicional = ''): KbEstructura {
  return { schemaVersion: PRODUCTOS_SCHEMA.version, schemaId: 'productos', campos, adicional };
}

/** Los dos obligatorios resueltos, para poder aislar lo que se está probando. */
const MINIMO: Record<string, KbFieldValue> = {
  resumen_oferta: { tipo: 'texto', valor: 'Vendemos insumos de panadería.' },
  catalogo: { tipo: 'repetible', items: [{ nombre: 'Harina', descripcion: 'Bulto de 25 kg' }] },
};

describe('forma del schema', () => {
  it('se identifica como `productos` en su versión 1', () => {
    expect(PRODUCTOS_SCHEMA.id).toBe('productos');
    expect(PRODUCTOS_SCHEMA.version).toBe(1);
  });

  it('tiene las 3 secciones en orden', () => {
    expect(PRODUCTOS_SCHEMA.secciones.map((s) => s.id)).toEqual(['oferta', 'precios', 'entrega']);
  });

  it('los ids de campo son exactamente los congelados, en orden canónico', () => {
    expect(todosLosCampos(PRODUCTOS_SCHEMA).map((c) => c.id)).toEqual([...IDS_CONGELADOS]);
  });

  it('ningún id se repite', () => {
    const ids = todosLosCampos(PRODUCTOS_SCHEMA).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no declara un campo `categorias`: se solapaba con el catálogo y con el resumen', () => {
    expect(todosLosCampos(PRODUCTOS_SCHEMA).map((c) => c.id)).not.toContain('categorias');
  });

  it('ningún campo se llama «Información adicional»: esa vía es el `adicional` del sobre', () => {
    const etiquetas = todosLosCampos(PRODUCTOS_SCHEMA).map((c) => c.etiqueta.toLowerCase());
    expect(etiquetas).not.toContain('información adicional');
  });

  it('no usa `horario` ni `triestado`; lo enumerable va como `lista`, no como `repetible`', () => {
    const kinds = todosLosCampos(PRODUCTOS_SCHEMA).map((c) => c.kind);
    expect(kinds).not.toContain('horario');
    expect(kinds).not.toContain('triestado');
    expect(kinds.filter((k) => k === 'repetible')).toHaveLength(1);
    expect(campo('formas_pago').kind).toBe('lista');
    expect(campo('modalidades_entrega').kind).toBe('lista');
  });
});

describe('las columnas del catálogo', () => {
  it('son exactamente `nombre` y `descripcion`, en ese orden', () => {
    expect(campo('catalogo').subcampos?.map((s) => s.id)).toEqual(['nombre', 'descripcion']);
  });

  it('NINGUNA columna se llama `precio`', () => {
    // Decisión de HU-KB-09: el precio envejece como el stock y una cifra caducada en el texto
    // indexado es peor que «se cotiza». Reintroducirlo debe costar una decisión consciente —y un
    // cambio de `version`—, no colarse en un refactor.
    expect(campo('catalogo').subcampos?.map((s) => s.id)).not.toContain('precio');
  });

  it('respeta los topes: nombre 60, descripcion 120 (el default de `repetible`)', () => {
    const subcampos = campo('catalogo').subcampos ?? [];
    expect(subcampos.find((s) => s.id === 'nombre')?.maxLength).toBe(60);
    expect(subcampos.find((s) => s.id === 'descripcion')?.maxLength).toBe(120);
  });

  it('admite hasta 12 filas', () => {
    expect(maxItemsDeCampo(campo('catalogo'))).toBe(12);
  });
});

describe('exigencia de los campos', () => {
  it('solo `resumen_oferta` y `catalogo` son obligatorios', () => {
    const obligatorios = todosLosCampos(PRODUCTOS_SCHEMA)
      .filter((c) => c.requisito === 'obligatorio')
      .map((c) => c.id);

    expect(obligatorios).toEqual(['resumen_oferta', 'catalogo']);
  });

  it('la estructura vacía reclama exactamente esos dos', () => {
    const faltan = camposFaltantes(PRODUCTOS_SCHEMA, emptyEstructura(PRODUCTOS_SCHEMA));
    expect(faltan.map((c) => c.id)).toEqual(['resumen_oferta', 'catalogo']);
  });

  it('una fila con SOLO el nombre ya desbloquea el guardado', () => {
    // Hallazgo H2: el contrato no permite exigir columna por fila, y se acepta a propósito — un
    // producto listado por su nombre ya es conocimiento útil.
    const faltan = camposFaltantes(
      PRODUCTOS_SCHEMA,
      estructura({
        resumen_oferta: { tipo: 'texto', valor: 'Algo' },
        catalogo: { tipo: 'repetible', items: [{ nombre: 'Harina', descripcion: '' }] },
      }),
    );
    expect(faltan).toHaveLength(0);
  });

  it('filas todas en blanco siguen contando como vacío y bloquean', () => {
    const faltan = camposFaltantes(
      PRODUCTOS_SCHEMA,
      estructura({
        resumen_oferta: { tipo: 'texto', valor: 'Algo' },
        catalogo: { tipo: 'repetible', items: [{ nombre: '', descripcion: '   ' }] },
      }),
    );
    expect(faltan.map((c) => c.id)).toEqual(['catalogo']);
  });

  it('`resumen_oferta` se acota a 600, no a los 1.500 del kind', () => {
    expect(limiteDeCampo(campo('resumen_oferta'))).toBe(600);
  });

  it('las listas llevan su propio tope de ítems y de longitud', () => {
    expect(maxItemsDeCampo(campo('formas_pago'))).toBe(8);
    expect(maxItemsDeCampo(campo('modalidades_entrega'))).toBe(6);
    expect(limiteDeCampo(campo('formas_pago'))).toBe(60);
  });
});

describe('el texto que llega a la IA', () => {
  it('serializa cada fila con sus dos columnas separadas por ` · `', () => {
    const texto = serializeEstructura(
      estructura({
        ...MINIMO,
        catalogo: {
          tipo: 'repetible',
          items: [
            { nombre: 'Harina', descripcion: 'Bulto de 25 kg' },
            { nombre: 'Levadura', descripcion: 'Caja de 500 g' },
          ],
        },
      }),
      PRODUCTOS_SCHEMA,
    );

    expect(texto).toBe(
      [
        '## Qué ofrece',
        '¿Qué vende o qué servicios presta?: Vendemos insumos de panadería.',
        'Productos y servicios:',
        '- nombre: Harina · descripcion: Bulto de 25 kg',
        '- nombre: Levadura · descripcion: Caja de 500 g',
      ].join('\n'),
    );
  });

  it('una fila con solo nombre no deja separadores huérfanos', () => {
    const texto = serializeEstructura(
      estructura({
        ...MINIMO,
        catalogo: { tipo: 'repetible', items: [{ nombre: 'Harina', descripcion: '' }] },
      }),
      PRODUCTOS_SCHEMA,
    );

    expect(texto).toContain('- nombre: Harina');
    expect(texto).not.toContain('·');
  });

  it('un catálogo sin filas útiles no deja encabezado', () => {
    const texto = serializeEstructura(
      estructura({
        resumen_oferta: { tipo: 'texto', valor: 'Algo' },
        catalogo: { tipo: 'repetible', items: [{ nombre: '', descripcion: '' }] },
      }),
      PRODUCTOS_SCHEMA,
    );

    expect(texto).not.toContain('Productos y servicios:');
  });

  it('respeta el orden en que se ingresaron las filas', () => {
    const texto = serializeEstructura(
      estructura({
        ...MINIMO,
        catalogo: {
          tipo: 'repetible',
          items: [{ nombre: 'Zeta' }, { nombre: 'Alfa' }],
        },
      }),
      PRODUCTOS_SCHEMA,
    );

    expect(texto.indexOf('Zeta')).toBeLessThan(texto.indexOf('Alfa'));
  });

  it('saca las 3 secciones en orden canónico con «Información adicional» al final', () => {
    const texto = serializeEstructura(
      estructura(
        {
          ...MINIMO,
          notas_precios: { tipo: 'texto', valor: 'De $10 a $50 según volumen.' },
          modalidades_entrega: { tipo: 'lista', valores: ['Domicilio'] },
        },
        'Cerramos en Semana Santa.',
      ),
      PRODUCTOS_SCHEMA,
    );

    const orden = ['## Qué ofrece', '## Precios y condiciones', '## Cómo se entrega', '## Información adicional'];
    const posiciones = orden.map((h) => texto.indexOf(h));
    expect(posiciones.every((p) => p >= 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
  });

  it('un formulario a medias no deja secciones huérfanas', () => {
    const texto = serializeEstructura(estructura(MINIMO), PRODUCTOS_SCHEMA);

    expect(texto).not.toContain('## Precios y condiciones');
    expect(texto).not.toContain('## Cómo se entrega');
  });
});

describe('presupuesto de caracteres', () => {
  /** Llena TODOS los campos hasta su tope, incluidas las 12 filas con sus 2 columnas. */
  function estructuraAlTope(): KbEstructura {
    const campos: Record<string, KbFieldValue> = {};

    for (const def of todosLosCampos(PRODUCTOS_SCHEMA)) {
      const max = limiteDeCampo(def);
      switch (def.kind) {
        case 'lista':
          campos[def.id] = {
            tipo: 'lista',
            valores: Array.from({ length: maxItemsDeCampo(def) }, () => 'x'.repeat(max)),
          };
          break;
        case 'repetible': {
          const subcampos = def.subcampos ?? [];
          campos[def.id] = {
            tipo: 'repetible',
            items: Array.from({ length: maxItemsDeCampo(def) }, () =>
              Object.fromEntries(subcampos.map((s) => [s.id, 'x'.repeat(s.maxLength ?? max)])),
            ),
          };
          break;
        }
        default:
          campos[def.id] = { tipo: 'texto', valor: 'x'.repeat(max) };
      }
    }

    return estructura(campos, 'x'.repeat(1500));
  }

  it('con todo al tope, el texto serializado cabe en CONTENIDO_MAX', () => {
    expect(serializedLength(estructuraAlTope(), PRODUCTOS_SCHEMA)).toBeLessThanOrEqual(CONTENIDO_MAX);
  });

  it('el peor caso incluye de verdad las 12 filas completas', () => {
    // Si el generador se quedara corto, el test de arriba pasaría por la razón equivocada.
    const texto = serializeEstructura(estructuraAlTope(), PRODUCTOS_SCHEMA);
    const filas = texto.split('\n').filter((l) => l.startsWith('- nombre: '));
    expect(filas).toHaveLength(12);
  });

  it('el catálogo es el bloque más caro: conviene saberlo antes de ampliarlo', () => {
    const conCatalogo = serializedLength(estructuraAlTope(), PRODUCTOS_SCHEMA);
    const sinCatalogo = serializedLength(
      { ...estructuraAlTope(), campos: { ...estructuraAlTope().campos, catalogo: { tipo: 'repetible', items: [] } } },
      PRODUCTOS_SCHEMA,
    );

    expect(conCatalogo - sinCatalogo).toBeGreaterThan(2000);
  });
});
