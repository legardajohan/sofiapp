import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { metaTemplateClient } from './meta-template.client.js';

const ACCESS_TOKEN = 'test-token';
const WABA_ID = 'waba-1';

describe('metaTemplateClient.list — paginación por cursor', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recorre todas las páginas de paging.next hasta agotarla', async () => {
    const paginaUno = {
      data: [{ id: 't1', name: 'uno', language: 'es', category: 'UTILITY', status: 'APPROVED', components: [] }],
      paging: { next: 'https://graph.facebook.com/v26.0/waba-1/message_templates?after=CURSOR' },
    };
    const paginaDos = {
      data: [{ id: 't2', name: 'dos', language: 'es', category: 'MARKETING', status: 'PENDING', components: [] }],
      // sin paging.next: última página
    };

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(paginaUno) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(paginaDos) } as Response);

    const resultado = await metaTemplateClient.list(WABA_ID, ACCESS_TOKEN);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resultado.map((t) => t.id)).toEqual(['t1', 't2']);
    // La segunda llamada usa la URL exacta de `paging.next`.
    expect(fetchMock.mock.calls[1]?.[0]).toBe(paginaUno.paging.next);
  });
});
