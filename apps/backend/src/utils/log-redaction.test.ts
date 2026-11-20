import { describe, expect, it } from 'vitest';
import {
  CLAVES_REDACTADAS,
  MARCA_REDACTADO,
  normalizarClave,
  redactar,
  redactarTexto,
} from './log-redaction.js';

const COMO_SE_ESCRIBEN: Record<string, string[]> = {
  authorization: ['authorization', 'Authorization', 'AUTHORIZATION'],
  cookie: ['cookie', 'Cookie'],
  setcookie: ['set-cookie', 'Set-Cookie', 'set_cookie', 'setCookie'],
  password: ['password', 'Password'],
  passwordhash: ['passwordHash', 'password_hash', 'password-hash'],
  token: ['token', 'Token'],
  accesstoken: ['accessToken', 'access_token', 'access-token'],
  refreshtoken: ['refreshToken', 'refresh_token'],
  acceptancetoken: ['acceptance_token', 'acceptanceToken'],
  acceptpersonalauth: ['accept_personal_auth', 'acceptPersonalAuth'],
  secret: ['secret', 'SECRET'],
  apikey: ['apiKey', 'api_key', 'api-key'],
  privatekey: ['privateKey', 'private_key'],
  eventssecret: ['eventsSecret', 'events_secret'],
  integritysecret: ['integritySecret', 'integrity_secret'],
  signature: ['signature', 'Signature'],
  checksum: ['checksum', 'CHECKSUM'],
  xeventchecksum: ['x-event-checksum', 'X-Event-Checksum', 'xEventChecksum'],
  customeremail: ['customer_email', 'customerEmail'],
  email: ['email', 'Email'],
  correo: ['correo'],
  telefono: ['telefono'],
  phone: ['phone'],
  phonenumber: ['phone_number', 'phoneNumber'],
  documento: ['documento'],
  legalid: ['legal_id', 'legalId'],
};

describe('claves redactadas', () => {
  it('la tabla de prueba cubre exactamente la lista del plan', () => {
    expect(new Set(Object.keys(COMO_SE_ESCRIBEN))).toEqual(new Set(CLAVES_REDACTADAS));
  });

  const casos = Object.values(COMO_SE_ESCRIBEN).flat();
  it.each(casos)('%s se redacta a profundidad 1, 3 y dentro de un arreglo', (clave) => {
    expect(redactar({ [clave]: 'x' })).toEqual({ [clave]: MARCA_REDACTADO });
    expect(redactar({ a: { b: { [clave]: 'x' } } })).toEqual({ a: { b: { [clave]: MARCA_REDACTADO } } });
    expect(redactar({ lista: [{ [clave]: 'x' }] })).toEqual({ lista: [{ [clave]: MARCA_REDACTADO }] });
  });

  it('reemplaza el valor entero sea del tipo que sea', () => {
    expect(redactar({ token: { a: 1 } })).toEqual({ token: MARCA_REDACTADO });
    expect(redactar({ phone: 3001234567 })).toEqual({ phone: MARCA_REDACTADO });
  });

  it('normalizarClave quita separadores y pasa a minúsculas', () => {
    expect(normalizarClave('X-Event_Checksum')).toBe('xeventchecksum');
  });

  it('conserva phoneNumberId, key, tokens, reference, tenantId y números', () => {
    const entrada = { phoneNumberId: '123', key: 'media/abc', tokens: 42, reference: 'SOFI-AAAA', tenantId: 't1', n: 7 };
    expect(redactar(entrada)).toEqual(entrada);
  });
});

describe('patrones de valor', () => {
  it.each([
    'prv_test_abc123',
    'prv_prod_abc123',
    'pub_test_abc123',
    'test_events_abc123',
    'prod_integrity_abc123',
    'Bearer abc.def',
    'eyJhbGciOi.eyJzdWIiOiIx.firmaXYZ',
    'persona@correo.com',
  ])('%s dentro de un texto se sustituye y el resto queda igual', (sensible) => {
    const r = redactarTexto(`antes ${sensible} después`);
    expect(r).toBe(`antes ${MARCA_REDACTADO} después`);
    expect(r).not.toContain(sensible);
  });

  it('un texto sin nada sensible queda idéntico', () => {
    expect(redactarTexto('Webhook recibido: 3 mensajes')).toBe('Webhook recibido: 3 mensajes');
  });

  it('también redacta cadenas anidadas en el meta', () => {
    expect(redactar({ detalle: { msg: 'usa prv_test_zzz' } })).toEqual({ detalle: { msg: `usa ${MARCA_REDACTADO}` } });
  });
});

describe('robustez', () => {
  it('referencia circular → [CIRCULAR]', () => {
    const a: Record<string, unknown> = { nombre: 'a' };
    a['yo'] = a;
    expect(redactar(a)).toEqual({ nombre: 'a', yo: '[CIRCULAR]' });
  });

  it('un objeto repetido en ramas hermanas no es circular', () => {
    const compartido = { v: 1 };
    expect(redactar({ x: compartido, y: compartido })).toEqual({ x: { v: 1 }, y: { v: 1 } });
  });

  it('profundidad 12 → [PROFUNDO]', () => {
    let o: Record<string, unknown> = { fin: true };
    for (let i = 0; i < 12; i++) o = { n: o };
    expect(JSON.stringify(redactar(o))).toContain('[PROFUNDO]');
  });

  it('Error → { name, message } redactado y sin stack', () => {
    const r = redactar({ err: new TypeError('falló con prv_test_abc') }) as { err: Record<string, unknown> };
    expect(r.err).toEqual({ name: 'TypeError', message: `falló con ${MARCA_REDACTADO}` });
    expect('stack' in r.err).toBe(false);
  });

  it('no muta la entrada', () => {
    const entrada = { token: 'x', anidado: { email: 'a@b.co', lista: [{ secret: 's' }] } };
    const copia = structuredClone(entrada);
    redactar(entrada);
    expect(entrada).toEqual(copia);
  });

  it('un getter que lanza no hace lanzar a redactar', () => {
    const o = {
      ok: 1,
      get roto(): string {
        throw new Error('boom');
      },
    };
    expect(() => redactar(o)).not.toThrow();
    expect(redactar(o)).toEqual({ ok: 1, roto: MARCA_REDACTADO });
  });

  it('Date, null y booleanos pasan igual', () => {
    const d = new Date();
    expect(redactar({ d, n: null, b: true })).toEqual({ d, n: null, b: true });
  });
});
