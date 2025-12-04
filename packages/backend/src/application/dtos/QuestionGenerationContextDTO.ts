/**
 * QuestionGenerationContextDTO
 *
 * Data transfer object for question generation context
 */

export interface QuestionGenerationContextDTO {
  vendorType: string;
  solutionType: string;
  assessmentFocus?: string;
  industry?: string;
  assessmentType?: 'quick' | 'comprehensive' | 'category_focused';
  category?: string;
}
