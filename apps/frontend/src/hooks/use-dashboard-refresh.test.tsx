import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager, useQuery } from '@tanstack/react-query';
import { DASHBOARD_REFRESH_MS, dashboardAutoRefresh, useDashboardRefresh } from './use-dashboard-refresh.js';

const KEY = ['tablero', 'prueba'] as const;
const MIN = 60 * 1000;

/** Un tablero mínimo: la query con las opciones compartidas + el hook del botón. */
function montar(queryFn: () => Promise<number>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => {
      const query = useQuery({ queryKey: [...KEY, { p: 1 }], queryFn, ...dashboardAutoRefresh });
      const tablero = useDashboardRefresh(KEY);
      return { query, tablero };
    },
    { wrapper },
  );
}

async function avanzar(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useDashboardRefresh / dashboardAutoRefresh — HU-REP-05', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    focusManager.setFocused(undefined);
    vi.useRealTimers();
  });

  it('el intervalo es de 5 minutos', () => {
    expect(DASHBOARD_REFRESH_MS).toBe(5 * MIN);
  });

  it('CA-4: vuelve a pedir a los 5 minutos, y no antes', async () => {
    const queryFn = vi.fn().mockResolvedValue(1);
    montar(queryFn);
    await avanzar(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    await avanzar(5 * MIN - 1000);
    expect(queryFn).toHaveBeenCalledTimes(1);

    await avanzar(1000);
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('CA-7: "Actualizar" pide al instante y reinicia el temporizador', async () => {
    const queryFn = vi.fn().mockResolvedValue(1);
    const { result } = montar(queryFn);
    await avanzar(3 * MIN);
    expect(queryFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.tablero.refresh();
    });
    expect(queryFn).toHaveBeenCalledTimes(2);

    // El tick que tocaba en el minuto 5 ya no llega: el siguiente es en el 8.
    await avanzar(2 * MIN + 1000);
    expect(queryFn).toHaveBeenCalledTimes(2);
    await avanzar(3 * MIN);
    expect(queryFn).toHaveBeenCalledTimes(3);
  });

  it('CA-6: con la pestaña oculta no pide nada', async () => {
    const queryFn = vi.fn().mockResolvedValue(1);
    montar(queryFn);
    await avanzar(0);

    act(() => focusManager.setFocused(false));
    await avanzar(11 * MIN);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('CA-10: al desmontar no quedan temporizadores', async () => {
    const queryFn = vi.fn().mockResolvedValue(1);
    const { unmount } = montar(queryFn);
    await avanzar(0);

    unmount();
    await avanzar(10 * MIN);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('isRefreshing refleja la carga en curso y los datos anteriores siguen disponibles', async () => {
    let resolver: (n: number) => void = () => undefined;
    const queryFn = vi
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(1)
      .mockImplementationOnce(() => new Promise<number>((r) => (resolver = r)));
    const { result } = montar(queryFn);
    await avanzar(0);
    expect(result.current.tablero.isRefreshing).toBe(false);

    act(() => void result.current.tablero.refresh());
    await avanzar(0);
    expect(result.current.tablero.isRefreshing).toBe(true);
    // CA-5: un refetch no vuelve a `pending`; el dato anterior se queda.
    expect(result.current.query.isPending).toBe(false);
    expect(result.current.query.data).toBe(1);

    await act(async () => {
      resolver(2);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.tablero.isRefreshing).toBe(false);
    expect(result.current.query.data).toBe(2);
  });
});
