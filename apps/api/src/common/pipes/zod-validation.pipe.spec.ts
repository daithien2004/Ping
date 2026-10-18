import { BadRequestException } from '@nestjs/common';
import { createMessageSchema } from '@ping/shared';
import { describe, expect, it } from 'vitest';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const validNonce = '123e4567-e89b-12d3-a456-426614174000';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(createMessageSchema);

  it('returns parsed data for a valid payload', () => {
    expect(pipe.transform({ content: '  hello  ', nonce: validNonce })).toEqual({
      content: 'hello',
      nonce: validNonce,
    });
  });

  it('rejects an invalid payload with VALIDATION_ERROR details', () => {
    expect(() => pipe.transform({ content: '', nonce: 'not-a-uuid' })).toThrow(BadRequestException);

    try {
      pipe.transform({ content: '', nonce: 'not-a-uuid' });
    } catch (error) {
      const body = (error as BadRequestException).getResponse() as Record<string, unknown>;
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.details).toHaveLength(2);
    }
  });
});
