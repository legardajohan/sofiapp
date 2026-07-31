import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import {
  SUBROLES_DATOS_SENSIBLES,
  authorizeSubrol,
  puedeVerDatosSensibles,
} from './authorize-subrol.middleware.js';
import type { SafeUser } from '../types/express.js';
import type { AdminSubrol } from '../features/users/user.types.js';

function usuario(rol: SafeUser['rol'], subrol?: AdminSubrol): SafeUser {
  return {
    sub: new Types.ObjectId().toString(),
    tenantId: rol === 'superadmin' ? null : new Types.ObjectId(),
    rol,
    ...(subrol ? { subrol } : {}),
  };
}

function ejecutar(user?: SafeUser): { status: number | null; siguio: boolean } {
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

  authorizeSubrol(SUBROLES_DATOS_SENSIBLES)(req, res, next);
  return { status, siguio };
}

describe('authorizeSubrol — gate de datos sensibles (HU-CRM-02)', () => {
  it('deja pasar a director y manager', () => {
    for (const subrol of ['director', 'manager'] as const) {
      expect(ejecutar(usuario('admin', subrol)).siguio).toBe(true);
    }
  });

  it('deja pasar al admin SIN subrol (retrocompatibilidad con AUTH-02)', () => {
    // Hoy ningún usuario tiene subrol asignado; exigirlo dejaría a todos los tenants fuera de sus
    // propios datos el día del despliegue.
    expect(ejecutar(usuario('admin')).siguio).toBe(true);
  });

  it('rechaza a coordinator y secretary con 403', () => {
    for (const subrol of ['coordinator', 'secretary'] as const) {
      const { status, siguio } = ejecutar(usuario('admin', subrol));
      expect(siguio).toBe(false);
      expect(status).toBe(403);
    }
  });

  it('rechaza al superadmin: no toca datos de tenant', () => {
    const { status, siguio } = ejecutar(usuario('superadmin'));
    expect(siguio).toBe(false);
    expect(status).toBe(403);
  });

  it('rechaza si no hay usuario en la request', () => {
    expect(ejecutar(undefined).status).toBe(403);
  });
});

describe('puedeVerDatosSensibles', () => {
  it('coincide con el gate de ruta para cada subrol', () => {
    expect(puedeVerDatosSensibles(usuario('admin', 'director'))).toBe(true);
    expect(puedeVerDatosSensibles(usuario('admin', 'manager'))).toBe(true);
    expect(puedeVerDatosSensibles(usuario('admin'))).toBe(true);
    expect(puedeVerDatosSensibles(usuario('admin', 'coordinator'))).toBe(false);
    expect(puedeVerDatosSensibles(usuario('admin', 'secretary'))).toBe(false);
    expect(puedeVerDatosSensibles(usuario('superadmin'))).toBe(false);
  });
});
