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

// `Select` de Radix mide su trigger con ResizeObserver, que jsdom tampoco trae. Un stub inerte
// basta: en el test no hay layout que observar.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// Limpia el DOM renderizado entre tests para evitar fugas de estado.
afterEach(() => {
  cleanup();
  // Mientras hay un modal de Radix abierto, `react-remove-scroll` deja `pointer-events: none` en
  // el `body`. Si un test termina con el diálogo abierto, `cleanup()` desmonta el árbol pero ese
  // estilo se queda pegado al documento y el siguiente test no puede pulsar nada: falla por el
  // entorno, no por el código. Se revierte a mano porque el desmontaje ya no puede hacerlo.
  document.body.style.pointerEvents = '';
});
