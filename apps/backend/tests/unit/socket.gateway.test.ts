import http from 'http';
import type { AddressInfo } from 'net';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { io as ioClient, type Socket } from 'socket.io-client';
import type { Server } from 'socket.io';
import { createSocketGateway } from '../../src/realtime/socket.gateway.js';
import { env } from '../../src/config/env.js';

function sign(tenantId: string): string {
  return jwt.sign(
    { sub: new Types.ObjectId().toString(), tenantId, rol: 'asesor' },
    env.JWT_SECRET,
  );
}

describe('socket.gateway — auth y aislamiento por tenant', () => {
  let server: http.Server;
  let gateway: Server;
  let url: string;
  const tenantA = new Types.ObjectId().toString();
  const tenantB = new Types.ObjectId().toString();

  beforeAll(async () => {
    server = http.createServer();
    gateway = createSocketGateway(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    url = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await gateway.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function connect(cookie?: string): Socket {
    return ioClient(url, {
      transports: ['websocket'],
      extraHeaders: cookie ? { Cookie: cookie } : {},
      reconnection: false,
    });
  }

  it('rechaza el handshake sin JWT', async () => {
    const socket = connect();
    const err = await new Promise<Error>((resolve) => {
      socket.on('connect_error', (e) => resolve(e));
    });
    expect(err.message).toBeTruthy();
    socket.close();
  });

  it('un socket de tenantB no recibe un evento emitido al room de tenantA', async () => {
    const a = connect(`token=${sign(tenantA)}`);
    const b = connect(`token=${sign(tenantB)}`);

    await Promise.all([
      new Promise<void>((res) => a.on('connect', () => res())),
      new Promise<void>((res) => b.on('connect', () => res())),
    ]);

    let bGotIt = false;
    b.on('message:new', () => {
      bGotIt = true;
    });

    const aReceived = new Promise<boolean>((resolve) => {
      a.on('message:new', () => resolve(true));
      setTimeout(() => resolve(false), 600);
    });

    // Respiro para asegurar que los joins de los rooms se completaron en el servidor.
    await new Promise((r) => setTimeout(r, 80));
    gateway.to(`tenant:${tenantA}`).emit('message:new', { conversationId: 'x' });

    expect(await aReceived).toBe(true);
    expect(bGotIt).toBe(false);

    a.close();
    b.close();
  });
});
