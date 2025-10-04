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
    }),
    new winston.transports.File({
      filename: 'logs/audit.log',
      level: 'info',
      maxsize: 5242880,
      maxFiles: 10,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
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

/**
 * Audit logger for security events
 */
export interface AuditEvent {
  event: string;
  userId?: string | undefined;
  ip?: string | undefined;
  userAgent?: string | undefined;
  resource?: string | undefined;
  action?: string | undefined;
  outcome: 'success' | 'failure' | 'attempt';
  details?: Record<string, unknown> | undefined;
  correlationId?: string | undefined;
}

export const auditLogger = {
  log: (event: AuditEvent) => {
    const logEntry: Record<string, unknown> = {
      type: 'AUDIT',
      event: event.event,
      timestamp: new Date().toISOString(),
      outcome: event.outcome,
    };

    // Only include defined properties
    if (event.userId) logEntry['userId'] = event.userId;
    if (event.ip) logEntry['ip'] = event.ip;
    if (event.userAgent) logEntry['userAgent'] = event.userAgent;
    if (event.resource) logEntry['resource'] = event.resource;
    if (event.action) logEntry['action'] = event.action;
    if (event.details) logEntry['details'] = event.details;
    if (event.correlationId) logEntry['correlationId'] = event.correlationId;

    logger.info('Security Event', logEntry);
  },

  // Specific audit event methods
  loginSuccess: (userId: string, ip: string, userAgent?: string, correlationId?: string) => {
    auditLogger.log({
      event: 'USER_LOGIN',
      userId,
      ip,
      userAgent,
      outcome: 'success',
      correlationId,
    });
  },

  loginFailure: (email: string, ip: string, userAgent?: string, reason?: string, correlationId?: string) => {
    auditLogger.log({
      event: 'USER_LOGIN_FAILED',
      ip,
      userAgent,
      outcome: 'failure',
      details: { email, reason },
      correlationId,
    });
  },

  logout: (userId: string, ip: string, userAgent?: string, correlationId?: string) => {
    auditLogger.log({
      event: 'USER_LOGOUT',
      userId,
      ip,
      userAgent,
      outcome: 'success',
      correlationId,
    });
  },

  passwordChange: (userId: string, ip: string, userAgent?: string, correlationId?: string) => {
    auditLogger.log({
      event: 'PASSWORD_CHANGE',
      userId,
      ip,
      userAgent,
      outcome: 'success',
      correlationId,
    });
  },

  registration: (userId: string, email: string, ip: string, userAgent?: string, correlationId?: string) => {
    auditLogger.log({
      event: 'USER_REGISTRATION',
      userId,
      ip,
      userAgent,
      outcome: 'success',
      details: { email },
      correlationId,
    });
  },

  rateLimitExceeded: (ip: string, userAgent?: string, endpoint?: string, correlationId?: string) => {
    auditLogger.log({
      event: 'RATE_LIMIT_EXCEEDED',
      ip,
      userAgent,
      resource: endpoint,
      outcome: 'attempt',
      correlationId,
    });
  },

  tokenRefresh: (userId: string, ip: string, userAgent?: string, correlationId?: string) => {
    auditLogger.log({
      event: 'TOKEN_REFRESH',
      userId,
      ip,
      userAgent,
      outcome: 'success',
      correlationId,
    });
  },

  unauthorizedAccess: (ip: string, userAgent?: string, resource?: string, correlationId?: string) => {
    auditLogger.log({
      event: 'UNAUTHORIZED_ACCESS',
      ip,
      userAgent,
      resource,
      outcome: 'failure',
      correlationId,
    });
  },

  dataImport: (userId: string, filename: string, recordCount: number, ip: string, userAgent?: string, correlationId?: string) => {
    auditLogger.log({
      event: 'DATA_IMPORT',
      userId,
      ip,
      userAgent,
      resource: filename,
      action: 'import',
      outcome: 'success',
      details: { recordCount },
      correlationId,
    });
  },

  dataExport: (userId: string, filters: Record<string, unknown>, ip: string, userAgent?: string, correlationId?: string) => {
    auditLogger.log({
      event: 'DATA_EXPORT',
      userId,
      ip,
      userAgent,
      action: 'export',
      outcome: 'success',
      details: { filters },
      correlationId,
    });
  },
};