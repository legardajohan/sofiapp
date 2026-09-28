/**
 * Nota: TanStack Query v5 pasa un segundo argumento (el contexto) a `mutationFn`, por eso los
 * asserts miran `mock.calls[0][0]` en vez de `toHaveBeenCalledWith`.
 *
 * HT-WA-03 en pantalla: la invitación a conectar, el Embedded Signup completo (code + ids por
 * `postMessage`), el PIN solo cuando Meta lo pide, y que cerrar el popup no se trate como error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { ChannelConfigPage } from './ChannelConfigPage.js';
import type { IChannelStatusResponse } from './api.js';

const { mockStatus, mockSignup, mockActivate, mockLogin } = vi.hoisted(() => ({
  mockStatus: vi.fn(),
  mockSignup: vi.fn(),
  mockActivate: vi.fn(),
  mockLogin: vi.fn(),
}));

vi.mock('./api.js', () => ({
  getWhatsAppStatus: mockStatus,
  connectEmbeddedSignup: mockSignup,
  activateWhatsApp: mockActivate,
  connectWhatsApp: vi.fn(),
}));

vi.mock('@/lib/facebook-sdk', () => ({
  getMetaSignupConfig: () => ({ appId: 'app', configId: 'cfg', graphVersion: 'v26.0' }),
  loadFacebookSdk: () => Promise.resolve({ init: vi.fn(), login: mockLogin }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function axiosError(status: number, data: Record<string, unknown>): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError('fallo', undefined, { headers }, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers },
    data,
  });
}

const CONECTADO: IChannelStatusResponse = {
  activo: true,
  phoneNumberId: 'phone-1',
  wabaId: 'waba-1',
  displayPhoneNumber: '+57 300 111 2233',
  verifiedName: 'Acme',
  messagingTier: 'TIER_1K',
  qualityRating: 'GREEN',
  tierSyncedAt: null,
  tierManual: false,
};

function metaMessage(event: string, data: Record<string, string> = {}): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://www.facebook.com',
        data: JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event, data }),
      }),
    );
  });
}

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ChannelConfigPage />
    </QueryClientProvider>,
  );
}

async function pulsarConectar(): Promise<void> {
  const boton = await screen.findByRole('button', { name: /conectar con facebook/i });
  await waitFor(() => expect(boton).toBeEnabled());
  await userEvent.click(boton);
}

describe('ChannelConfigPage (HT-WA-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStatus.mockRejectedValue(axiosError(404, { message: 'No hay canal' }));
    mockSignup.mockResolvedValue(CONECTADO);
    mockActivate.mockResolvedValue(CONECTADO);
    // El popup "termina": entrega el code como lo hace el SDK real.
    mockLogin.mockImplementation((cb: (r: { authResponse: { code: string } }) => void) => {
      cb({ authResponse: { code: 'code-1' } });
    });
  });

  it('sin canal invita a conectar en vez de mostrar un error', async () => {
    renderPage();

    expect(await screen.findByText('Conecta tu WhatsApp Business')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('junta el code y los ids de Meta, los envía y muestra el número conectado', async () => {
    renderPage();
    await pulsarConectar();

    // Sin los ids todavía no se envía nada: el code solo no basta.
    expect(mockSignup).not.toHaveBeenCalled();

    mockStatus.mockResolvedValue(CONECTADO);
    metaMessage('FINISH', { waba_id: 'waba-1', phone_number_id: 'phone-1' });

    await waitFor(() =>
      expect(mockSignup.mock.calls[0]?.[0]).toEqual({
        code: 'code-1',
        wabaId: 'waba-1',
        phoneNumberId: 'phone-1',
      }),
    );
    expect(await screen.findByText('+57 300 111 2233')).toBeInTheDocument();
    expect(screen.getByText('Conectado')).toBeInTheDocument();
  });

  it('ignora mensajes que no vienen de Facebook', async () => {
    renderPage();
    await pulsarConectar();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://evil.example',
          data: JSON.stringify({
            type: 'WA_EMBEDDED_SIGNUP',
            event: 'FINISH',
            data: { waba_id: 'x', phone_number_id: 'y' },
          }),
        }),
      );
    });

    expect(mockSignup).not.toHaveBeenCalled();
  });

  it('pide el PIN solo cuando Meta lo exige, y lo envía', async () => {
    mockSignup.mockRejectedValue(axiosError(422, { message: 'PIN', reason: 'pin_required' }));
    renderPage();
    await pulsarConectar();
    metaMessage('FINISH', { waba_id: 'waba-1', phone_number_id: 'phone-1' });

    const campo = await screen.findByLabelText(/pin de verificación/i);
    await userEvent.type(campo, '123456');
    await userEvent.click(screen.getByRole('button', { name: /activar número/i }));

    await waitFor(() => expect(mockActivate.mock.calls[0]?.[0]).toBe('123456'));
  });

  it('cerrar el popup vuelve al inicio sin mostrar un error', async () => {
    mockLogin.mockImplementation(() => undefined);
    renderPage();
    await pulsarConectar();

    metaMessage('CANCEL', { current_step: 'PHONE_NUMBER_SETUP' });

    await waitFor(() => expect(screen.getByRole('button', { name: /conectar con facebook/i })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un canal a medio activar ofrece terminar la activación', async () => {
    mockStatus.mockResolvedValue({ ...CONECTADO, activo: false });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /terminar activación/i }));

    await waitFor(() => expect(mockActivate).toHaveBeenCalledTimes(1));
    expect(mockActivate.mock.calls[0]?.[0]).toBeUndefined();
  });
});
