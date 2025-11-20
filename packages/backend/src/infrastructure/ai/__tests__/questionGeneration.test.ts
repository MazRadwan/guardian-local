import { buildQuestionGenerationPrompt } from '../prompts/questionGeneration';

describe('buildQuestionGenerationPrompt', () => {
  const baseContext = {
    vendorType: 'SaaS',
    solutionType: 'clinical AI',
  };

  it('uses comprehensive defaults when assessmentType not provided', () => {
    const prompt = buildQuestionGenerationPrompt(baseContext);
    expect(prompt).toContain('85-95 questions');
    expect(prompt).toContain('Section 1: Company Overview');
  });

  it('uses quick assessment counts and guidance', () => {
    const prompt = buildQuestionGenerationPrompt({
      ...baseContext,
      assessmentType: 'quick',
    });
    expect(prompt).toContain('30-40 targeted questions');
    expect(prompt).toContain('Focus the bulk of questions on critical sections');
  });

  it('uses renewal assessment wording', () => {
    const prompt = buildQuestionGenerationPrompt({
      ...baseContext,
      assessmentType: 'renewal',
    });
    expect(prompt).toContain('60-70 questions focused on changes since last assessment');
    expect(prompt).toContain('deltas');
  });

  it('includes category when provided', () => {
    const prompt = buildQuestionGenerationPrompt({
      ...baseContext,
      assessmentType: 'comprehensive',
      category: 'chatbot triage',
    });
    expect(prompt).toContain('Category: chatbot triage');
  });
});
