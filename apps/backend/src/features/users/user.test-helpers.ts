import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import request from 'supertest';
import type { Express } from 'express';
import { Cliente } from '../cliente/cliente.model.js';
import { UserModel } from './user.model.js';
import type { AdminSubrol } from './user.types.js';

// Utilidades compartidas por los tests de gestión de usuarios (AUTH-03). No es un test.

export const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const CSRF = 'csrf-de-prueba';

export interface IUsuarioPrueba {
  id: string;
  tenantId: string;
  subrol?: AdminSubrol;
}

export async function crearUsuario(
  tenantId: string,
  opts: { subrol?: AdminSubrol; activo?: boolean; nombre?: string; email?: string; password?: string } = {},
): Promise<IUsuarioPrueba> {
  const doc = await UserModel.create({
    tenantId: new Types.ObjectId(tenantId),
    nombre: opts.nombre ?? 'Usuario',
    email: opts.email ?? `u-${new Types.ObjectId().toString()}@t.com`,
    passwordHash: opts.password ? await bcrypt.hash(opts.password, 4) : 'hash',
    rol: 'admin',
    activo: opts.activo ?? true,
    ...(opts.subrol ? { subrol: opts.subrol } : {}),
  });
  return { id: doc._id.toString(), tenantId, ...(opts.subrol ? { subrol: opts.subrol } : {}) };
}

/** Firma un JWT como el login. `iatOffsetS` permite fecharlo después de una revocación. */
export function tokenDe(u: IUsuarioPrueba, iatOffsetS = 0): string {
  return jwt.sign(
    {
      sub: u.id,
      tenantId: u.tenantId,
      rol: 'admin',
      subrol: u.subrol,
      iat: Math.floor(Date.now() / 1000) + iatOffsetS,
    },
    SECRET,
    { expiresIn: '1h' },
  );
}

export async function crearClienteAsignado(tenantId: string, asesorId: string | null): Promise<string> {
  const doc = await Cliente.create({
    tenantId: new Types.ObjectId(tenantId),
    metaUserId: `wa-${new Types.ObjectId().toString()}`,
    telefono: '3000000000',
    canalOrigen: 'whatsapp',
    estadoComercial: 'nuevo',
    customFields: {},
    ...(asesorId ? { asesorId: new Types.ObjectId(asesorId) } : {}),
  });
  return doc._id.toString();
}

type Metodo = 'get' | 'post' | 'patch';

export function llamar(app: Express, metodo: Metodo, url: string, token: string, body?: object): request.Test {
  const req = request(app)[metodo](url)
    .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF);
  return body ? req.send(body) : req;
}
