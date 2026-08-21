import { describe, it, expect } from 'vitest';
import type { KbEstructura, KbScheduleDay } from '../types/index.js';
import {
  copiarHorario,
  estadoIntervalo,
  estructuraConHorarioInvertido,
  hayIntervalosInvertidos,
  intervalosUtiles,
} from './kb-horario.js';

const dia = (
  nombre: string,
  intervalos: KbScheduleDay['intervalos'],
  cerrado = false,
): KbScheduleDay => ({ dia: nombre, cerrado, intervalos });

describe('estadoIntervalo', () => {
  it('un tramo con las dos horas y en orden es `ok`', () => {
    expect(estadoIntervalo({ desde: '08:00', hasta: '12:00' })).toBe('ok');
  });

  it('falta alguna hora → `incompleto`', () => {
    expect(estadoIntervalo({ desde: '08:00', hasta: '' })).toBe('incompleto');
    expect(estadoIntervalo({ desde: '', hasta: '12:00' })).toBe('incompleto');
    expect(estadoIntervalo({ desde: '', hasta: '' })).toBe('incompleto');
  });

  it('cierra antes de abrir → `invertido`', () => {
    expect(estadoIntervalo({ desde: '18:00', hasta: '09:00' })).toBe('invertido');
  });

  it('abrir y cerrar a la misma hora también es `invertido`', () => {
    // Un tramo de duración cero no describe una franja de atención: describe un descuido.
    expect(estadoIntervalo({ desde: '08:00', hasta: '08:00' })).toBe('invertido');
  });

  it('compara «HH:mm» como texto, y con eso basta', () => {
    // El orden lexicográfico de un «HH:mm» de dos dígitos coincide con el cronológico. Este test
    // existe para que nadie «arregle» la comparación con un parseo innecesario.
    expect(estadoIntervalo({ desde: '09:00', hasta: '10:00' })).toBe('ok');
    expect(estadoIntervalo({ desde: '10:00', hasta: '09:59' })).toBe('invertido');
  });
});

describe('intervalosUtiles', () => {
  it('deja fuera los tramos incompletos y los invertidos', () => {
    const lunes = dia('lunes', [
      { desde: '08:00', hasta: '12:00' },
      { desde: '14:00', hasta: '' },
      { desde: '20:00', hasta: '19:00' },
    ]);

    expect(intervalosUtiles(lunes)).toEqual([{ desde: '08:00', hasta: '12:00' }]);
  });

  it('un día cerrado no aporta tramos, aunque los conserve', () => {
    const domingo = dia('domingo', [{ desde: '08:00', hasta: '12:00' }], true);
    expect(intervalosUtiles(domingo)).toEqual([]);
  });
});

describe('hayIntervalosInvertidos — lo único que bloquea el guardado', () => {
  it('detecta un invertido en un día abierto', () => {
    expect(hayIntervalosInvertidos([dia('lunes', [{ desde: '18:00', hasta: '09:00' }])])).toBe(true);
  });

  it('un tramo INCOMPLETO no cuenta: es el estado natural mientras se teclea', () => {
    expect(hayIntervalosInvertidos([dia('lunes', [{ desde: '08:00', hasta: '' }])])).toBe(false);
  });

  it('un día CERRADO con un tramo invertido tampoco cuenta', () => {
    // Sus tramos se conservan por si vuelve a abrirse, pero no llegan al texto: un error ahí no
    // engaña a nadie y bloquear por él sería incomprensible.
    expect(
      hayIntervalosInvertidos([dia('domingo', [{ desde: '18:00', hasta: '09:00' }], true)]),
    ).toBe(false);
  });

  it('una semana sana no bloquea', () => {
    expect(
      hayIntervalosInvertidos([
        dia('lunes', [{ desde: '08:00', hasta: '12:00' }]),
        dia('domingo', [], true),
      ]),
    ).toBe(false);
  });
});

describe('estructuraConHorarioInvertido', () => {
  const estructura = (campos: KbEstructura['campos']): KbEstructura => ({
    schemaVersion: 1,
    schemaId: 'horarios',
    campos,
    adicional: '',
  });

  it('mira dentro de los campos de tipo horario', () => {
    expect(
      estructuraConHorarioInvertido(
        estructura({
          horario_atencion: {
            tipo: 'horario',
            dias: [dia('lunes', [{ desde: '18:00', hasta: '09:00' }])],
          },
        }),
      ),
    ).toBe(true);
  });

  it('ignora los campos que no son horarios', () => {
    expect(
      estructuraConHorarioInvertido(estructura({ whatsapp: { tipo: 'texto', valor: '300' } })),
    ).toBe(false);
  });
});

describe('copiarHorario', () => {
  const semana = (): KbScheduleDay[] => [
    dia('lunes', [{ desde: '08:00', hasta: '12:00', descripcion: 'Presencial' }]),
    dia('martes', []),
    dia('miércoles', [{ desde: '10:00', hasta: '11:00' }]),
    dia('domingo', [], true),
  ];

  it('copia los tramos a los destinos elegidos, con su descripción', () => {
    const resultado = copiarHorario(semana(), 'lunes', ['martes']);

    expect(resultado[1]?.intervalos).toEqual([
      { desde: '08:00', hasta: '12:00', descripcion: 'Presencial' },
    ]);
  });

  it('NO sobrescribe un día cerrado', () => {
    const resultado = copiarHorario(semana(), 'lunes', ['martes', 'domingo']);

    // Cerrar un día es una decisión explícita del admin; un copiado masivo no puede deshacerla.
    expect(resultado[3]?.intervalos).toEqual([]);
    expect(resultado[3]?.cerrado).toBe(true);
  });

  it('no toca los días que no se eligieron', () => {
    const resultado = copiarHorario(semana(), 'lunes', ['martes']);
    expect(resultado[2]?.intervalos).toEqual([{ desde: '10:00', hasta: '11:00' }]);
  });

  it('copia por VALOR: editar el destino no muta el origen', () => {
    const resultado = copiarHorario(semana(), 'lunes', ['martes']);
    const copiado = resultado[1]?.intervalos[0];
    if (copiado === undefined) throw new Error('el martes debería tener un tramo');
    copiado.desde = '06:00';

    expect(resultado[0]?.intervalos[0]?.desde).toBe('08:00');
  });

  it('conserva el orden canónico de los días', () => {
    const resultado = copiarHorario(semana(), 'lunes', ['martes']);
    expect(resultado.map((d) => d.dia)).toEqual(['lunes', 'martes', 'miércoles', 'domingo']);
  });

  it('un origen que no existe deja la semana intacta', () => {
    const original = semana();
    expect(copiarHorario(original, 'feriado', ['martes'])).toBe(original);
  });
});
