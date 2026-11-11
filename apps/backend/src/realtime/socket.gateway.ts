import type { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { isTokenRevoked } from '../features/auth/session.service.js';
import { resolverRolEmpresa } from '../features/users/user.rol-empresa.js';
import type { RolEmpresa } from '../features/users/user.types.js';
import { logger } from '../utils/logger.js';
import { suscribirSesionRevocada } from './internal-bus.js';

/** Datos de autenticación que colgamos del socket tras validar el JWT del handshake. */
interface SocketAuth {
  sub: string;
  tenantId: string;
  rol: string;
  /** AUTH-04: traducido igual que en `authenticateJWT`. AUTH-05 lo usará para los rooms por equipo. */
  rolEmpresa: RolEmpresa;
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
        rolEmpresa: resolverRolEmpresa(payload),
      };
      const iat = typeof payload['iat'] === 'number' ? payload['iat'] : undefined;
      // AUTH-03: un JWT revocado tampoco abre socket. La consulta es asíncrona y va fuera del
      // `try` de la verificación para no confundir un fallo de BD con un token inválido.
      isTokenRevoked(auth.tenantId, auth.sub, iat)
        .then((revocado) => {
          if (revocado) {
            next(new Error('Sesión revocada.'));
            return;
          }
          socket.data.auth = auth;
          next();
        })
        .catch((err: unknown) => {
          logger.error('No se pudo comprobar la revocación del socket', { error: String(err) });
          next(new Error('No autenticado.'));
        });
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

/**
 * Corta los sockets vivos de un usuario cuando se revocan sus sesiones (AUTH-03). El room
 * `asesor:<id>` es por usuario, y el `tenantId` del aviso se comprueba contra el de cada socket:
 * un aviso nunca desconecta a nadie de otro tenant.
 */
export function subscribeSessionRevocations(io: Server): void {
  suscribirSesionRevocada(({ tenantId, userId }) => {
    void io
      .in(`asesor:${userId}`)
      .fetchSockets()
      .then((sockets) => {
        for (const s of sockets) {
          const auth = s.data.auth as SocketAuth | undefined;
          if (auth?.tenantId === tenantId) s.disconnect(true);
        }
      })
      .catch((err: unknown) => {
        logger.error('No se pudieron desconectar los sockets revocados', { error: String(err) });
      });
  });
}
