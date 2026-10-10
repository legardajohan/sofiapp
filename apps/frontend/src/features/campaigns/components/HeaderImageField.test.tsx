import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HeaderImageField } from './HeaderImageField.js';

beforeAll(() => {
  // jsdom no implementa las URLs de objeto.
  URL.createObjectURL = vi.fn(() => 'blob:reemplazo');
  URL.revokeObjectURL = vi.fn();
});

const DEFECTO = '/api/media/templates/t1/imagen?t=abc';

describe('HeaderImageField (HT-WA-04)', () => {
  it('arranca con la imagen por defecto y no ofrece restaurar', () => {
    render(<HeaderImageField imagenDefectoUrl={DEFECTO} valor={null} onChange={vi.fn()} />);

    expect(screen.getByRole('img', { name: 'Imagen por defecto de la plantilla' })).toHaveAttribute(
      'src',
      DEFECTO,
    );
    expect(screen.getByText('Imagen por defecto')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restaurar imagen por defecto' })).not.toBeInTheDocument();
  });

  it('«Cambiar imagen» con un PNG válido lo sube al padre; un GIF se rechaza en línea', () => {
    const onChange = vi.fn();
    render(<HeaderImageField imagenDefectoUrl={DEFECTO} valor={null} onChange={onChange} />);
    const input = screen.getByTestId('imagen-mensaje-input');

    fireEvent.change(input, { target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('JPG o PNG');

    const png = new File(['x'], 'promo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [png] } });
    expect(onChange).toHaveBeenCalledWith(png);
  });

  it('con reemplazo muestra la imagen nueva y «Restaurar» vuelve a la de por defecto', () => {
    const onChange = vi.fn();
    const png = new File(['x'], 'promo.png', { type: 'image/png' });
    render(<HeaderImageField imagenDefectoUrl={DEFECTO} valor={png} onChange={onChange} />);

    expect(screen.getByRole('img', { name: 'Imagen elegida para este envío' })).toHaveAttribute(
      'src',
      'blob:reemplazo',
    );
    expect(screen.getByText('Imagen personalizada')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar imagen por defecto' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('sin imagen por defecto pide elegir una', () => {
    render(<HeaderImageField imagenDefectoUrl={null} valor={null} onChange={vi.fn()} />);
    expect(screen.getByText('Esta plantilla no tiene imagen por defecto: elige la que se enviará.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Arrastra una imagen o elígela/ })).toBeInTheDocument();
  });
});
