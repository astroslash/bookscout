export type ErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "PROVIDER_ERROR"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "INTERNAL_ERROR";

export class PlatformError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidInputError extends PlatformError {
  constructor(message = "Invalid input.") {
    super("INVALID_INPUT", message, 400);
  }
}

export class NotFoundError extends PlatformError {
  constructor(message = "Resource not found.") {
    super("NOT_FOUND", message, 404);
  }
}

export class ProviderError extends PlatformError {
  constructor(message = "A data provider is unavailable.") {
    super("PROVIDER_ERROR", message, 502, true);
  }
}

export class RateLimitError extends PlatformError {
  constructor(message = "Rate limit exceeded.") {
    super("RATE_LIMITED", message, 429, true);
  }
}

export class TimeoutError extends PlatformError {
  constructor(message = "The request timed out.") {
    super("TIMEOUT", message, 504, true);
  }
}

export function publicError(error: unknown): PlatformError {
  return error instanceof PlatformError
    ? error
    : new PlatformError("INTERNAL_ERROR", "An unexpected error occurred.", 500);
}

export function errorBody(error: unknown) {
  const safe = publicError(error);
  return {
    success: false as const,
    error: { code: safe.code, message: safe.message, retryable: safe.retryable },
  };
}
