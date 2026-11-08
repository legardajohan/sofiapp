import type { RequestHandler } from 'express';
import {
  avanzarEspera,
  enviarMensajePrueba,
  obtenerSesion,
  reiniciarSesion,
  seleccionarFlujo,
} from './sandbox.service.js';
import type { SelectFlowBody, SendMessageBody } from './sandbox.validation.js';

// `tenantId` y `userId` salen SIEMPRE del token: ningún endpoint del chat de prueba recibe un
// `clienteId`, así que un admin no tiene forma de apuntar a la sesión de otro.

export const getSessionController: RequestHandler = async (req, res) => {
  const { tenantId, sub } = req.user!;
  res.status(200).json(await obtenerSesion(tenantId!.toString(), sub));
};

export const sendMessageController: RequestHandler = async (req, res) => {
  const { tenantId, sub } = req.user!;
  const { texto } = req.body as SendMessageBody;
  const { mensaje } = await enviarMensajePrueba(tenantId!.toString(), sub, texto);
  // 202: el mensaje quedó guardado; la respuesta de Sofi o del flujo llega por socket.
  res.status(202).json({ message: mensaje });
};

export const selectFlowController: RequestHandler = async (req, res) => {
  const { tenantId, sub } = req.user!;
  const { flowId } = req.body as SelectFlowBody;
  res.status(200).json(await seleccionarFlujo(tenantId!.toString(), sub, flowId));
};

export const resetSessionController: RequestHandler = async (req, res) => {
  const { tenantId, sub } = req.user!;
  res.status(200).json(await reiniciarSesion(tenantId!.toString(), sub));
};

export const advanceWaitController: RequestHandler = async (req, res) => {
  const { tenantId, sub } = req.user!;
  await avanzarEspera(tenantId!.toString(), sub);
  res.status(202).end();
};
