import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';
import { ErrorCodes } from '@ping/shared';

/**
 * Validates a request payload with a Zod schema (typically one imported
 * from `@ping/shared` so the API and the web app share the same rules).
 * Usage: `@UsePipes(new ZodValidationPipe(createMessageSchema))`.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed',
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
