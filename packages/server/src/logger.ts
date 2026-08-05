import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(config.isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
        },
      }),
});

export type Logger = pino.Logger;

export function childLogger(scope: string, bindings: Record<string, unknown> = {}): Logger {
  return logger.child({ scope, ...bindings });
}
