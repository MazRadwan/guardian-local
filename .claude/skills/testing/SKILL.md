---
name: testing-guardian
description: Write and run tests for Guardian app features. Use when implementing features, fixing bugs, writing tests, or when tests fail. Covers unit, integration, and E2E testing with Jest and Playwright.
---

# Testing Guardian App

This skill helps you write effective tests and run them efficiently.

## Quick Reference: Which Command?

| Situation | Command | Why |
|-----------|---------|-----|
| **Working on a file** | `pnpm --filter @guardian/backend test:watch:unit` | Instant feedback on changes |
| **Quick validation** | `pnpm test:unit` | Fast, catches most issues |
| **Changed DB/repos** | `pnpm test:integration` | Verify DB operations |
| **Before commit** | `pnpm test:unit` + `test:integration` if DB touched | Comprehensive check |
| **Before PR** | `pnpm test` | Full validation |
| **Specific file** | `pnpm --filter @guardian/backend test -- path/to/file.test.ts` | Target one test file |

## Test Structure

```
packages/backend/__tests__/
├── unit/                    # Fast, no I/O
│   ├── domain/              # Entities, value objects
│   ├── application/         # Services (mock deps)
│   └── infrastructure/      # Middleware, utils
├── integration/             # Real test DB
└── e2e/                     # Full workflows

apps/web/
├── e2e/                     # Playwright specs
└── src/**/__tests__/        # Co-located unit tests
```

## Writing Tests by Layer

### Domain Layer (Unit Tests)

**Location:** `__tests__/unit/domain/`
**Approach:** TDD - write test first
**Mocks:** None needed

```typescript
// Example: Testing a value object
describe('Email', () => {
  it('should reject invalid email format', () => {
    expect(() => Email.create('invalid')).toThrow('Invalid email format');
  });

  it('should normalize email to lowercase', () => {
    const email = Email.create('Test@Example.COM');
    expect(email.value).toBe('test@example.com');
  });
});
```

**Test what:**
- Validation rules
- Business logic
- Edge cases
- Error conditions

**Don't test:**
- Simple getters with no logic

---

### Application Layer (Unit Tests)

**Location:** `__tests__/unit/application/`
**Approach:** Write with implementation
**Mocks:** Repositories, external APIs, Claude client

```typescript
// Example: Testing a service
describe('AuthService', () => {
  let authService: AuthService;
  let mockUserRepo: jest.Mocked<IUserRepository>;

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: jest.fn(),
      save: jest.fn(),
    };
    authService = new AuthService(mockUserRepo);
  });

  it('should throw if user not found', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    await expect(authService.login('x@y.com', 'pass'))
      .rejects.toThrow('Invalid credentials');
  });
});
```

**Mock patterns:**
```typescript
// Mock repository
const mockRepo = { findById: jest.fn(), save: jest.fn() };

// Mock Claude client
const mockClaude = { sendMessage: jest.fn().mockResolvedValue({ content: '...' }) };

// Mock file storage
const mockStorage = { upload: jest.fn().mockResolvedValue('file-id') };
```

---

### Infrastructure Layer (Integration Tests)

**Location:** `__tests__/integration/`
**Approach:** Write after implementation
**Mocks:** None - use real test DB

```typescript
// Example: Testing a repository
describe('DrizzleUserRepository', () => {
  let repo: DrizzleUserRepository;
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await TestDatabase.create();
    repo = new DrizzleUserRepository(testDb.client);
  });

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await testDb.truncate(['users']);
  });

  it('should save and retrieve user', async () => {
    const user = User.create({ email: 'test@example.com', ... });
    await repo.save(user);

    const found = await repo.findByEmail('test@example.com');
    expect(found?.email.value).toBe('test@example.com');
  });
});
```

---

### UI Components (Unit Tests)

**Location:** `src/components/**/__tests__/`
**Approach:** Write with implementation
**Mocks:** Hooks, services, stores

```typescript
// Example: Testing a component
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the hook
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { name: 'Test' }, logout: jest.fn() })
}));

describe('Sidebar', () => {
  it('should display user name', () => {
    render(<Sidebar />);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('should call logout on button click', async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    await user.click(screen.getByRole('button', { name: /logout/i }));
    // Assert logout was called
  });
});
```

---

## Diagnosing Test Issues

### Test is slow (>1s for unit test)

**Symptoms:** Unit test takes seconds instead of milliseconds

**Likely causes:**
1. Making real network calls (missing mock)
2. Hitting real database (should be unit, not integration)
3. Using real timers (use `jest.useFakeTimers()`)

**Fix:**
```typescript
// Add missing mock
jest.mock('@/services/api', () => ({
  fetchData: jest.fn().mockResolvedValue({ ... })
}));

// Use fake timers
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
```

### Test is flaky (passes sometimes)

**Symptoms:** Test passes locally, fails in CI (or vice versa)

**Likely causes:**
1. Race condition (not awaiting async)
2. Test order dependency (shared state)
3. Timing-dependent assertions

**Fix:**
```typescript
// Always await async operations
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});

// Reset state between tests
beforeEach(() => {
  jest.clearAllMocks();
  // Reset any global state
});

// Don't use arbitrary timeouts
// BAD: await new Promise(r => setTimeout(r, 1000));
// GOOD: await waitFor(() => expect(...));
```

### Test fails with "not found"

**Symptoms:** `Unable to find element with text: ...`

**Likely causes:**
1. Element not rendered yet (async)
2. Wrong query method
3. Text doesn't match exactly

**Fix:**
```typescript
// Wait for async render
await screen.findByText('Expected Text');

// Use flexible matching
screen.getByText(/expected/i);  // Case insensitive
screen.getByRole('button', { name: /submit/i });  // By role
```

---

## What NOT to Test

Save time by skipping tests for:

| Skip | Example | Why |
|------|---------|-----|
| Simple getters | `get name() { return this._name; }` | No logic to test |
| Framework code | Express route definitions | Framework is tested |
| Pass-throughs | `save(x) { return this.repo.save(x); }` | Just delegation |
| Third-party libs | Zod schema parsing | Library is tested |
| Type definitions | Interface declarations | TypeScript checks these |

**Do test:**
- Business logic and validation
- Error handling and edge cases
- Integration points (with integration tests)
- User interactions (with component tests)

---

## Common Patterns

### Testing async operations

```typescript
it('should handle async operation', async () => {
  const result = await service.doAsyncThing();
  expect(result).toBeDefined();
});
```

### Testing errors

```typescript
it('should throw on invalid input', async () => {
  await expect(service.process(null))
    .rejects.toThrow('Input required');
});
```

### Testing with fixtures

```typescript
import { userFixture } from '../fixtures/user';

it('should process user', () => {
  const result = service.process(userFixture);
  expect(result.processed).toBe(true);
});
```

### Snapshot testing (use sparingly)

```typescript
it('should match snapshot', () => {
  const { container } = render(<Component />);
  expect(container).toMatchSnapshot();
});
```

---

## Test File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Unit test | `*.test.ts` | `Email.test.ts` |
| Integration | `*.test.ts` in integration/ | `DrizzleUserRepository.test.ts` |
| E2E (Jest) | `*.test.ts` in e2e/ | `auth.test.ts` |
| E2E (Playwright) | `*.spec.ts` | `export-resume.spec.ts` |

---

## Before You Run Tests

1. **Ensure test DB is running** (for integration tests):
   ```bash
   docker-compose up -d
   ```

2. **Start watch mode** (for development):
   ```bash
   pnpm --filter @guardian/backend test:watch:unit
   ```

3. **Run specific test file**:
   ```bash
   pnpm --filter @guardian/backend test -- __tests__/unit/MyService.test.ts
   ```

---

## Is the Code Wrong or the Test Wrong?

When a test fails, determine the root cause before fixing.

### Signals the CODE is Wrong

| Signal | Why |
|--------|-----|
| Test was passing, now fails after code change | You broke something |
| Multiple tests for same feature failing | Systemic issue in code |
| Test logic is simple and matches spec | Test is probably right |
| Test has been stable for months | Unlikely to be the test |
| Error shows wrong output/exception | Code behavior changed |

### Signals the TEST is Wrong

| Signal | Why |
|--------|-----|
| Test was just written or modified | New tests have bugs too |
| Only 1 test fails, similar tests pass | Test might be overly specific |
| Test checks implementation details | Brittle to refactoring |
| Test expectation doesn't match docs/spec | Test misunderstands requirements |
| Assertion is too specific (exact strings, timestamps) | Test is fragile |
| Test setup is complex/convoluted | Setup might be wrong |

### Diagnostic Steps

1. **Read BOTH** the test AND the code under test
2. **Check git blame** - who changed what recently?
3. **Ask:** "Does the test match the documented behavior?"
4. **Run related tests** - pattern or isolated failure?
5. **Check:** Is it testing behavior vs implementation details?

### Quick Heuristic

```
IF test existed before your changes AND was passing
  → Your code is probably wrong

IF you just wrote the test AND it fails
  → Either could be wrong, verify both

IF test checks exact strings/formats that changed
  → Test is probably too brittle, update it

IF multiple tests fail after your change
  → Your code is probably wrong
```

### Examples

**Code is wrong:**
```typescript
// Test: "should return user email in lowercase"
// Expected: "test@example.com"
// Actual: "TEST@EXAMPLE.COM"
// → Code forgot to normalize, fix the code
```

**Test is wrong:**
```typescript
// Test: "should return error message"
// Expected: "User not found"
// Actual: "User with email test@x.com not found"
// → Test is too specific about message format, fix the test
```

**Test is brittle:**
```typescript
// BAD: Exact timestamp match
expect(result.createdAt).toBe('2024-01-15T10:30:00Z');

// GOOD: Check it's a valid date
expect(result.createdAt).toBeInstanceOf(Date);
```

---

## Checklist: Is My Test Good?

- [ ] Test has a clear, descriptive name
- [ ] Test tests ONE behavior (single assertion concept)
- [ ] Test is independent (doesn't rely on other tests)
- [ ] Test is deterministic (same result every time)
- [ ] Test is fast (<100ms for unit, <1s for integration)
- [ ] Mocks are minimal (only external dependencies)
- [ ] Error cases are covered, not just happy path
