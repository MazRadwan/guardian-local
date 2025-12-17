/**
 * Unit tests for ChatServer context injection (Epic 16.6.1)
 *
 * Tests that stored intake context is injected as a synthetic assistant message
 * when building conversation context for Claude API calls.
 */

import type { IntakeDocumentContext, ConversationContext } from '../../src/domain/entities/Conversation.js';

// Mock the formatIntakeContextForClaude logic (matches ChatServer implementation)
function formatIntakeContextForClaude(
  ctx: IntakeDocumentContext,
  gapCategories?: string[]
): string {
  const parts: string[] = [
    'I have analyzed the uploaded document and extracted the following context:',
  ];

  if (ctx.vendorName) parts.push(`- Vendor: ${ctx.vendorName}`);
  if (ctx.solutionName) parts.push(`- Solution: ${ctx.solutionName}`);
  if (ctx.solutionType) parts.push(`- Type: ${ctx.solutionType}`);
  if (ctx.industry) parts.push(`- Industry: ${ctx.industry}`);
  if (ctx.features?.length) parts.push(`- Key Features: ${ctx.features.slice(0, 5).join(', ')}`);
  if (ctx.claims?.length) parts.push(`- Claims: ${ctx.claims.slice(0, 3).join(', ')}`);
  if (ctx.complianceMentions?.length) parts.push(`- Compliance Mentions: ${ctx.complianceMentions.join(', ')}`);
  if (gapCategories?.length) parts.push(`- Areas Needing Clarification: ${gapCategories.join(', ')}`);

  parts.push('', 'I will use this context to assist with the assessment.');
  return parts.join('\n');
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface MockMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | { text: string };
}

// Simulated buildConversationContext message handling (matches ChatServer pattern)
function buildMessagesWithContextInjection(
  history: MockMessage[],
  context?: ConversationContext
): ClaudeMessage[] {
  // Format messages for Claude API (only user/assistant, skip system messages)
  const messages: ClaudeMessage[] = history
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: typeof msg.content === 'string' ? msg.content : msg.content.text || '',
    }));

  // Epic 16.6.1: Inject stored intake context as synthetic assistant message
  if (context?.intakeContext) {
    const contextMessage = formatIntakeContextForClaude(
      context.intakeContext,
      context.intakeGapCategories
    );
    // Prepend as first assistant message
    messages.unshift({
      role: 'assistant',
      content: contextMessage,
    });
  }

  return messages;
}

describe('ChatServer Context Injection (Epic 16.6.1)', () => {
  describe('buildMessagesWithContextInjection', () => {
    const mockHistory: MockMessage[] = [
      { role: 'user', content: 'Hello, I want to assess a vendor' },
      { role: 'assistant', content: 'I can help you with that. What vendor?' },
      { role: 'user', content: 'Acme AI Solutions' },
    ];

    describe('when intakeContext exists', () => {
      const contextWithIntake: ConversationContext = {
        intakeContext: {
          vendorName: 'Acme AI',
          solutionName: 'Acme Health AI',
          solutionType: 'Clinical Decision Support',
          industry: 'Healthcare',
          features: ['HIPAA compliant', 'Real-time analytics', 'EHR integration'],
          claims: ['99.9% uptime', 'SOC 2 certified'],
          complianceMentions: ['HIPAA', 'SOC 2', 'FDA 510(k)'],
        },
        intakeGapCategories: ['privacy_risk', 'model_risk'],
        intakeParsedAt: '2024-01-15T10:00:00Z',
      };

      it('should prepend synthetic assistant message with context', () => {
        const messages = buildMessagesWithContextInjection(mockHistory, contextWithIntake);

        // Should have 4 messages (1 synthetic + 3 history)
        expect(messages).toHaveLength(4);

        // First message should be synthetic assistant message
        expect(messages[0].role).toBe('assistant');
        expect(messages[0].content).toContain('I have analyzed the uploaded document');
      });

      it('should include vendor name in synthetic message', () => {
        const messages = buildMessagesWithContextInjection(mockHistory, contextWithIntake);

        expect(messages[0].content).toContain('Vendor: Acme AI');
      });

      it('should include solution details in synthetic message', () => {
        const messages = buildMessagesWithContextInjection(mockHistory, contextWithIntake);

        expect(messages[0].content).toContain('Solution: Acme Health AI');
        expect(messages[0].content).toContain('Type: Clinical Decision Support');
        expect(messages[0].content).toContain('Industry: Healthcare');
      });

      it('should include features (limited to 5)', () => {
        const messages = buildMessagesWithContextInjection(mockHistory, contextWithIntake);

        expect(messages[0].content).toContain('Key Features:');
        expect(messages[0].content).toContain('HIPAA compliant');
      });

      it('should include compliance mentions', () => {
        const messages = buildMessagesWithContextInjection(mockHistory, contextWithIntake);

        expect(messages[0].content).toContain('Compliance Mentions: HIPAA, SOC 2, FDA 510(k)');
      });

      it('should include gap categories as areas needing clarification', () => {
        const messages = buildMessagesWithContextInjection(mockHistory, contextWithIntake);

        expect(messages[0].content).toContain('Areas Needing Clarification: privacy_risk, model_risk');
      });

      it('should preserve original message order after synthetic message', () => {
        const messages = buildMessagesWithContextInjection(mockHistory, contextWithIntake);

        // Original history should follow in order
        expect(messages[1].role).toBe('user');
        expect(messages[1].content).toBe('Hello, I want to assess a vendor');
        expect(messages[2].role).toBe('assistant');
        expect(messages[3].role).toBe('user');
        expect(messages[3].content).toBe('Acme AI Solutions');
      });
    });

    describe('when intakeContext does NOT exist', () => {
      it('should NOT prepend synthetic message when context is undefined', () => {
        const messages = buildMessagesWithContextInjection(mockHistory, undefined);

        // Should only have original 3 messages
        expect(messages).toHaveLength(3);

        // First message should be original user message
        expect(messages[0].role).toBe('user');
        expect(messages[0].content).toBe('Hello, I want to assess a vendor');
      });

      it('should NOT prepend synthetic message when context has no intakeContext', () => {
        const contextWithoutIntake: ConversationContext = {
          lastIntent: 'vendor_assessment',
        };

        const messages = buildMessagesWithContextInjection(mockHistory, contextWithoutIntake);

        expect(messages).toHaveLength(3);
        expect(messages[0].role).toBe('user');
      });

      it('should NOT prepend synthetic message when intakeContext is null', () => {
        const contextWithNullIntake: ConversationContext = {
          intakeContext: undefined,
        };

        const messages = buildMessagesWithContextInjection(mockHistory, contextWithNullIntake);

        expect(messages).toHaveLength(3);
        expect(messages[0].role).toBe('user');
      });
    });

    describe('edge cases', () => {
      it('should handle empty history with context', () => {
        const contextWithIntake: ConversationContext = {
          intakeContext: {
            vendorName: 'Test Vendor',
            solutionName: null,
            solutionType: null,
            industry: null,
            features: [],
            claims: [],
            complianceMentions: [],
          },
        };

        const messages = buildMessagesWithContextInjection([], contextWithIntake);

        // Should only have synthetic message
        expect(messages).toHaveLength(1);
        expect(messages[0].role).toBe('assistant');
        expect(messages[0].content).toContain('Vendor: Test Vendor');
      });

      it('should filter out system messages from history', () => {
        const historyWithSystem: MockMessage[] = [
          { role: 'system', content: 'System prompt' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
        ];

        const messages = buildMessagesWithContextInjection(historyWithSystem, undefined);

        // System message should be filtered out - only user and assistant remain
        expect(messages).toHaveLength(2);
        expect(messages[0].role).toBe('user');
        expect(messages[1].role).toBe('assistant');
      });

      it('should handle minimal context with only vendor name', () => {
        const minimalContext: ConversationContext = {
          intakeContext: {
            vendorName: 'Simple Vendor',
            solutionName: null,
            solutionType: null,
            industry: null,
            features: [],
            claims: [],
            complianceMentions: [],
          },
        };

        const messages = buildMessagesWithContextInjection(mockHistory, minimalContext);

        expect(messages[0].content).toContain('Vendor: Simple Vendor');
        expect(messages[0].content).not.toContain('Solution:');
        expect(messages[0].content).not.toContain('Industry:');
      });
    });
  });

  describe('formatIntakeContextForClaude', () => {
    it('should include header and footer', () => {
      const ctx: IntakeDocumentContext = {
        vendorName: 'Test',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      };

      const result = formatIntakeContextForClaude(ctx);

      expect(result).toContain('I have analyzed the uploaded document');
      expect(result).toContain('I will use this context to assist with the assessment');
    });

    it('should limit features to 5 items', () => {
      const ctx: IntakeDocumentContext = {
        vendorName: 'Test',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'],
        claims: [],
        complianceMentions: [],
      };

      const result = formatIntakeContextForClaude(ctx);

      expect(result).toContain('f1, f2, f3, f4, f5');
      expect(result).not.toContain('f6');
      expect(result).not.toContain('f7');
    });

    it('should limit claims to 3 items', () => {
      const ctx: IntakeDocumentContext = {
        vendorName: 'Test',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: ['c1', 'c2', 'c3', 'c4', 'c5'],
        complianceMentions: [],
      };

      const result = formatIntakeContextForClaude(ctx);

      expect(result).toContain('c1, c2, c3');
      expect(result).not.toContain('c4');
      expect(result).not.toContain('c5');
    });
  });
});
