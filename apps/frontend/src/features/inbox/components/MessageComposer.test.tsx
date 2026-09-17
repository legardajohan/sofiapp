import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageComposer } from './MessageComposer.js';

// jsdom no implementa la API de object URLs, y la vista previa la usa para pintar el archivo. Sin
// estos dobles el componente lanza al montar la ventana y el test no prueba nada.
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:vista-previa');
  URL.revokeObjectURL = vi.fn();
});

const mockToastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => mockToastError(...a) } }));

function pintar(props: Partial<React.ComponentProps<typeof MessageComposer>> = {}): {
  onSend: ReturnType<typeof vi.fn>;
  onSendMedia: ReturnType<typeof vi.fn>;
} {
  const onSend = vi.fn();
  const onSendMedia = vi.fn(async () => undefined);
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

/** El textarea del comentario, dentro de la ventana de confirmación. */
function campoComentario(): HTMLElement {
  return screen.getByPlaceholderText('Añade un comentario…');
}

describe('MessageComposer — ventana de confirmación del archivo (HU-OMNI-06)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('elegir un archivo abre una ventana con su vista previa, no lo envía', async () => {
    const { onSendMedia } = pintar();

    await userEvent.upload(inputArchivo(), archivo('foto.jpg', 'image/jpeg', 1024));

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('foto.jpg');
    // Mandar el documento equivocado a un cliente no se puede deshacer: primero se revisa.
    expect(onSendMedia).not.toHaveBeenCalled();
  });

  it('la imagen se ve en la ventana, no solo su nombre', async () => {
    pintar();

    await userEvent.upload(inputArchivo(), archivo('foto.jpg', 'image/jpeg', 1024));

    await screen.findByRole('dialog');
    expect(document.querySelector('img[src="blob:vista-previa"]')).toBeInTheDocument();
  });

  it('el comentario se escribe en la ventana y viaja como pie de foto', async () => {
    const { onSendMedia } = pintar();
    await userEvent.upload(inputArchivo(), archivo('foto.jpg', 'image/jpeg', 1024));
    await screen.findByRole('dialog');

    await userEvent.type(campoComentario(), 'mira esto');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar archivo' }));

    expect(onSendMedia).toHaveBeenCalledOnce();
    expect(onSendMedia.mock.calls[0]?.[1]).toBe('mira esto');
  });

  it('se puede enviar sin comentario', async () => {
    const { onSendMedia } = pintar();
    await userEvent.upload(inputArchivo(), archivo('foto.jpg', 'image/jpeg', 1024));
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'Enviar archivo' }));

    expect(onSendMedia.mock.calls[0]?.[1]).toBe('');
  });

  it('la ventana se cierra sola cuando el envío termina', async () => {
    const { onSendMedia } = pintar();
    await userEvent.upload(inputArchivo(), archivo('foto.jpg', 'image/jpeg', 1024));
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'Enviar archivo' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onSendMedia).toHaveBeenCalledOnce();
  });

  it('REGRESIÓN: si el envío falla, la ventana SIGUE abierta con el archivo puesto', async () => {
    // Cerrarla obligaría al asesor a volver a buscar el archivo por un 413 o un 422 que puede
    // resolver ahí mismo.
    const onSendMedia = vi.fn().mockRejectedValue(new Error('413'));
    render(
      <MessageComposer
        disabled={false}
        pending={false}
        onSend={vi.fn()}
        onSendMedia={onSendMedia}
        uploadProgress={null}
      />,
    );
    await userEvent.upload(inputArchivo(), archivo('foto.jpg', 'image/jpeg', 1024));
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'Enviar archivo' }));

    await waitFor(() => expect(onSendMedia).toHaveBeenCalled());
    expect(await screen.findByRole('dialog')).toHaveTextContent('foto.jpg');
  });

  it('cancelar descarta el archivo', async () => {
    pintar();
    await userEvent.upload(inputArchivo(), archivo('foto.jpg', 'image/jpeg', 1024));
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('mientras sube, muestra el progreso y no deja enviar otra vez', async () => {
    const { rerender } = render(
      <MessageComposer
        disabled={false}
        pending={false}
        onSend={vi.fn()}
        onSendMedia={vi.fn(async () => undefined)}
        uploadProgress={null}
      />,
    );
    await userEvent.upload(inputArchivo(), archivo('foto.jpg', 'image/jpeg', 1024));
    await screen.findByRole('dialog');

    rerender(
      <MessageComposer
        disabled={false}
        pending={false}
        onSend={vi.fn()}
        onSendMedia={vi.fn(async () => undefined)}
        uploadProgress={42}
      />,
    );

    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar archivo' })).toBeDisabled();
  });

  it('al 100 % el texto cambia: la subida acabó, pero Meta todavía no confirmó', async () => {
    const { rerender } = render(
      <MessageComposer
        disabled={false}
        pending={false}
        onSend={vi.fn()}
        onSendMedia={vi.fn(async () => undefined)}
        uploadProgress={null}
      />,
    );
    await userEvent.upload(inputArchivo(), archivo('foto.jpg', 'image/jpeg', 1024));
    await screen.findByRole('dialog');

    rerender(
      <MessageComposer
        disabled={false}
        pending={false}
        onSend={vi.fn()}
        onSendMedia={vi.fn(async () => undefined)}
        uploadProgress={100}
      />,
    );

    // Sin esto la barra se queda clavada en 100 % unos segundos y parece colgada.
    expect(screen.getByText('Enviando a WhatsApp…')).toBeInTheDocument();
  });

  it('un documento se describe, porque no se puede previsualizar', async () => {
    pintar();

    await userEvent.upload(inputArchivo(1), archivo('contrato.pdf', 'application/pdf', 2048));

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('contrato.pdf');
    expect(dialogo).toHaveTextContent('2.0 KB');
  });
});

describe('MessageComposer — validación antes de abrir la ventana', () => {
  beforeEach(() => vi.clearAllMocks());

  it('una imagen de más de 5 MB se rechaza sin llegar a la ventana', async () => {
    const { onSendMedia } = pintar();

    await userEvent.upload(inputArchivo(), archivo('grande.jpg', 'image/jpeg', 6 * 1024 * 1024));

    expect(mockToastError).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onSendMedia).not.toHaveBeenCalled();
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

  it('arrastrar y soltar un archivo válido también abre la ventana', async () => {
    pintar();

    fireEvent.drop(zonaDeSoltar(), {
      dataTransfer: { files: [archivo('plano.pdf', 'application/pdf', 2048)] },
    });

    expect(await screen.findByRole('dialog')).toHaveTextContent('plano.pdf');
  });
});

describe('MessageComposer — texto y menú de adjuntar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sin adjunto sigue enviando texto como siempre', async () => {
    const { onSend, onSendMedia } = pintar();

    await userEvent.type(screen.getByRole('textbox'), 'hola{Enter}');

    expect(onSend).toHaveBeenCalledWith('hola');
    expect(onSendMedia).not.toHaveBeenCalled();
  });

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

  it('con la ventana de 24 h cerrada no se puede adjuntar', async () => {
    pintar({ disabled: true });

    // Si se pudiera, el asesor subiría 8 MB para recibir un 422.
    const disparador = screen.getByRole('button', { name: 'Adjuntar archivo' });
    expect(disparador).toBeDisabled();
    expect(disparador).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(disparador);
    expect(disparador).toHaveAttribute('aria-expanded', 'false');
  });
});
