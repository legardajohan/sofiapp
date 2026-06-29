const now = (): string => new Date().toISOString();

export const logger = {
  info: (msg: string, meta?: unknown): void => {
    console.log(JSON.stringify({ level: 'info', msg, meta, ts: now() }));
  },
  warn: (msg: string, meta?: unknown): void => {
    console.warn(JSON.stringify({ level: 'warn', msg, meta, ts: now() }));
  },
  error: (msg: string, meta?: unknown): void => {
    console.error(JSON.stringify({ level: 'error', msg, meta, ts: now() }));
  },
};
