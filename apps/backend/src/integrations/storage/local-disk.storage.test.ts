/**
 * El adaptador de disco (HU-OMNI-06). Lo importante no es el round-trip, que es trivial, sino la
 * **guarda de path traversal**: la clave es un identificador que acaba en un `path.join`, y sin ella
 * `GET /api/media/:id` sería una lectura arbitraria del disco del servidor.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { localDiskStorage } from './local-disk.storage.js';
import { construirMediaKey } from './index.js';

const tenantId = '68b0000000000000000000a1';
const messageId = '68b0000000000000000000b2';

async function leerTodo(key: string): Promise<string> {
  const { stream } = await localDiskStorage.leer(key);
  const trozos: Buffer[] = [];
  for await (const t of stream) trozos.push(Buffer.from(t as Buffer));
  return Buffer.concat(trozos).toString('utf8');
}

describe('localDiskStorage (HU-OMNI-06)', () => {
  afterAll(async () => {
    await rm(path.resolve(env.MEDIA_LOCAL_DIR), { recursive: true, force: true });
  });

  it('guarda y devuelve el mismo contenido', async () => {
    const key = construirMediaKey(tenantId, messageId, 'image/png');

    const obj = await localDiskStorage.guardar({
      key,
      contenido: Buffer.from('bytes-de-una-foto'),
      mimeType: 'image/png',
    });

    expect(obj.key).toBe(key);
    expect(obj.tamanoBytes).toBe(17);
    expect(await leerTodo(key)).toBe('bytes-de-una-foto');
  });

  it('crea los directorios intermedios que la clave implique', async () => {
    const key = `${tenantId}/sub/otra/mas/archivo.txt`;

    await expect(
      localDiskStorage.guardar({ key, contenido: Buffer.from('x'), mimeType: 'text/plain' }),
    ).resolves.toMatchObject({ key });
  });

  it('una clave con `../` no escapa del directorio de media', async () => {
    await expect(localDiskStorage.leer('../../../etc/passwd')).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      localDiskStorage.guardar({
        key: `${tenantId}/../../fuera.txt`,
        contenido: Buffer.from('x'),
        mimeType: 'text/plain',
      }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(localDiskStorage.eliminar('..')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('un directorio hermano con el mismo prefijo tampoco pasa', async () => {
    // `/tmp/sofiapp-test-media-privado` empieza por la base pero NO está dentro. Comparar contra
    // `base` a secas, sin el separador, dejaría pasar exactamente este caso.
    const hermano = `${path.basename(path.resolve(env.MEDIA_LOCAL_DIR))}-privado/secreto.txt`;

    await expect(localDiskStorage.leer(`../${hermano}`)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('una clave inexistente da 404, no una excepción de `fs`', async () => {
    await expect(localDiskStorage.leer(`${tenantId}/${messageId}/no-existe.png`)).rejects.toMatchObject(
      { statusCode: 404 },
    );
  });

  it('no sabe firmar: devuelve null para que el controller sirva el stream', async () => {
    expect(await localDiskStorage.urlFirmada('cualquier/clave.png')).toBeNull();
  });

  it('eliminar es idempotente: borrar algo que no está no falla', async () => {
    const key = construirMediaKey(tenantId, messageId, 'image/png');
    await localDiskStorage.guardar({ key, contenido: Buffer.from('a'), mimeType: 'image/png' });

    await localDiskStorage.eliminar(key);
    await expect(localDiskStorage.eliminar(key)).resolves.toBeUndefined();
    await expect(localDiskStorage.leer(key)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('la clave construida empieza por el tenantId y lleva la extensión del mime', () => {
    const key = construirMediaKey(tenantId, messageId, 'application/pdf');

    expect(key.startsWith(`${tenantId}/`)).toBe(true);
    expect(key).toContain(`/${messageId}/`);
    expect(key.endsWith('.pdf')).toBe(true);
  });

  it('un mime desconocido cae a `.bin` en vez de inventarse una extensión', () => {
    expect(construirMediaKey(tenantId, messageId, 'application/x-raro').endsWith('.bin')).toBe(true);
  });

  it('HU-OMNI-07: con rango devuelve solo esos bytes y el tamaño del objeto completo', async () => {
    const key = construirMediaKey(tenantId, messageId, 'audio/ogg');
    await localDiskStorage.guardar({
      key,
      contenido: Buffer.from('0123456789'),
      mimeType: 'audio/ogg',
    });

    const { stream, tamanoBytes } = await localDiskStorage.leer(key, { inicio: 2, fin: 5 });
    const trozos: Buffer[] = [];
    for await (const t of stream) trozos.push(Buffer.from(t as Buffer));

    expect(Buffer.concat(trozos).toString('utf8')).toBe('2345');
    expect(tamanoBytes).toBe(10);
  });
});

