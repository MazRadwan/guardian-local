import { QuestionExtractionService } from '../../src/application/services/QuestionExtractionService';
import { IQuestionRepository } from '../../src/application/interfaces/IQuestionRepository';
import { IAssessmentRepository } from '../../src/application/interfaces/IAssessmentRepository';
import { Assessment } from '../../src/domain/entities/Assessment';

// No longer need to mock db.transaction - service uses repository's replaceAllForAssessment

describe('QuestionExtractionService', () => {
  let service: QuestionExtractionService;
  let mockQuestionRepo: jest.Mocked<IQuestionRepository>;
  let mockAssessmentRepo: jest.Mocked<IAssessmentRepository>;

  beforeEach(() => {
    mockQuestionRepo = {
      bulkCreate: jest.fn().mockResolvedValue([]),
      deleteByAssessmentId: jest.fn().mockResolvedValue(undefined),
      findByAssessmentId: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      replaceAllForAssessment: jest.fn().mockResolvedValue([]),
    } as any;

    mockAssessmentRepo = {
      findById: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(),
      findByVendorId: jest.fn(),
      findByCreatedBy: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
    } as any;

    service = new QuestionExtractionService(mockQuestionRepo, mockAssessmentRepo);
  });

  describe('hasQuestionnaireMarkers', () => {
    it('returns true when both markers present', () => {
      const response = 'Some text <!-- QUESTIONNAIRE_START --> content <!-- QUESTIONNAIRE_END --> more text';
      expect(service.hasQuestionnaireMarkers(response)).toBe(true);
    });

    it('returns false when start marker missing', () => {
      const response = 'content <!-- QUESTIONNAIRE_END -->';
      expect(service.hasQuestionnaireMarkers(response)).toBe(false);
    });

    it('returns false when end marker missing', () => {
      const response = '<!-- QUESTIONNAIRE_START --> content';
      expect(service.hasQuestionnaireMarkers(response)).toBe(false);
    });

    it('returns false when no markers', () => {
      const response = 'Just regular text without any markers';
      expect(service.hasQuestionnaireMarkers(response)).toBe(false);
    });
  });

  describe('extractMarkedContent', () => {
    it('extracts content between markers', () => {
      const response = 'prefix <!-- QUESTIONNAIRE_START -->the content<!-- QUESTIONNAIRE_END --> suffix';
      expect(service.extractMarkedContent(response)).toBe('the content');
    });

    it('trims whitespace from extracted content', () => {
      const response = '<!-- QUESTIONNAIRE_START -->\n  content with whitespace  \n<!-- QUESTIONNAIRE_END -->';
      expect(service.extractMarkedContent(response)).toBe('content with whitespace');
    });

    it('returns null if markers missing', () => {
      expect(service.extractMarkedContent('no markers')).toBeNull();
    });

    it('returns null if markers in wrong order', () => {
      const response = '<!-- QUESTIONNAIRE_END -->content<!-- QUESTIONNAIRE_START -->';
      expect(service.extractMarkedContent(response)).toBeNull();
    });
  });

  describe('handleAssistantCompletion', () => {
    const validQuestionnaire = `
<!-- QUESTIONNAIRE_START -->
## Section 1: Privacy Compliance
1. Does the vendor have a privacy policy?
2. How is personal data protected?

## Section 2: Security
1. What encryption is used?
<!-- QUESTIONNAIRE_END -->
`;

    it('returns null if no markers in response', async () => {
      const result = await service.handleAssistantCompletion('conv-1', 'assess-1', 'no markers here');
      expect(result).toBeNull();
      expect(mockQuestionRepo.bulkCreate).not.toHaveBeenCalled();
    });

    it('returns error if no assessmentId provided', async () => {
      const result = await service.handleAssistantCompletion('conv-1', null, validQuestionnaire);

      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      expect(result?.error).toContain('No assessment linked');
    });

    it('returns error if assessment not found', async () => {
      mockAssessmentRepo.findById.mockResolvedValue(null);

      const result = await service.handleAssistantCompletion('conv-1', 'assess-1', validQuestionnaire);

      expect(result?.success).toBe(false);
      expect(result?.error).toBe('Assessment not found');
    });

    it('returns error if assessment not in draft status', async () => {
      const assessment = Assessment.create({
        vendorId: 'vendor-1',
        createdBy: 'user-1',
        assessmentType: 'comprehensive',
      });
      // Manually set status using reflection since status is readonly
      Object.defineProperty(assessment, 'status', {
        value: 'questions_generated',
        writable: false,
      });

      mockAssessmentRepo.findById.mockResolvedValue(assessment);

      const result = await service.handleAssistantCompletion('conv-1', 'assess-1', validQuestionnaire);

      expect(result?.success).toBe(false);
      expect(result?.error).toContain('must be in draft status');
    });

    it('extracts and persists questions successfully', async () => {
      const assessment = Assessment.create({
        id: 'assess-1',
        vendorId: 'vendor-1',
        createdBy: 'user-1',
        assessmentType: 'comprehensive',
      });

      mockAssessmentRepo.findById.mockResolvedValue(assessment);

      const result = await service.handleAssistantCompletion('conv-1', 'assess-1', validQuestionnaire);

      expect(result?.success).toBe(true);
      expect(result?.questionCount).toBe(3);
      // Uses replaceAllForAssessment for atomic persistence
      expect(mockQuestionRepo.replaceAllForAssessment).toHaveBeenCalledWith('assess-1', expect.any(Array));
      expect(mockAssessmentRepo.updateStatus).toHaveBeenCalledWith('assess-1', 'questions_generated');
    });

    it('handles conversion errors gracefully', async () => {
      const assessment = Assessment.create({
        id: 'assess-1',
        vendorId: 'vendor-1',
        createdBy: 'user-1',
        assessmentType: 'comprehensive',
      });

      mockAssessmentRepo.findById.mockResolvedValue(assessment);

      const badQuestionnaire = '<!-- QUESTIONNAIRE_START -->no valid sections<!-- QUESTIONNAIRE_END -->';

      const result = await service.handleAssistantCompletion('conv-1', 'assess-1', badQuestionnaire);

      expect(result?.success).toBe(false);
      expect(result?.error).toContain('No sections found');
    });

    it('uses replaceAllForAssessment for atomic persistence', async () => {
      const assessment = Assessment.create({
        id: 'assess-1',
        vendorId: 'vendor-1',
        createdBy: 'user-1',
        assessmentType: 'comprehensive',
      });

      mockAssessmentRepo.findById.mockResolvedValue(assessment);

      await service.handleAssistantCompletion('conv-1', 'assess-1', validQuestionnaire);

      // Service delegates atomic persistence to repository
      expect(mockQuestionRepo.replaceAllForAssessment).toHaveBeenCalledWith(
        'assess-1',
        expect.arrayContaining([
          expect.objectContaining({ sectionNumber: 1 }),
        ])
      );
      // Does NOT call individual delete/bulkCreate methods
      expect(mockQuestionRepo.deleteByAssessmentId).not.toHaveBeenCalled();
      expect(mockQuestionRepo.bulkCreate).not.toHaveBeenCalled();
    });

    it('updates assessment status after successful extraction', async () => {
      const assessment = Assessment.create({
        id: 'assess-1',
        vendorId: 'vendor-1',
        createdBy: 'user-1',
        assessmentType: 'comprehensive',
      });

      mockAssessmentRepo.findById.mockResolvedValue(assessment);

      await service.handleAssistantCompletion('conv-1', 'assess-1', validQuestionnaire);

      expect(mockAssessmentRepo.updateStatus).toHaveBeenCalledWith('assess-1', 'questions_generated');
    });

    it('does not update status on extraction failure', async () => {
      const assessment = Assessment.create({
        id: 'assess-1',
        vendorId: 'vendor-1',
        createdBy: 'user-1',
        assessmentType: 'comprehensive',
      });

      mockAssessmentRepo.findById.mockResolvedValue(assessment);
      mockQuestionRepo.replaceAllForAssessment.mockRejectedValue(new Error('Database error'));

      await service.handleAssistantCompletion('conv-1', 'assess-1', validQuestionnaire);

      expect(mockAssessmentRepo.updateStatus).not.toHaveBeenCalled();
    });
  });
});
