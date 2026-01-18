import { render, screen, waitFor } from '@testing-library/react';
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
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

// Mock DevModeButton to avoid complexity
jest.mock('@/components/auth/DevModeButton', () => ({
  DevModeButton: ({ onLogin }: { onLogin: (token: string, user: unknown) => void }) => (
    <button
      data-testid="dev-mode-button"
      onClick={() => onLogin('test-token', { id: '1', email: 'test@guardian.com', name: 'Test', role: 'admin' })}
    >
      Development Mode
    </button>
  ),
}));

describe('LoginPage', () => {
  const mockRouter = { push: jest.fn() };
  const mockLogin = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useAuth as jest.Mock).mockReturnValue({ login: mockLogin });
    // Reset env
    delete process.env.NEXT_PUBLIC_ENABLE_DEV_MODE;
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
      const { AuthAPIError } = jest.requireMock('@/lib/api/auth');
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
    it('shows dev mode button when enabled', () => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_MODE = 'true';

      render(<LoginPage />);

      expect(screen.getByTestId('dev-mode-button')).toBeInTheDocument();
    });

    it('hides dev mode button when disabled', () => {
      process.env.NEXT_PUBLIC_ENABLE_DEV_MODE = 'false';

      render(<LoginPage />);

      expect(screen.queryByTestId('dev-mode-button')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has accessible labels for inputs', () => {
      render(<LoginPage />);

      // Labels exist (sr-only)
      expect(screen.getByLabelText('Email address')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });

    it('has aria-label for password toggle', () => {
      render(<LoginPage />);

      expect(screen.getByLabelText('Show password')).toBeInTheDocument();
    });

    it('has aria-label for form', () => {
      render(<LoginPage />);

      expect(screen.getByRole('form', { name: 'Sign in form' })).toBeInTheDocument();
    });
  });
});
