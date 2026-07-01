import type { RequestHandler } from 'express';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

function isPublicPath(path: string): boolean {
  return path === '/api/auth/login' || path.startsWith('/api/webhooks/');
}

export const csrfGuard: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.includes(req.method) || isPublicPath(req.path)) {
    next();
    return;
  }

  const header = req.get('X-CSRF-Token');
  const cookie = req.cookies?.csrfToken as string | undefined;

  if (!header || !cookie || header !== cookie) {
    res.status(403).json({ message: 'CSRF token inválido.' });
    return;
  }

  next();
};
