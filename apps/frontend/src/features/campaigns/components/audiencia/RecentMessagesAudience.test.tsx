import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecentMessagesAudience } from './RecentMessagesAudience.js';
import { aAudiencia, type SeleccionRango } from '../../lib/rango.js';
import type { AudiencePreviewDTO } from '../../types.js';

vi.mock('@/features/tenant-settings/hooks/useAjustesTenant', () => ({
  useAjustesTenant: () => ({ data: { zonaHoraria: 'America/Bogota' } }),
  useUpdateAjustesTenant: () => ({ mutate: vi.fn(), isPending: false }),
}));

const PREVIEW: AudiencePreviewDTO = {
  total: 12,
  muestra: [{ id: 'c1', nombre: 'Ana', telefono: '573000000001' }],
  resumen: { coinciden: 15, bajas: 2, bloqueados: 1, excluidosAMano: 0, duplicados: 0, validos: 12 },
  presupuesto: {
    tier: 'TIER_1K',
    calidad: 'GREEN',
    limiteDiario: 800,
    consumido24h: 0,
    disponible: 800,
    intervaloMs: 108_000,
    bloqueado: false,
    motivoBloqueo: null,
  },
  rango: {
    desde: '2026-10-30T13:00:00.000Z',
    hasta: '2026-10-31T13:00:00.000Z',
    zonaHoraria: 'America/Bogota',
  },
};

function Arnes(): React.ReactElement {
  const [valor, setValor] = useState<SeleccionRango>({ rango: '1d' });
  return (
    <>
      <RecentMessagesAudience
        valor={valor}
        onChange={setValor}
        preview={PREVIEW}
        cargando={false}
        actualizando={false}
      />
      <output data-testid="peticion">{JSON.stringify(aAudiencia(valor))}</output>
    </>
  );
}

const peticion = (): unknown => JSON.parse(screen.getByTestId('peticion').textContent ?? 'null');

describe('HU-MARK-07 — paso de audiencia por mensajes recientes', () => {
  it('muestra el total, el desglose de excluidos y la zona del tenant', () => {
    render(<Arnes />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Bloqueados o inactivos')).toBeInTheDocument();
    expect(screen.queryByText('Quitados por ti')).not.toBeInTheDocument();
    expect(screen.getAllByText(/America\/Bogota|America Bogota/).length).toBeGreaterThan(0);
  });

  it('cambiar de preset cambia la petición', async () => {
    const user = userEvent.setup();
    render(<Arnes />);

    await user.click(screen.getByRole('radio', { name: '7 días' }));
    expect(peticion()).toEqual({ tipo: 'mensajes_recientes', rango: '7d' });
  });

  it('personalizado sin fechas no pide nada al servidor y lo explica', async () => {
    const user = userEvent.setup();
    render(<Arnes />);

    await user.click(screen.getByRole('radio', { name: 'Personalizado' }));
    expect(peticion()).toBeNull();
    expect(screen.getByText(/Elige la fecha de inicio y la de fin/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechas' })).toHaveTextContent('Elige las fechas');
  });
});
