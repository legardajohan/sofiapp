import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import {
  ROLES_CONFIGURACION,
  ROLES_DATOS_SENSIBLES,
  ROLES_GESTION_USUARIOS,
  ROLES_REPORTES,
  authorizeRolEmpresa,
  puedeVerDatosSensibles,
} from './authorize-rol-empresa.middleware.js';
import type { SafeUser } from '../types/express.js';
import type { RolEmpresa } from '../features/users/user.types.js';

function usuario(rol: SafeUser['rol'], rolEmpresa?: RolEmpresa): SafeUser {
  return {
    sub: new Types.ObjectId().toString(),
    tenantId: rol === 'superadmin' ? null : new Types.ObjectId(),
    rol,
    ...(rolEmpresa ? { rolEmpresa } : {}),
  };
}

function ejecutar(roles: readonly RolEmpresa[], user?: SafeUser): { status: number | null; siguio: boolean } {
  const req = { user } as Request;
  let status: number | null = null;
  const res = {
    status: (code: number) => {
      status = code;
      return { json: vi.fn() } as unknown as Response;
    },
  } as Response;
  let siguio = false;
  const next: NextFunction = () => {
    siguio = true;
  };
  authorizeRolEmpresa(roles)(req, res, next);
  return { status, siguio };
}

describe('authorizeRolEmpresa (AUTH-04)', () => {
  it.each([
    ['datos sensibles', ROLES_DATOS_SENSIBLES, ['administrador']],
    ['reportes', ROLES_REPORTES, ['administrador']],
    ['gestión de usuarios', ROLES_GESTION_USUARIOS, ['administrador', 'coordinador']],
    ['configuración', ROLES_CONFIGURACION, ['administrador']],
  ] as const)('%s: solo pasan %j', (_n, roles, permitidos) => {
    for (const rol of ['administrador', 'coordinador', 'asesor'] as const) {
      const { siguio, status } = ejecutar(roles, usuario('admin', rol));
      const debe = (permitidos as readonly string[]).includes(rol);
      expect(siguio).toBe(debe);
      expect(status).toBe(debe ? null : 403);
    }
  });

  it('sin rolEmpresa ya no hay acceso total (la regla "sin subrol = todo" desapareció)', () => {
    expect(ejecutar(ROLES_CONFIGURACION, usuario('admin')).status).toBe(403);
  });

  it('rechaza al superadmin y a una petición sin usuario', () => {
    expect(ejecutar(ROLES_CONFIGURACION, usuario('superadmin')).status).toBe(403);
    expect(ejecutar(ROLES_CONFIGURACION).status).toBe(403);
  });

  it('puedeVerDatosSensibles: solo el administrador en AUTH-04', () => {
    expect(puedeVerDatosSensibles(usuario('admin', 'administrador'))).toBe(true);
    expect(puedeVerDatosSensibles(usuario('admin', 'coordinador'))).toBe(false);
    expect(puedeVerDatosSensibles(usuario('admin', 'asesor'))).toBe(false);
  });
});
