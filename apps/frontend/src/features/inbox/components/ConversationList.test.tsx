import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders } from 'axios';
import { ConversationList } from './ConversationList.js';
import { errorMessage } from '../lib/errors.js';
import type { ConversationDTO } from '../types.js';

const noop = (): void => {};

function makeConversation(overrides: Partial<ConversationDTO> = {}): ConversationDTO {
  return {
    id: 'c-1',
    nombre: 'María Fernanda Gómez',
    telefono: '573001112233',
    canalOrigen: 'whatsapp',
    ultimoMensajeAt: '2026-07-26T18:00:00.000Z',
    preview: 'Hola, quisiera información.',
    noLeidos: 0,
    asesorId: null,
    iaHabilitada: false,
    ventana24hAbierta: true,
    estadoComercial: 'nuevo',
    ...overrides,
  };
}

/** Construye un AxiosError como el que produce una respuesta de error del backend. */
function apiError(status: number, message?: string): AxiosError {
  const err = new AxiosError('Request failed');
  err.response = {
    status,
    statusText: '',
    data: message === undefined ? {} : { message },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  return err;
}

describe('ConversationList — un fallo nunca se pinta como bandeja vacía', () => {
  it('muestra el estado vacío cuando la carga fue bien y no hay conversaciones', () => {
    render(
      <ConversationList
        conversations={[]}
        activeId={null}
        onSelect={noop}
        isLoading={false}
        error={null}
        onRetry={noop}
      />,
    );
    expect(screen.getByText('Bandeja vacía')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con error muestra la alerta y NO el estado vacío, aunque la lista venga vacía', () => {
    render(
      <ConversationList
        conversations={[]}
        activeId={null}
        onSelect={noop}
        isLoading={false}
        error="Error de validación."
        onRetry={noop}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Error de validación.')).toBeInTheDocument();
    expect(screen.queryByText('Bandeja vacía')).not.toBeInTheDocument();
  });

  it('el error tiene prioridad sobre datos ya cacheados', () => {
    render(
      <ConversationList
        conversations={[makeConversation()]}
        activeId={null}
        onSelect={noop}
        isLoading={false}
        error="No hay conexión con el servidor."
        onRetry={noop}
      />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('María Fernanda Gómez')).not.toBeInTheDocument();
  });

  it('el botón Reintentar dispara el refetch', async () => {
    const onRetry = vi.fn();
    render(
      <ConversationList
        conversations={[]}
        activeId={null}
        onSelect={noop}
        isLoading={false}
        error="HTTP 500"
        onRetry={onRetry}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('mientras carga no muestra ni vacío ni error', () => {
    render(
      <ConversationList
        conversations={[]}
        activeId={null}
        onSelect={noop}
        isLoading
        error={null}
        onRetry={noop}
      />,
    );
    expect(screen.queryByText('Bandeja vacía')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('errorMessage — el motivo real llega a la UI', () => {
  it('prefiere el message del backend', () => {
    // Es el 400 real que devolvía la bandeja por el `body` requerido en Express 5.
    expect(errorMessage(apiError(400, 'Error de validación.'), 'fallback')).toBe('Error de validación.');
  });

  it('cae al fallback con el código HTTP cuando la respuesta no trae message', () => {
    expect(errorMessage(apiError(500), 'No se pudieron cargar las conversaciones.')).toBe(
      'No se pudieron cargar las conversaciones. (HTTP 500)',
    );
  });

  it('distingue un fallo de red de un error del servidor', () => {
    expect(errorMessage(new AxiosError('Network Error'), 'fallback')).toBe(
      'No hay conexión con el servidor.',
    );
  });

  it('usa el fallback ante un error que no es de axios', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('fallback');
  });
});
