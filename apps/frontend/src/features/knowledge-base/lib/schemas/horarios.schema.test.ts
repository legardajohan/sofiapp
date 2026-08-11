import { describe, it, expect } from 'vitest';
import type { KbEstructura, KbFieldValue, KbScheduleDay } from '../../types/index.js';
import {
  DIAS_SEMANA,
  camposFaltantes,
  emptyEstructura,
  limiteDeCampo,
  maxItemsDeCampo,
  todosLosCampos,
  type KbFieldDef,
} from '../kb-schemas.js';
import { serializeEstructura, serializedLength } from '../kb-serialize.js';
import { HORARIOS_SCHEMA } from './horarios.schema.js';

/** Espejo de `CONTENIDO_MAX` en `apps/backend/src/features/kb/kb.validation.ts`. */
const CONTENIDO_MAX = 10_000;

/** Tope de tramos por día que impone `ScheduleDayEditor`. */
const MAX_INTERVALOS = 4;

/**
 * Ids congelados. **Este test es el candado**: renombrar un campo deja huérfano el dato ya guardado
 * por los tenants. Si falla por un renombre, la respuesta correcta casi siempre es deshacerlo y
 * cambiar la `etiqueta` en su lugar.
 */
const IDS_CONGELADOS = [
  'direccion',
  'indicaciones',
  'otras_sedes',
  'whatsapp',
  'telefono',
  'correo',
  'redes_sociales',
  'horario_atencion',
  'excepciones_horario',
] as const;

const campo = (id: string): KbFieldDef => {
  const encontrado = todosLosCampos(HORARIOS_SCHEMA).find((c) => c.id === id);
  if (!encontrado) throw new Error(`El campo ${id} no existe en HORARIOS_SCHEMA`);
  return encontrado;
};

function estructura(campos: Record<string, KbFieldValue>, adicional = ''): KbEstructura {
  return { schemaVersion: HORARIOS_SCHEMA.version, schemaId: 'horarios', campos, adicional };
}

const dia = (
  nombre: string,
  intervalos: Array<{ desde: string; hasta: string }>,
  cerrado = false,
): KbScheduleDay => ({ dia: nombre, cerrado, intervalos });

describe('forma del schema', () => {
  it('se identifica como `horarios` en su versión 1', () => {
    expect(HORARIOS_SCHEMA.id).toBe('horarios');
    expect(HORARIOS_SCHEMA.version).toBe(1);
  });

  it('tiene las 3 secciones en orden', () => {
    expect(HORARIOS_SCHEMA.secciones.map((s) => s.id)).toEqual([
      'ubicacion',
      'contacto',
      'horarios',
    ]);
  });

  it('los ids de campo son exactamente los congelados, en orden canónico', () => {
    expect(todosLosCampos(HORARIOS_SCHEMA).map((c) => c.id)).toEqual([...IDS_CONGELADOS]);
  });

  it('ningún id se repite', () => {
    const ids = todosLosCampos(HORARIOS_SCHEMA).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ningún campo se llama «Información adicional»: esa vía es el `adicional` del sobre', () => {
    const etiquetas = todosLosCampos(HORARIOS_SCHEMA).map((c) => c.etiqueta.toLowerCase());
    expect(etiquetas).not.toContain('información adicional');
  });

  it('hay exactamente un campo `horario` y ninguno `triestado`', () => {
    const kinds = todosLosCampos(HORARIOS_SCHEMA).map((c) => c.kind);
    expect(kinds.filter((k) => k === 'horario')).toHaveLength(1);
    expect(kinds).not.toContain('triestado'); // su consumidor es HU-KB-11
  });

  it('no cruza ninguna de las tres fronteras pactadas', () => {
    const ids = todosLosCampos(HORARIOS_SCHEMA).map((c) => c.id).join(' ');
    // Zonas de cobertura → empresa (HU-KB-08); entrega y despacho → productos (HU-KB-09);
    // políticas → HU-KB-11.
    expect(ids).not.toMatch(/zona|cobertura/);
    expect(ids).not.toMatch(/entrega|envio|despacho/);
    expect(ids).not.toMatch(/garantia|devolucion|politica/);
  });
});

describe('los canales de contacto son campos dedicados', () => {
  it('WhatsApp, teléfono y correo son campos de texto propios, no una lista', () => {
    // La ambigüedad aquí produce datos incorrectos: un número suelto en una lista no le dice a la
    // IA si es WhatsApp o fijo.
    expect(campo('whatsapp').kind).toBe('texto-corto');
    expect(campo('telefono').kind).toBe('texto-corto');
    expect(campo('correo').kind).toBe('texto-corto');
  });

  it('las redes sociales sí van como lista: el conjunto de redes es abierto', () => {
    expect(campo('redes_sociales').kind).toBe('lista');
    expect(maxItemsDeCampo(campo('redes_sociales'))).toBe(6);
  });
});

describe('las columnas de `otras_sedes`', () => {
  it('son exactamente `nombre`, `direccion` y `telefono`, en ese orden', () => {
    expect(campo('otras_sedes').subcampos?.map((s) => s.id)).toEqual([
      'nombre',
      'direccion',
      'telefono',
    ]);
  });

  it('admite hasta 6 sedes', () => {
    expect(maxItemsDeCampo(campo('otras_sedes'))).toBe(6);
  });

  it('convive con `direccion`: el caso de una sola ubicación no cuesta una fila', () => {
    expect(campo('direccion').kind).toBe('texto-medio');
    expect(campo('otras_sedes').etiqueta).toBe('Otras sedes');
  });
});

describe('exigencia de los campos', () => {
  it('NINGÚN campo es obligatorio', () => {
    // Categoría opcional y eliminable: cualquier candidato a obligatorio falla para algún negocio
    // (solo-online no tiene dirección, solo-correo no tiene WhatsApp, 24/7 no tiene horario).
    const obligatorios = todosLosCampos(HORARIOS_SCHEMA).filter(
      (c) => c.requisito !== 'opcional',
    );
    expect(obligatorios).toEqual([]);
  });

  it('la estructura vacía no reclama nada', () => {
    expect(camposFaltantes(HORARIOS_SCHEMA, emptyEstructura(HORARIOS_SCHEMA))).toEqual([]);
  });

  it('aun así, una estructura vacía no produce texto que guardar', () => {
    // El piso lo pone el editor (`contenidoListo`), no un campo obligatorio.
    expect(serializeEstructura(emptyEstructura(HORARIOS_SCHEMA), HORARIOS_SCHEMA)).toBe('');
  });

  it('basta cualquier campo para que haya algo que guardar', () => {
    const texto = serializeEstructura(
      estructura({ whatsapp: { tipo: 'texto', valor: '3001234567' } }),
      HORARIOS_SCHEMA,
    );
    expect(texto).toContain('WhatsApp: 3001234567');
  });
});

describe('el horario en el texto que llega a la IA', () => {
  it('saca un día por línea, con sus tramos separados por coma', () => {
    const texto = serializeEstructura(
      estructura({
        horario_atencion: {
          tipo: 'horario',
          dias: [
            dia('lunes', [
              { desde: '08:00', hasta: '12:00' },
              { desde: '14:00', hasta: '18:00' },
            ]),
          ],
        },
      }),
      HORARIOS_SCHEMA,
    );

    expect(texto).toBe(
      ['## Cuándo atienden', 'Horario de atención:', '- lunes: 08:00–12:00, 14:00–18:00'].join('\n'),
    );
  });

  it('un día CERRADO aparece en el texto: saber que no abren también es información', () => {
    const texto = serializeEstructura(
      estructura({
        horario_atencion: {
          tipo: 'horario',
          dias: [dia('sábado', [{ desde: '09:00', hasta: '13:00' }]), dia('domingo', [], true)],
        },
      }),
      HORARIOS_SCHEMA,
    );

    expect(texto).toContain('- domingo: cerrado');
  });

  it('un día abierto SIN tramos no dice nada y se omite', () => {
    const texto = serializeEstructura(
      estructura({
        horario_atencion: {
          tipo: 'horario',
          dias: [dia('lunes', [{ desde: '08:00', hasta: '18:00' }]), dia('martes', [])],
        },
      }),
      HORARIOS_SCHEMA,
    );

    expect(texto).toContain('- lunes:');
    expect(texto).not.toContain('martes');
  });

  it('un horario sin ningún día útil no deja encabezado', () => {
    const texto = serializeEstructura(
      estructura({ horario_atencion: { tipo: 'horario', dias: [dia('lunes', [])] } }),
      HORARIOS_SCHEMA,
    );

    expect(texto).toBe('');
  });

  it('respeta el orden canónico de los días, desde lunes', () => {
    const texto = serializeEstructura(
      estructura({
        horario_atencion: {
          tipo: 'horario',
          dias: DIAS_SEMANA.map((d) => dia(d, [{ desde: '08:00', hasta: '18:00' }])),
        },
      }),
      HORARIOS_SCHEMA,
    );

    const posiciones = DIAS_SEMANA.map((d) => texto.indexOf(`- ${d}:`));
    expect(posiciones.every((p) => p >= 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
  });
});

describe('el resto del texto', () => {
  it('saca las 3 secciones en orden canónico con «Información adicional» al final', () => {
    const texto = serializeEstructura(
      estructura(
        {
          direccion: { tipo: 'texto', valor: 'Calle 100 #15-20' },
          whatsapp: { tipo: 'texto', valor: '3001234567' },
          horario_atencion: {
            tipo: 'horario',
            dias: [dia('lunes', [{ desde: '08:00', hasta: '18:00' }])],
          },
        },
        'Cerramos la última semana de diciembre.',
      ),
      HORARIOS_SCHEMA,
    );

    const orden = [
      '## Dónde están',
      '## Cómo contactarlos',
      '## Cuándo atienden',
      '## Información adicional',
    ];
    const posiciones = orden.map((h) => texto.indexOf(h));
    expect(posiciones.every((p) => p >= 0)).toBe(true);
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
  });

  it('una sede se serializa con sus tres columnas', () => {
    const texto = serializeEstructura(
      estructura({
        otras_sedes: {
          tipo: 'repetible',
          items: [{ nombre: 'Sede Norte', direccion: 'Calle 100 #15-20', telefono: '6011234567' }],
        },
      }),
      HORARIOS_SCHEMA,
    );

    expect(texto).toContain(
      '- nombre: Sede Norte · direccion: Calle 100 #15-20 · telefono: 6011234567',
    );
  });

  it('un formulario a medias no deja secciones huérfanas', () => {
    const texto = serializeEstructura(
      estructura({ whatsapp: { tipo: 'texto', valor: '3001234567' } }),
      HORARIOS_SCHEMA,
    );

    expect(texto).not.toContain('## Dónde están');
    expect(texto).not.toContain('## Cuándo atienden');
  });
});

describe('presupuesto de caracteres', () => {
  /** Llena TODOS los campos hasta su tope: 7 días × 4 tramos, 6 sedes × 3 columnas, listas llenas. */
  function estructuraAlTope(): KbEstructura {
    const campos: Record<string, KbFieldValue> = {};

    for (const def of todosLosCampos(HORARIOS_SCHEMA)) {
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
        case 'horario':
          campos[def.id] = {
            tipo: 'horario',
            dias: DIAS_SEMANA.map((d) =>
              dia(
                d,
                Array.from({ length: MAX_INTERVALOS }, () => ({ desde: '08:00', hasta: '12:00' })),
              ),
            ),
          };
          break;
        default:
          campos[def.id] = { tipo: 'texto', valor: 'x'.repeat(max) };
      }
    }

    return estructura(campos, 'x'.repeat(1500));
  }

  it('con todo al tope, el texto serializado cabe en CONTENIDO_MAX', () => {
    expect(serializedLength(estructuraAlTope(), HORARIOS_SCHEMA)).toBeLessThanOrEqual(CONTENIDO_MAX);
  });

  it('el peor caso incluye de verdad los 7 días con sus 4 tramos', () => {
    const texto = serializeEstructura(estructuraAlTope(), HORARIOS_SCHEMA);
    for (const d of DIAS_SEMANA) {
      expect(texto).toContain(`- ${d}: 08:00–12:00, 08:00–12:00, 08:00–12:00, 08:00–12:00`);
    }
  });

  it('`otras_sedes` cuesta MÁS que el horario completo: ahí está el peso real', () => {
    // Contraintuitivo y conviene tenerlo fijado: si algún día hay que recortar, el candidato son
    // las sedes, no los días ni los tramos.
    const tope = estructuraAlTope();
    const sinSedes = serializedLength(
      { ...tope, campos: { ...tope.campos, otras_sedes: { tipo: 'repetible', items: [] } } },
      HORARIOS_SCHEMA,
    );
    const sinHorario = serializedLength(
      { ...tope, campos: { ...tope.campos, horario_atencion: { tipo: 'horario', dias: [] } } },
      HORARIOS_SCHEMA,
    );
    const total = serializedLength(tope, HORARIOS_SCHEMA);

    expect(total - sinSedes).toBeGreaterThan(total - sinHorario);
  });
});
