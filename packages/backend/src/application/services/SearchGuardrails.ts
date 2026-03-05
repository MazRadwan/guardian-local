/**
 * SearchGuardrails - Security guardrails for web search tool
 *
 * Server-side defenses against:
 * 1. Off-topic queries (topic scope enforcement)
 * 2. Prompt injection in queries (pattern stripping)
 * 3. Indirect prompt injection in search results (content sanitization)
 *
 * These run BEFORE external API calls (query guards) and
 * AFTER results return (result sanitization), independent of model behavior.
 */

/**
 * Allowed keyword list for topic scope enforcement.
 * Queries must contain at least one of these to pass.
 */
const ALLOWED_KEYWORDS = [
  'health', 'medical', 'clinical', 'patient', 'hospital', 'physician', 'nurse',
  'ai', 'artificial intelligence', 'machine learning', 'algorithm', 'model',
  'governance', 'compliance', 'regulation', 'privacy', 'security', 'risk',
  'pipeda', 'hipaa', 'atipp', 'nist', 'iso', 'gdpr', 'fda', 'health canada',
  'vendor', 'assessment', 'audit', 'framework', 'policy', 'data protection',
  'phi', 'pii', 'ehr', 'emr', 'dicom', 'hl7', 'fhir',
  'bias', 'fairness', 'transparency', 'explainability', 'accountability',
  'cybersecurity', 'encryption', 'authentication', 'access control',
  'pharmaceutical', 'diagnostic', 'radiology', 'pathology', 'genomic',
  'telemedicine', 'telehealth', 'digital health', 'saas', 'cloud',
];

/**
 * Enforce topic scope: only allow healthcare/AI governance related queries.
 * Server-side enforcement — does not rely on model self-gating.
 * @returns Error message if off-topic, null if allowed
 */
export function enforceTopicScope(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  const hasRelevantTopic = ALLOWED_KEYWORDS.some(kw => lowerQuery.includes(kw));
  if (!hasRelevantTopic) {
    console.warn(`[SearchGuardrails] Blocked off-topic query: "${query}"`);
    return 'Search restricted to healthcare AI governance topics. Please rephrase your query to relate to healthcare, AI, compliance, or risk assessment.';
  }
  return null;
}

/**
 * Strip prompt injection patterns from search queries.
 * Prevents adversarial queries from being forwarded to external APIs.
 */
export function stripInjectionPatterns(query: string): string {
  let cleaned = query;

  // Remove common injection prefixes
  cleaned = cleaned.replace(
    /\b(ignore|forget|disregard)\s+(all\s+)?(previous|prior|above|system)\s+(instructions?|prompts?|rules?|context)\b/gi,
    ''
  );
  cleaned = cleaned.replace(
    /\b(you\s+are\s+now|pretend\s+(to\s+be|you\s+are)|act\s+as)\b/gi,
    ''
  );
  cleaned = cleaned.replace(
    /\b(system\s*prompt|internal\s*instructions?|reveal\s+(your|the)\s+(prompt|instructions?))\b/gi,
    ''
  );

  // Remove encoded/obfuscated injection attempts
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, ''); // zero-width chars
  cleaned = cleaned.replace(/<[^>]+>/g, ''); // HTML tags
  cleaned = cleaned.replace(/\{[^}]*\}/g, ''); // JSON-like payloads

  return cleaned.trim() || query; // fallback to original if fully stripped
}

/**
 * Sanitize content from search results to prevent indirect prompt injection.
 * Strips patterns that could influence model behavior when results are fed back.
 */
export function sanitizeResultContent(content: string): string {
  let sanitized = content;

  // Strip instruction-like patterns that could hijack the model
  sanitized = sanitized.replace(
    /\b(IMPORTANT|CRITICAL|SYSTEM|INSTRUCTION|NOTE TO AI|ASSISTANT):\s*[^\n]{0,200}(ignore|forget|disregard|override|new instructions?)/gi,
    '[CONTENT_FILTERED]'
  );
  sanitized = sanitized.replace(/<\/?(?:script|style|iframe|object|embed)[^>]*>/gi, '');

  // Strip base64-encoded payloads (potential exfil vectors)
  sanitized = sanitized.replace(
    /data:[a-z]+\/[a-z]+;base64,[A-Za-z0-9+/=]{100,}/g,
    '[BASE64_REMOVED]'
  );

  return sanitized;
}
