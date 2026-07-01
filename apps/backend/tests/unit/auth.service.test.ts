import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../../src/features/users/user.model.js';
import { login, getProfile } from '../../src/features/auth/auth.service.js';
import { env } from '../../src/config/env.js';

const PASSWORD = 'secret123';

async function createUser(overrides: {
  tenantId: Types.ObjectId | null;
  email: string;
  rol: 'superadmin' | 'admin' | 'coordinador' | 'asesor';
  activo?: boolean;
  nombre?: string;
}) {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  return User.create({
    tenantId: overrides.tenantId,
    nombre: overrides.nombre ?? 'Usuario de prueba',
    email: overrides.email,
    passwordHash,
    rol: overrides.rol,
    activo: overrides.activo ?? true,
  });
}

describe('auth.service — login', () => {
  it('credenciales válidas → devuelve token, csrfToken y session', async () => {
    const tenantId = new Types.ObjectId();
    const user = await createUser({ tenantId, email: 'ana@tenant-a.com', rol: 'admin', nombre: 'Ana Admin' });

    const result = await login('ana@tenant-a.com', PASSWORD);

    expect(result.token).toEqual(expect.any(String));
    expect(result.csrfToken).toEqual(expect.any(String));
    expect(result.session.email).toBe('ana@tenant-a.com');
    expect(result.session.tenantId).toBe(tenantId.toString());
    expect(result.session.sub).toBe((user._id as Types.ObjectId).toString());
  });

  it('password incorrecta → AppError 401', async () => {
    await createUser({ tenantId: new Types.ObjectId(), email: 'x@tenant-a.com', rol: 'admin' });

    await expect(login('x@tenant-a.com', 'wrong-password')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Credenciales inválidas.',
    });
  });

  it('usuario activo=false → AppError 401', async () => {
    await createUser({ tenantId: new Types.ObjectId(), email: 'y@tenant-a.com', rol: 'asesor', activo: false });

    await expect(login('y@tenant-a.com', PASSWORD)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('email inexistente → AppError 401 (mismo mensaje, sin enumeración)', async () => {
    await expect(login('nadie@tenant-a.com', 'lo-que-sea')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Credenciales inválidas.',
    });
  });
});

describe('auth.service — getProfile', () => {
  it('mapea el usuario a ISessionUser', async () => {
    const tenantId = new Types.ObjectId();
    const user = await createUser({ tenantId, email: 'zoe@tenant-a.com', rol: 'coordinador', nombre: 'Zoe' });

    const session = await getProfile((user._id as Types.ObjectId).toString());

    expect(session).toEqual({
      sub: (user._id as Types.ObjectId).toString(),
      nombre: 'Zoe',
      email: 'zoe@tenant-a.com',
      rol: 'coordinador',
      tenantId: tenantId.toString(),
    });
  });

  it('usuario inexistente → AppError 401', async () => {
    await expect(getProfile(new Types.ObjectId().toString())).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('auth.service — aislamiento multi-tenant', () => {
  it('el JWT emitido lleva el tenantId del documento User, nunca uno provisto por el cliente', async () => {
    const tenantId = new Types.ObjectId();
    await createUser({ tenantId, email: 'tenant-user@tenant-a.com', rol: 'admin' });

    // login() solo acepta (email, password): es estructuralmente imposible inyectar un tenantId
    // desde el cliente. El token se firma exclusivamente con el tenantId del documento hallado.
    const { token } = await login('tenant-user@tenant-a.com', PASSWORD);
    const payload = jwt.verify(token, env.JWT_SECRET) as { tenantId: string | null };

    expect(payload.tenantId).toBe(tenantId.toString());
  });

  it('el superadmin (tenantId=null) recibe un token con tenantId=null', async () => {
    await createUser({ tenantId: null, email: 'root@sofiapp.com', rol: 'superadmin' });

    const { token } = await login('root@sofiapp.com', PASSWORD);
    const payload = jwt.verify(token, env.JWT_SECRET) as { tenantId: string | null };

    expect(payload.tenantId).toBeNull();
  });
});
