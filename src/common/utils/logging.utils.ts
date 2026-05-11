interface LogErrorDetails {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  cause?: string;
}

type LogFields = Record<string, unknown>;

const PLAIN_LOG_VALUE_PATTERN = /^[A-Za-z0-9_.:/@-]+$/;

export function toLogErrorDetails(error: unknown): LogErrorDetails {
  if (error instanceof Error) {
    const details: LogErrorDetails = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    const errorWithCode = error as Error & { code?: unknown; cause?: unknown };

    if (typeof errorWithCode.code === 'string' || typeof errorWithCode.code === 'number') {
      details.code = String(errorWithCode.code);
    }

    if (errorWithCode.cause !== undefined) {
      details.cause = errorWithCode.cause instanceof Error
        ? errorWithCode.cause.message
        : String(errorWithCode.cause);
    }

    return details;
  }

  return {
    name: typeof error,
    message: String(error),
  };
}

export function formatLogEvent(eventName: string, fields: LogFields = {}): string {
  return formatLogFields({
    event: eventName,
    ...fields,
  });
}

export function formatErrorLogEvent(
  eventName: string,
  error: unknown,
  fields: LogFields = {},
): string {
  const details = toLogErrorDetails(error);

  return formatLogFields({
    event: eventName,
    ...fields,
    errorName: details.name,
    ...(details.code ? { errorCode: details.code } : {}),
    errorMessage: details.message,
    ...(details.cause ? { errorCause: details.cause } : {}),
  });
}

export function formatLogFields(fields: LogFields): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${formatLogValue(value)}`)
    .join(' ');
}

function formatLogValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'string') {
    return PLAIN_LOG_VALUE_PATTERN.test(value) ? value : JSON.stringify(value);
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
