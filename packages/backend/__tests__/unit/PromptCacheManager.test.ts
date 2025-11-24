import { describe, it, expect } from '@jest/globals'
import { PromptCacheManager } from '../../src/infrastructure/ai/PromptCacheManager'
import type { ConversationMode } from '../../src/domain/entities/Conversation'

const mockPromptProvider = (suffix: string) => (mode: ConversationMode) => `prompt-${suffix}-${mode}`

describe('PromptCacheManager', () => {
  it('returns cache metadata when enabled', () => {
    const manager = new PromptCacheManager({ enabled: true, prefix: 'test' }, mockPromptProvider('v1'))

    const entry = manager.ensureCached('consult')

    expect(entry.usePromptCache).toBe(true)
    expect(entry.cachedPromptId).toContain('test-consult')
    expect(entry.hash).toHaveLength(16)
  })

  it('does not return cache id when disabled', () => {
    const manager = new PromptCacheManager({ enabled: false, prefix: 'test' }, mockPromptProvider('v1'))

    const entry = manager.ensureCached('assessment')

    expect(entry.usePromptCache).toBe(false)
    expect(entry.cachedPromptId).toBeUndefined()
  })

  it('recomputes when prompt content changes', () => {
    let variant = 'v1'
    const provider = (mode: ConversationMode) => `prompt-${variant}-${mode}`
    const manager = new PromptCacheManager({ enabled: true, prefix: 'test' }, provider)

    const first = manager.ensureCached('consult')
    variant = 'v2'
    const updated = manager.ensureCached('consult')

    expect(first.hash).not.toEqual(updated.hash)
    expect(first.cachedPromptId).not.toEqual(updated.cachedPromptId)
  })

  it('deduplicates by hash for same mode and content', () => {
    const manager = new PromptCacheManager(
      { enabled: true, prefix: 'test' },
      mockPromptProvider('v1')
    )

    const first = manager.ensureCached('consult')
    const second = manager.ensureCached('consult')

    expect(first).toBe(second) // Same object reference (cached)
    expect(first.hash).toEqual(second.hash)
    expect(first.cachedPromptId).toEqual(second.cachedPromptId)
  })

  it('generates different cache IDs for different modes', () => {
    const manager = new PromptCacheManager(
      { enabled: true, prefix: 'test' },
      mockPromptProvider('v1')
    )

    const consult = manager.ensureCached('consult')
    const assessment = manager.ensureCached('assessment')

    expect(consult.cachedPromptId).not.toEqual(assessment.cachedPromptId)
    expect(consult.hash).not.toEqual(assessment.hash)
    expect(consult.mode).toBe('consult')
    expect(assessment.mode).toBe('assessment')
  })

  it('uses custom prefix in cache ID', () => {
    const manager = new PromptCacheManager(
      { enabled: true, prefix: 'custom-prefix' },
      mockPromptProvider('v1')
    )

    const entry = manager.ensureCached('consult')

    expect(entry.cachedPromptId).toContain('custom-prefix-consult')
  })

  it('defaults to "guardian" prefix when not specified', () => {
    const manager = new PromptCacheManager(
      { enabled: true },
      mockPromptProvider('v1')
    )

    const entry = manager.ensureCached('consult')

    expect(entry.cachedPromptId).toContain('guardian-consult')
  })

  it('hashes produce consistent 16-character strings', () => {
    const manager = new PromptCacheManager(
      { enabled: true, prefix: 'test' },
      mockPromptProvider('v1')
    )

    const entry1 = manager.ensureCached('consult')
    const entry2 = manager.ensureCached('consult')

    expect(entry1.hash).toHaveLength(16)
    expect(entry1.hash).toEqual(entry2.hash)
    expect(entry1.hash).toMatch(/^[0-9a-f]{16}$/) // Hex string
  })
})
