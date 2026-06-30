const iso = () => new Date().toISOString();

export const logger = {
  info: (msg: string, meta?: unknown) =>
    console.log(JSON.stringify({ level: 'info', ts: iso(), msg, ...(meta ? { meta } : {}) })),
  warn: (msg: string, meta?: unknown) =>
    console.warn(JSON.stringify({ level: 'warn', ts: iso(), msg, ...(meta ? { meta } : {}) })),
  error: (msg: string, meta?: unknown) =>
    console.error(JSON.stringify({ level: 'error', ts: iso(), msg, ...(meta ? { meta } : {}) })),
};
