/**
 * Unit Tests for ModeRouter
 *
 * Extracted from MessageHandler.test.ts (Story 28.9.4).
 * Tests mode-specific configuration for message processing.
 *
 * getModeConfig:
 * 1. Return consult config with tools enabled (Epic 33: web_search)
 * 2. Return assessment config with tools + background enrich
 * 3. Return scoring config with Claude bypass
 * 4. Default to consult for unknown mode
 * 5. Default to consult for empty string
 * 6. Case-sensitive mode names
 *
 * Integration:
 * 1. Tool enablement pattern across all modes
 * 2. Scoring bypass pattern
 * 3. Background enrichment pattern
 */

import { getModeConfig } from '../../../../../src/infrastructure/websocket/handlers/ModeRouter.js';

describe('ModeRouter', () => {
  describe('getModeConfig', () => {
    it('should return consult config with web_search tools enabled (Epic 33)', () => {
      const config = getModeConfig('consult');

      expect(config.mode).toBe('consult');
      expect(config.enableTools).toBe(true);
      expect(config.backgroundEnrich).toBe(false);
      expect(config.bypassClaude).toBe(false);
    });

    it('should return assessment config with tools and background enrich', () => {
      const config = getModeConfig('assessment');

      expect(config.mode).toBe('assessment');
      expect(config.enableTools).toBe(true);
      expect(config.backgroundEnrich).toBe(true);
      expect(config.bypassClaude).toBe(false);
    });

    it('should return scoring config with Claude bypass', () => {
      const config = getModeConfig('scoring');

      expect(config.mode).toBe('scoring');
      expect(config.enableTools).toBe(false);
      expect(config.backgroundEnrich).toBe(false);
      expect(config.bypassClaude).toBe(true);
    });

    it('should default to consult for unknown mode', () => {
      const config = getModeConfig('unknown');

      expect(config.mode).toBe('consult');
      expect(config.enableTools).toBe(true);
      expect(config.bypassClaude).toBe(false);
    });

    it('should default to consult for empty string mode', () => {
      const config = getModeConfig('');

      expect(config.mode).toBe('consult');
      expect(config.enableTools).toBe(true);
    });

    it('should be case-sensitive for mode names', () => {
      const config = getModeConfig('Assessment'); // Capital A

      expect(config.mode).toBe('consult'); // Defaults to consult (unknown mode)
      expect(config.enableTools).toBe(true);
    });
  });

  describe('mode-specific routing integration', () => {
    it('should correctly identify tool enablement pattern (Epic 33: consult now has tools)', () => {
      const consultConfig = getModeConfig('consult');
      const assessmentConfig = getModeConfig('assessment');
      const scoringConfig = getModeConfig('scoring');

      // Epic 33: Both consult and assessment have tools, only scoring doesn't
      expect(consultConfig.enableTools).toBe(true);
      expect(assessmentConfig.enableTools).toBe(true);
      expect(scoringConfig.enableTools).toBe(false);

      // Verify: enableTools is true for consult and assessment, false for scoring
      expect(consultConfig.enableTools).toBe(consultConfig.mode !== 'scoring');
      expect(assessmentConfig.enableTools).toBe(assessmentConfig.mode !== 'scoring');
      expect(scoringConfig.enableTools).toBe(scoringConfig.mode !== 'scoring');
    });

    it('should correctly identify scoring bypass pattern', () => {
      const scoringConfig = getModeConfig('scoring');
      const consultConfig = getModeConfig('consult');
      const assessmentConfig = getModeConfig('assessment');

      expect(scoringConfig.bypassClaude).toBe(true);
      expect(consultConfig.bypassClaude).toBe(false);
      expect(assessmentConfig.bypassClaude).toBe(false);
    });

    it('should correctly identify background enrichment pattern', () => {
      const consultConfig = getModeConfig('consult');
      const assessmentConfig = getModeConfig('assessment');
      const scoringConfig = getModeConfig('scoring');

      expect(consultConfig.backgroundEnrich).toBe(false);
      expect(assessmentConfig.backgroundEnrich).toBe(true);
      expect(scoringConfig.backgroundEnrich).toBe(false);
    });
  });
});
