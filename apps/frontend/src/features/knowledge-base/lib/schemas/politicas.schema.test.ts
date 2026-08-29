import { describe, it, expect } from 'vitest';
import type { KbEstructura, KbFieldValue } from '../../types/index.js';
import {
  camposFaltantes,
  emptyEstructura,
  limiteDeCampo,
  todosLosCampos,
  type KbFieldDef,
} from '../kb-schemas.js';
import { serializeEstructura, serializedLength } from '../kb-serialize.js';
import { POLITICAS_SCHEMA } from './politicas.schema.js';

/** Espejo de `CONTENIDO_MAX` en `apps/backend/src/features/kb/kb.validation.ts`. */
const CONTENIDO_MAX = 10_000;

/** Tope de «Información adicional» en `KnowledgeStructuredForm` (el de `texto-largo`). */
const ADICIONAL_MAX = 1500;

/**
 * Ids congelados. **Este test es el candado**: renombrar un campo deja huérfano el dato ya guardado
 * por los tenants. Si falla por un renombre, la respuesta correcta casi siempre es deshacerlo y
 * cambiar la `etiqueta` en su lugar.
 */
const IDS_CONGELADOS = [
  'acepta_devoluciones',
  'acepta_cambios',
  'ofrece_garantia',
  'requiere_reserva',
  'admite_mascotas',
  'consumo_minimo',
  'otras_politicas',
  'terminos_generales',
] as const;

const campo = (id: string): KbFieldDef => {
  const encontrado = todosLosCampos(POLITICAS_SCHEMA).find((c) => c.id === id);
  if (!encontrado) throw new Error(`El campo ${id} no existe en POLITICAS_SCHEMA`);
  return encontrado;
};

function estructura(campos: Record<string, KbFieldValue>, adicional = ''): KbEstructura {
  return { schemaVersion: POLITICAS_SCHEMA.version, schemaId: 'politicas', campos, adicional };
}

describe('forma del schema', () => {
  it('se identifica como `politicas` en su versión 1', () => {
    expect(POLITICAS_SCHEMA.id).toBe('politicas');
    expect(POLITICAS_SCHEMA.version).toBe(1);
  });

  it('tiene las 2 secciones en orden', () => {
    expect(POLITICAS_SCHEMA.secciones.map((s) => s.id)).toEqual(['politicas', 'terminos']);
  });

  it('los ids de campo son exactamente los congelados, en orden canónico', () => {
    expect(todosLosCampos(POLITICAS_SCHEMA).map((c) => c.id)).toEqual([...IDS_CONGELADOS]);
  });

  it('ningún id se repite', () => {
    const ids = todosLosCampos(POLITICAS_SCHEMA).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ningún campo se llama «Información adicional»: esa vía es el `adicional` del sobre', () => {
    const etiquetas = todosLosCampos(POLITICAS_SCHEMA).map((c) => c.etiqueta.toLowerCase());
    expect(etiquetas).not.toContain('información adicional');
  });

  it('hay exactamente seis `triestado` y dos `texto-largo`, y nada más', () => {
    const kinds = todosLosCampos(POLITICAS_SCHEMA).map((c) => c.kind);
    expect(kinds.filter((k) => k === 'triestado')).toHaveLength(6);
    expect(kinds.filter((k) => k === 'texto-largo')).toHaveLength(2);
    expect(new Set(kinds)).toEqual(new Set(['triestado', 'texto-largo']));
  });

  it('las seis preguntas viven en la MISMA sección: el 3 + 3 no es un reparto obligatorio', () => {
    const preguntas = POLITICAS_SCHEMA.secciones[0]?.campos ?? [];
    expect(preguntas.map((c) => c.id)).toEqual([
      'acepta_devoluciones',
      'acepta_cambios',
      'ofrece_garantia',
      'requiere_reserva',
      'admite_mascotas',
      'consumo_minimo',
    ]);
  });

  it('los dos textos largos tienen los topes previstos', () => {
    // 800 para las reglas sueltas; 1.500 —el de `texto-largo`— para los términos. El tope de
    // `terminos_generales` es parte del diseño: lo que se escriba ahí lo va a leer una IA para
    // contestar por WhatsApp, y un contrato entero recupera peor que un párrafo claro.
    expect(limiteDeCampo(campo('otras_politicas'))).toBe(800);
    expect(limiteDeCampo(campo('terminos_generales'))).toBe(1500);
  });

  it('el detalle de cada política tiene el tope del `triestado` (300)', () => {
    for (const def of todosLosCampos(POLITICAS_SCHEMA).filter((c) => c.kind === 'triestado')) {
      expect(limiteDeCampo(def)).toBe(300);
    }
  });

  it('las etiquetas de las políticas son preguntas completas', () => {
    // Acaban DENTRO del texto que lee la IA, así que el fragmento tiene que auto-describirse:
    // «¿Aceptan devoluciones?: Sí — …» se entiende suelto; «Devoluciones: Sí» no tanto.
    for (const def of todosLosCampos(POLITICAS_SCHEMA).filter((c) => c.kind === 'triestado')) {
      expect(def.etiqueta.startsWith('¿')).toBe(true);
      expect(def.etiqueta.endsWith('?')).toBe(true);
    }
  });

  it('no cruza ninguna de las cinco fronteras pactadas', () => {
    const ids = todosLosCampos(POLITICAS_SCHEMA)
      .map((c) => c.id)
      .join(' ');
    // Entrega y despacho → productos (HU-KB-09); horarios y contacto → horarios (HU-KB-10);
    // identidad y cobertura → empresa (HU-KB-08); precios y formas de pago → productos (HU-KB-09).
    expect(ids).not.toMatch(/entrega|envio|despacho|logistica/);
    expect(ids).not.toMatch(/horario|direccion|telefono|whatsapp|correo/);
    expect(ids).not.toMatch(/zona|cobertura|mision|nombre_comercial/);
    expect(ids).not.toMatch(/precio|pago|tarifa/);
  });
});

describe('exigencia de los campos', () => {
  it('NINGÚN campo es obligatorio', () => {
    // Categoría opcional y eliminable, y el tri-estado ya tiene «No aplica» para «esto no me
    // describe»: exigirlo no añadiría dato, solo obligaría a pulsar un botón.
    const obligatorios = todosLosCampos(POLITICAS_SCHEMA).filter((c) => c.requisito !== 'opcional');
    expect(obligatorios).toEqual([]);
  });

  it('la estructura vacía no reclama nada', () => {
    expect(camposFaltantes(POLITICAS_SCHEMA, emptyEstructura(POLITICAS_SCHEMA))).toEqual([]);
  });

  it('aun así, una estructura vacía no produce texto que guardar', () => {
    // El piso lo pone el editor (`contenidoListo`), no un campo obligatorio.
    expect(serializeEstructura(emptyEstructura(POLITICAS_SCHEMA), POLITICAS_SCHEMA)).toBe('');
  });

  it('basta UNA respuesta, aunque sea «No aplica», para que haya algo que guardar', () => {
    // Es lo que distingue a esta categoría de las otras tres: en ellas hay que escribir algo.
    const texto = serializeEstructura(
      estructura({ admite_mascotas: { tipo: 'triestado', valor: 'na' } }),
      POLITICAS_SCHEMA,
    );
    expect(texto).toContain('¿Admiten mascotas?: No aplica');
  });
});

describe('«No aplica» es una respuesta con valor propio', () => {
  const soloDevoluciones = (valor: 'si' | 'no' | 'na', detalle?: string): string =>
    serializeEstructura(
      estructura({
        acepta_devoluciones: {
          tipo: 'triestado',
          valor,
          ...(detalle !== undefined ? { detalle } : {}),
        },
      }),
      POLITICAS_SCHEMA,
    );

  it('distingue «No» de «No aplica», y no omite ninguno de los dos', () => {
    // La razón de ser de la categoría: sin esta distinción, «no tenemos política de devoluciones» y
    // «no vendemos productos físicos» se guardarían igual y la IA respondería lo mismo en dos
    // situaciones opuestas. Si alguien «optimiza» la serialización, este test lo delata.
    expect(soloDevoluciones('no')).toContain('¿Aceptan devoluciones?: No');
    expect(soloDevoluciones('no')).not.toContain('No aplica');
    expect(soloDevoluciones('na')).toContain('¿Aceptan devoluciones?: No aplica');
  });

  it('un «Sí» con detalle sale con su guion; sin detalle, sin guion suelto', () => {
    expect(soloDevoluciones('si', '30 días con factura')).toContain(
      '¿Aceptan devoluciones?: Sí — 30 días con factura',
    );
    expect(soloDevoluciones('si')).toContain('¿Aceptan devoluciones?: Sí');
    expect(soloDevoluciones('si')).not.toContain('—');
  });

  it('una política NUNCA respondida no aparece en el texto', () => {
    // Hallazgo H1 del `spec.md`: el radio se pinta con «No aplica» preseleccionado, pero mientras el
    // admin no toque nada el campo no entra en `campos` y la IA no lee una respuesta que nadie dio.
    const texto = soloDevoluciones('si', 'sí');
    expect(texto).not.toContain('¿Admiten mascotas?');
    expect(texto).not.toContain('¿Ofrecen garantía?');
  });
});

describe('el resto del texto', () => {
  it('saca las 2 secciones en orden canónico con «Información adicional» al final', () => {
    const texto = serializeEstructura(
      estructura(
        {
          acepta_devoluciones: { tipo: 'triestado', valor: 'si', detalle: '30 días con factura' },
          terminos_generales: { tipo: 'texto', valor: 'Aplican condiciones.' },
        },
        'Cerramos el 1 de enero.',
      ),
      POLITICAS_SCHEMA,
    );

    const orden = ['## Políticas frecuentes', '## Términos y condiciones', '## Información adicional'];
    const posiciones = orden.map((h) => texto.indexOf(h));
    expect(posiciones.every((p) => p >= 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
  });

  it('un formulario a medias no deja secciones huérfanas', () => {
    const texto = serializeEstructura(
      estructura({ otras_politicas: { tipo: 'texto', valor: 'Mayores de 18 años.' } }),
      POLITICAS_SCHEMA,
    );

    expect(texto).not.toContain('## Políticas frecuentes');
    expect(texto).toContain('## Términos y condiciones');
  });
});

describe('presupuesto de caracteres', () => {
  /** Llena TODOS los campos hasta su tope: los 6 detalles a 300 y los dos textos largos completos. */
  function estructuraAlTope(): KbEstructura {
    const campos: Record<string, KbFieldValue> = {};

    for (const def of todosLosCampos(POLITICAS_SCHEMA)) {
      const max = limiteDeCampo(def);
      campos[def.id] =
        def.kind === 'triestado'
          ? { tipo: 'triestado', valor: 'si', detalle: 'x'.repeat(max) }
          : { tipo: 'texto', valor: 'x'.repeat(max) };
    }

    return estructura(campos, 'x'.repeat(ADICIONAL_MAX));
  }

  it('con todo al tope, el texto serializado cabe en CONTENIDO_MAX', () => {
    expect(serializedLength(estructuraAlTope(), POLITICAS_SCHEMA)).toBeLessThanOrEqual(
      CONTENIDO_MAX,
    );
  });

  it('el peor caso incluye de verdad las seis políticas con su detalle al tope', () => {
    const texto = serializeEstructura(estructuraAlTope(), POLITICAS_SCHEMA);
    for (const def of todosLosCampos(POLITICAS_SCHEMA).filter((c) => c.kind === 'triestado')) {
      expect(texto).toContain(`${def.etiqueta}: Sí — ${'x'.repeat(limiteDeCampo(def))}`);
    }
  });

  it('los dos textos largos cuestan MÁS que las seis preguntas juntas: ahí está el peso', () => {
    // Si algún día hay que recortar, el candidato es `terminos_generales`, no el número de
    // políticas: un tri-estado con su detalle cuesta ~330 caracteres.
    const tope = estructuraAlTope();
    const total = serializedLength(tope, POLITICAS_SCHEMA);

    const sinTextos = { ...tope.campos };
    delete sinTextos.otras_politicas;
    delete sinTextos.terminos_generales;
    const costeTextos = total - serializedLength({ ...tope, campos: sinTextos }, POLITICAS_SCHEMA);

    const soloTextos: Record<string, KbFieldValue> = {
      otras_politicas: tope.campos.otras_politicas as KbFieldValue,
      terminos_generales: tope.campos.terminos_generales as KbFieldValue,
    };
    const costePreguntas =
      total - serializedLength({ ...tope, campos: soloTextos }, POLITICAS_SCHEMA);

    expect(costeTextos).toBeGreaterThan(costePreguntas);
  });
});
