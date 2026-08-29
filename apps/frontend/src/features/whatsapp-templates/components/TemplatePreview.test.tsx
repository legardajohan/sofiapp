import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TemplatePreview } from './TemplatePreview.js';
import { substituteEjemplos } from '../lib/substitute-ejemplos.js';

describe('substituteEjemplos', () => {
  it('sustituye cada {{n}} por el ejemplo en esa posición', () => {
    expect(substituteEjemplos('Hola {{1}}, tu cita es el {{2}}', ['Ana', '20 de agosto'])).toBe(
      'Hola Ana, tu cita es el 20 de agosto',
    );
  });

  it('deja el placeholder si no hay ejemplo para esa posición', () => {
    expect(substituteEjemplos('Hola {{1}}, código {{2}}', ['Ana'])).toBe(
      'Hola Ana, código {{2}}',
    );
  });

  it('un cuerpo sin placeholders no cambia', () => {
    expect(substituteEjemplos('Hola, gracias por escribirnos', [])).toBe(
      'Hola, gracias por escribirnos',
    );
  });
});

describe('TemplatePreview', () => {
  it('muestra el cuerpo con los ejemplos sustituidos', () => {
    render(<TemplatePreview cuerpo="Hola {{1}}" ejemplos={['Ana']} />);
    expect(screen.getByText('Hola Ana')).toBeInTheDocument();
  });

  it('sin cuerpo muestra el estado vacío', () => {
    render(<TemplatePreview cuerpo={null} />);
    expect(screen.getByText('Sin contenido todavía')).toBeInTheDocument();
  });
});
