/**
 * El cuerpo que se manda a Graph para la media saliente. Lo que importa de HU-OMNI-07: el audio
 * lleva `voice: true` cuando es nota de voz y **nunca** lleva `caption` (Meta responde 400).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { metaWhatsAppClient } from './meta-whatsapp.client.js';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(
    new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function cuerpoEnviado(): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('metaWhatsAppClient.sendMedia — audio (HU-OMNI-07)', () => {
  it('una nota de voz sale como `type: audio` con `voice: true`', async () => {
    await metaWhatsAppClient.sendMedia('573001', 'audio', 'media-1', { esNotaDeVoz: true }, 'ph', 'tok');

    expect(cuerpoEnviado()).toMatchObject({ type: 'audio', audio: { id: 'media-1', voice: true } });
  });

  it('el caption se descarta en el audio aunque el llamador lo mande', async () => {
    await metaWhatsAppClient.sendMedia(
      '573001',
      'audio',
      'media-1',
      { caption: 'hola', filename: 'x.ogg', esNotaDeVoz: true },
      'ph',
      'tok',
    );

    const audio = cuerpoEnviado()['audio'] as Record<string, unknown>;
    expect(audio).not.toHaveProperty('caption');
    expect(audio).not.toHaveProperty('filename');
  });

  it('un audio que no es nota de voz no lleva el flag', async () => {
    await metaWhatsAppClient.sendMedia('573001', 'audio', 'media-1', {}, 'ph', 'tok');

    expect(cuerpoEnviado()['audio']).toEqual({ id: 'media-1' });
  });

  it('una imagen conserva su caption (no se rompe HU-OMNI-06)', async () => {
    await metaWhatsAppClient.sendMedia('573001', 'imagen', 'media-2', { caption: 'mira' }, 'ph', 'tok');

    expect(cuerpoEnviado()['image']).toEqual({ id: 'media-2', caption: 'mira' });
  });
});
