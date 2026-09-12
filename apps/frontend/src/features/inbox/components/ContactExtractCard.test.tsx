import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactExtractCard } from './ContactExtractCard.js';
import type { CampoExtraido, DatosExtraidosDTO } from '../types.js';

const BASE: DatosExtraidosDTO = {
  nombreCompleto: 'Diego Ramírez',
  correo: 'diego@empresa.com',
  telefono: '573000000000',
  telefonoOrigen: 'whatsapp',
  interes: 'curso pre-ICFES sabatino',
  confirmados: [],
  extraidoAt: '2026-08-27T15:00:00.000Z',
};

const noop = (): void => {};

function renderCard(
  over: Partial<DatosExtraidosDTO> | null = {},
  onConfirmar: (campos: CampoExtraido[]) => void = noop,
): void {
  render(
    <ContactExtractCard
      datos={over === null ? null : { ...BASE, ...over }}
      pending={false}
      confirmando={null}
      error={null}
      onExtract={noop}
      onConfirmar={onConfirmar}
    />,
  );
}

describe('ContactExtractCard (HU-IA-06)', () => {
  it('pinta los cuatro campos, incluido el interés', () => {
    renderCard();

    expect(screen.getByText('Diego Ramírez')).toBeInTheDocument();
    expect(screen.getByText('diego@empresa.com')).toBeInTheDocument();
    expect(screen.getByText('573000000000')).toBeInTheDocument();
    expect(screen.getByText('curso pre-ICFES sabatino')).toBeInTheDocument();
  });

  // AC19
  it('un campo sugerido ofrece confirmarlo y uno confirmado no', async () => {
    const onConfirmar = vi.fn();
    renderCard({ confirmados: ['correo'] }, onConfirmar);

    const boton = screen.getByRole('button', { name: 'Confirmar el nombre completo' });
    await userEvent.click(boton);
    expect(onConfirmar).toHaveBeenCalledWith(['nombreCompleto']);

    expect(screen.queryByRole('button', { name: 'Confirmar el correo' })).not.toBeInTheDocument();
    expect(screen.getAllByText('En la ficha')).toHaveLength(1);
  });

  // AC20: el teléfono de WhatsApp ya está en la ficha; confirmarlo no aportaría nada.
  it('no ofrece confirmar el teléfono cuando es el número de WhatsApp', () => {
    renderCard({ telefonoOrigen: 'whatsapp' });

    expect(screen.queryByRole('button', { name: 'Confirmar el teléfono' })).not.toBeInTheDocument();
    expect(screen.getByText('número de WhatsApp')).toBeInTheDocument();
  });

  it('sí lo ofrece cuando el cliente dictó el teléfono en el chat', () => {
    renderCard({ telefono: '6011234567', telefonoOrigen: 'conversacion' });

    expect(screen.getByRole('button', { name: 'Confirmar el teléfono' })).toBeInTheDocument();
    expect(screen.getByText('indicado en el chat')).toBeInTheDocument();
  });

  // AC19: la ausencia se declara, no se deja el hueco en blanco.
  it('un campo sin dato lo dice y no ofrece nada que pulsar', () => {
    renderCard({ interes: null });

    expect(screen.getByText('No aparece en la conversación')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar el interés' })).not.toBeInTheDocument();
  });

  it('la cabecera cuenta los campos que quedan por confirmar', () => {
    // nombre + correo + interés = 3; el teléfono de WhatsApp no cuenta.
    renderCard();
    expect(screen.getByText('3 sin confirmar')).toBeInTheDocument();
  });

  it('sin campos por confirmar no pinta la insignia', () => {
    renderCard({ confirmados: ['nombreCompleto', 'correo', 'interes'] });

    expect(screen.queryByText(/sin confirmar/)).not.toBeInTheDocument();
  });

  it('«Confirmar todo» manda los campos pendientes de una vez', async () => {
    const onConfirmar = vi.fn();
    renderCard({}, onConfirmar);

    await userEvent.click(screen.getByRole('button', { name: /confirmar todo/i }));

    expect(onConfirmar).toHaveBeenCalledWith(['nombreCompleto', 'correo', 'interes']);
  });

  // Con uno solo duplicaría el botón que está tres líneas más arriba.
  it('no muestra «Confirmar todo» cuando solo queda un campo por confirmar', () => {
    renderCard({ confirmados: ['nombreCompleto', 'correo'] });

    expect(screen.queryByRole('button', { name: /confirmar todo/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar el interés' })).toBeInTheDocument();
  });

  it('sin extracción invita a hacerla', () => {
    renderCard(null);

    expect(screen.getByRole('button', { name: /extraer datos/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /volver a extraer/i })).not.toBeInTheDocument();
  });

  it('muestra el error del servidor como alerta', () => {
    render(
      <ContactExtractCard
        datos={null}
        pending={false}
        confirmando={null}
        error="No se pudieron extraer los datos."
        onExtract={noop}
        onConfirmar={noop}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron extraer los datos.');
  });

  it('mientras se confirma un campo, su botón queda deshabilitado', () => {
    render(
      <ContactExtractCard
        datos={BASE}
        pending={false}
        confirmando={['nombreCompleto']}
        error={null}
        onExtract={noop}
        onConfirmar={noop}
      />,
    );

    expect(screen.getByRole('button', { name: 'Confirmar el nombre completo' })).toBeDisabled();
  });
});
