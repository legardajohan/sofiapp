import { describe, it, expect } from 'vitest';
import { localAUtc } from '../../utils/zona-horaria.util.js';
import {
  aMinutos,
  evaluarVentana,
  normalizarFranjas,
  siguienteApertura,
  siguienteCierre,
  ultimoMomentoAbierto,
  validarSolapes,
  validarSolapesDia,
} from './send-window.policy.js';
import {
  CONFIG_DEFECTO,
  type CategoriaEnvio,
  type IExcepcion,
  type IFranja,
  type IPoliticaVentana,
} from './send-window.types.js';

// Semana de referencia en Bogotá (UTC-5): lun 2026-11-02 … sáb 2026-11-07, dom 2026-11-08.
const ZONA = 'America/Bogota';
const en = (fecha: string, hhmm: string, zona = ZONA): Date => localAUtc(fecha, hhmm, zona);

function config(
  franjas: IFranja[],
  opciones: { excepciones?: IExcepcion[]; zona?: string; categoria?: CategoriaEnvio } = {},
): IPoliticaVentana {
  const categoria = opciones.categoria ?? 'campana';
  return {
    activo: true,
    zonaHoraria: opciones.zona ?? ZONA,
    reglas: CONFIG_DEFECTO.reglas.map((r) =>
      r.categoria === categoria ? { categoria, modo: 'restringido', franjas } : r,
    ),
    excepciones: opciones.excepciones ?? [],
  };
}

const LABORAL: IFranja = { dias: [1, 2, 3, 4, 5], desde: '08:00', hasta: '19:00' };

describe('send-window.policy', () => {
  it('aMinutos', () => {
    expect(aMinutos('00:00')).toBe(0);
    expect(aMinutos('08:30')).toBe(510);
    expect(aMinutos('24:00')).toBe(1440);
  });

  describe('permitido sin restricción', () => {
    it('activo: false deja salir todo', () => {
      const cfg = { ...config([]), activo: false };
      expect(evaluarVentana(cfg, 'campana', en('2026-11-07', '03:00'))).toEqual({
        permitido: true,
        siguienteCierre: null,
      });
    });

    it('una regla libre deja salir aunque haya franjas', () => {
      const cfg = config([LABORAL]);
      expect(evaluarVentana(cfg, 'asesor', en('2026-11-07', '03:00')).permitido).toBe(true);
    });
  });

  describe('franja lun–vie 08:00–19:00', () => {
    const cfg = config([LABORAL]);

    it('dentro: permitido con el cierre del mismo día', () => {
      const r = evaluarVentana(cfg, 'campana', en('2026-11-03', '10:00'));
      expect(r).toEqual({ permitido: true, siguienteCierre: en('2026-11-03', '19:00') });
    });

    it('en el borde: 08:00 abierto, 19:00 cerrado', () => {
      expect(evaluarVentana(cfg, 'campana', en('2026-11-03', '08:00')).permitido).toBe(true);
      const r = evaluarVentana(cfg, 'campana', en('2026-11-03', '19:00'));
      expect(r).toEqual({ permitido: false, siguienteApertura: en('2026-11-04', '08:00'), motivo: 'fuera_de_franja' });
    });

    it('sábado cerrado con apertura el lunes 08:00', () => {
      expect(siguienteApertura(cfg, 'campana', en('2026-11-07', '10:00'))).toEqual(en('2026-11-09', '08:00'));
      expect(siguienteCierre(cfg, 'campana', en('2026-11-07', '10:00'))).toBeNull();
    });
  });

  describe('franjas que cruzan la medianoche', () => {
    it('vie 22:00–02:00: sábado 01:00 abierto, sábado 03:00 cerrado', () => {
      const cfg = config([{ dias: [5], desde: '22:00', hasta: '02:00' }]);
      expect(evaluarVentana(cfg, 'campana', en('2026-11-07', '01:00'))).toEqual({
        permitido: true,
        siguienteCierre: en('2026-11-07', '02:00'),
      });
      expect(evaluarVentana(cfg, 'campana', en('2026-11-07', '03:00'))).toEqual({
        permitido: false,
        siguienteApertura: en('2026-11-13', '22:00'),
        motivo: 'fuera_de_franja',
      });
    });

    it('sáb 22:00–02:00 vuelve al domingo', () => {
      const cfg = config([{ dias: [6], desde: '22:00', hasta: '02:00' }]);
      expect(normalizarFranjas(cfg.reglas.find((r) => r.categoria === 'campana')!.franjas)).toEqual([
        [6 * 1440 + 1320, 7 * 1440],
        [0, 120],
      ]);
      expect(evaluarVentana(cfg, 'campana', en('2026-11-08', '01:00')).permitido).toBe(true);
      expect(evaluarVentana(cfg, 'campana', en('2026-11-08', '02:00')).permitido).toBe(false);
    });

    it('24:00 como fin se une con la franja de las 00:00 del día siguiente', () => {
      const cfg = config([
        { dias: [1], desde: '20:00', hasta: '24:00' },
        { dias: [2], desde: '00:00', hasta: '06:00' },
      ]);
      expect(evaluarVentana(cfg, 'campana', en('2026-11-02', '23:00'))).toEqual({
        permitido: true,
        siguienteCierre: en('2026-11-03', '06:00'),
      });
    });
  });

  describe('validarSolapes', () => {
    it('franjas contiguas no se solapan', () => {
      expect(
        validarSolapes([
          { dias: [1], desde: '08:00', hasta: '12:00' },
          { dias: [1], desde: '12:00', hasta: '14:00' },
        ]),
      ).toEqual([]);
    });

    it('detecta un solape el mismo día', () => {
      expect(
        validarSolapes([
          { dias: [1], desde: '08:00', hasta: '12:00' },
          { dias: [1, 2], desde: '11:00', hasta: '13:00' },
        ]),
      ).toEqual(['Las franjas 1 y 2 se solapan el lunes.']);
    });

    it('detecta un solape contra la cola de una franja que cruza la medianoche', () => {
      expect(
        validarSolapes([
          { dias: [5], desde: '22:00', hasta: '02:00' },
          { dias: [6], desde: '01:00', hasta: '05:00' },
        ]),
      ).toEqual(['Las franjas 1 y 2 se solapan el sábado.']);
      // Y la vuelta sábado → domingo.
      expect(
        validarSolapes([
          { dias: [6], desde: '23:00', hasta: '03:00' },
          { dias: [0], desde: '02:00', hasta: '04:00' },
        ]),
      ).toEqual(['Las franjas 1 y 2 se solapan el domingo.']);
    });

    it('validarSolapesDia', () => {
      expect(validarSolapesDia([{ desde: '09:00', hasta: '11:00' }, { desde: '10:00', hasta: '12:00' }])).toHaveLength(1);
      expect(validarSolapesDia([{ desde: '09:00', hasta: '11:00' }, { desde: '11:00', hasta: '12:00' }])).toEqual([]);
    });
  });

  describe('excepciones', () => {
    it('cerrado para todas las categorías', () => {
      const cfg = config([LABORAL], { excepciones: [{ fecha: '2026-11-03', tipo: 'cerrado' }] });
      expect(evaluarVentana(cfg, 'campana', en('2026-11-03', '10:00'))).toEqual({
        permitido: false,
        siguienteApertura: en('2026-11-04', '08:00'),
        motivo: 'excepcion',
      });
    });

    it('cerrado solo para campana no afecta a otra categoría restringida', () => {
      const base = config([LABORAL], {
        excepciones: [{ fecha: '2026-11-03', tipo: 'cerrado', categorias: ['campana'] }],
      });
      const cfg: IPoliticaVentana = {
        ...base,
        reglas: base.reglas.map((r) => (r.categoria === 'flujo' ? { ...r, franjas: [LABORAL] } : r)),
      };
      expect(evaluarVentana(cfg, 'campana', en('2026-11-03', '10:00')).permitido).toBe(false);
      expect(evaluarVentana(cfg, 'flujo', en('2026-11-03', '10:00')).permitido).toBe(true);
    });

    it('franjas especiales reemplazan las del día', () => {
      const cfg = config([LABORAL], {
        excepciones: [{ fecha: '2026-11-03', tipo: 'franjas', franjas: [{ desde: '09:00', hasta: '11:00' }] }],
      });
      expect(evaluarVentana(cfg, 'campana', en('2026-11-03', '10:00'))).toEqual({
        permitido: true,
        siguienteCierre: en('2026-11-03', '11:00'),
      });
      expect(evaluarVentana(cfg, 'campana', en('2026-11-03', '12:00'))).toEqual({
        permitido: false,
        siguienteApertura: en('2026-11-04', '08:00'),
        motivo: 'excepcion',
      });
      // Abre un sábado que normalmente está cerrado.
      const sabado = config([LABORAL], {
        excepciones: [{ fecha: '2026-11-07', tipo: 'franjas', franjas: [{ desde: '09:00', hasta: '12:00' }] }],
      });
      expect(siguienteApertura(sabado, 'campana', en('2026-11-06', '20:00'))).toEqual(en('2026-11-07', '09:00'));
    });

    it('una excepción el día anterior corta la cola de su franja nocturna', () => {
      const cfg = config([{ dias: [5], desde: '22:00', hasta: '02:00' }], {
        excepciones: [{ fecha: '2026-11-06', tipo: 'cerrado' }],
      });
      expect(evaluarVentana(cfg, 'campana', en('2026-11-07', '01:00')).permitido).toBe(false);
    });
  });

  it('sin apertura en 14 días devuelve null', () => {
    const cfg = config([]);
    expect(evaluarVentana(cfg, 'campana', en('2026-11-03', '10:00'))).toEqual({
      permitido: false,
      siguienteApertura: null,
      motivo: 'fuera_de_franja',
    });
  });

  it('respeta el horario de verano de la zona', () => {
    // Nueva York pasa a EDT el domingo 2026-03-08: el lunes 08:00 es 12:00Z, no 13:00Z.
    const cfg = config([LABORAL], { zona: 'America/New_York' });
    expect(siguienteApertura(cfg, 'campana', new Date('2026-03-07T01:00:00Z'))).toEqual(
      new Date('2026-03-09T12:00:00Z'),
    );
  });
});

describe('ultimoMomentoAbierto (recordatorios adelantados)', () => {
  const cfg = config([LABORAL], { categoria: 'recordatorio' });

  it('sin política o categoría libre: el propio límite', () => {
    const limite = en('2026-11-03', '23:00');
    expect(ultimoMomentoAbierto({ ...cfg, activo: false }, 'recordatorio', en('2026-11-03', '10:00'), limite)).toEqual(limite);
    expect(ultimoMomentoAbierto(cfg, 'asesor', en('2026-11-03', '10:00'), limite)).toEqual(limite);
  });

  it('límite dentro de una franja: el propio límite', () => {
    expect(ultimoMomentoAbierto(cfg, 'recordatorio', en('2026-11-03', '10:00'), en('2026-11-03', '15:00'))).toEqual(
      en('2026-11-03', '15:00'),
    );
  });

  it('límite de noche: el cierre de la franja de ese día', () => {
    expect(ultimoMomentoAbierto(cfg, 'recordatorio', en('2026-11-03', '10:00'), en('2026-11-03', '23:00'))).toEqual(
      en('2026-11-03', '19:00'),
    );
    // Vence a las 07:00 del día siguiente, antes de que abra: el cierre de hoy.
    expect(ultimoMomentoAbierto(cfg, 'recordatorio', en('2026-11-03', '10:00'), en('2026-11-04', '07:00'))).toEqual(
      en('2026-11-03', '19:00'),
    );
  });

  it('límite al día siguiente dentro de franja: prefiere el momento más tardío', () => {
    expect(ultimoMomentoAbierto(cfg, 'recordatorio', en('2026-11-03', '18:00'), en('2026-11-04', '10:00'))).toEqual(
      en('2026-11-04', '10:00'),
    );
  });

  it('sin nada abierto entre ahora y el límite, o con el límite ya pasado: null', () => {
    expect(ultimoMomentoAbierto(cfg, 'recordatorio', en('2026-11-07', '10:00'), en('2026-11-07', '23:00'))).toBeNull();
    expect(ultimoMomentoAbierto(cfg, 'recordatorio', en('2026-11-03', '10:00'), en('2026-11-03', '09:00'))).toBeNull();
  });
});
