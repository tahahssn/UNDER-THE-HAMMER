import { HttpException } from '@nestjs/common';
import type { ErrorCodeValue } from './error-codes';

/** Business rejection carrying a stable code. Use for expected failures, not bugs. */
export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCodeValue | string,
    message: string,
    status: number,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}
