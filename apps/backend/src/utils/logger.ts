import { redactar, redactarTexto } from './log-redaction.js';

type Nivel = 'info' | 'warn' | 'error';
type Salida = (linea: string) => void;

// Toda llamada pasa por la redacción (HT-PAY-05). El formato no cambia: `level`, `message`,
// campos del meta y `ts`. Si redactar o serializar fallan, se emite solo `{ level, message, ts }`.
function emitir(nivel: Nivel, salida: Salida, message: string, meta?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  const mensaje = redactarTexto(message);
  try {
    const campos = meta ? redactar(meta) : undefined;
    const cuerpo =
      typeof campos === 'object' && campos !== null && !Array.isArray(campos) ? campos : {};
    salida(JSON.stringify({ level: nivel, message: mensaje, ...cuerpo, ts }));
  } catch {
    salida(JSON.stringify({ level: nivel, message: mensaje, ts }));
  }
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>): void => {
    emitir('info', (l) => console.log(l), message, meta);
  },
  warn: (message: string, meta?: Record<string, unknown>): void => {
    emitir('warn', (l) => console.warn(l), message, meta);
  },
  error: (message: string, meta?: Record<string, unknown>): void => {
    emitir('error', (l) => console.error(l), message, meta);
  },
};
