import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import request from 'supertest';
import type { Express } from 'express';
import { Cliente } from '../cliente/cliente.model.js';
import { UserModel } from './user.model.js';
import type { RolEmpresa } from './user.types.js';

// Utilidades compartidas por los tests de gestión de usuarios (AUTH-03/AUTH-04). No es un test.

export const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const CSRF = 'csrf-de-prueba';

export interface IUsuarioPrueba {
  id: string;
  tenantId: string;
  rolEmpresa: RolEmpresa;
}

export interface OpcionesUsuario {
  /** Por defecto `administrador`. */
  rolEmpresa?: RolEmpresa;
  coordinadorId?: string | null;
  activo?: boolean;
  nombre?: string;
  email?: string;
  password?: string;
}

export async function crearUsuario(tenantId: string, opts: OpcionesUsuario = {}): Promise<IUsuarioPrueba> {
  const rolEmpresa = opts.rolEmpresa ?? 'administrador';
  const doc = await UserModel.create({
    tenantId: new Types.ObjectId(tenantId),
    nombre: opts.nombre ?? 'Usuario',
    email: opts.email ?? `u-${new Types.ObjectId().toString()}@t.com`,
    passwordHash: opts.password ? await bcrypt.hash(opts.password, 4) : 'hash',
    rol: 'admin',
    rolEmpresa,
    coordinadorId: opts.coordinadorId ? new Types.ObjectId(opts.coordinadorId) : null,
    activo: opts.activo ?? true,
  });
  return { id: doc._id.toString(), tenantId, rolEmpresa };
}

/** Firma un JWT como el login. `iatOffsetS` permite fecharlo después de una revocación. */
export function tokenDe(u: IUsuarioPrueba, iatOffsetS = 0): string {
  return jwt.sign(
    {
      sub: u.id,
      tenantId: u.tenantId,
      rol: 'admin',
      rolEmpresa: u.rolEmpresa,
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

type Metodo = 'get' | 'post' | 'patch' | 'put' | 'delete';

export function llamar(app: Express, metodo: Metodo, url: string, token: string, body?: object): request.Test {
  const req = request(app)[metodo](url)
    .set('Cookie', [`token=${token}`, `csrfToken=${CSRF}`])
    .set('X-CSRF-Token', CSRF);
  return body ? req.send(body) : req;
}
