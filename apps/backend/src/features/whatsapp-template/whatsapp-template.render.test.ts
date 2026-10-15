import { describe, it, expect } from 'vitest';
import { renderizarPlantilla } from './whatsapp-template.service.js';
import type { IPlantillaComponente } from './whatsapp-template.types.js';

describe('renderizarPlantilla — el texto que leyó el cliente (HU-MARK-05)', () => {
  it('sustituye los {{n}} del cuerpo por posición', () => {
    const components: IPlantillaComponente[] = [
      { type: 'BODY', text: 'Hola {{1}}, tu clase es el {{2}}.' },
    ];
    expect(renderizarPlantilla(components, ['Ana', 'lunes'])).toBe('Hola Ana, tu clase es el lunes.');
  });

  it('une cabecera de texto, cuerpo y pie con una línea en blanco', () => {
    const components: IPlantillaComponente[] = [
      { type: 'HEADER', format: 'TEXT', text: 'Pre-ICFES 2026' },
      { type: 'BODY', text: 'Hola {{1}}' },
      { type: 'FOOTER', text: 'Responde SALIR para no recibir más' },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Quiero info' }] },
    ];
    expect(renderizarPlantilla(components, ['Ana'])).toBe(
      'Pre-ICFES 2026\n\nHola Ana\n\nResponde SALIR para no recibir más',
    );
  });

  it('ignora una cabecera de imagen: la imagen va como media, no como texto', () => {
    const components: IPlantillaComponente[] = [
      { type: 'HEADER', format: 'IMAGE' },
      { type: 'BODY', text: 'Mira nuestra promo' },
    ];
    expect(renderizarPlantilla(components, [])).toBe('Mira nuestra promo');
  });

  it('deja literal un {{n}} sin parámetro en vez de inventar contenido', () => {
    const components: IPlantillaComponente[] = [{ type: 'BODY', text: 'Hola {{1}} y {{2}}' }];
    expect(renderizarPlantilla(components, ['Ana'])).toBe('Hola Ana y {{2}}');
  });

  it('sin cuerpo devuelve null', () => {
    expect(renderizarPlantilla([{ type: 'HEADER', format: 'TEXT', text: 'Hola' }], [])).toBeNull();
  });
});
