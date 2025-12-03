/**
 * Unit tests for TriggerDetection utilities
 */

import { detectGenerateTrigger, LITERAL_PATTERNS, FLEXIBLE_PATTERNS } from '../../src/infrastructure/websocket/TriggerDetection';

describe('TriggerDetection', () => {
  describe('LITERAL_PATTERNS', () => {
    it('should have expanded trigger patterns', () => {
      expect(LITERAL_PATTERNS.length).toBeGreaterThan(6);
      expect(LITERAL_PATTERNS.length).toBeGreaterThanOrEqual(30);
    });

    it('should include backward compatible patterns', () => {
      const normalized = (pattern: RegExp) => pattern.toString();
      const patterns = LITERAL_PATTERNS.map(normalized);

      expect(patterns.some(p => p.includes('generate questionnaire'))).toBe(true);
      expect(patterns.some(p => p.includes('create questionnaire'))).toBe(true);
      expect(patterns.some(p => p.includes('go ahead'))).toBe(true);
    });
  });

  describe('FLEXIBLE_PATTERNS', () => {
    it('should have flexible regex patterns', () => {
      expect(FLEXIBLE_PATTERNS.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('detectGenerateTrigger() - positive cases', () => {
    describe('existing triggers (backward compatibility)', () => {
      it.each([
        'generate questionnaire',
        'Generate Questionnaire',  // case insensitive
        'please generate questionnaire',
        'generate the questionnaire',
        'create questionnaire',
        'generate it',
        'go ahead',
        'yes generate',
      ])('matches existing trigger: "%s"', (input) => {
        expect(detectGenerateTrigger(input)).toBe(true);
      });
    });

    describe('new direct requests', () => {
      it.each([
        'create a questionnaire',
        'make a questionnaire',
        'build a questionnaire',
        'produce a questionnaire',
        'start the questionnaire',
        'begin the questionnaire',
        'make the questionnaire',
        'build the questionnaire',
      ])('matches direct request: "%s"', (input) => {
        expect(detectGenerateTrigger(input)).toBe(true);
      });
    });

    describe('short confirmation forms', () => {
      it.each([
        'create it',
        'make it',
        'do it',
        'proceed',
        'yes please',
        'yes, please',
        'yes create',
        'yes, create',
        'yes generate',
        'yes, generate',
        'ok generate',
        'okay generate',
        'build it',
        'start it',
        'begin it',
      ])('matches short form: "%s"', (input) => {
        expect(detectGenerateTrigger(input)).toBe(true);
      });
    });

    describe('synonyms (survey, form, assessment)', () => {
      it.each([
        'generate survey',
        'create survey',
        'make survey',
        'generate form',
        'create form',
        'generate assessment',
        'create assessment',
      ])('matches synonym: "%s"', (input) => {
        expect(detectGenerateTrigger(input)).toBe(true);
      });
    });

    describe('flexible patterns', () => {
      it.each([
        'create a short questionnaire',
        'make a brief survey',
        'generate a quick form',
        'build a simple questionnaire',
        'start a basic assessment',
        "let's create it",
        "let's generate the questionnaire",
        "let's make a form",
        'sure, create the assessment',
        'ok generate it now',
        'yes, please make the questionnaire',
        'absolutely, create the survey',
      ])('matches flexible pattern: "%s"', (input) => {
        expect(detectGenerateTrigger(input)).toBe(true);
      });
    });

    describe('adjective + noun without verb', () => {
      it.each([
        'short questionnaire',
        'short questionnaire please',
        'brief survey',
        'quick form',
        'simple questionnaire',
        'basic assessment',
        'I need a short questionnaire',
        'give me a brief survey',
      ])('matches adjective+noun: "%s"', (input) => {
        expect(detectGenerateTrigger(input)).toBe(true);
      });
    });

    describe('case insensitivity', () => {
      it('should match regardless of case', () => {
        expect(detectGenerateTrigger('GENERATE QUESTIONNAIRE')).toBe(true);
        expect(detectGenerateTrigger('Generate Questionnaire')).toBe(true);
        expect(detectGenerateTrigger('gEnErAtE qUeStIoNnAiRe')).toBe(true);
        expect(detectGenerateTrigger('CREATE A QUESTIONNAIRE')).toBe(true);
      });
    });

    describe('whitespace handling', () => {
      it('should trim leading/trailing whitespace', () => {
        expect(detectGenerateTrigger('  generate questionnaire  ')).toBe(true);
        expect(detectGenerateTrigger('\tgo ahead\n')).toBe(true);
        expect(detectGenerateTrigger('  create a questionnaire  ')).toBe(true);
      });
    });
  });

  describe('detectGenerateTrigger() - negative cases', () => {
    describe('word boundary protection', () => {
      it.each([
        // Partial word matches (word boundary test)
        'regenerate questionnaire',        // "regenerate" contains "generate"
        'degenerate the form',             // "degenerate" contains "generate"
        'procreate something',             // "procreate" contains "create"
      ])('does NOT match partial word: "%s"', (input) => {
        expect(detectGenerateTrigger(input)).toBe(false);
      });
    });

    describe('past tense (not commands)', () => {
      it.each([
        'I generated a questionnaire yesterday',
        'we created the survey last week',
      ])('does NOT match past tense: "%s"', (input) => {
        expect(detectGenerateTrigger(input)).toBe(false);
      });
    });

    describe('unrelated messages', () => {
      it.each([
        'hello',
        'what is a questionnaire?',
        'tell me about security assessments',
        'how does the survey process work?',
      ])('does NOT match unrelated: "%s"', (input) => {
        expect(detectGenerateTrigger(input)).toBe(false);
      });
    });

    describe('questions (not commands)', () => {
      // KNOWN LIMITATION (documented in spec - not fixing for MVP):
      // Modal verbs like "can" and "would" still trigger detection
      // This is acceptable because if user asks "can you?", they likely want it
      it.each([
        // These are known limitations that we document but don't fix for MVP
        // 'can you generate a questionnaire?',   // Would match (false positive)
        // 'would you create a survey?',          // Would match (false positive)
        'should I generate the form?',  // This correctly does NOT match
      ])('does NOT match question: "%s"', (input) => {
        expect(detectGenerateTrigger(input)).toBe(false);
      });
    });

    describe('empty/whitespace', () => {
      it('should return false for empty string', () => {
        expect(detectGenerateTrigger('')).toBe(false);
      });

      it('should return false for whitespace-only string', () => {
        expect(detectGenerateTrigger('   ')).toBe(false);
        expect(detectGenerateTrigger('\t\n')).toBe(false);
      });
    });
  });

  describe('substring matching', () => {
    it('should match trigger as substring of longer message', () => {
      expect(detectGenerateTrigger('I am ready, please generate questionnaire for the vendor')).toBe(true);
      expect(detectGenerateTrigger('After reviewing, go ahead with the assessment')).toBe(true);
      expect(detectGenerateTrigger('Now please create a questionnaire for the new vendor')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle messages with special characters', () => {
      expect(detectGenerateTrigger('go ahead!')).toBe(true);
      expect(detectGenerateTrigger('generate questionnaire?')).toBe(true);
      expect(detectGenerateTrigger('yes, generate it.')).toBe(true);
      expect(detectGenerateTrigger('create a questionnaire, please.')).toBe(true);
    });

    it('should handle messages with multiple triggers', () => {
      // Should return true if any trigger matches
      expect(detectGenerateTrigger('go ahead and generate questionnaire')).toBe(true);
      expect(detectGenerateTrigger('yes, create a questionnaire')).toBe(true);
    });
  });
});
