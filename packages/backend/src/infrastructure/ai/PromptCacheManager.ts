import { createHash } from 'crypto';
import type { ConversationMode } from '../../domain/entities/Conversation.js';

type SystemPromptProvider = (mode: ConversationMode) => string;

export interface PromptCacheConfig {
  enabled: boolean;
  prefix?: string;
}

export interface PromptCacheEntry {
  mode: ConversationMode;
  hash: string;
  systemPrompt: string;
  cachedPromptId?: string;
  usePromptCache: boolean;
}

/**
 * PromptCacheManager
 *
 * Provides a thin orchestration layer for Anthropic prompt caching.
 * - Computes stable hashes for prompts per mode
 * - Generates cache identifiers scoped by prefix/mode/hash
 * - Allows callers to decide whether to enable `cache_control` on requests
 */
export class PromptCacheManager {
  private cache = new Map<ConversationMode, PromptCacheEntry>();
  private readonly enabled: boolean;
  private readonly prefix: string;
  private readonly getPrompt: SystemPromptProvider;

  constructor(config: PromptCacheConfig, promptProvider: SystemPromptProvider) {
    this.enabled = config.enabled;
    this.prefix = config.prefix ?? 'guardian';
    this.getPrompt = promptProvider;
  }

  ensureCached(mode: ConversationMode): PromptCacheEntry {
    const systemPrompt = this.getPrompt(mode);
    const hash = this.hashPrompt(systemPrompt);
    const existing = this.cache.get(mode);

    if (existing && existing.hash === hash) {
      return existing;
    }

    const cachedPromptId = this.enabled ? `${this.prefix}-${mode}-${hash}` : undefined;

    const entry: PromptCacheEntry = {
      mode,
      hash,
      systemPrompt,
      cachedPromptId,
      usePromptCache: this.enabled,
    };

    this.cache.set(mode, entry);
    return entry;
  }

  private hashPrompt(prompt: string): string {
    return createHash('sha256').update(prompt).digest('hex').slice(0, 16);
  }
}
