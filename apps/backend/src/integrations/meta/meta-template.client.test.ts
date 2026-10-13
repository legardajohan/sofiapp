import { describe, it, expect, vi, afterEach } from 'vitest';
import { env } from '../../config/env.js';
import { mapearErrorPlantilla, metaTemplateClient } from './meta-template.client.js';

/** HT-WA-04 — Resumable Upload y traducción de errores de Meta, con `fetch` simulado. */

function respuesta(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const ACCESS_TOKEN = 'test-token';
const WABA_ID = 'waba-1';

describe('metaTemplateClient.list — paginación por cursor', () => {
  it('recorre todas las páginas de paging.next hasta agotarla', async () => {
    const paginaUno = {
      data: [{ id: 't1', name: 'uno', language: 'es', category: 'UTILITY', status: 'APPROVED', components: [] }],
      paging: { next: 'https://graph.facebook.com/v26.0/waba-1/message_templates?after=CURSOR' },
    };
    const paginaDos = {
      data: [{ id: 't2', name: 'dos', language: 'es', category: 'MARKETING', status: 'PENDING', components: [] }],
      // sin paging.next: última página
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(paginaUno) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(paginaDos) } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const resultado = await metaTemplateClient.list(WABA_ID, ACCESS_TOKEN);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resultado.map((t) => t.id)).toEqual(['t1', 't2']);
    // La segunda llamada usa la URL exacta de `paging.next`.
    expect(fetchMock.mock.calls[1]?.[0]).toBe(paginaUno.paging.next);
  });
});

describe('metaTemplateClient.subirMuestra (Resumable Upload)', () => {
  it('abre la sesión en la app y sube los bytes desde el offset 0 con cabecera OAuth', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respuesta(200, { id: 'upload:abc' }))
      .mockResolvedValueOnce(respuesta(200, { h: 'handle-xyz' }));
    vi.stubGlobal('fetch', fetchMock);
    const buffer = Buffer.from('png');

    const resultado = await metaTemplateClient.subirMuestra('tok', { buffer, mimeType: 'image/png' });

    expect(resultado).toEqual({ headerHandle: 'handle-xyz' });
    const [urlSesion, initSesion] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(urlSesion).toContain(`/${env.META_APP_ID}/uploads?`);
    expect(urlSesion).toContain('file_length=3');
    expect(urlSesion).toContain('file_type=image%2Fpng');
    expect(initSesion.method).toBe('POST');

    const [urlBytes, initBytes] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(urlBytes).toMatch(/\/upload:abc$/);
    expect(initBytes.headers).toMatchObject({ Authorization: 'OAuth tok', file_offset: '0' });
  });

  it('si Meta rechaza la imagen → 422 legible, sin el texto crudo de la Graph API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        respuesta(400, { error: { message: 'Invalid image file type', code: 100 } }),
      ),
    );

    await expect(
      metaTemplateClient.subirMuestra('tok', { buffer: Buffer.from('x'), mimeType: 'image/png' }),
    ).rejects.toMatchObject({ statusCode: 422, details: { reason: 'imagen_invalida' } });
  });
});

describe('mapearErrorPlantilla', () => {
  it('nombre/idioma duplicado → 409', () => {
    expect(
      mapearErrorPlantilla(400, { code: 100, error_subcode: 2_388_024, message: 'x' }),
    ).toMatchObject({ statusCode: 409 });
    expect(
      mapearErrorPlantilla(400, { message: 'Content in this language already exists' }),
    ).toMatchObject({ statusCode: 409 });
  });

  it('límite de plantillas → 422 con su motivo', () => {
    expect(
      mapearErrorPlantilla(400, { message: 'Message template limit reached for this WABA' }),
    ).toMatchObject({ statusCode: 422, details: { reason: 'limite_plantillas' } });
  });

  it('otro 4xx → 422 genérico; 5xx o sin cuerpo → 502', () => {
    expect(mapearErrorPlantilla(400, { message: 'Invalid parameter' })).toMatchObject({
      statusCode: 422,
      details: { reason: 'plantilla_invalida' },
    });
    expect(mapearErrorPlantilla(503, undefined)).toMatchObject({ statusCode: 502 });
  });
});
