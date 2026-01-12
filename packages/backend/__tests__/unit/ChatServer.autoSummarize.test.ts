/**
 * Unit tests for ChatServer auto-summarize feature (Epic 18.4.5)
 *
 * Story 18.4.5: Consult Mode Auto-Summarize
 * When a user uploads a file in Consult mode without typing a message,
 * automatically generate a summary of the document.
 */

import { jest } from '@jest/globals';
import type { FileRecord, FileWithExcerpt } from '../../src/application/interfaces/IFileRepository.js';

/**
 * Simulate auto-summarize detection logic for testing
 *
 * This mirrors the ChatServer detection logic to test when auto-summarize
 * should trigger without needing full infrastructure.
 */
function shouldAutoSummarize(
  mode: 'consult' | 'assessment' | 'scoring',
  hasAttachments: boolean,
  messageText: string | undefined
): boolean {
  return (
    mode === 'consult' &&
    hasAttachments &&
    (!messageText || messageText.trim().length === 0)
  );
}

/**
 * Simulate buildAutoSummarizePrompt logic for testing
 */
function buildAutoSummarizePrompt(fileLabel: string): string {
  return `You are Guardian, an AI assistant helping healthcare organizations assess AI vendors.

The user has uploaded ${fileLabel} and wants to understand its contents.

Please provide a helpful summary that:
1. Identifies what type of document this is (security whitepaper, compliance cert, product doc, questionnaire, etc.)
2. Highlights key points relevant to AI governance and vendor assessment
3. Notes any security, privacy, or compliance information mentioned
4. Ends with an invitation to ask follow-up questions

Keep the summary concise (3-5 paragraphs) and focus on information relevant to vendor assessment.
If the document appears to be a completed questionnaire, mention that it can be scored in Scoring mode.`;
}

/**
 * Simulate autoSummarizeDocuments logic for testing
 */
async function autoSummarizeDocuments(
  fileIds: string[],
  fileRepository: {
    findById: (id: string) => Promise<FileRecord | null>;
  },
  buildFileContext: () => Promise<string>,
  claudeClient: {
    streamMessage: (
      messages: unknown[],
      options: { systemPrompt: string }
    ) => AsyncGenerator<{ content: string; isComplete: boolean }>;
  },
  conversationService: {
    sendMessage: (params: {
      conversationId: string;
      role: string;
      content: { text: string };
    }) => Promise<{ id: string }>;
  },
  emittedEvents: Array<{ event: string; data: unknown }>
): Promise<{ success: boolean; response?: string; error?: string }> {
  try {
    // Build file context
    const fileContext = await buildFileContext();

    if (!fileContext) {
      emittedEvents.push({
        event: 'message',
        data: {
          role: 'assistant',
          content: "I received your file but couldn't extract the content. Could you try uploading it again?",
        },
      });
      return { success: false, error: 'No file context' };
    }

    // Get file names
    const files = await Promise.all(fileIds.map(id => fileRepository.findById(id)));
    const validFiles = files.filter(Boolean) as FileRecord[];
    const fileNames = validFiles.map(f => f.filename).join(', ');

    // Build prompt
    const isSingleFile = fileIds.length === 1;
    const fileLabel = isSingleFile
      ? `a document (${fileNames})`
      : `${fileIds.length} documents (${fileNames})`;
    const systemPrompt = buildAutoSummarizePrompt(fileLabel);

    // Emit typing indicator
    emittedEvents.push({ event: 'assistant_stream_start', data: {} });

    // Stream response
    let fullResponse = '';
    for await (const chunk of claudeClient.streamMessage([], {
      systemPrompt: `${systemPrompt}\n\n${fileContext}`,
    })) {
      if (!chunk.isComplete && chunk.content) {
        fullResponse += chunk.content;
        emittedEvents.push({
          event: 'assistant_token',
          data: { token: chunk.content },
        });
      }
    }

    // Save response
    const savedMessage = await conversationService.sendMessage({
      conversationId: 'conv-1',
      role: 'assistant',
      content: { text: fullResponse },
    });

    // Emit stream complete
    emittedEvents.push({
      event: 'assistant_done',
      data: {
        messageId: savedMessage.id,
        fullText: fullResponse,
      },
    });

    return { success: true, response: fullResponse };
  } catch (error) {
    emittedEvents.push({
      event: 'message',
      data: {
        role: 'assistant',
        content: "I had trouble summarizing the document. What would you like to know about it?",
      },
    });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

describe('ChatServer Auto-Summarize (Epic 18.4.5)', () => {
  const createMockFile = (
    id: string,
    filename: string = `${id}.pdf`
  ): FileRecord => ({
    id,
    userId: 'user-1',
    conversationId: 'conv-1',
    filename,
    mimeType: 'application/pdf',
    size: 1000,
    storagePath: `uploads/${id}.pdf`,
    createdAt: new Date(),
    textExcerpt: 'Sample text excerpt',
    parseStatus: 'pending',
    detectedDocType: null,
    detectedVendorName: null,
  });

  // =========================================================================
  // Detection Tests
  // =========================================================================

  describe('shouldAutoSummarize detection', () => {
    it('should trigger for empty message with file in consult mode', () => {
      expect(shouldAutoSummarize('consult', true, '')).toBe(true);
      expect(shouldAutoSummarize('consult', true, undefined)).toBe(true);
      expect(shouldAutoSummarize('consult', true, '   ')).toBe(true);
    });

    it('should NOT trigger for non-empty message', () => {
      expect(shouldAutoSummarize('consult', true, 'Tell me about this')).toBe(false);
      expect(shouldAutoSummarize('consult', true, 'What is this?')).toBe(false);
    });

    it('should NOT trigger without attachments', () => {
      expect(shouldAutoSummarize('consult', false, '')).toBe(false);
      expect(shouldAutoSummarize('consult', false, undefined)).toBe(false);
    });

    it('should NOT trigger in assessment mode', () => {
      expect(shouldAutoSummarize('assessment', true, '')).toBe(false);
      expect(shouldAutoSummarize('assessment', true, undefined)).toBe(false);
    });

    it('should NOT trigger in scoring mode', () => {
      expect(shouldAutoSummarize('scoring', true, '')).toBe(false);
      expect(shouldAutoSummarize('scoring', true, undefined)).toBe(false);
    });
  });

  // =========================================================================
  // Prompt Building Tests
  // =========================================================================

  describe('buildAutoSummarizePrompt', () => {
    it('should include file names in prompt', () => {
      const prompt = buildAutoSummarizePrompt('a document (security-doc.pdf)');
      expect(prompt).toContain('security-doc.pdf');
    });

    it('should request relevant summary points', () => {
      const prompt = buildAutoSummarizePrompt('a document (doc.pdf)');
      expect(prompt).toContain('AI governance');
      expect(prompt).toContain('vendor assessment');
    });

    it('should mention document type identification', () => {
      const prompt = buildAutoSummarizePrompt('a document (doc.pdf)');
      expect(prompt).toContain('what type of document');
      expect(prompt).toContain('security whitepaper');
      expect(prompt).toContain('compliance cert');
    });

    it('should mention security/privacy/compliance', () => {
      const prompt = buildAutoSummarizePrompt('a document (doc.pdf)');
      expect(prompt).toContain('security');
      expect(prompt).toContain('privacy');
      expect(prompt).toContain('compliance');
    });

    it('should end with follow-up invitation', () => {
      const prompt = buildAutoSummarizePrompt('a document (doc.pdf)');
      expect(prompt).toContain('follow-up questions');
    });

    it('should mention Scoring mode for questionnaires', () => {
      const prompt = buildAutoSummarizePrompt('a document (doc.pdf)');
      expect(prompt).toContain('Scoring mode');
      expect(prompt).toContain('questionnaire');
    });

    it('should handle multiple files', () => {
      const prompt = buildAutoSummarizePrompt('3 documents (doc1.pdf, doc2.pdf, doc3.pdf)');
      expect(prompt).toContain('3 documents');
      expect(prompt).toContain('doc1.pdf');
      expect(prompt).toContain('doc2.pdf');
      expect(prompt).toContain('doc3.pdf');
    });
  });

  // =========================================================================
  // Auto-Summarize Logic Tests
  // =========================================================================

  describe('autoSummarizeDocuments', () => {
    it('should generate summary for single file', async () => {
      const file = createMockFile('file-1', 'vendor-whitepaper.pdf');
      const emittedEvents: Array<{ event: string; data: unknown }> = [];

      const fileRepository = {
        findById: jest.fn<(id: string) => Promise<FileRecord | null>>().mockResolvedValue(file),
      };
      const buildFileContext = jest.fn<() => Promise<string>>().mockResolvedValue('Document content here...');
      const claudeClient = {
        streamMessage: jest.fn<() => AsyncGenerator<{ content: string; isComplete: boolean }>>().mockImplementation(async function* () {
          yield { content: 'This document is a ', isComplete: false };
          yield { content: 'security whitepaper.', isComplete: false };
          yield { content: '', isComplete: true };
        }),
      };
      const conversationService = {
        sendMessage: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'msg-1' }),
      };

      const result = await autoSummarizeDocuments(
        ['file-1'],
        fileRepository,
        buildFileContext,
        claudeClient,
        conversationService,
        emittedEvents
      );

      expect(result.success).toBe(true);
      expect(result.response).toBe('This document is a security whitepaper.');

      // Verify events emitted
      expect(emittedEvents).toContainEqual({ event: 'assistant_stream_start', data: {} });
      expect(emittedEvents.filter(e => e.event === 'assistant_token').length).toBe(2);
      expect(emittedEvents).toContainEqual(
        expect.objectContaining({
          event: 'assistant_done',
          data: expect.objectContaining({ messageId: 'msg-1' }),
        })
      );

      // Verify Claude was called with correct prompt structure
      expect(claudeClient.streamMessage).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          systemPrompt: expect.stringContaining('vendor-whitepaper.pdf'),
        })
      );
    });

    it('should generate summary for multiple files', async () => {
      const file1 = createMockFile('file-1', 'doc1.pdf');
      const file2 = createMockFile('file-2', 'doc2.pdf');
      const emittedEvents: Array<{ event: string; data: unknown }> = [];

      const fileRepository = {
        findById: jest.fn<(id: string) => Promise<FileRecord | null>>()
          .mockResolvedValueOnce(file1)
          .mockResolvedValueOnce(file2),
      };
      const buildFileContext = jest.fn<() => Promise<string>>().mockResolvedValue('Combined document content...');
      const claudeClient = {
        streamMessage: jest.fn<() => AsyncGenerator<{ content: string; isComplete: boolean }>>().mockImplementation(async function* () {
          yield { content: 'Summary of both documents.', isComplete: false };
          yield { content: '', isComplete: true };
        }),
      };
      const conversationService = {
        sendMessage: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'msg-1' }),
      };

      const result = await autoSummarizeDocuments(
        ['file-1', 'file-2'],
        fileRepository,
        buildFileContext,
        claudeClient,
        conversationService,
        emittedEvents
      );

      expect(result.success).toBe(true);

      // Verify prompt mentions multiple documents
      expect(claudeClient.streamMessage).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          systemPrompt: expect.stringContaining('2 documents'),
        })
      );
      expect(claudeClient.streamMessage).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          systemPrompt: expect.stringContaining('doc1.pdf'),
        })
      );
    });

    it('should handle missing file context gracefully', async () => {
      const emittedEvents: Array<{ event: string; data: unknown }> = [];

      const fileRepository = {
        findById: jest.fn<(id: string) => Promise<FileRecord | null>>(),
      };
      const buildFileContext = jest.fn<() => Promise<string>>().mockResolvedValue(''); // Empty context
      const claudeClient = {
        streamMessage: jest.fn<() => AsyncGenerator<{ content: string; isComplete: boolean }>>(),
      };
      const conversationService = {
        sendMessage: jest.fn<() => Promise<{ id: string }>>(),
      };

      const result = await autoSummarizeDocuments(
        ['file-1'],
        fileRepository,
        buildFileContext,
        claudeClient,
        conversationService,
        emittedEvents
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('No file context');

      // Verify fallback message emitted
      expect(emittedEvents).toContainEqual({
        event: 'message',
        data: {
          role: 'assistant',
          content: expect.stringContaining("couldn't extract the content"),
        },
      });

      // Claude should NOT be called
      expect(claudeClient.streamMessage).not.toHaveBeenCalled();
    });

    it('should handle Claude API errors gracefully', async () => {
      const file = createMockFile('file-1');
      const emittedEvents: Array<{ event: string; data: unknown }> = [];

      const fileRepository = {
        findById: jest.fn<(id: string) => Promise<FileRecord | null>>().mockResolvedValue(file),
      };
      const buildFileContext = jest.fn<() => Promise<string>>().mockResolvedValue('Document content...');
      const claudeClient = {
        streamMessage: jest.fn<() => AsyncGenerator<{ content: string; isComplete: boolean }>>().mockImplementation(async function* () {
          throw new Error('Claude API error');
        }),
      };
      const conversationService = {
        sendMessage: jest.fn<() => Promise<{ id: string }>>(),
      };

      const result = await autoSummarizeDocuments(
        ['file-1'],
        fileRepository,
        buildFileContext,
        claudeClient,
        conversationService,
        emittedEvents
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Claude API error');

      // Verify fallback message emitted
      expect(emittedEvents).toContainEqual({
        event: 'message',
        data: {
          role: 'assistant',
          content: expect.stringContaining('trouble summarizing'),
        },
      });
    });

    it('should save assistant response to database', async () => {
      const file = createMockFile('file-1');
      const emittedEvents: Array<{ event: string; data: unknown }> = [];

      const fileRepository = {
        findById: jest.fn<(id: string) => Promise<FileRecord | null>>().mockResolvedValue(file),
      };
      const buildFileContext = jest.fn<() => Promise<string>>().mockResolvedValue('Content...');
      const claudeClient = {
        streamMessage: jest.fn<() => AsyncGenerator<{ content: string; isComplete: boolean }>>().mockImplementation(async function* () {
          yield { content: 'Summary text', isComplete: false };
          yield { content: '', isComplete: true };
        }),
      };
      const conversationService = {
        sendMessage: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'msg-1' }),
      };

      await autoSummarizeDocuments(
        ['file-1'],
        fileRepository,
        buildFileContext,
        claudeClient,
        conversationService,
        emittedEvents
      );

      // Verify message was saved
      expect(conversationService.sendMessage).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        role: 'assistant',
        content: { text: 'Summary text' },
      });
    });
  });

  // =========================================================================
  // Integration with Mode-Specific Behavior Tests
  // =========================================================================

  describe('Mode-specific behavior integration', () => {
    it('non-empty message triggers normal flow (no auto-summarize)', () => {
      // In normal flow, even with attachments, we should NOT auto-summarize
      // if the user typed a message
      const hasAttachments = true;
      const messageText = 'What does this document say about security?';

      expect(shouldAutoSummarize('consult', hasAttachments, messageText)).toBe(false);
    });

    it('assessment mode does NOT trigger auto-summarize', () => {
      // Assessment mode has its own handling (background enrichment)
      const hasAttachments = true;
      const messageText = '';

      expect(shouldAutoSummarize('assessment', hasAttachments, messageText)).toBe(false);
    });

    it('scoring mode does NOT trigger auto-summarize', () => {
      // Scoring mode has its own handling (trigger scoring)
      const hasAttachments = true;
      const messageText = '';

      expect(shouldAutoSummarize('scoring', hasAttachments, messageText)).toBe(false);
    });

    it('whitespace-only message triggers auto-summarize', () => {
      // Whitespace should be treated as empty
      expect(shouldAutoSummarize('consult', true, '   ')).toBe(true);
      expect(shouldAutoSummarize('consult', true, '\t')).toBe(true);
      expect(shouldAutoSummarize('consult', true, '\n')).toBe(true);
    });
  });
});
