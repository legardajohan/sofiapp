import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthStore } from '@/stores/authStore';
import { enviarLatido } from '../api.js';
import { HEARTBEAT_MS, IDLE_MS, useActivityHeartbeat } from './useActivityHeartbeat.js';

vi.mock('../api.js', () => ({ enviarLatido: vi.fn() }));

const mockLatido = vi.mocked(enviarLatido);
let visibilidad: DocumentVisibilityState = 'visible';

function setVisibilidad(v: DocumentVisibilityState): void {
  visibilidad = v;
  document.dispatchEvent(new Event('visibilitychange'));
}

function loguear(rol: 'admin' | 'superadmin'): void {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'u1', nombre: 'Ana', email: 'a@a.co', rol } as never,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockLatido.mockResolvedValue();
  visibilidad = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilidad);
  loguear('admin');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useActivityHeartbeat — HU-REP-06', () => {
  it('con la pestaña visible y en uso late cada intervalo, nunca por adelantado', () => {
    renderHook(() => useActivityHeartbeat());
    expect(mockLatido).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(HEARTBEAT_MS));
    expect(mockLatido).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(HEARTBEAT_MS));
    expect(mockLatido).toHaveBeenCalledTimes(2);
  });

  it('sin interacción durante IDLE_MS deja de latir, y vuelve al interactuar', () => {
    renderHook(() => useActivityHeartbeat());
    act(() => vi.advanceTimersByTime(IDLE_MS + HEARTBEAT_MS));
    const antes = mockLatido.mock.calls.length;

    act(() => vi.advanceTimersByTime(3 * HEARTBEAT_MS));
    expect(mockLatido).toHaveBeenCalledTimes(antes);

    act(() => {
      window.dispatchEvent(new Event('keydown'));
      vi.advanceTimersByTime(HEARTBEAT_MS);
    });
    expect(mockLatido).toHaveBeenCalledTimes(antes + 1);
  });

  it('con la pestaña oculta no late', () => {
    renderHook(() => useActivityHeartbeat());
    act(() => setVisibilidad('hidden'));
    act(() => vi.advanceTimersByTime(5 * HEARTBEAT_MS));
    expect(mockLatido).not.toHaveBeenCalled();
  });

  it('al volver a la pestaña reinicia el ciclo: el primer latido sale un intervalo después', () => {
    renderHook(() => useActivityHeartbeat());
    act(() => setVisibilidad('hidden'));
    act(() => vi.advanceTimersByTime(10 * HEARTBEAT_MS));

    act(() => setVisibilidad('visible'));
    expect(mockLatido).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(HEARTBEAT_MS));
    expect(mockLatido).toHaveBeenCalledTimes(1);
  });

  it('el superadmin no late', () => {
    loguear('superadmin');
    renderHook(() => useActivityHeartbeat());
    act(() => vi.advanceTimersByTime(3 * HEARTBEAT_MS));
    expect(mockLatido).not.toHaveBeenCalled();
  });

  it('al desmontar (logout) deja de latir', () => {
    const { unmount } = renderHook(() => useActivityHeartbeat());
    unmount();
    act(() => vi.advanceTimersByTime(3 * HEARTBEAT_MS));
    expect(mockLatido).not.toHaveBeenCalled();
  });

  it('un latido fallido no rompe nada', () => {
    mockLatido.mockRejectedValue(new Error('red caída'));
    renderHook(() => useActivityHeartbeat());
    expect(() => act(() => vi.advanceTimersByTime(2 * HEARTBEAT_MS))).not.toThrow();
    expect(mockLatido).toHaveBeenCalledTimes(2);
  });
});
