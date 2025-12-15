/**
 * IVisionClient - Interface for Claude Vision operations
 *
 * Part of Epic 16: Document Parser Infrastructure
 */

export interface VisionContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    data: string;
  };
}

export interface VisionRequest {
  /** Images to analyze (max 20) */
  images: VisionContent[];

  /** Prompt for analysis */
  prompt: string;

  /** System prompt */
  systemPrompt?: string;

  /** Max tokens for response */
  maxTokens?: number;
}

export interface VisionResponse {
  /** Extracted text/analysis */
  content: string;

  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };

  /** Stop reason */
  stopReason: string;
}

export interface IVisionClient {
  /**
   * Analyze images with Claude Vision
   */
  analyzeImages(request: VisionRequest): Promise<VisionResponse>;

  /**
   * Convert document buffer to vision-ready images
   */
  prepareDocument(buffer: Buffer, mimeType: string): Promise<VisionContent[]>;
}
