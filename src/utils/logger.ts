import winston from 'winston';
import { existsSync, mkdirSync } from 'fs';
import { config } from '@/config/environment';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const safeTimestamp = typeof timestamp === 'string' ? timestamp : String(timestamp ?? '');
    const safeLevel = typeof level === 'string' ? level.toUpperCase() : String(level ?? '').toUpperCase();
    const safeMessage = typeof message === 'string' ? message : JSON.stringify(message);
    let log = `${safeTimestamp} [${safeLevel}]: ${safeMessage}`;

    const metaRecord = meta as Record<string, unknown>;
    if (Object.keys(metaRecord).length > 0) {
      log += ` ${JSON.stringify(metaRecord)}`;
    }

    return log;
  })
);

const isTestEnv = config.env === 'test';

if (!isTestEnv && !existsSync('logs')) {
  mkdirSync('logs');
}

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  })
];

if (!isTestEnv) {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5,
    })
  );
}

const exceptionHandlers = isTestEnv ? [] : [
  new winston.transports.File({ filename: 'logs/exceptions.log' })
];

const rejectionHandlers = isTestEnv ? [] : [
  new winston.transports.File({ filename: 'logs/rejections.log' })
];

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: {
    service: 'courtflow-backend',
    environment: config.env
  },
  transports,
  exceptionHandlers,
  rejectionHandlers,
  exitOnError: !isTestEnv,
});

// Export logger with additional methods
type LogMeta = Record<string, unknown>;

export const createLogger = (module: string) => {
  return {
    error: (message: string, meta?: LogMeta) => logger.error(message, { module, ...meta }),
    warn: (message: string, meta?: LogMeta) => logger.warn(message, { module, ...meta }),
    info: (message: string, meta?: LogMeta) => logger.info(message, { module, ...meta }),
    debug: (message: string, meta?: LogMeta) => logger.debug(message, { module, ...meta }),
  };
};