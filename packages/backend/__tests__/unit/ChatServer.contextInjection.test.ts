/**
 * Unit tests for ChatServer context injection (Epic 16.6.1 + Sprint 17.3)
 *
 * Tests that stored intake context is injected as a synthetic assistant message
 * when building conversation context for Claude API calls.
 *
 * Sprint 17.3: Added tests for sanitizeForPrompt, formatMultiDocContextForClaude,
 * and sanitizeErrorForClient methods.
 */

import type { IntakeDocumentContext, ConversationContext } from '../../src/domain/entities/Conversation.js';
import type { FileWithIntakeContext } from '../../src/application/interfaces/IFileRepository.js';

/**
 * sanitizeForPrompt - matches ChatServer implementation
 * Sprint 17.3: Security helper to prevent prompt injection
 */
function sanitizeForPrompt(str: string | null, maxLength: number = 200): string {
  if (!str) return '';
  const cleaned = str
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control chars
    .replace(/\s+/g, ' ')            // Normalize whitespace
    .trim();
  return cleaned.slice(0, maxLength);
}

/**
 * sanitizeErrorForClient - matches ChatServer implementation
 * Sprint 17.3: Security helper to prevent SQL leak in error messages
 */
function sanitizeErrorForClient(error: unknown, fallbackMessage: string): string {
  if (!(error instanceof Error)) {
    return fallbackMessage;
  }

  const message = error.message;

  const sqlPatterns = [
    /\bSELECT\b/i,
    /\bINSERT\b/i,
    /\bUPDATE\b/i,
    /\bDELETE\b/i,
    /\bFROM\b.*\bWHERE\b/i,
    /\$\d+/,
    /params:/i,
    /Failed query:/i,
    /ECONNREFUSED/,
    /ETIMEDOUT/,
    /duplicate key/i,
    /violates.*constraint/i,
  ];

  for (const pattern of sqlPatterns) {
    if (pattern.test(message)) {
      return fallbackMessage;
    }
  }

  return message.slice(0, 200);
}

// Mock the formatIntakeContextForClaude logic (matches ChatServer implementation with sanitization)
function formatIntakeContextForClaude(
  ctx: IntakeDocumentContext,
  gapCategories?: string[]
): string {
  const parts: string[] = [
    'I have analyzed the uploaded document and extracted the following context:',
  ];

  if (ctx.vendorName) parts.push(`- Vendor: ${sanitizeForPrompt(ctx.vendorName)}`);
  if (ctx.solutionName) parts.push(`- Solution: ${sanitizeForPrompt(ctx.solutionName)}`);
  if (ctx.solutionType) parts.push(`- Type: ${sanitizeForPrompt(ctx.solutionType)}`);
  if (ctx.industry) parts.push(`- Industry: ${sanitizeForPrompt(ctx.industry)}`);
  if (ctx.features?.length) {
    const sanitizedFeatures = ctx.features.slice(0, 5).map(f => sanitizeForPrompt(f, 100)).filter(Boolean);
    if (sanitizedFeatures.length) parts.push(`- Key Features: ${sanitizedFeatures.join(', ')}`);
  }
  if (ctx.claims?.length) {
    const sanitizedClaims = ctx.claims.slice(0, 3).map(c => sanitizeForPrompt(c, 100)).filter(Boolean);
    if (sanitizedClaims.length) parts.push(`- Claims: ${sanitizedClaims.join(', ')}`);
  }
  if (ctx.complianceMentions?.length) {
    const sanitizedCompliance = ctx.complianceMentions.map(c => sanitizeForPrompt(c, 50)).filter(Boolean);
    if (sanitizedCompliance.length) parts.push(`- Compliance Mentions: ${sanitizedCompliance.join(', ')}`);
  }
  if (gapCategories?.length) {
    const sanitizedGaps = gapCategories.map(g => sanitizeForPrompt(g, 50)).filter(Boolean);
    if (sanitizedGaps.length) parts.push(`- Areas Needing Clarification: ${sanitizedGaps.join(', ')}`);
  }

  parts.push('', 'I will use this context to assist with the assessment.');
  return parts.join('\n');
}

/**
 * formatMultiDocContextForClaude - matches ChatServer implementation
 * Sprint 17.3: Multi-document context aggregation with sanitization
 */
function formatMultiDocContextForClaude(
  files: FileWithIntakeContext[],
  legacyContext?: IntakeDocumentContext | null,
  legacyGapCategories?: string[] | null
): string {
  const parts: string[] = [
    `I have analyzed ${files.length} uploaded document(s) and extracted the following context:`,
  ];

  // Per-document summary
  files.forEach((file, i) => {
    const ctx = file.intakeContext!;
    parts.push(`\n**Document ${i + 1}: ${sanitizeForPrompt(file.filename, 100)}**`);
    if (ctx.vendorName) parts.push(`- Vendor: ${sanitizeForPrompt(ctx.vendorName)}`);
    if (ctx.solutionName) parts.push(`- Solution: ${sanitizeForPrompt(ctx.solutionName)}`);
    if (ctx.solutionType) parts.push(`- Type: ${sanitizeForPrompt(ctx.solutionType)}`);
    if (ctx.industry) parts.push(`- Industry: ${sanitizeForPrompt(ctx.industry)}`);
  });

  // Include legacy context if present AND not duplicate
  if (legacyContext && !files.some(f =>
    f.intakeContext?.vendorName === legacyContext.vendorName &&
    f.intakeContext?.solutionName === legacyContext.solutionName
  )) {
    parts.push(`\n**Prior Document (legacy):**`);
    if (legacyContext.vendorName) parts.push(`- Vendor: ${sanitizeForPrompt(legacyContext.vendorName)}`);
    if (legacyContext.solutionName) parts.push(`- Solution: ${sanitizeForPrompt(legacyContext.solutionName)}`);
  }

  // Sprint 17.3 Fix: Sanitize BEFORE dedup
  const allFeatures = [...new Set(
    [
      ...files.flatMap(f => f.intakeContext?.features || []),
      ...(legacyContext?.features || []),
    ].map(f => sanitizeForPrompt(f, 100)).filter(Boolean)
  )];

  const allClaims = [...new Set(
    [
      ...files.flatMap(f => f.intakeContext?.claims || []),
      ...(legacyContext?.claims || []),
    ].map(c => sanitizeForPrompt(c, 100)).filter(Boolean)
  )];

  const allCompliance = [...new Set(
    [
      ...files.flatMap(f => f.intakeContext?.complianceMentions || []),
      ...(legacyContext?.complianceMentions || []),
    ].map(c => sanitizeForPrompt(c, 50)).filter(Boolean)
  )];

  const allGaps = [...new Set(
    [
      ...files.flatMap(f => f.intakeGapCategories || []),
      ...(legacyGapCategories || []),
    ].map(g => sanitizeForPrompt(g, 50)).filter(Boolean)
  )];

  if (allFeatures.length > 0) {
    parts.push(`\n**Combined Features:** ${allFeatures.slice(0, 10).join(', ')}`);
  }
  if (allClaims.length > 0) {
    parts.push(`**Combined Claims:** ${allClaims.slice(0, 5).join(', ')}`);
  }
  if (allCompliance.length > 0) {
    parts.push(`**Compliance Mentions:** ${allCompliance.join(', ')}`);
  }
  if (allGaps.length > 0) {
    parts.push(`**Areas Needing Clarification:** ${allGaps.join(', ')}`);
  }

  parts.push('', 'I will use this combined context to assist with the assessment.');
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

    it('should sanitize strings with control characters', () => {
      const ctx: IntakeDocumentContext = {
        vendorName: 'Vendor\x00Name\x1FWith\x7FControl',
        solutionName: null,
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      };

      const result = formatIntakeContextForClaude(ctx);

      expect(result).toContain('Vendor: VendorNameWithControl');
      expect(result).not.toContain('\x00');
      expect(result).not.toContain('\x1F');
      expect(result).not.toContain('\x7F');
    });
  });

  /**
   * Sprint 17.3: Unit tests for sanitizeForPrompt
   */
  describe('sanitizeForPrompt', () => {
    it('should return empty string for null input', () => {
      expect(sanitizeForPrompt(null)).toBe('');
    });

    it('should return empty string for empty input', () => {
      expect(sanitizeForPrompt('')).toBe('');
    });

    it('should remove control characters (without adding spaces)', () => {
      // Control chars are removed completely, not replaced with space
      expect(sanitizeForPrompt('Hello\x00World')).toBe('HelloWorld');
      expect(sanitizeForPrompt('Test\x1FValue')).toBe('TestValue');
      expect(sanitizeForPrompt('Foo\x7FBar')).toBe('FooBar');
    });

    it('should normalize whitespace (spaces only, control chars removed)', () => {
      expect(sanitizeForPrompt('Hello   World')).toBe('Hello World');
      expect(sanitizeForPrompt('  Leading')).toBe('Leading');
      expect(sanitizeForPrompt('Trailing  ')).toBe('Trailing');
      // Note: \n and \t are control chars (0x0A, 0x09) so they get REMOVED, not normalized
      expect(sanitizeForPrompt('Multiple\n\nNewlines')).toBe('MultipleNewlines');
      expect(sanitizeForPrompt('Tabs\t\tHere')).toBe('TabsHere');
    });

    it('should truncate to max length', () => {
      const longString = 'a'.repeat(300);
      expect(sanitizeForPrompt(longString)).toHaveLength(200);
      expect(sanitizeForPrompt(longString, 50)).toHaveLength(50);
    });

    it('should handle combined issues', () => {
      // Control chars removed, then multiple spaces normalized to single space
      const input = '  Hello\x00\x00World  with   spaces  and\nnewlines  ';
      const result = sanitizeForPrompt(input);
      // \x00 removed, \n removed, multiple spaces → single space
      expect(result).toBe('HelloWorld with spaces andnewlines');
    });
  });

  /**
   * Sprint 17.3: Unit tests for formatMultiDocContextForClaude
   */
  describe('formatMultiDocContextForClaude', () => {
    const createMockFile = (
      id: string,
      filename: string,
      context: IntakeDocumentContext,
      gapCategories?: string[]
    ): FileWithIntakeContext => ({
      id,
      conversationId: 'conv-1',
      filename,
      mimeType: 'application/pdf',
      size: 1000,
      intakeContext: context,
      intakeGapCategories: gapCategories || null,
      intakeParsedAt: new Date(),
    });

    it('should include header with document count', () => {
      const files = [
        createMockFile('1', 'doc1.pdf', {
          vendorName: 'Vendor1',
          solutionName: null,
          solutionType: null,
          industry: null,
          features: [],
          claims: [],
          complianceMentions: [],
        }),
      ];

      const result = formatMultiDocContextForClaude(files);

      expect(result).toContain('I have analyzed 1 uploaded document(s)');
    });

    it('should include per-document summaries', () => {
      const files = [
        createMockFile('1', 'vendor-brochure.pdf', {
          vendorName: 'Acme Corp',
          solutionName: 'AI Platform',
          solutionType: 'SaaS',
          industry: 'Healthcare',
          features: [],
          claims: [],
          complianceMentions: [],
        }),
        createMockFile('2', 'security-whitepaper.pdf', {
          vendorName: 'Acme Corp',
          solutionName: 'AI Platform',
          solutionType: null,
          industry: null,
          features: [],
          claims: [],
          complianceMentions: [],
        }),
      ];

      const result = formatMultiDocContextForClaude(files);

      expect(result).toContain('Document 1: vendor-brochure.pdf');
      expect(result).toContain('Document 2: security-whitepaper.pdf');
      expect(result).toContain('Vendor: Acme Corp');
      expect(result).toContain('Solution: AI Platform');
    });

    it('should deduplicate features across documents', () => {
      const files = [
        createMockFile('1', 'doc1.pdf', {
          vendorName: 'V1',
          solutionName: null,
          solutionType: null,
          industry: null,
          features: ['Feature A', 'Feature B'],
          claims: [],
          complianceMentions: [],
        }),
        createMockFile('2', 'doc2.pdf', {
          vendorName: 'V2',
          solutionName: null,
          solutionType: null,
          industry: null,
          features: ['Feature B', 'Feature C'],
          claims: [],
          complianceMentions: [],
        }),
      ];

      const result = formatMultiDocContextForClaude(files);

      // Feature B should appear only once
      const matches = result.match(/Feature B/g);
      expect(matches).toHaveLength(1);
      expect(result).toContain('Feature A');
      expect(result).toContain('Feature C');
    });

    it('should include legacy context when not duplicate', () => {
      const files = [
        createMockFile('1', 'doc1.pdf', {
          vendorName: 'New Vendor',
          solutionName: 'New Solution',
          solutionType: null,
          industry: null,
          features: [],
          claims: [],
          complianceMentions: [],
        }),
      ];

      const legacyContext: IntakeDocumentContext = {
        vendorName: 'Legacy Vendor',
        solutionName: 'Legacy Solution',
        solutionType: null,
        industry: null,
        features: ['Legacy Feature'],
        claims: [],
        complianceMentions: [],
      };

      const result = formatMultiDocContextForClaude(files, legacyContext);

      expect(result).toContain('Prior Document (legacy)');
      expect(result).toContain('Legacy Vendor');
      expect(result).toContain('Legacy Feature');
    });

    it('should NOT include legacy context when duplicate', () => {
      const files = [
        createMockFile('1', 'doc1.pdf', {
          vendorName: 'Same Vendor',
          solutionName: 'Same Solution',
          solutionType: null,
          industry: null,
          features: [],
          claims: [],
          complianceMentions: [],
        }),
      ];

      const legacyContext: IntakeDocumentContext = {
        vendorName: 'Same Vendor',
        solutionName: 'Same Solution',
        solutionType: null,
        industry: null,
        features: [],
        claims: [],
        complianceMentions: [],
      };

      const result = formatMultiDocContextForClaude(files, legacyContext);

      expect(result).not.toContain('Prior Document (legacy)');
    });

    it('should sanitize filenames and context values', () => {
      const files = [
        createMockFile('1', 'file\x00name.pdf', {
          vendorName: 'Vendor\x00Name',
          solutionName: null,
          solutionType: null,
          industry: null,
          features: ['Feature\x1FOne'],
          claims: [],
          complianceMentions: [],
        }),
      ];

      const result = formatMultiDocContextForClaude(files);

      expect(result).not.toContain('\x00');
      expect(result).not.toContain('\x1F');
      expect(result).toContain('filename.pdf');
      expect(result).toContain('VendorName');
    });

    it('should limit features to 10 items', () => {
      const features = Array.from({ length: 15 }, (_, i) => `Feature${i}`);
      const files = [
        createMockFile('1', 'doc.pdf', {
          vendorName: 'V',
          solutionName: null,
          solutionType: null,
          industry: null,
          features,
          claims: [],
          complianceMentions: [],
        }),
      ];

      const result = formatMultiDocContextForClaude(files);

      expect(result).toContain('Feature0');
      expect(result).toContain('Feature9');
      expect(result).not.toContain('Feature10');
    });

    it('should handle dedup-after-sanitize correctly', () => {
      // Two distinct raw strings that become the same after sanitization
      const files = [
        createMockFile('1', 'doc.pdf', {
          vendorName: 'V',
          solutionName: null,
          solutionType: null,
          industry: null,
          features: ['Feature\x00A', 'FeatureA'],  // Both become 'FeatureA'
          claims: [],
          complianceMentions: [],
        }),
      ];

      const result = formatMultiDocContextForClaude(files);

      // Should only appear once after dedup
      const matches = result.match(/FeatureA/g);
      expect(matches).toHaveLength(1);
    });
  });

  /**
   * Sprint 17.3: Unit tests for sanitizeErrorForClient
   */
  describe('sanitizeErrorForClient', () => {
    const fallback = 'Operation failed';

    it('should return fallback for non-Error objects', () => {
      expect(sanitizeErrorForClient('string error', fallback)).toBe(fallback);
      expect(sanitizeErrorForClient(null, fallback)).toBe(fallback);
      expect(sanitizeErrorForClient(undefined, fallback)).toBe(fallback);
      expect(sanitizeErrorForClient({ message: 'obj' }, fallback)).toBe(fallback);
    });

    it('should return fallback for SQL SELECT errors', () => {
      const error = new Error('SELECT * FROM users WHERE id = $1');
      expect(sanitizeErrorForClient(error, fallback)).toBe(fallback);
    });

    it('should return fallback for SQL INSERT errors', () => {
      const error = new Error('Failed query: INSERT INTO conversations...');
      expect(sanitizeErrorForClient(error, fallback)).toBe(fallback);
    });

    it('should return fallback for SQL UPDATE errors', () => {
      const error = new Error('UPDATE files SET status = $1');
      expect(sanitizeErrorForClient(error, fallback)).toBe(fallback);
    });

    it('should return fallback for SQL DELETE errors', () => {
      const error = new Error('DELETE FROM sessions WHERE expired = true');
      expect(sanitizeErrorForClient(error, fallback)).toBe(fallback);
    });

    it('should return fallback for parameter placeholders', () => {
      const error = new Error('params: $1, $2, $3');
      expect(sanitizeErrorForClient(error, fallback)).toBe(fallback);
    });

    it('should return fallback for connection errors', () => {
      expect(sanitizeErrorForClient(new Error('ECONNREFUSED'), fallback)).toBe(fallback);
      expect(sanitizeErrorForClient(new Error('ETIMEDOUT'), fallback)).toBe(fallback);
    });

    it('should return fallback for constraint violations', () => {
      const error = new Error('duplicate key value violates unique constraint');
      expect(sanitizeErrorForClient(error, fallback)).toBe(fallback);
    });

    it('should return safe error messages unchanged', () => {
      const error = new Error('User not found');
      expect(sanitizeErrorForClient(error, fallback)).toBe('User not found');
    });

    it('should truncate long safe messages to 200 chars', () => {
      const longMessage = 'a'.repeat(300);
      const error = new Error(longMessage);
      expect(sanitizeErrorForClient(error, fallback)).toHaveLength(200);
    });
  });
});
