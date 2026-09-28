/**
 * Composer: notas de voz y emojis (HU-OMNI-07).
 *
 * jsdom no tiene `MediaRecorder` ni micrófono: se sustituyen por dobles que se comportan como el
 * navegador (entregan un trozo al detener y disparan `onstop`). Lo que se prueba es el flujo del
 * asesor y la invariante de soltar el micrófono, no la API del navegador.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageComposer } from './MessageComposer.js';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

// El selector real descarga los datos de emojis de un CDN. Aquí basta con que al elegir uno se
// llame a `onEmojiSelect`, que es el contrato del que depende el composer.
vi.mock('@/components/ui/emoji-picker', () => ({
  EmojiPicker: ({
    onEmojiSelect,
  }: {
    onEmojiSelect: (e: { emoji: string; label: string }) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onEmojiSelect({ emoji: '🎉', label: 'Party popper' })}>
        elegir 🎉
      </button>
      <button type="button" onClick={() => onEmojiSelect({ emoji: '👩🏽‍💻', label: 'Technologist' })}>
        elegir 👩🏽‍💻
      </button>
    </div>
  ),
  EmojiPickerSearch: () => null,
  EmojiPickerContent: () => null,
  EmojiPickerFooter: () => null,
}));

const pararPista = vi.fn();

class MediaRecorderFalso {
  static isTypeSupported = (m: string): boolean => m.startsWith('audio/webm');
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: MediaStream, opciones: { mimeType: string }) {
    this.mimeType = opciones.mimeType;
  }
  start(): void {
    this.state = 'recording';
  }
  stop(): void {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['voz'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

const getUserMedia = vi.fn();

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:grabacion');
  URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setInterval', 'clearInterval', 'performance'] });
  vi.stubGlobal('MediaRecorder', MediaRecorderFalso);
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: pararPista }] });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function pintar(props: Partial<React.ComponentProps<typeof MessageComposer>> = {}): {
  onSend: ReturnType<typeof vi.fn>;
  onSendAudio: ReturnType<typeof vi.fn>;
} {
  const onSend = vi.fn();
  const onSendAudio = vi.fn(async () => undefined);
  render(
    <MessageComposer
      disabled={false}
      pending={false}
      onSend={onSend}
      onSendMedia={vi.fn(async () => undefined)}
      uploadProgress={null}
      onSendAudio={onSendAudio}
      audioProgress={null}
      maxDuracionAudio={300}
      {...props}
    />,
  );
  return { onSend, onSendAudio };
}

async function avanzar(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe('MessageComposer — botón principal', () => {
  it('con el campo vacío es el micrófono; al escribir pasa a enviar', async () => {
    pintar();
    expect(screen.getByRole('button', { name: 'Grabar nota de voz' })).toBeEnabled();

    await userEvent.type(screen.getByRole('textbox'), 'hola');

    expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Grabar nota de voz' })).not.toBeInTheDocument();
  });

  it('con la ventana de 24 h cerrada no se puede grabar ni poner emojis', () => {
    pintar({ disabled: true });

    expect(screen.getByRole('button', { name: 'Grabar nota de voz' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Insertar emoji' })).toBeDisabled();
  });
});

describe('MessageComposer — nota de voz', () => {
  it('grabar → detener → previsualizar → enviar, y libera el micrófono', async () => {
    const { onSendAudio } = pintar();

    await userEvent.click(screen.getByRole('button', { name: 'Grabar nota de voz' }));
    const detener = await screen.findByRole('button', { name: 'Detener grabación' });
    // El campo de texto desaparece mientras se graba, como en WhatsApp.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await avanzar(3000);
    expect(screen.getByText('0:03')).toBeInTheDocument();

    await userEvent.click(detener);

    // Previsualización: nada se ha enviado todavía y el micrófono ya se soltó.
    expect(await screen.findByRole('button', { name: 'Enviar nota de voz' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descartar nota de voz' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver a grabar' })).toBeInTheDocument();
    expect(onSendAudio).not.toHaveBeenCalled();
    expect(pararPista).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Enviar nota de voz' }));

    await waitFor(() => expect(onSendAudio).toHaveBeenCalledOnce());
    const [grabacion, duracion] = onSendAudio.mock.calls[0] as [Blob, number];
    expect(grabacion.type).toContain('audio/webm');
    expect(duracion).toBeGreaterThanOrEqual(3);
    // Enviada: vuelve el campo de texto.
    expect(await screen.findByRole('textbox')).toBeInTheDocument();
  });

  it('descartar mientras graba no envía nada y suelta el micrófono', async () => {
    const { onSendAudio } = pintar();

    await userEvent.click(screen.getByRole('button', { name: 'Grabar nota de voz' }));
    await screen.findByRole('button', { name: 'Detener grabación' });
    await avanzar(2000);

    await userEvent.click(screen.getByRole('button', { name: 'Descartar grabación' }));

    expect(await screen.findByRole('textbox')).toBeInTheDocument();
    expect(onSendAudio).not.toHaveBeenCalled();
    expect(pararPista).toHaveBeenCalled();
  });

  it('Esc descarta la previsualización', async () => {
    pintar();
    await userEvent.click(screen.getByRole('button', { name: 'Grabar nota de voz' }));
    await avanzar(2000);
    await userEvent.click(await screen.findByRole('button', { name: 'Detener grabación' }));
    await screen.findByRole('button', { name: 'Enviar nota de voz' });

    await userEvent.keyboard('{Escape}');

    expect(await screen.findByRole('textbox')).toBeInTheDocument();
  });

  it('si el envío falla, la grabación se queda para reintentar', async () => {
    const onSendAudio = vi.fn().mockRejectedValue(new Error('422'));
    pintar({ onSendAudio });
    await userEvent.click(screen.getByRole('button', { name: 'Grabar nota de voz' }));
    await avanzar(2000);
    await userEvent.click(await screen.findByRole('button', { name: 'Detener grabación' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Enviar nota de voz' }));

    await waitFor(() => expect(onSendAudio).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Enviar nota de voz' })).toBeInTheDocument();
  });

  it('se corta sola al llegar al máximo del tenant y lo avisa', async () => {
    pintar({ maxDuracionAudio: 5 });
    await userEvent.click(screen.getByRole('button', { name: 'Grabar nota de voz' }));
    await screen.findByRole('button', { name: 'Detener grabación' });

    await avanzar(5200);

    expect(await screen.findByRole('button', { name: 'Enviar nota de voz' })).toBeInTheDocument();
    expect(screen.getByText(/se detuvo al llegar al máximo de 0:05/)).toBeInTheDocument();
  });

  it('una grabación de menos de un segundo se descarta con un aviso', async () => {
    pintar();
    await userEvent.click(screen.getByRole('button', { name: 'Grabar nota de voz' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Detener grabación' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('muy corta');
  });

  it('permiso de micrófono denegado: explica cómo darlo, sin error opaco', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('denegado', 'NotAllowedError'));
    pintar();

    await userEvent.click(screen.getByRole('button', { name: 'Grabar nota de voz' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/bloqueó el micrófono/);
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(await screen.findByRole('textbox')).toBeInTheDocument();
  });

  it('sin MediaRecorder (navegador viejo) lo dice en vez de fallar', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    pintar();

    await userEvent.click(screen.getByRole('button', { name: 'Grabar nota de voz' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no puede grabar audio/);
  });
});

describe('MessageComposer — emojis', () => {
  it('el emoji elegido se inserta en la posición del cursor', async () => {
    pintar();
    const campo = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(campo, 'hola mundo');
    campo.setSelectionRange(4, 4);

    await userEvent.click(screen.getByRole('button', { name: 'Insertar emoji' }));
    await userEvent.click(await screen.findByRole('button', { name: 'elegir 🎉' }));

    expect(campo.value).toBe('hola🎉 mundo');
  });

  it('varios emojis seguidos sin cerrar el selector, y el texto se envía intacto', async () => {
    const { onSend } = pintar();
    const campo = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(campo, 'listo ');

    await userEvent.click(screen.getByRole('button', { name: 'Insertar emoji' }));
    await userEvent.click(await screen.findByRole('button', { name: 'elegir 👩🏽‍💻' }));
    await userEvent.click(screen.getByRole('button', { name: 'elegir 🎉' }));
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(campo).toHaveFocus());
    await userEvent.keyboard('{Enter}');

    expect(onSend).toHaveBeenCalledWith('listo 👩🏽‍💻🎉');
  });

  it('REGRESIÓN: si el envío falla, el texto con emojis vuelve al campo en vez de perderse', async () => {
    // Era el síntoma reportado: "se borra y no llega". El campo se vaciaba al pulsar Enter y, si el
    // backend rechazaba el envío, el mensaje desaparecía sin rastro.
    const onSend = vi.fn().mockRejectedValue(new Error('502'));
    pintar({ onSend });
    const campo = screen.getByRole('textbox') as HTMLTextAreaElement;

    fireEvent.change(campo, { target: { value: 'hola 👩🏽‍💻 🇨🇴' } });
    fireEvent.keyDown(campo, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('hola 👩🏽‍💻 🇨🇴');
    await waitFor(() => expect(campo.value).toBe('hola 👩🏽‍💻 🇨🇴'));
  });

  it('Enter durante una composición IME (panel de emojis del SO) NO envía', () => {
    const { onSend } = pintar();
    const campo = screen.getByRole('textbox');
    fireEvent.change(campo, { target: { value: 'hola 😀' } });

    fireEvent.keyDown(campo, { key: 'Enter', isComposing: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('hola 😀');
  });
});
