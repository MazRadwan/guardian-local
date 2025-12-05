import { buildQuestionGenerationPrompt } from '../../src/infrastructure/ai/prompts/questionGeneration.js';

describe('buildQuestionGenerationPrompt', () => {
  const baseContext = {
    vendorType: 'SaaS',
    solutionType: 'clinical AI',
  };

  it('uses comprehensive defaults when assessmentType not provided', () => {
    const prompt = buildQuestionGenerationPrompt(baseContext);
    expect(prompt).toContain('85-95 questions across all 10 risk dimensions');
    expect(prompt).toContain('10 risk dimensions');
  });

  it('uses quick assessment counts and guidance', () => {
    const prompt = buildQuestionGenerationPrompt({
      ...baseContext,
      assessmentType: 'quick',
    });
    expect(prompt).toContain('30-40 red-flag screener questions');
    expect(prompt).toContain('Question distribution for quick assessment');
  });

  it('uses category_focused assessment wording', () => {
    const prompt = buildQuestionGenerationPrompt({
      ...baseContext,
      assessmentType: 'category_focused',
      category: 'privacy_risk',
    });
    expect(prompt).toContain('50-70 questions focused on the specified categories');
    expect(prompt).toContain('Focus questions on the specified category');
    expect(prompt).toContain('privacy_risk');
  });

  it('includes category when provided', () => {
    const prompt = buildQuestionGenerationPrompt({
      ...baseContext,
      assessmentType: 'comprehensive',
      category: 'chatbot triage',
    });
    expect(prompt).toContain('Category: chatbot triage');
  });

  it('outputs nested sections structure in JSON format', () => {
    const prompt = buildQuestionGenerationPrompt(baseContext);
    expect(prompt).toContain('"sections"');
    expect(prompt).toContain('"riskDimension"');
    expect(prompt).toContain('"questions"');
  });

  it('includes vendor metadata in output format', () => {
    const prompt = buildQuestionGenerationPrompt({
      ...baseContext,
      vendorName: 'Acme Corp',
      solutionName: 'AI Assistant',
    });
    expect(prompt).toContain('Vendor Name: Acme Corp');
    expect(prompt).toContain('Solution Name: AI Assistant');
    expect(prompt).toContain('"vendorName": "Acme Corp"');
  });

  it('lists all 10 risk dimensions', () => {
    const prompt = buildQuestionGenerationPrompt(baseContext);
    expect(prompt).toContain('clinical_risk');
    expect(prompt).toContain('privacy_risk');
    expect(prompt).toContain('security_risk');
    expect(prompt).toContain('technical_credibility');
    expect(prompt).toContain('vendor_capability');
    expect(prompt).toContain('ai_transparency');
    expect(prompt).toContain('ethical_considerations');
    expect(prompt).toContain('regulatory_compliance');
    expect(prompt).toContain('operational_excellence');
    expect(prompt).toContain('sustainability');
  });
});
