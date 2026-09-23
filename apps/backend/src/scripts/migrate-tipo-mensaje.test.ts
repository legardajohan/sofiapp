/**
 * La migración del enum de `Message.tipo` a español (HU-OMNI-06).
 *
 * Lo que hay que garantizar es que convierta los seis valores del enum anterior, que sea
 * **idempotente** —correrla dos veces no puede tocar nada la segunda— y que `--dry-run` no escriba.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { migrarTiposMensaje } from './migrate-tipo-mensaje.js';
import { Message } from '../features/message/message.model.js';

const tenantId = new Types.ObjectId();
const clienteId = new Types.ObjectId();

/**
 * Siembra por la colección cruda a propósito: el schema ya no acepta algunos de estos valores en la
 * fase `contract`, y lo que se está probando es precisamente la migración de documentos que el
 * modelo actual no podría escribir.
 */
async function sembrar(tipo: string, texto = 'hola'): Promise<Types.ObjectId> {
  const _id = new Types.ObjectId();
  await Message.collection.insertOne({
    _id,
    tenantId,
    clienteId,
    canal: 'whatsapp',
    direccion: 'inbound',
    sender: 'user',
    tipo,
    texto,
    status: 'sent',
    createdAt: new Date(),
  } as unknown as Parameters<typeof Message.collection.insertOne>[0]);
  return _id;
}

async function tipoDe(_id: Types.ObjectId): Promise<string | undefined> {
  const doc = await Message.collection.findOne({ _id });
  return doc?.['tipo'] as string | undefined;
}

describe('migrarTiposMensaje — enum de Message.tipo a español (HU-OMNI-06)', () => {
  beforeEach(async () => {
    await Message.collection.deleteMany({});
  });

  it('convierte los cinco valores que cambian de nombre', async () => {
    const ids = {
      text: await sembrar('text'),
      image: await sembrar('image'),
      document: await sembrar('document'),
      template: await sembrar('template'),
      other: await sembrar('other'),
    };

    expect(await migrarTiposMensaje()).toBe(5);

    expect(await tipoDe(ids.text)).toBe('texto');
    expect(await tipoDe(ids.image)).toBe('imagen');
    expect(await tipoDe(ids.document)).toBe('documento');
    expect(await tipoDe(ids.template)).toBe('plantilla');
    expect(await tipoDe(ids.other)).toBe('otro');
  });

  it('deja `audio` intacto: se escribe igual en los dos idiomas', async () => {
    const id = await sembrar('audio');

    expect(await migrarTiposMensaje()).toBe(0);

    expect(await tipoDe(id)).toBe('audio');
  });

  it('es idempotente: la segunda corrida no modifica nada', async () => {
    await sembrar('text');
    await sembrar('image');

    expect(await migrarTiposMensaje()).toBe(2);
    // La clave del despliegue: si la segunda corrida tocara documentos, relanzar el script tras un
    // fallo a medias sería peligroso en vez de trivial.
    expect(await migrarTiposMensaje()).toBe(0);
  });

  it('no toca los que ya están en español', async () => {
    const id = await sembrar('texto');

    expect(await migrarTiposMensaje()).toBe(0);

    expect(await tipoDe(id)).toBe('texto');
  });

  it('--dry-run informa el alcance pero no escribe', async () => {
    const id = await sembrar('text');

    expect(await migrarTiposMensaje(true)).toBe(1);
    expect(await tipoDe(id)).toBe('text');

    // Y tras la simulación, la migración real sigue teniendo trabajo que hacer.
    expect(await migrarTiposMensaje()).toBe(1);
    expect(await tipoDe(id)).toBe('texto');
  });

  it('migra documentos de todos los tenants, no solo de uno', async () => {
    const otroTenant = new Types.ObjectId();
    const propio = await sembrar('text');
    const ajeno = new Types.ObjectId();
    await Message.collection.insertOne({
      _id: ajeno,
      tenantId: otroTenant,
      clienteId,
      canal: 'whatsapp',
      direccion: 'inbound',
      sender: 'user',
      tipo: 'text',
      texto: 'de otra empresa',
      status: 'sent',
      createdAt: new Date(),
    } as unknown as Parameters<typeof Message.collection.insertOne>[0]);

    // Cross-tenant a propósito: es mantenimiento de datos, no una operación de usuario. Si filtrara
    // por tenant, las demás empresas se quedarían con el enum viejo para siempre.
    expect(await migrarTiposMensaje()).toBe(2);

    expect(await tipoDe(propio)).toBe('texto');
    expect(await tipoDe(ajeno)).toBe('texto');
  });
});
