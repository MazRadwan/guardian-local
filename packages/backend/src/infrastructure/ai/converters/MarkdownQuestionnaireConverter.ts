/**
 * Converts markdown-formatted questionnaire to JSON envelope
 * matching QuestionParser expected input format.
 *
 * Expected markdown format:
 * ## Section 1: Privacy Compliance
 * 1. Question text here?
 * 2. Another question?
 *
 * ## Section 2: Security Architecture
 * 1. Security question?
 */

export interface ConvertedQuestion {
  sectionName: string;
  sectionNumber: number;
  questionNumber: number;
  questionText: string;
  questionType: 'text' | 'enum' | 'boolean';
  questionMetadata?: {
    required?: boolean;
    helpText?: string;
    enumOptions?: string[];
  };
}

export interface ConvertedQuestionnaire {
  questions: ConvertedQuestion[];
}

export class MarkdownQuestionnaireConverter {
  private static readonly SECTION_REGEX = /^##\s*Section\s*(\d+):\s*(.+)$/i;
  private static readonly QUESTION_REGEX = /^(\d+)\.\s*(.+)$/;

  /**
   * Convert markdown questionnaire to JSON envelope
   * @param markdown - Raw markdown with section headers and numbered questions
   * @returns JSON envelope matching QuestionParser expected format
   * @throws Error if no sections found or invalid format
   */
  static convert(markdown: string): ConvertedQuestionnaire {
    const sections = this.extractSections(markdown);

    if (sections.length === 0) {
      throw new Error('No sections found in questionnaire markdown. Expected format: "## Section N: Name"');
    }

    const questions: ConvertedQuestion[] = [];

    for (const section of sections) {
      const sectionQuestions = this.extractQuestions(section);
      questions.push(...sectionQuestions);
    }

    if (questions.length === 0) {
      throw new Error('No questions found in questionnaire markdown. Expected format: "1. Question text"');
    }

    return { questions };
  }

  /**
   * Extract sections from markdown
   */
  private static extractSections(markdown: string): Array<{
    sectionNumber: number;
    sectionName: string;
    content: string;
  }> {
    const lines = markdown.split('\n');
    const sections: Array<{ sectionNumber: number; sectionName: string; content: string }> = [];

    let currentSection: { sectionNumber: number; sectionName: string; lines: string[] } | null = null;

    for (const line of lines) {
      const sectionMatch = line.match(this.SECTION_REGEX);

      if (sectionMatch) {
        // Save previous section
        if (currentSection) {
          sections.push({
            sectionNumber: currentSection.sectionNumber,
            sectionName: currentSection.sectionName,
            content: currentSection.lines.join('\n'),
          });
        }

        // Start new section
        currentSection = {
          sectionNumber: parseInt(sectionMatch[1], 10),
          sectionName: sectionMatch[2].trim(),
          lines: [],
        };
      } else if (currentSection) {
        currentSection.lines.push(line);
      }
    }

    // Don't forget last section
    if (currentSection) {
      sections.push({
        sectionNumber: currentSection.sectionNumber,
        sectionName: currentSection.sectionName,
        content: currentSection.lines.join('\n'),
      });
    }

    return sections;
  }

  /**
   * Extract questions from a section
   */
  private static extractQuestions(section: {
    sectionNumber: number;
    sectionName: string;
    content: string;
  }): ConvertedQuestion[] {
    const questions: ConvertedQuestion[] = [];
    const lines = section.content.split('\n');

    let currentQuestionNum: number | null = null;
    let currentQuestionLines: string[] = [];

    const saveCurrentQuestion = () => {
      if (currentQuestionNum !== null && currentQuestionLines.length > 0) {
        const questionText = currentQuestionLines.join(' ').trim();

        // Skip questions shorter than 10 characters (likely parsing artifacts)
        if (questionText.length >= 10) {
          questions.push({
            sectionName: section.sectionName,
            sectionNumber: section.sectionNumber,
            questionNumber: currentQuestionNum,
            questionText,
            questionType: this.inferQuestionType(questionText),
            questionMetadata: {
              required: true,
            },
          });
        }
      }
    };

    for (const line of lines) {
      const questionMatch = line.match(this.QUESTION_REGEX);

      if (questionMatch) {
        // Save previous question
        saveCurrentQuestion();

        // Start new question
        currentQuestionNum = parseInt(questionMatch[1], 10);
        currentQuestionLines = [questionMatch[2].trim()];
      } else if (currentQuestionNum !== null && line.trim()) {
        // Continuation of current question (multi-line)
        currentQuestionLines.push(line.trim());
      }
    }

    // Don't forget last question
    saveCurrentQuestion();

    return questions;
  }

  /**
   * Infer question type from text content
   *
   * TODO: Future enhancement - support explicit metadata hints in markdown:
   *   1. Question text here? [Type: enum] [Options: High, Medium, Low]
   *   or
   *   1. Question text here?
   *      Type: enum
   *      Options: High, Medium, Low
   *
   * This would allow prompt engineering to specify exact types/options
   * without relying solely on text inference.
   */
  private static inferQuestionType(text: string): 'text' | 'enum' | 'boolean' {
    const lowerText = text.toLowerCase();

    // Boolean indicators
    if (
      lowerText.includes('yes or no') ||
      lowerText.includes('(yes/no)') ||
      lowerText.includes('yes/no') ||
      lowerText.match(/^(does|is|are|has|have|can|will|do)\s/i)
    ) {
      return 'boolean';
    }

    // TODO: Add enum detection for patterns like:
    // - "select from:" or "choose:"
    // - "[Options: A, B, C]" inline hints
    // - Indented "Options:" block after question

    // For now, default to text
    return 'text';
  }
}
