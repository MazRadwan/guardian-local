/**
 * Unit tests for ClaudeClientBase.isTransientError()
 *
 * Verifies that transient transport errors are correctly classified
 * for retry logic in ScoringLLMService (and future consumers).
 */
import { ClaudeClientBase } from '../../../../src/infrastructure/ai/ClaudeClientBase.js';

describe('ClaudeClientBase.isTransientError', () => {
  describe('transient errors (should return true)', () => {
    const transientMessages = [
      'Premature close',
      'streamWithTool failed: Premature close',
      'read ECONNRESET',
      'socket hang up',
      'connect ETIMEDOUT 1.2.3.4:443',
      'UND_ERR_SOCKET: other side closed',
      'Server is overloaded',
      'rate_limit exceeded',
      'HTTP 529',
      'HTTP 503 Service Unavailable',
    ];

    for (const msg of transientMessages) {
      it(`"${msg}" → true`, () => {
        expect(ClaudeClientBase.isTransientError(new Error(msg))).toBe(true);
      });
    }

    it('case-insensitive: "premature CLOSE" → true', () => {
      expect(ClaudeClientBase.isTransientError(new Error('premature CLOSE'))).toBe(true);
    });
  });

  describe('non-transient errors (should return false)', () => {
    const nonTransientMessages = [
      'Invalid API key',
      'Model not found',
      'Invalid request body',
      'Permission denied',
      'Claude did not call scoring_complete tool',
    ];

    for (const msg of nonTransientMessages) {
      it(`"${msg}" → false`, () => {
        expect(ClaudeClientBase.isTransientError(new Error(msg))).toBe(false);
      });
    }
  });

  describe('structured error codes', () => {
    it('error.code = ECONNRESET → true', () => {
      const error = new Error('connection failed');
      (error as any).code = 'ECONNRESET';
      expect(ClaudeClientBase.isTransientError(error)).toBe(true);
    });

    it('error.cause.code = ETIMEDOUT → true', () => {
      const error = new Error('fetch failed');
      (error as any).cause = { code: 'ETIMEDOUT' };
      expect(ClaudeClientBase.isTransientError(error)).toBe(true);
    });

    it('error.code = EPIPE → true', () => {
      const error = new Error('write failed');
      (error as any).code = 'EPIPE';
      expect(ClaudeClientBase.isTransientError(error)).toBe(true);
    });

    it('error.code = ENOENT → false (not transient)', () => {
      const error = new Error('file not found');
      (error as any).code = 'ENOENT';
      expect(ClaudeClientBase.isTransientError(error)).toBe(false);
    });
  });

  describe('non-Error input', () => {
    it('string input with transient message → true', () => {
      expect(ClaudeClientBase.isTransientError('Premature close')).toBe(true);
    });

    it('string input without transient message → false', () => {
      expect(ClaudeClientBase.isTransientError('Unknown error')).toBe(false);
    });
  });
});
