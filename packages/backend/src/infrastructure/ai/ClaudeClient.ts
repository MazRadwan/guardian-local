/**
 * ClaudeClient - Facade implementing IClaudeClient, IVisionClient, ILLMClient
 *
 * Delegates text operations to ClaudeTextClient, vision operations to
 * ClaudeVisionClient, and streaming/tool operations to ClaudeStreamClient.
 *
 * Story 39.4.3: Split into focused modules
 * Story 39.4.4: Extracted streamWithTool to ClaudeStreamClient
 * Epic 30: Extended with ContentBlock array support for multimodal messages
 * Epic 39: onUsage callback for metrics collection
 */

import type {
  IClaudeClient,
  ClaudeMessage,
  ClaudeResponse,
  StreamChunk,
  ClaudeRequestOptions,
  ToolUseBlock,
  ToolResultBlock,
} from '../../application/interfaces/IClaudeClient.js';
import type {
  IVisionClient,
  VisionContent,
  VisionRequest,
  VisionResponse,
} from '../../application/interfaces/IVisionClient.js';
import type {
  ILLMClient,
  StreamWithToolOptions,
} from '../../application/interfaces/ILLMClient.js';
import type { ImageContentBlock } from './types/index.js';
import { ClaudeTextClient } from './ClaudeTextClient.js';
import { ClaudeVisionClient } from './ClaudeVisionClient.js';
import { ClaudeStreamClient } from './ClaudeStreamClient.js';

export { ClaudeAPIError } from './ClaudeClientBase.js';

export class ClaudeClient implements IClaudeClient, IVisionClient, ILLMClient {
  private textClient: ClaudeTextClient;
  private visionClient: ClaudeVisionClient;
  private streamClient: ClaudeStreamClient;

  constructor(apiKey: string) {
    this.textClient = new ClaudeTextClient(apiKey);
    this.visionClient = new ClaudeVisionClient(apiKey);
    this.streamClient = new ClaudeStreamClient(apiKey);
  }

  // =========================================================================
  // IClaudeClient delegation to ClaudeTextClient
  // =========================================================================

  sendMessage(
    messages: ClaudeMessage[],
    options?: ClaudeRequestOptions
  ): Promise<ClaudeResponse> {
    return this.textClient.sendMessage(messages, options);
  }

  streamMessage(
    messages: ClaudeMessage[],
    options?: ClaudeRequestOptions,
    imageBlocks?: ImageContentBlock[]
  ): AsyncGenerator<StreamChunk> {
    return this.textClient.streamMessage(messages, options, imageBlocks);
  }

  continueWithToolResult(
    messages: ClaudeMessage[],
    toolUseBlocks: ToolUseBlock[],
    toolResults: ToolResultBlock[],
    options?: ClaudeRequestOptions
  ): AsyncGenerator<StreamChunk> {
    return this.textClient.continueWithToolResult(messages, toolUseBlocks, toolResults, options);
  }

  // =========================================================================
  // IVisionClient delegation to ClaudeVisionClient
  // =========================================================================

  analyzeImages(request: VisionRequest): Promise<VisionResponse> {
    return this.visionClient.analyzeImages(request);
  }

  prepareDocument(buffer: Buffer, mimeType: string): Promise<VisionContent[]> {
    return this.visionClient.prepareDocument(buffer, mimeType);
  }

  // =========================================================================
  // ILLMClient delegation to ClaudeStreamClient
  // =========================================================================

  getModelId(): string {
    return this.streamClient.getModelId();
  }

  async streamWithTool(options: StreamWithToolOptions): Promise<void> {
    return this.streamClient.streamWithTool(options);
  }
}
