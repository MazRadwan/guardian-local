export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.test.ts'],

  // Setup files run BEFORE test files are imported
  // This sets DATABASE_URL to TEST_DATABASE_URL before the db client initializes
  setupFiles: ['<rootDir>/__tests__/setup/jest.integration.setup.ts'],

  // Performance: Prevent resource exhaustion from parallel tests
  // E2E tests spawn servers, databases, and Puppeteer browsers
  maxWorkers: 1, // Run sequentially to prevent resource exhaustion
  testTimeout: 30000, // 30 second default timeout

  // Memory management
  workerIdleMemoryLimit: '512MB',

  // NOTE: Do NOT use forceExit/detectOpenHandles here - they mask real leaks
  // Use --detectOpenHandles CLI flag when debugging handle leaks

  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Mock ESM-only packages
    '^uuid$': '<rootDir>/__tests__/__mocks__/uuid.ts',
    '^file-type$': '<rootDir>/__tests__/__mocks__/file-type.ts',
    '^marked$': '<rootDir>/__tests__/__mocks__/marked.ts',
    '^isomorphic-dompurify$': '<rootDir>/__tests__/__mocks__/isomorphic-dompurify.ts',
  },
  // Transform ESM packages
  transformIgnorePatterns: [
    '/node_modules/(?!(uuid|file-type|strtok3|token-types|peek-readable|marked)/)',
  ],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'NodeNext',
          target: 'ES2022',
          moduleResolution: 'NodeNext',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          rootDir: '.',
        },
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/*.test.ts'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
}
