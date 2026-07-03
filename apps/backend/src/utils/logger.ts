export const logger = {
  info: (message: string, meta?: Record<string, unknown>): void => {
    console.log(JSON.stringify({ level: 'info', message, ...meta, ts: new Date().toISOString() }));
  },
  warn: (message: string, meta?: Record<string, unknown>): void => {
    console.warn(JSON.stringify({ level: 'warn', message, ...meta, ts: new Date().toISOString() }));
  },
  error: (message: string, meta?: Record<string, unknown>): void => {
    console.error(JSON.stringify({ level: 'error', message, ...meta, ts: new Date().toISOString() }));
  },
};
