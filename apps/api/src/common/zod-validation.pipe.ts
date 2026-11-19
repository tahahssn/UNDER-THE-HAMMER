import { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppException } from './app-exception';
import { ErrorCode } from './error-codes';

/** Validates a request body/query/param against a Zod schema. Unknown keys are stripped. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'Request validation failed',
        400,
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return result.data;
  }
}
