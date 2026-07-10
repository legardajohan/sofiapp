import type { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/** Datos de autenticación que colgamos del socket tras validar el JWT del handshake. */
interface SocketAuth {
  sub: string;
  tenantId: string;
  rol: string;
}

/** Parsea la cabecera `Cookie` cruda del handshake en un mapa nombre→valor. */
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

/**
 * Crea el gateway Socket.IO sobre el servidor HTTP del proceso web. Autentica cada conexión
 * con el mismo JWT (cookie `token`) que las rutas REST y une el socket **solo** a los rooms
 * de su propio `tenantId` y `asesorId`. Un socket nunca recibe eventos de otro tenant.
 */
export function createSocketGateway(server: HttpServer): Server {
  const io = new Server(server, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
  });

  io.use((socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const token = cookies['token'];
    if (!token) {
      next(new Error('No autenticado.'));
      return;
    }
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as Record<string, unknown>;
      const tenantRaw = payload['tenantId'];
      if (!tenantRaw) {
        next(new Error('Token sin tenant.'));
        return;
      }
      const auth: SocketAuth = {
        sub: String(payload['sub']),
        tenantId: String(tenantRaw),
        rol: String(payload['rol']),
      };
      socket.data.auth = auth;
      next();
    } catch {
      next(new Error('Token inválido o expirado.'));
    }
  });

  io.on('connection', (socket) => {
    const auth = socket.data.auth as SocketAuth;
    void socket.join(`tenant:${auth.tenantId}`);
    void socket.join(`asesor:${auth.sub}`);
    logger.info('Socket conectado', { sub: auth.sub, tenantId: auth.tenantId });
  });

  return io;
}
