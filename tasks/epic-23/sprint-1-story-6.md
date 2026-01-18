# Story 23.6: Tests for Login Page

**Sprint:** 1
**Epic:** 23 - Login Page Redesign
**Agent:** frontend-agent
**Dependencies:** Stories 23.2-23.5 (all implementation complete)

---

## Description

### What
Create comprehensive tests for the redesigned login page covering rendering, user interactions, form submission, error handling, and loading states.

### Why
Tests ensure the login page works correctly and prevents regressions. All features require tests per project conventions.

---

## Acceptance Criteria

- [ ] Test: renders all form elements (email, password, buttons, links)
- [ ] Test: email input accepts user input
- [ ] Test: password input accepts user input
- [ ] Test: password visibility toggle switches input type
- [ ] Test: form submission calls API with credentials
- [ ] Test: error state displays on authentication failure
- [ ] Test: loading state shows during submission
- [ ] Test: successful login redirects to /chat
- [ ] Test: dev mode button appears when env enabled
- [ ] Test: forgot password link is present
- [ ] Test: create account link navigates to /register
- [ ] All tests pass with `pnpm test:unit`

---

## Technical Approach

### Step 1: Create Test File

**File:** `apps/web/src/app/login/__tests__/page.test.tsx`

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import LoginPage from '../page';
import { useAuth } from '@/hooks/useAuth';
import { login as apiLogin } from '@/lib/api/auth';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/lib/api/auth', () => ({
  login: jest.fn(),
  AuthAPIError: class AuthAPIError extends Error {
    constructor(message: string, public statusCode: number) {
      super(message);
    }
  },
}));

describe('LoginPage', () => {
  const mockRouter = { push: jest.fn() };
  const mockLogin = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useAuth as jest.Mock).mockReturnValue({ login: mockLogin });
  });

  describe('Rendering', () => {
    it('renders Guardian logo and tagline', () => {
      render(<LoginPage />);

      expect(screen.getByText('Guardian')).toBeInTheDocument();
      expect(screen.getByText('AI Governance & Risk Assessment')).toBeInTheDocument();
    });

    it('renders email input', () => {
      render(<LoginPage />);

      expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument();
    });

    it('renders password input', () => {
      render(<LoginPage />);

      expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    });

    it('renders sign in button', () => {
      render(<LoginPage />);

      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('renders forgot password link', () => {
      render(<LoginPage />);

      expect(screen.getByText('Forgot password?')).toBeInTheDocument();
    });

    it('renders create account link', () => {
      render(<LoginPage />);

      expect(screen.getByText('Create an account')).toBeInTheDocument();
    });

    it('renders footer links', () => {
      render(<LoginPage />);

      expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
      expect(screen.getByText('Terms of Service')).toBeInTheDocument();
      expect(screen.getByText('Support')).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('allows typing in email input', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const emailInput = screen.getByPlaceholderText('Email address');
      await user.type(emailInput, 'test@example.com');

      expect(emailInput).toHaveValue('test@example.com');
    });

    it('allows typing in password input', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const passwordInput = screen.getByPlaceholderText('Password');
      await user.type(passwordInput, 'secretpassword');

      expect(passwordInput).toHaveValue('secretpassword');
    });

    it('toggles password visibility', async () => {
      const user = userEvent.setup();
      render(<LoginPage />);

      const passwordInput = screen.getByPlaceholderText('Password');
      const toggleButton = screen.getByLabelText('Show password');

      expect(passwordInput).toHaveAttribute('type', 'password');

      await user.click(toggleButton);

      expect(passwordInput).toHaveAttribute('type', 'text');
      expect(screen.getByLabelText('Hide password')).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('calls API with credentials on submit', async () => {
      const user = userEvent.setup();
      (apiLogin as jest.Mock).mockResolvedValue({
        token: 'test-token',
        user: { id: '1', email: 'test@example.com', name: 'Test', role: 'admin' },
      });

      render(<LoginPage />);

      await user.type(screen.getByPlaceholderText('Email address'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('Password'), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(apiLogin).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123',
        });
      });
    });

    it('shows loading state during submission', async () => {
      const user = userEvent.setup();
      (apiLogin as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<LoginPage />);

      await user.type(screen.getByPlaceholderText('Email address'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('Password'), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      expect(screen.getByText('Signing in...')).toBeInTheDocument();
    });

    it('redirects to /chat on successful login', async () => {
      const user = userEvent.setup();
      (apiLogin as jest.Mock).mockResolvedValue({
        token: 'test-token',
        user: { id: '1', email: 'test@example.com', name: 'Test', role: 'admin' },
      });

      render(<LoginPage />);

      await user.type(screen.getByPlaceholderText('Email address'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('Password'), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/chat');
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error message on invalid credentials', async () => {
      const user = userEvent.setup();
      const { AuthAPIError } = require('@/lib/api/auth');
      (apiLogin as jest.Mock).mockRejectedValue(
        new AuthAPIError('Invalid email or password', 401)
      );

      render(<LoginPage />);

      await user.type(screen.getByPlaceholderText('Email address'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('Password'), 'wrongpassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
      });
    });

    it('displays generic error on network failure', async () => {
      const user = userEvent.setup();
      (apiLogin as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<LoginPage />);

      await user.type(screen.getByPlaceholderText('Email address'), 'test@example.com');
      await user.type(screen.getByPlaceholderText('Password'), 'password123');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('An unexpected error occurred');
      });
    });
  });

  describe('Dev Mode', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('shows dev mode button when enabled', () => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_MODE = 'true';

      render(<LoginPage />);

      expect(screen.getByText('Development Mode')).toBeInTheDocument();
    });

    it('hides dev mode button when disabled', () => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_MODE = 'false';

      render(<LoginPage />);

      expect(screen.queryByText('Development Mode')).not.toBeInTheDocument();
    });
  });
});
```

---

## Files Touched

- `apps/web/src/app/login/__tests__/page.test.tsx` - New test file

---

## Tests Required

This story IS the test implementation. All tests listed in Acceptance Criteria.

---

## Verification Commands

```bash
# Run login page tests
pnpm --filter @guardian/web test:unit -- login

# Run all unit tests
pnpm --filter @guardian/web test:unit

# Run with coverage
pnpm --filter @guardian/web test:coverage

# Expected: All tests pass, 70%+ coverage for page.tsx
```

---

## Notes for Agent

1. **Create __tests__ directory** if it doesn't exist
2. **Mock all external dependencies** - router, useAuth, apiLogin
3. **Use userEvent over fireEvent** - More realistic user interactions
4. **waitFor for async operations** - Form submission is async
5. **Test both success and error paths** - Cover all branches
6. **Environment variable mocking** - For dev mode tests
7. **role="alert"** - Use this to find error messages
