import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Cliente Socket.IO único hacia el gateway del backend. El JWT viaja en la cookie httpOnly
 * (`withCredentials`), igual que el `apiClient`. El origen es el del backend
 * (`VITE_API_BASE_URL`); si no está definido, se conecta al mismo origen (proxy de Vite / prod).
 */
export function getSocket(): Socket {
  if (!socket) {
    // En dev, VITE_API_BASE_URL viene vacío → conectamos same-origin (proxy WS de Vite).
    // En prod, apunta al origen del backend. `|| undefined` trata '' como same-origin.
    const origin = (import.meta.env['VITE_API_BASE_URL'] as string | undefined) || undefined;
    socket = io(origin, { withCredentials: true });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
