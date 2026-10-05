import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ImageDropzone } from './ImageDropzone.js';

beforeAll(() => {
  // jsdom no implementa las URLs de objeto.
  URL.createObjectURL = vi.fn(() => 'blob:previa');
  URL.revokeObjectURL = vi.fn();
});

function elegir(archivo: File): void {
  fireEvent.change(screen.getByTestId('imagen-input'), { target: { files: [archivo] } });
}

describe('ImageDropzone', () => {
  it('vacía, invita a arrastrar o elegir y dice el formato admitido', () => {
    render(<ImageDropzone valor={null} onChange={vi.fn()} />);
    const zona = screen.getByRole('button', { name: /Arrastra una imagen o elígela/ });
    expect(zona).toHaveAccessibleDescription(/JPG o PNG, hasta 5 MB/);
  });

  it('un PNG válido sube al padre', () => {
    const onChange = vi.fn();
    render(<ImageDropzone valor={null} onChange={onChange} />);
    const png = new File(['x'], 'promo.png', { type: 'image/png' });

    elegir(png);

    expect(onChange).toHaveBeenCalledWith(png);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un GIF no sube y explica por qué', () => {
    const onChange = vi.fn();
    render(<ImageDropzone valor={null} onChange={onChange} />);

    elegir(new File(['x'], 'anim.gif', { type: 'image/gif' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('La imagen tiene que ser JPG o PNG.');
  });

  it('soltar una imagen encima también la elige', () => {
    const onChange = vi.fn();
    render(<ImageDropzone valor={null} onChange={onChange} />);
    const png = new File(['x'], 'promo.png', { type: 'image/png' });

    fireEvent.drop(screen.getByRole('button', { name: /Arrastra una imagen/ }), {
      dataTransfer: { files: [png] },
    });

    expect(onChange).toHaveBeenCalledWith(png);
  });

  it('llena, muestra la imagen con su nombre y permite quitarla', () => {
    const onChange = vi.fn();
    const png = new File(['x'], 'promo.png', { type: 'image/png' });
    render(<ImageDropzone valor={png} onChange={onChange} />);

    expect(screen.getByRole('img', { name: 'Imagen de la campaña' })).toHaveAttribute('src', 'blob:previa');
    expect(screen.getByText(/promo\.png/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('si la imagen es obligatoria no ofrece quitarla, solo cambiarla', () => {
    const png = new File(['x'], 'promo.png', { type: 'image/png' });
    render(<ImageDropzone valor={png} onChange={vi.fn()} obligatoria />);

    expect(screen.queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar' })).toBeInTheDocument();
  });
});
