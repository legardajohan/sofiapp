import type { RequestHandler } from 'express';
import { puedeVerDatosSensibles } from '../../middlewares/authorize-subrol.middleware.js';
import { extractContactData, getContactHistory, updateCliente } from './cliente.service.js';
import type { UpdateClienteDTO } from './cliente.types.js';
import type { HistoryQuery } from './cliente.validation.js';

export const getContactHistoryController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  // `req.validatedQuery`, no `req.query`: en Express 5 `query` es un getter que re-parsea el string
  // crudo, así que perdería la coerción y los defaults que aplicó Zod (page/limit).
  const result = await getContactHistory(
    tenantId,
    id,
    req.validatedQuery as unknown as HistoryQuery,
    puedeVerDatosSensibles(req.user!),
  );
  res.status(200).json(result);
};

export const extractContactDataController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  const datos = await extractContactData(tenantId, id, puedeVerDatosSensibles(req.user!));
  res.status(200).json(datos);
};

export const updateClienteController: RequestHandler = async (req, res) => {
  const tenantId = req.user!.tenantId!.toString();
  const id = req.params['id'] as string;
  // El permiso se resuelve aquí, no en el router: el gate de este endpoint es **por campo** dentro
  // del service, para que un `coordinator` conserve la edición de los campos no sensibles.
  const contacto = await updateCliente(
    tenantId,
    req.user!.sub,
    id,
    req.body as UpdateClienteDTO,
    puedeVerDatosSensibles(req.user!),
  );
  res.status(200).json(contacto);
};
