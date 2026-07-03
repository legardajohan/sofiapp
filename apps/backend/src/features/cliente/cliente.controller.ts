import type { RequestHandler } from 'express';

export const placeholderController: RequestHandler = (_req, res) => {
  res.status(501).json({ message: 'No implementado aún.' });
};
