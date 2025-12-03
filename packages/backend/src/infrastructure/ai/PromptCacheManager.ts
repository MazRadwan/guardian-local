import { createHash } from 'crypto';
import type { ConversationMode } from '../../domain/entities/Conversation.js';

type SystemPromptProvider = (mode: ConversationMode, options?: { includeToolInstructions?: boolean }) => string;

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
  private cache = new Map<string, PromptCacheEntry>(); // Changed key to string for mode+options combo
  private readonly enabled: boolean;
  private readonly prefix: string;
  private readonly getPrompt: SystemPromptProvider;

  constructor(config: PromptCacheConfig, promptProvider: SystemPromptProvider) {
    this.enabled = config.enabled;
    this.prefix = config.prefix ?? 'guardian';
    this.getPrompt = promptProvider;
  }

  ensureCached(mode: ConversationMode, options?: { includeToolInstructions?: boolean }): PromptCacheEntry {
    const systemPrompt = this.getPrompt(mode, options);
    const hash = this.hashPrompt(systemPrompt);

    // Create cache key that includes options to differentiate tool-enabled vs tool-disabled prompts
    const cacheKey = `${mode}-${options?.includeToolInstructions !== false ? 'with-tools' : 'no-tools'}`;
    const existing = this.cache.get(cacheKey);

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

    this.cache.set(cacheKey, entry);
    return entry;
  }

  private hashPrompt(prompt: string): string {
    return createHash('sha256').update(prompt).digest('hex').slice(0, 16);
  }
}
