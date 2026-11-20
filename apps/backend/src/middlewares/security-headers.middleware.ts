import type { RequestHandler } from 'express';
import helmet from 'helmet';

// Cabeceras de seguridad de la API (HT-PAY-05). Es el PRIMER middleware de `app.ts`, así que
// también cubre errores de CORS y de parseo.
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  // La media se pide como <img> desde otro origen (y redirige a Spaces): el valor por defecto de
  // helmet (`same-origin`) la rompería.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  // 180 días. `includeSubDomains`/`preload` los decide Cloudflare/Nginx, no la API.
  hsts: { maxAge: 15_552_000, includeSubDomains: false, preload: false },
  referrerPolicy: { policy: 'no-referrer' },
});
