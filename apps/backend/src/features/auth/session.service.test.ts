import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import request from 'supertest';

vi.mock('../../realtime/realtime.publisher.js', () => ({ publishRealtime: vi.fn(), subscribeRealtime: vi.fn() }));

const { isTokenRevoked, revokeUserSessions } = await import('./session.service.js');
const { default: app } = await import('../../app.js');

const SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('session.service — revocación de sesiones (AUTH-03)', () => {
  const tenantId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const ahoraS = (): number => Math.floor(Date.now() / 1000);

  it('sin revocación → el token es válido', async () => {
    expect(await isTokenRevoked(tenantId, userId, ahoraS())).toBe(false);
  });

  it('token emitido antes (o en el mismo segundo) de la revocación → revocado', async () => {
    const iat = ahoraS();
    await revokeUserSessions(tenantId, userId);
    expect(await isTokenRevoked(tenantId, userId, iat)).toBe(true);
    expect(await isTokenRevoked(tenantId, userId, iat - 60)).toBe(true);
  });

  it('token emitido después de la revocación → válido', async () => {
    await revokeUserSessions(tenantId, userId);
    expect(await isTokenRevoked(tenantId, userId, ahoraS() + 5)).toBe(false);
  });

  it('revocar es idempotente (un documento por usuario)', async () => {
    const { SessionRevocation } = await import('./session-revocation.model.js');
    await revokeUserSessions(tenantId, userId);
    await revokeUserSessions(tenantId, userId);
    expect(await SessionRevocation.countDocuments({ userId })).toBe(1);
  });

  describe('authenticateJWT', () => {
    const firmar = (iat: number, tenant: string | null = tenantId, rol = 'admin'): string =>
      jwt.sign({ sub: userId, tenantId: tenant, rol, iat }, SECRET, { expiresIn: '1h' });

    it('JWT revocado → 401 "Sesión revocada."', async () => {
      const t = firmar(ahoraS());
      await revokeUserSessions(tenantId, userId);
      const res = await request(app).get('/api/users').set('Cookie', `token=${t}`);
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Sesión revocada.');
    });

    it('JWT emitido tras la revocación → pasa la autenticación', async () => {
      await revokeUserSessions(tenantId, userId);
      const res = await request(app).get('/api/users').set('Cookie', `token=${firmar(ahoraS() + 5)}`);
      expect(res.status).toBe(200);
    });

    it('superadmin (sin tenant) no consulta revocaciones', async () => {
      const res = await request(app).get('/api/auth/me').set('Cookie', `token=${firmar(ahoraS(), null, 'superadmin')}`);
      // /me responde 401 porque el usuario no existe en BD, pero NO por revocación.
      expect(res.body.message).not.toBe('Sesión revocada.');
    });
  });
});
