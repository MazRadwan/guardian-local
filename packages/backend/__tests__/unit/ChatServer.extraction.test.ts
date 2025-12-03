/**
 * Unit tests for ChatServer extraction fallback logic
 * Tests performExtractionWithFallback scenarios
 */

// Mock dependencies
const mockExtractMarkedContent = jest.fn();
const mockGetConversation = jest.fn();
const mockGetAssessment = jest.fn();
const mockCreateFallbackAssessment = jest.fn();
const mockAttemptQuestionnaireExtraction = jest.fn();
const mockSocketEmit = jest.fn();

// Mock socket
const mockSocket = {
  emit: mockSocketEmit,
  userId: 'test-user-123',
};

// Simulated performExtractionWithFallback logic for testing
// (This tests the logic pattern used in ChatServer)
async function performExtractionWithFallback(
  socket: typeof mockSocket,
  conversationId: string,
  fullResponse: string,
  userId: string
): Promise<void> {
  // STEP 1: Check for markers
  const extractedContent = mockExtractMarkedContent(fullResponse);

  if (!extractedContent) {
    return;
  }

  // STEP 2: Get current assessment
  const conversation = await mockGetConversation(conversationId);
  let assessmentId = conversation?.assessmentId || null;

  // STEP 3: Check if existing assessment is usable (must be 'draft')
  if (assessmentId) {
    const existingAssessment = await mockGetAssessment(assessmentId);
    if (existingAssessment && existingAssessment.status !== 'draft') {
      assessmentId = null; // Force fallback creation
    }
  }

  // STEP 4: Create fallback if needed
  if (!assessmentId) {
    assessmentId = await mockCreateFallbackAssessment(conversationId, userId);

    if (!assessmentId) {
      socket.emit('extraction_failed', {
        conversationId,
        assessmentId: null,
        error: 'Failed to create assessment for questionnaire export',
      });
      return;
    }
  }

  // STEP 5: Extract questions
  mockAttemptQuestionnaireExtraction(socket, conversationId, assessmentId, fullResponse);
}

describe('ChatServer Extraction Fallback Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('marker detection', () => {
    it('should skip extraction when no markers found', async () => {
      mockExtractMarkedContent.mockReturnValue(null);

      await performExtractionWithFallback(mockSocket, 'conv-1', 'no markers here', 'user-1');

      expect(mockGetConversation).not.toHaveBeenCalled();
      expect(mockAttemptQuestionnaireExtraction).not.toHaveBeenCalled();
    });

    it('should proceed when markers found', async () => {
      mockExtractMarkedContent.mockReturnValue('extracted content');
      mockGetConversation.mockResolvedValue({ assessmentId: 'assess-1' });
      mockGetAssessment.mockResolvedValue({ id: 'assess-1', status: 'draft' });

      await performExtractionWithFallback(mockSocket, 'conv-1', 'has markers', 'user-1');

      expect(mockGetConversation).toHaveBeenCalledWith('conv-1');
      expect(mockAttemptQuestionnaireExtraction).toHaveBeenCalled();
    });
  });

  describe('assessment handling', () => {
    beforeEach(() => {
      mockExtractMarkedContent.mockReturnValue('extracted content');
    });

    it('should use existing draft assessment', async () => {
      mockGetConversation.mockResolvedValue({ assessmentId: 'assess-1' });
      mockGetAssessment.mockResolvedValue({ id: 'assess-1', status: 'draft' });

      await performExtractionWithFallback(mockSocket, 'conv-1', 'response', 'user-1');

      expect(mockCreateFallbackAssessment).not.toHaveBeenCalled();
      expect(mockAttemptQuestionnaireExtraction).toHaveBeenCalledWith(
        mockSocket, 'conv-1', 'assess-1', 'response'
      );
    });

    it('should create new assessment when existing is not draft', async () => {
      mockGetConversation.mockResolvedValue({ assessmentId: 'assess-1' });
      mockGetAssessment.mockResolvedValue({ id: 'assess-1', status: 'questions_generated' });
      mockCreateFallbackAssessment.mockResolvedValue('assess-2');

      await performExtractionWithFallback(mockSocket, 'conv-1', 'response', 'user-1');

      expect(mockCreateFallbackAssessment).toHaveBeenCalledWith('conv-1', 'user-1');
      expect(mockAttemptQuestionnaireExtraction).toHaveBeenCalledWith(
        mockSocket, 'conv-1', 'assess-2', 'response'
      );
    });

    it('should create fallback when no assessment linked', async () => {
      mockGetConversation.mockResolvedValue({ assessmentId: null });
      mockCreateFallbackAssessment.mockResolvedValue('assess-new');

      await performExtractionWithFallback(mockSocket, 'conv-1', 'response', 'user-1');

      expect(mockCreateFallbackAssessment).toHaveBeenCalledWith('conv-1', 'user-1');
      expect(mockAttemptQuestionnaireExtraction).toHaveBeenCalledWith(
        mockSocket, 'conv-1', 'assess-new', 'response'
      );
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      mockExtractMarkedContent.mockReturnValue('extracted content');
      mockGetConversation.mockResolvedValue({ assessmentId: null });
    });

    it('should emit extraction_failed when fallback creation fails', async () => {
      mockCreateFallbackAssessment.mockResolvedValue(null);

      await performExtractionWithFallback(mockSocket, 'conv-1', 'response', 'user-1');

      expect(mockSocketEmit).toHaveBeenCalledWith('extraction_failed', {
        conversationId: 'conv-1',
        assessmentId: null,
        error: 'Failed to create assessment for questionnaire export',
      });
      expect(mockAttemptQuestionnaireExtraction).not.toHaveBeenCalled();
    });
  });

  describe('repeat generation flow', () => {
    beforeEach(() => {
      mockExtractMarkedContent.mockReturnValue('extracted content');
    });

    it('should handle completed assessment by creating new one', async () => {
      mockGetConversation.mockResolvedValue({ assessmentId: 'assess-old' });
      mockGetAssessment.mockResolvedValue({ id: 'assess-old', status: 'completed' });
      mockCreateFallbackAssessment.mockResolvedValue('assess-new');

      await performExtractionWithFallback(mockSocket, 'conv-1', 'response', 'user-1');

      // Should have created new assessment because old one was 'completed'
      expect(mockCreateFallbackAssessment).toHaveBeenCalled();
      expect(mockAttemptQuestionnaireExtraction).toHaveBeenCalledWith(
        mockSocket, 'conv-1', 'assess-new', 'response'
      );
    });

    it('should handle in_progress assessment by creating new one', async () => {
      mockGetConversation.mockResolvedValue({ assessmentId: 'assess-old' });
      mockGetAssessment.mockResolvedValue({ id: 'assess-old', status: 'in_progress' });
      mockCreateFallbackAssessment.mockResolvedValue('assess-new');

      await performExtractionWithFallback(mockSocket, 'conv-1', 'response', 'user-1');

      expect(mockCreateFallbackAssessment).toHaveBeenCalled();
    });
  });
});
