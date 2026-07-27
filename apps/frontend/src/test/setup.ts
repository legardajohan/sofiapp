import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom no implementa estas APIs y Radix (dropdown, select, dialog) las usa al abrirse. Sin los
// stubs, cualquier test que despliegue uno de esos primitivos falla por el entorno, no por el
// código que se está probando.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = (): boolean => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = (): void => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = (): void => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = (): void => {};
}

// Limpia el DOM renderizado entre tests para evitar fugas de estado.
afterEach(() => {
  cleanup();
});
