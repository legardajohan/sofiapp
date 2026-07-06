import type { Response } from 'express';
import { env } from '../config/env.js';

const DURATION_UNITS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

function parseDurationToMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) return 8 * 60 * 60 * 1000;
  const [, value, unit] = match as unknown as [string, string, string];
  return Number(value) * DURATION_UNITS[unit]!;
}

function cookieBaseOptions(): {
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  domain?: string;
  path: string;
} {
  return {
    secure: env.NODE_ENV === 'production',
    sameSite: env.COOKIE_SAMESITE,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    path: '/',
  };
}

export function setAuthCookies(res: Response, token: string, csrfToken: string): void {
  const maxAge = parseDurationToMs(env.JWT_EXPIRES_IN);
  const base = cookieBaseOptions();

  res.cookie('token', token, { ...base, httpOnly: true, maxAge });
  res.cookie('csrfToken', csrfToken, { ...base, httpOnly: false, maxAge });
}

export function clearAuthCookies(res: Response): void {
  const base = cookieBaseOptions();

  res.clearCookie('token', { ...base, httpOnly: true });
  res.clearCookie('csrfToken', { ...base, httpOnly: false });
}
