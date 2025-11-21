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
})
