import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom no implementa `scrollIntoView`, y el auto-scroll del hilo de mensajes lo llama al montar.
// Sin este stub, cualquier test que renderice una conversación falla por el entorno, no por el código.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = (): void => {};
}

// Limpia el DOM renderizado entre tests para evitar fugas de estado.
afterEach(() => {
  cleanup();
});
