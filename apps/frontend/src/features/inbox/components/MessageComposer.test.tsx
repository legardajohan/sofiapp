import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageComposer } from './MessageComposer.js';

// jsdom no implementa la API de object URLs, y `AttachmentPreview` la usa para la miniatura. Sin
// estos dobles el componente lanza al montar la previsualización y el test no prueba nada.
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:miniatura');
  URL.revokeObjectURL = vi.fn();
});

const mockToastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => mockToastError(...a) } }));

function pintar(props: Partial<React.ComponentProps<typeof MessageComposer>> = {}): {
  onSend: ReturnType<typeof vi.fn>;
  onSendMedia: ReturnType<typeof vi.fn>;
} {
  const onSend = vi.fn();
  const onSendMedia = vi.fn();
  render(
    <MessageComposer
      disabled={false}
      pending={false}
      onSend={onSend}
      onSendMedia={onSendMedia}
      uploadProgress={null}
      {...props}
    />,
  );
  return { onSend, onSendMedia };
}

function archivo(nombre: string, tipo: string, bytes: number): File {
  const file = new File(['x'], nombre, { type: tipo });
  // `File` no deja fijar `size` por constructor y lo que se está probando es justo el límite.
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}

/**
 * Hay DOS inputs ocultos —uno por entrada del menú, con su propio `accept`— así que se elige por
 * índice: 0 = fotos y videos, 1 = documentos.
 */
function inputArchivo(indice = 0): HTMLInputElement {
  const inputs = document.querySelectorAll('input[type="file"]');
  const input = inputs[indice];
  if (!input) throw new Error(`no hay input de archivo en el índice ${indice}`);
  return input as HTMLInputElement;
}

function zonaDeSoltar(): Element {
  const zona = screen.getByRole('textbox').closest('div.relative');
  if (!zona) throw new Error('no se encontró la zona de soltar');
  return zona;
}

describe('MessageComposer — adjuntar archivos (HU-OMNI-06)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('un archivo válido queda en previsualización antes de enviarse', async () => {
    const { onSendMedia } = pintar();

    await userEvent.upload(inputArchivo(), archivo('foto.jpg', 'image/jpeg', 1024));

    expect(screen.getByText('foto.jpg')).toBeInTheDocument();
    // Adjuntar no envía: mandar el documento equivocado a un cliente no se puede deshacer.
    expect(onSendMedia).not.toHaveBeenCalled();
  });

  it('al enviar, el archivo viaja con el comentario como pie', async () => {
    const { onSendMedia } = pintar();
    await userEvent.upload(inputArchivo(), archivo('foto.jpg', 'image/jpeg', 1024));

    await userEvent.type(screen.getByRole('textbox'), 'mira esto');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(onSendMedia).toHaveBeenCalledOnce();
    expect(onSendMedia.mock.calls[0]?.[1]).toBe('mira esto');
  });

  it('una imagen de más de 5 MB se rechaza en el cliente, sin subir nada', async () => {
    const { onSendMedia } = pintar();

    await userEvent.upload(inputArchivo(), archivo('grande.jpg', 'image/jpeg', 6 * 1024 * 1024));

    expect(mockToastError).toHaveBeenCalledOnce();
    expect(onSendMedia).not.toHaveBeenCalled();
    expect(screen.queryByText('grande.jpg')).not.toBeInTheDocument();
  });

  it('un tipo que WhatsApp no admite se rechaza explicando qué sí se puede enviar', () => {
    pintar();

    // Por arrastrar y soltar, no por el input: el `accept` del input ya filtra en el diálogo del
    // sistema, así que soltar el archivo es la vía real por la que llega un tipo no permitido.
    fireEvent.drop(zonaDeSoltar(), {
      dataTransfer: { files: [archivo('virus.exe', 'application/x-msdownload', 100)] },
    });

    const descripcion = mockToastError.mock.calls[0]?.[1] as { description: string };
    expect(descripcion.description).toMatch(/imagen, un video o un documento/i);
  });

  it('arrastrar y soltar un archivo válido lo adjunta', () => {
    pintar();

    fireEvent.drop(zonaDeSoltar(), {
      dataTransfer: { files: [archivo('plano.pdf', 'application/pdf', 2048)] },
    });

    expect(screen.getByText('plano.pdf')).toBeInTheDocument();
  });

  it('se puede quitar el adjunto antes de enviarlo', async () => {
    pintar();
    await userEvent.upload(inputArchivo(), archivo('foto.jpg', 'image/jpeg', 1024));

    await userEvent.click(screen.getByRole('button', { name: 'Quitar archivo' }));

    expect(screen.queryByText('foto.jpg')).not.toBeInTheDocument();
  });

  it('con la ventana de 24 h cerrada no se puede adjuntar', () => {
    pintar({ disabled: true });

    // Si se pudiera, el asesor subiría 8 MB para recibir un 422.
    expect(screen.getByRole('button', { name: 'Adjuntar archivo' })).toBeDisabled();
  });

  it('mientras sube, se muestra el progreso y no se puede quitar el archivo', async () => {
    const { rerender } = render(
      <MessageComposer
        disabled={false}
        pending={false}
        onSend={vi.fn()}
        onSendMedia={vi.fn()}
        uploadProgress={null}
      />,
    );
    await userEvent.upload(inputArchivo(), archivo('foto.jpg', 'image/jpeg', 1024));

    rerender(
      <MessageComposer
        disabled={false}
        pending={false}
        onSend={vi.fn()}
        onSendMedia={vi.fn()}
        uploadProgress={42}
      />,
    );

    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar archivo' })).not.toBeInTheDocument();
  });

  it('al 100 % el texto cambia: la subida acabó, pero Meta todavía no confirmó', async () => {
    const { rerender } = render(
      <MessageComposer
        disabled={false}
        pending={false}
        onSend={vi.fn()}
        onSendMedia={vi.fn()}
        uploadProgress={null}
      />,
    );
    await userEvent.upload(inputArchivo(), archivo('foto.jpg', 'image/jpeg', 1024));

    rerender(
      <MessageComposer
        disabled={false}
        pending={false}
        onSend={vi.fn()}
        onSendMedia={vi.fn()}
        uploadProgress={100}
      />,
    );

    // Sin esto la barra se queda clavada en 100 % unos segundos y parece colgada.
    expect(screen.getByText('Enviando a WhatsApp…')).toBeInTheDocument();
  });

  it('sin adjunto sigue enviando texto como siempre', async () => {
    const { onSend, onSendMedia } = pintar();

    await userEvent.type(screen.getByRole('textbox'), 'hola{Enter}');

    expect(onSend).toHaveBeenCalledWith('hola');
    expect(onSendMedia).not.toHaveBeenCalled();
  });
});

describe('MessageComposer — menú de adjuntar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('el clip abre un menú con las opciones, no el diálogo de archivos directo', async () => {
    pintar();

    await userEvent.click(screen.getByRole('button', { name: 'Adjuntar archivo' }));

    expect(await screen.findByRole('menuitem', { name: /fotos y videos/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /documento/i })).toBeInTheDocument();
  });

  it('cada opción filtra el diálogo del sistema por su propio tipo', () => {
    pintar();

    // Es lo que hace que las dos entradas se comporten distinto de verdad en vez de ser dos
    // etiquetas que abren lo mismo.
    expect(inputArchivo(0).accept).toContain('image/jpeg');
    expect(inputArchivo(0).accept).toContain('video/mp4');
    expect(inputArchivo(0).accept).not.toContain('application/pdf');

    expect(inputArchivo(1).accept).toContain('application/pdf');
    expect(inputArchivo(1).accept).not.toContain('image/jpeg');
  });

  it('con la ventana de 24 h cerrada el menú ni se abre', async () => {
    pintar({ disabled: true });

    const disparador = screen.getByRole('button', { name: 'Adjuntar archivo' });
    expect(disparador).toBeDisabled();

    await userEvent.click(disparador);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  it('un documento elegido por su opción del menú se adjunta igual', async () => {
    pintar();

    await userEvent.upload(inputArchivo(1), archivo('contrato.pdf', 'application/pdf', 2048));

    expect(screen.getByText('contrato.pdf')).toBeInTheDocument();
  });
});
