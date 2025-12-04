declare namespace NodeJS {
  interface ProcessEnv {
    // Server
    PORT?: string;
    CORS_ORIGIN?: string;
    NODE_ENV?: 'development' | 'production' | 'test';

    // Database
    DATABASE_URL?: string;

    // JWT
    JWT_SECRET?: string;
    JWT_EXPIRES_IN?: string;

    // Claude API
    ANTHROPIC_API_KEY?: string;
    CLAUDE_PROMPT_CACHE?: string;
    CLAUDE_PROMPT_CACHE_PREFIX?: string;

    // Rate Limiting
    RATE_LIMIT_MAX_MESSAGES?: string;
    RATE_LIMIT_WINDOW_MS?: string;

    /**
     * Dev testing: Skip Claude API and return fixture questionnaire
     * Only works in non-production, non-test environments
     */
    GUARDIAN_FAST_GENERATION?: 'true' | 'false';
  }
}
