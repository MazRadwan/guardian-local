/**
 * Tests for GenerateQuestionnaireButton component
 *
 * Part of Epic 12: Tool-Based Questionnaire Generation Trigger
 *
 * NOTE: apps/web uses Jest (not Vitest)
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { GenerateQuestionnaireButton } from '../GenerateQuestionnaireButton';
import { QuestionnaireReadyPayload } from '@/lib/websocket';

const basePayload: QuestionnaireReadyPayload = {
  conversationId: 'conv-123',
  assessmentType: 'comprehensive',
  vendorName: null,
  solutionName: null,
  contextSummary: null,
  estimatedQuestions: null,
  selectedCategories: null,
};

describe('GenerateQuestionnaireButton', () => {
  describe('rendering', () => {
    it('should render with comprehensive assessment type', () => {
      render(
        <GenerateQuestionnaireButton
          payload={basePayload}
          onGenerate={jest.fn()}
        />
      );

      expect(screen.getByText('Ready to Generate')).toBeInTheDocument();
      expect(screen.getByText('Comprehensive Assessment')).toBeInTheDocument();
      expect(screen.getByText('Generate Questionnaire')).toBeInTheDocument();
    });

    it('should render quick assessment type with green styling', () => {
      render(
        <GenerateQuestionnaireButton
          payload={{ ...basePayload, assessmentType: 'quick' }}
          onGenerate={jest.fn()}
        />
      );

      expect(screen.getByText('Quick Assessment')).toBeInTheDocument();
    });

    it('should render category_focused assessment type', () => {
      render(
        <GenerateQuestionnaireButton
          payload={{
            ...basePayload,
            assessmentType: 'category_focused',
            selectedCategories: ['Security', 'Privacy'],
          }}
          onGenerate={jest.fn()}
        />
      );

      expect(screen.getByText('Category-Focused Assessment')).toBeInTheDocument();
      expect(screen.getByText(/Security, Privacy/)).toBeInTheDocument();
    });
  });

  describe('optional fields', () => {
    it('should display vendor name when provided', () => {
      render(
        <GenerateQuestionnaireButton
          payload={{ ...basePayload, vendorName: 'Acme AI' }}
          onGenerate={jest.fn()}
        />
      );

      expect(screen.getByText(/Acme AI/)).toBeInTheDocument();
    });

    it('should display vendor and solution name together', () => {
      render(
        <GenerateQuestionnaireButton
          payload={{
            ...basePayload,
            vendorName: 'Acme AI',
            solutionName: 'DiagnoBot',
          }}
          onGenerate={jest.fn()}
        />
      );

      expect(screen.getByText(/Acme AI - DiagnoBot/)).toBeInTheDocument();
    });

    it('should display context summary in italics', () => {
      render(
        <GenerateQuestionnaireButton
          payload={{
            ...basePayload,
            contextSummary: 'Healthcare diagnostic AI solution',
          }}
          onGenerate={jest.fn()}
        />
      );

      expect(
        screen.getByText(/"Healthcare diagnostic AI solution"/)
      ).toBeInTheDocument();
    });

    it('should display estimated questions when provided', () => {
      render(
        <GenerateQuestionnaireButton
          payload={{ ...basePayload, estimatedQuestions: 85 }}
          onGenerate={jest.fn()}
        />
      );

      expect(screen.getByText(/~85 questions/)).toBeInTheDocument();
    });

    it('should use default description when no estimate provided', () => {
      render(
        <GenerateQuestionnaireButton
          payload={basePayload}
          onGenerate={jest.fn()}
        />
      );

      expect(screen.getByText(/~85-95 questions/)).toBeInTheDocument();
    });

    it('should NOT display vendor section when null', () => {
      render(
        <GenerateQuestionnaireButton
          payload={basePayload}
          onGenerate={jest.fn()}
        />
      );

      expect(screen.queryByText(/Vendor:/)).not.toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('should call onGenerate when button clicked', () => {
      const onGenerate = jest.fn();
      render(
        <GenerateQuestionnaireButton
          payload={basePayload}
          onGenerate={onGenerate}
        />
      );

      fireEvent.click(screen.getByText('Generate Questionnaire'));

      expect(onGenerate).toHaveBeenCalledTimes(1);
    });

    it('should NOT call onGenerate when disabled', () => {
      const onGenerate = jest.fn();
      render(
        <GenerateQuestionnaireButton
          payload={basePayload}
          onGenerate={onGenerate}
          isGenerating={true}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();

      fireEvent.click(button);
      expect(onGenerate).not.toHaveBeenCalled();
    });

    it('should find button by data-testid', () => {
      render(
        <GenerateQuestionnaireButton
          payload={basePayload}
          onGenerate={jest.fn()}
        />
      );

      expect(screen.getByTestId('questionnaire-ready-card')).toBeInTheDocument();
      expect(screen.getByTestId('generate-questionnaire-btn')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show loading text when generating', () => {
      render(
        <GenerateQuestionnaireButton
          payload={basePayload}
          onGenerate={jest.fn()}
          isGenerating={true}
        />
      );

      expect(screen.getByText('Generating...')).toBeInTheDocument();
      expect(screen.getByText('Generating Questionnaire...')).toBeInTheDocument();
    });

    it('should disable button when generating', () => {
      render(
        <GenerateQuestionnaireButton
          payload={basePayload}
          onGenerate={jest.fn()}
          isGenerating={true}
        />
      );

      expect(screen.getByRole('button')).toBeDisabled();
    });
  });
});
