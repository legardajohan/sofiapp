import { describe, it, expect } from 'vitest';
import { normalizarNombre, validarNombreCampo } from './campos.js';
import type { CampoContactoDTO } from '../types.js';

const campo = (id: string, label: string): CampoContactoDTO => ({
  id,
  key: label.toLowerCase(),
  label,
  tipoDato: 'texto',
  sensible: false,
  orden: 0,
  activo: true,
});

describe('validarNombreCampo (HU-FLOW-05, criterio 18)', () => {
  const existentes = [campo('1', 'Colegio'), campo('2', 'Ciudad')];

  it('un nombre libre es válido', () => {
    expect(validarNombreCampo('Presupuesto', existentes)).toBeNull();
  });

  it('un nombre vacío o demasiado largo no se envía', () => {
    expect(validarNombreCampo('   ', existentes)).toMatch(/necesita un nombre/);
    expect(validarNombreCampo('a'.repeat(61), existentes)).toMatch(/60 caracteres/);
  });

  it('un duplicado se detecta sin mayúsculas ni tildes', () => {
    expect(validarNombreCampo('COLEGIO', existentes)).toMatch(/Ya existe/);
    expect(validarNombreCampo('Cólegio', existentes)).toMatch(/Ya existe/);
  });

  it('al renombrar, el propio campo puede conservar su nombre con otra caja', () => {
    expect(validarNombreCampo('COLEGIO', existentes, '1')).toBeNull();
    expect(validarNombreCampo('Ciudad', existentes, '1')).toMatch(/Ya existe/);
  });

  it.each(['Nombre', 'Email', 'Teléfono', 'documento', 'Rol Contacto', 'Nivel Interés'])(
    'el nombre reservado «%s» remite al dato fijo',
    (label) => {
      expect(validarNombreCampo(label, existentes)).toMatch(/dato fijo/);
    },
  );
});

describe('normalizarNombre', () => {
  it('quita tildes, mayúsculas y espacios repetidos', () => {
    expect(normalizarNombre('  Institución   Educativa ')).toBe('institucion educativa');
  });
});
