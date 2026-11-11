import { describe, it, expect } from 'vitest';
import { resolverRolEmpresa } from './user.rol-empresa.js';

// AUTH-04 (ADR 0017): la única tabla de traducción subrol → rol de empresa.
describe('resolverRolEmpresa', () => {
  it.each([
    [{ subrol: 'director' }, 'administrador'],
    [{ subrol: 'manager' }, 'administrador'],
    [{ subrol: 'coordinator' }, 'coordinador'],
    [{ subrol: 'secretary' }, 'asesor'],
    [{}, 'administrador'],
    [{ subrol: null }, 'administrador'],
  ] as const)('%o → %s', (src, esperado) => {
    expect(resolverRolEmpresa(src)).toBe(esperado);
  });

  it('un rolEmpresa válido manda sobre el subrol legado', () => {
    expect(resolverRolEmpresa({ rolEmpresa: 'asesor', subrol: 'director' })).toBe('asesor');
  });

  it('un rolEmpresa desconocido no se acepta: se cae a la traducción del subrol', () => {
    expect(resolverRolEmpresa({ rolEmpresa: 'superjefe', subrol: 'secretary' })).toBe('asesor');
  });

  it('un subrol desconocido sin rolEmpresa se trata como el propietario de siempre', () => {
    expect(resolverRolEmpresa({ subrol: 'otro' })).toBe('administrador');
  });
});
