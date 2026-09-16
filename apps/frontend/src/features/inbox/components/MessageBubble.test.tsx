import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageBubble } from './MessageBubble.js';
import type { MediaDTO, MessageDTO } from '../types.js';

function mensaje(parcial: Partial<MessageDTO> = {}): MessageDTO {
  return {
    id: 'm-1',
    direccion: 'inbound',
    sender: 'user',
    tipo: 'texto',
    texto: null,
    media: null,
    previewEnlace: null,
    attachmentUrl: null,
    status: 'sent',
    createdAt: '2026-09-16T12:00:00.000Z',
    ...parcial,
  };
}

function media(parcial: Partial<MediaDTO> = {}): MediaDTO {
  return {
    estado: 'disponible',
    mimeType: 'image/jpeg',
    nombreArchivo: null,
    tamanoBytes: null,
    urlArchivo: '/media/m-1?t=token',
    error: null,
    ...parcial,
  };
}

function pintar(m: MessageDTO): { onAbrirImagen: ReturnType<typeof vi.fn> } {
  const onAbrirImagen = vi.fn();
  render(<MessageBubble message={m} onAbrirImagen={onAbrirImagen} />);
  return { onAbrirImagen };
}

describe('MessageBubble — renderizado por tipo (HU-OMNI-06)', () => {
  it('un texto se pinta tal cual', () => {
    pintar(mensaje({ texto: 'Hola, ¿cómo estás?' }));
    expect(screen.getByText('Hola, ¿cómo estás?')).toBeInTheDocument();
  });

  it('una imagen disponible se pinta inline con su URL firmada', () => {
    pintar(mensaje({ tipo: 'imagen', media: media(), texto: 'el comprobante' }));

    const img = screen.getByRole('img', { name: 'el comprobante' });
    expect(img).toHaveAttribute('src', '/media/m-1?t=token');
  });

  it('al pulsar la imagen se pide abrir el lightbox, sin salir del CRM', async () => {
    const { onAbrirImagen } = pintar(mensaje({ tipo: 'imagen', media: media(), texto: 'factura' }));

    await userEvent.click(screen.getByRole('button', { name: /abrir factura en tamaño completo/i }));

    expect(onAbrirImagen).toHaveBeenCalledWith('/media/m-1?t=token', 'factura');
  });

  it('una imagen pendiente muestra el estado y NO un img roto', () => {
    pintar(mensaje({ tipo: 'imagen', media: media({ estado: 'pendiente', urlArchivo: null }) }));

    expect(screen.getByText('Descargando imagen…')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('una media fallida explica el motivo que dio el backend', () => {
    pintar(
      mensaje({
        tipo: 'imagen',
        media: media({
          estado: 'fallida',
          urlArchivo: null,
          error: 'El archivo ya no está disponible en WhatsApp (el enlace de Meta expiró).',
        }),
      }),
    );

    expect(screen.getByText(/el enlace de Meta expiró/i)).toBeInTheDocument();
  });

  it('un video se pinta embebido, con precarga de solo metadata', () => {
    const { container } = render(
      <MessageBubble
        message={mensaje({ tipo: 'video', media: media({ mimeType: 'video/mp4' }) })}
        onAbrirImagen={vi.fn()}
      />,
    );

    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    // `auto` descargaría megabytes de cada video que pase por la bandeja.
    expect(video).toHaveAttribute('preload', 'metadata');
  });

  it('un documento muestra nombre, formato y tamaño', () => {
    pintar(
      mensaje({
        tipo: 'documento',
        media: media({
          mimeType: 'application/pdf',
          nombreArchivo: 'cedula.pdf',
          tamanoBytes: 1_572_864,
        }),
      }),
    );

    expect(screen.getByText('cedula.pdf')).toBeInTheDocument();
    expect(screen.getByText(/PDF · 1\.5 MB/)).toBeInTheDocument();
  });

  it('el documento se abre con el parámetro de descarga', () => {
    pintar(
      mensaje({
        tipo: 'documento',
        media: media({ mimeType: 'application/pdf', nombreArchivo: 'a.pdf' }),
      }),
    );

    expect(screen.getByRole('link')).toHaveAttribute('href', '/media/m-1?t=token&descargar=1');
  });

  it('un enlace muestra la tarjeta con su dominio, conservando el texto', () => {
    pintar(
      mensaje({
        tipo: 'enlace',
        texto: 'Mira esto https://www.youtube.com/watch?v=abc',
        previewEnlace: { url: 'https://www.youtube.com/watch?v=abc', dominio: 'youtube.com' },
      }),
    );

    expect(screen.getByText('youtube.com')).toBeInTheDocument();
    expect(screen.getByText(/Mira esto/)).toBeInTheDocument();
  });

  it('un mensaje de Sofi se distingue del de una persona', () => {
    pintar(mensaje({ direccion: 'outbound', sender: 'bot', texto: 'Con gusto' }));
    expect(screen.getByText('Sofi')).toBeInTheDocument();
  });

  it('un saliente del asesor no se atribuye a Sofi', () => {
    pintar(mensaje({ direccion: 'outbound', sender: 'agent', texto: 'Ya te envío' }));
    expect(screen.queryByText('Sofi')).not.toBeInTheDocument();
  });

  it('un tipo con archivo que no sabemos pintar cae a la tarjeta de documento', () => {
    // Mejor una tarjeta con el nombre y el peso que un hueco vacío.
    pintar(
      mensaje({
        tipo: 'otro',
        media: media({ mimeType: 'application/zip', nombreArchivo: 'paquete.zip' }),
      }),
    );

    expect(screen.getByText('paquete.zip')).toBeInTheDocument();
  });
});
