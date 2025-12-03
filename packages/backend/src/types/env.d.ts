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
     * Feature flag: Use Claude tool calls for questionnaire trigger
     * Must be exactly 'true' or 'false' (or undefined)
     */
    USE_TOOL_BASED_TRIGGER?: 'true' | 'false';
  }
}
