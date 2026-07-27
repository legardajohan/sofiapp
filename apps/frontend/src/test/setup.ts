import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom no implementa estas APIs del DOM y sí las usan Radix (dropdown, select, dialog) al abrirse
// y el auto-scroll del hilo de mensajes al montar. Sin los stubs, cualquier test que renderice una
// conversación o despliegue uno de esos primitivos falla por el entorno, no por el código.
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
