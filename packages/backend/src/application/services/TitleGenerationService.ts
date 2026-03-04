/**
 * Title Generation Service
 *
 * Epic 25: Chat Title Intelligence
 * Generates meaningful, context-aware titles for conversations using Claude Haiku.
 *
 * Story 25.1: Core title generation with LLM
 * Story 25.2: Mode-aware title strategies
 * Story 25.9: Skip LLM prompt message for scoring mode
 */

import Anthropic from '@anthropic-ai/sdk';
import { getMaxTokens, getModelId } from '../../infrastructure/ai/ClaudeClientBase.js';
import { ConversationMode } from '../../domain/entities/Conversation.js';

/**
 * Placeholder titles for each mode
 * Story 25.9: Centralized constants for consistency
 */
export const PLACEHOLDER_TITLES = {
  DEFAULT: 'New Chat',
  ASSESSMENT: 'New Assessment',
  SCORING: 'Scoring Analysis',
} as const;

/**
 * Check if a title is a placeholder (auto-generation should proceed)
 * Story 25.9: Used for idempotency guard
 *
 * @param title - Title to check
 * @returns true if title is null or a known placeholder
 */
export function isPlaceholderTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  return Object.values(PLACEHOLDER_TITLES).includes(title as typeof PLACEHOLDER_TITLES[keyof typeof PLACEHOLDER_TITLES]);
}

/**
 * Context for title generation
 */
export interface TitleContext {
  mode: ConversationMode;
  userMessage?: string;
  assistantResponse?: string;
  metadata?: {
    vendorName?: string;
    solutionName?: string;
    filename?: string;
  };
}

/**
 * Title generation result
 */
export interface TitleGenerationResult {
  title: string;
  source: 'llm' | 'vendor' | 'filename' | 'default';
}

/**
 * Maximum title length (for sidebar display)
 */
const MAX_TITLE_LENGTH = 50;

/**
 * Claude Haiku model for fast, low-cost title generation
 */
const HAIKU_MODEL = getModelId('claude-3-haiku-20240307');

/**
 * System prompt for title generation
 */
const TITLE_GENERATION_PROMPT = `Generate a concise 3-6 word title for this conversation.
Be specific and descriptive. Do not use quotes.
Focus on the main topic or question being discussed.
The title should be scannable in a sidebar.`;

export class TitleGenerationService {
  private client: Anthropic | null = null;

  constructor(private readonly apiKey?: string) {
    // Initialize Anthropic client if API key provided
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  /**
   * Generate a title using Claude Haiku
   * Returns null on API error (graceful degradation)
   *
   * Story 25.1: Core LLM-based title generation
   */
  async generateTitle(context: TitleContext): Promise<string | null> {
    // Validate context
    if (!context.userMessage && !context.assistantResponse) {
      return null;
    }

    // If no API client, return null (graceful degradation)
    if (!this.client) {
      console.warn('[TitleGenerationService] No API key configured, cannot generate title');
      return null;
    }

    try {
      const userPrompt = this.buildUserPrompt(context);

      const response = await this.client.messages.create({
        model: HAIKU_MODEL,
        max_tokens: getMaxTokens(100),
        system: TITLE_GENERATION_PROMPT,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      });

      // Extract text content
      const content = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      // Clean and truncate title
      return this.sanitizeTitle(content);
    } catch (error) {
      console.error('[TitleGenerationService] Failed to generate title:', error);
      return null;
    }
  }

  /**
   * Generate mode-aware title based on conversation context
   *
   * Story 25.2: Mode-specific title strategies
   * - Consult: LLM-generated from Q&A exchange
   * - Assessment: "Assessment: {vendor_name}" or LLM fallback (Story 26.1)
   * - Scoring: "Scoring: {filename}" or "Scoring Analysis"
   */
  async generateModeAwareTitle(context: TitleContext): Promise<TitleGenerationResult> {
    const { mode } = context;

    switch (mode) {
      case 'assessment':
        return this.generateAssessmentTitle(context);

      case 'scoring':
        return this.generateScoringTitle(context.metadata);

      case 'consult':
      default:
        return this.generateConsultTitle(context);
    }
  }

  /**
   * Generate title for assessment mode
   * Uses vendor name or solution name if available, falls back to LLM
   *
   * Story 25.2: Assessment mode title strategy
   * Story 26.1: LLM fallback when no vendor info available
   */
  private async generateAssessmentTitle(
    context: TitleContext
  ): Promise<TitleGenerationResult> {
    const { metadata } = context;

    // If vendor info available, use it (takes precedence over LLM)
    if (metadata?.vendorName) {
      const title = this.sanitizeTitle(`Assessment: ${metadata.vendorName}`);
      return { title, source: 'vendor' };
    }

    if (metadata?.solutionName) {
      const title = this.sanitizeTitle(`Assessment: ${metadata.solutionName}`);
      return { title, source: 'vendor' };
    }

    // Story 26.1: No vendor info - generate LLM title from conversation context
    const llmTitle = await this.generateTitle(context);
    if (llmTitle) {
      return { title: llmTitle, source: 'llm' };
    }

    // Fallback if LLM fails
    return { title: PLACEHOLDER_TITLES.ASSESSMENT, source: 'default' };
  }

  /**
   * Generate title for scoring mode
   * Uses uploaded filename if available
   *
   * Story 25.2 & 25.4: Scoring mode title strategy
   */
  private generateScoringTitle(
    metadata?: TitleContext['metadata']
  ): TitleGenerationResult {
    if (metadata?.filename) {
      const formattedTitle = this.formatScoringTitle(metadata.filename);
      return { title: formattedTitle, source: 'filename' };
    }

    return { title: PLACEHOLDER_TITLES.SCORING, source: 'default' };
  }

  /**
   * Format scoring title from filename
   * Truncates long filenames while preserving extension
   *
   * Story 25.4: Filename truncation strategy
   * Strategy: Keep last 30 chars + extension visible
   */
  formatScoringTitle(filename: string): string {
    const prefix = 'Scoring: ';
    const maxFilenameLength = MAX_TITLE_LENGTH - prefix.length;

    if (filename.length <= maxFilenameLength) {
      return this.sanitizeTitle(`${prefix}${filename}`);
    }

    // Extract extension
    const lastDot = filename.lastIndexOf('.');
    const extension = lastDot > 0 ? filename.slice(lastDot) : '';
    const baseName = lastDot > 0 ? filename.slice(0, lastDot) : filename;

    // Calculate how much of the base name we can keep
    // Reserve space for "..." and extension
    const availableLength = maxFilenameLength - 3 - extension.length;

    if (availableLength <= 0) {
      // Edge case: very long extension
      return this.sanitizeTitle(`${prefix}${filename.slice(0, maxFilenameLength - 3)}...`);
    }

    const truncatedBase = baseName.slice(0, availableLength);
    return this.sanitizeTitle(`${prefix}${truncatedBase}...${extension}`);
  }

  /**
   * Generate title for consult mode using LLM
   *
   * Story 25.2: Consult mode title strategy
   */
  private async generateConsultTitle(context: TitleContext): Promise<TitleGenerationResult> {
    const llmTitle = await this.generateTitle(context);

    if (llmTitle) {
      return { title: llmTitle, source: 'llm' };
    }

    // Fallback if LLM fails
    return { title: PLACEHOLDER_TITLES.DEFAULT, source: 'default' };
  }

  /**
   * Build user prompt for title generation
   */
  private buildUserPrompt(context: TitleContext): string {
    const parts: string[] = [];

    if (context.userMessage) {
      parts.push(`User: ${context.userMessage}`);
    }

    if (context.assistantResponse) {
      // Truncate long responses to save tokens
      const truncatedResponse =
        context.assistantResponse.length > 500
          ? context.assistantResponse.slice(0, 500) + '...'
          : context.assistantResponse;
      parts.push(`Assistant: ${truncatedResponse}`);
    }

    parts.push('\nTitle:');

    return parts.join('\n');
  }

  /**
   * Clean and truncate title to max length
   */
  private sanitizeTitle(rawTitle: string): string {
    // Remove quotes, extra whitespace, and newlines
    let title = rawTitle
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/[\n\r]+/g, ' ') // Replace newlines with spaces
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim();

    // Truncate to max length
    if (title.length > MAX_TITLE_LENGTH) {
      title = title.slice(0, MAX_TITLE_LENGTH - 3).trim() + '...';
    }

    return title;
  }
}
