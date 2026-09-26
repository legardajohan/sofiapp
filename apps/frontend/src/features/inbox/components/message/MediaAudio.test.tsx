import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaAudio } from './MediaAudio.js';
import { useAudioActivo } from '../../hooks/useAudioActivo.js';
import type { MediaDTO } from '../../types.js';

// jsdom no reproduce audio: `play`/`pause` no existen de verdad. Los dobles emiten los mismos
// eventos que el navegador para que el componente reaccione como en producción.
beforeEach(() => {
  useAudioActivo.setState({ activo: null });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: true, configurable: true });
    this.dispatchEvent(new Event('pause'));
  });
});

function media(parcial: Partial<MediaDTO> = {}): MediaDTO {
  return {
    estado: 'disponible',
    mimeType: 'audio/ogg',
    nombreArchivo: null,
    tamanoBytes: 1000,
    urlArchivo: '/media/m-1?t=token',
    error: null,
    duracionSegundos: 42,
    esNotaDeVoz: true,
    ...parcial,
  };
}

describe('MediaAudio — reproductor propio (HU-OMNI-07)', () => {
  it('en reposo muestra la duración total que dio el servidor', () => {
    render(<MediaAudio messageId="m-1" media={media()} outbound={false} />);

    expect(screen.getByText('0:42')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reproducir nota de voz' })).toBeInTheDocument();
  });

  it('distingue la nota de voz de un archivo de audio en el nombre accesible', () => {
    render(<MediaAudio messageId="m-1" media={media({ esNotaDeVoz: false })} outbound={false} />);

    expect(screen.getByRole('button', { name: 'Reproducir audio' })).toBeInTheDocument();
  });

  it('reproduce y pausa', async () => {
    render(<MediaAudio messageId="m-1" media={media()} outbound={false} />);

    await userEvent.click(screen.getByRole('button', { name: 'Reproducir nota de voz' }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();

    await userEvent.click(await screen.findByRole('button', { name: 'Pausar nota de voz' }));
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Reproducir nota de voz' })).toBeInTheDocument();
  });

  it('la barra se opera con teclado: la flecha avanza y actualiza el tiempo', async () => {
    const { container } = render(<MediaAudio messageId="m-1" media={media()} outbound={false} />);
    const barra = screen.getByRole('slider', { name: 'Posición de la nota de voz' });

    barra.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');

    const audio = container.querySelector('audio')!;
    expect(audio.currentTime).toBe(3);
    expect(barra).toHaveAttribute('aria-valuetext', '0:03 de 0:42');
  });

  it('sin duración del servidor la toma de los metadatos, e ignora el Infinity de Chrome', () => {
    const { container } = render(
      <MediaAudio messageId="m-1" media={media({ duracionSegundos: null })} outbound={false} />,
    );
    const audio = container.querySelector('audio')!;

    Object.defineProperty(audio, 'duration', { value: Number.POSITIVE_INFINITY, configurable: true });
    fireEvent.loadedMetadata(audio);
    expect(screen.getByText('0:00')).toBeInTheDocument();

    Object.defineProperty(audio, 'duration', { value: 75, configurable: true });
    fireEvent.loadedMetadata(audio);
    expect(screen.getByText('1:15')).toBeInTheDocument();
  });

  it('un solo audio a la vez: reproducir el segundo pausa el primero', async () => {
    render(
      <>
        <MediaAudio messageId="m-1" media={media()} outbound={false} />
        <MediaAudio messageId="m-2" media={media()} outbound />
      </>,
    );
    const [primero, segundo] = screen.getAllByRole('button', { name: 'Reproducir nota de voz' });

    await userEvent.click(primero!);
    await userEvent.click(segundo!);

    // Uno pausado, otro sonando.
    expect(screen.getAllByRole('button', { name: 'Pausar nota de voz' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Reproducir nota de voz' })).toHaveLength(1);
  });

  it('la velocidad rota 1× → 1.5× → 2× → 1×', async () => {
    render(<MediaAudio messageId="m-1" media={media()} outbound={false} />);
    const boton = screen.getByRole('button', { name: /Velocidad de reproducción 1×/ });

    await userEvent.click(boton);
    expect(boton).toHaveTextContent('1.5×');
    await userEvent.click(boton);
    expect(boton).toHaveTextContent('2×');
    await userEvent.click(boton);
    expect(boton).toHaveTextContent('1×');
  });

  it('si el navegador no puede reproducirlo, lo dice en vez de quedarse mudo', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error('NotSupportedError'));
    render(<MediaAudio messageId="m-1" media={media()} outbound={false} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Reproducir nota de voz' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo reproducir');
  });

  it('sin URL (ya no disponible) muestra el estado de fallo', () => {
    render(<MediaAudio messageId="m-1" media={media({ urlArchivo: null })} outbound={false} />);

    expect(screen.getByText('El audio ya no está disponible.')).toBeInTheDocument();
  });
});
