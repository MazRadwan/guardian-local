import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../Sidebar';

describe('Sidebar', () => {
  const mockProps = {
    isOpen: true,
    isMinimized: false,
    onToggle: jest.fn(),
    onNewChat: jest.fn(),
    onLogout: jest.fn(),
    userName: 'Test User',
    userRole: 'analyst',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering States', () => {
    it('renders expanded sidebar by default on desktop', () => {
      render(<Sidebar {...mockProps} />);

      // Should show full text content
      expect(screen.getByText('New chat')).toBeInTheDocument();
      expect(screen.getByText('No conversations yet')).toBeInTheDocument();
      expect(screen.getByText('Logout')).toBeInTheDocument();
    });

    it('renders minimized sidebar state', () => {
      render(<Sidebar {...mockProps} isMinimized={true} />);

      // Should not show text content in minimized state
      expect(screen.queryByText('New chat')).not.toBeInTheDocument();
      expect(screen.queryByText('Logout')).not.toBeInTheDocument();

      // Should show icons with title attributes
      const newChatButton = screen.getByTitle('New Chat');
      const logoutButton = screen.getByTitle('Logout');
      expect(newChatButton).toBeInTheDocument();
      expect(logoutButton).toBeInTheDocument();
    });

    it('renders user information when provided', () => {
      render(<Sidebar {...mockProps} />);

      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('(analyst)')).toBeInTheDocument();
    });

    it('renders without user information when not provided', () => {
      const propsWithoutUser = {
        ...mockProps,
        userName: undefined,
        userRole: undefined,
      };
      render(<Sidebar {...propsWithoutUser} />);

      expect(screen.queryByText('Test User')).not.toBeInTheDocument();
    });
  });

  describe('Interaction Behaviors', () => {
    it('calls onNewChat when New Chat button clicked in expanded state', () => {
      render(<Sidebar {...mockProps} />);

      const newChatButton = screen.getByText('New chat');
      fireEvent.click(newChatButton);

      expect(mockProps.onNewChat).toHaveBeenCalledTimes(1);
    });

    it('calls onNewChat when Plus icon clicked in minimized state', () => {
      render(<Sidebar {...mockProps} isMinimized={true} />);

      const newChatButton = screen.getByTitle('New Chat');
      fireEvent.click(newChatButton);

      expect(mockProps.onNewChat).toHaveBeenCalledTimes(1);
    });

    it('calls onLogout when Logout button clicked in expanded state', () => {
      render(<Sidebar {...mockProps} />);

      const logoutButton = screen.getByText('Logout');
      fireEvent.click(logoutButton);

      expect(mockProps.onLogout).toHaveBeenCalledTimes(1);
    });

    it('calls onLogout when Logout icon clicked in minimized state', () => {
      render(<Sidebar {...mockProps} isMinimized={true} />);

      const logoutButton = screen.getByTitle('Logout');
      fireEvent.click(logoutButton);

      expect(mockProps.onLogout).toHaveBeenCalledTimes(1);
    });

    it('calls onToggle when toggle button clicked', () => {
      render(<Sidebar {...mockProps} />);

      // Toggle button with PanelLeft icon
      const toggleButton = screen.getByTitle('Minimize sidebar');
      fireEvent.click(toggleButton);

      expect(mockProps.onToggle).toHaveBeenCalledTimes(1);
    });

    it('calls onCloseMobile when backdrop clicked on mobile', () => {
      const onCloseMobile = jest.fn();
      render(<Sidebar {...mockProps} onCloseMobile={onCloseMobile} />);

      // Find backdrop element (only visible when sidebar is open)
      const backdrop = document.querySelector('.fixed.inset-0.z-40.bg-black\\/50');
      expect(backdrop).toBeInTheDocument();

      if (backdrop) {
        fireEvent.click(backdrop);
        expect(onCloseMobile).toHaveBeenCalledTimes(1);
        expect(mockProps.onToggle).not.toHaveBeenCalled();
      }
    });
  });

  describe('Mobile Drawer Pattern', () => {
    it('shows backdrop when sidebar is open', () => {
      render(<Sidebar {...mockProps} isOpen={true} />);

      const backdrop = document.querySelector('.fixed.inset-0.z-40.bg-black\\/50');
      expect(backdrop).toBeInTheDocument();
    });

    it('hides backdrop when sidebar is closed', () => {
      render(<Sidebar {...mockProps} isOpen={false} />);

      const backdrop = document.querySelector('.fixed.inset-0.z-40.bg-black\\/50');
      expect(backdrop).not.toBeInTheDocument();
    });

    it('applies correct translation classes for mobile drawer', () => {
      const { container } = render(<Sidebar {...mockProps} isOpen={false} />);

      const sidebar = container.querySelector('aside');
      expect(sidebar).toHaveClass('-translate-x-full');
    });

    it('applies correct translation classes when drawer is open', () => {
      const { container } = render(<Sidebar {...mockProps} isOpen={true} />);

      const sidebar = container.querySelector('aside');
      expect(sidebar).toHaveClass('translate-x-0');
    });
  });

  describe('Transition Animations', () => {
    it('applies transition classes to sidebar', () => {
      const { container } = render(<Sidebar {...mockProps} />);

      const sidebar = container.querySelector('aside');
      expect(sidebar).toHaveClass('transition-all');
      expect(sidebar).toHaveClass('duration-300');
      expect(sidebar).toHaveClass('ease-in-out');
    });

    it('changes width classes between expanded and minimized states', () => {
      const { container, rerender } = render(<Sidebar {...mockProps} isMinimized={false} />);

      let sidebar = container.querySelector('aside');
      expect(sidebar).toHaveClass('md:w-64');

      rerender(<Sidebar {...mockProps} isMinimized={true} />);

      sidebar = container.querySelector('aside');
      expect(sidebar).toHaveClass('md:w-12');
    });

    it('rotates toggle icon when expanded', () => {
      const { container } = render(<Sidebar {...mockProps} isMinimized={false} />);

      // When expanded, icon should rotate 180deg (pointing right)
      const panelLeftIcon = container.querySelector('.rotate-180');
      expect(panelLeftIcon).toBeInTheDocument();
    });

    it('does not rotate toggle icon when minimized', () => {
      const { container } = render(<Sidebar {...mockProps} isMinimized={true} />);

      // When minimized, icon should not rotate (pointing left, indicating expand)
      const panelLeftIcon = container.querySelector('.rotate-180');
      expect(panelLeftIcon).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('provides title attributes for icon-only buttons in minimized state', () => {
      render(<Sidebar {...mockProps} isMinimized={true} />);

      expect(screen.getByTitle('New Chat')).toBeInTheDocument();
      expect(screen.getByTitle('Conversations')).toBeInTheDocument();
      expect(screen.getByTitle('Logout')).toBeInTheDocument();
    });

    it('provides title attribute for toggle button in expanded state', () => {
      render(<Sidebar {...mockProps} isMinimized={false} />);

      expect(screen.getByTitle('Minimize sidebar')).toBeInTheDocument();
    });

    it('provides title attribute for toggle button in minimized state', () => {
      render(<Sidebar {...mockProps} isMinimized={true} />);

      expect(screen.getByTitle('Expand sidebar')).toBeInTheDocument();
    });

    it('provides aria-label for icon-only buttons', () => {
      render(<Sidebar {...mockProps} isMinimized={true} />);

      expect(screen.getByLabelText('New Chat')).toBeInTheDocument();
      expect(screen.getByLabelText('Conversations')).toBeInTheDocument();
      expect(screen.getByLabelText('Logout')).toBeInTheDocument();
    });

    it('provides aria-label for toggle button', () => {
      render(<Sidebar {...mockProps} isMinimized={false} />);

      expect(screen.getByLabelText('Minimize sidebar')).toBeInTheDocument();
    });

    it('has aria-expanded attribute on toggle button', () => {
      const { container } = render(<Sidebar {...mockProps} isMinimized={false} />);

      const toggleButton = screen.getByTitle('Minimize sidebar');
      expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    });

    it('has aria-expanded false when sidebar is minimized', () => {
      const { container } = render(<Sidebar {...mockProps} isMinimized={true} />);

      const toggleButton = screen.getByTitle('Expand sidebar');
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('has role="navigation" on sidebar', () => {
      const { container } = render(<Sidebar {...mockProps} />);

      const aside = container.querySelector('aside');
      expect(aside).toHaveAttribute('role', 'navigation');
    });

    it('has aria-label on sidebar', () => {
      const { container } = render(<Sidebar {...mockProps} />);

      const aside = container.querySelector('aside');
      expect(aside).toHaveAttribute('aria-label', 'Sidebar navigation');
    });

    it('has aria-hidden on backdrop', () => {
      const { container } = render(<Sidebar {...mockProps} isOpen={true} />);

      const backdrop = container.querySelector('.fixed.inset-0.z-40.bg-black\\/50');
      expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    });

    it('has proper semantic structure with sections', () => {
      const { container } = render(<Sidebar {...mockProps} />);

      const aside = container.querySelector('aside');
      expect(aside).toBeInTheDocument();

      // Three sections: header, middle, footer
      const borderDivs = container.querySelectorAll('.border-b, .border-t');
      expect(borderDivs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Keyboard Support', () => {
    it('calls onCloseMobile when Escape key is pressed on mobile', () => {
      // Mock window.innerWidth for mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      });

      const onCloseMobile = jest.fn();
      render(<Sidebar {...mockProps} isOpen={true} onCloseMobile={onCloseMobile} />);

      // Simulate Escape key press
      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onCloseMobile).toHaveBeenCalledTimes(1);
      expect(mockProps.onToggle).not.toHaveBeenCalled();
    });

    it('does not close drawer on Escape when already closed', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      });

      render(<Sidebar {...mockProps} isOpen={false} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockProps.onToggle).not.toHaveBeenCalled();
    });

    it('does not close sidebar on Escape on desktop', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      render(<Sidebar {...mockProps} isOpen={true} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockProps.onToggle).not.toHaveBeenCalled();
    });
  });

  describe('Visual Styling', () => {
    it('applies gray background to sidebar', () => {
      const { container } = render(<Sidebar {...mockProps} />);

      const sidebar = container.querySelector('aside');
      expect(sidebar).toHaveClass('bg-gray-50');
    });

    it('applies border to sidebar', () => {
      const { container } = render(<Sidebar {...mockProps} />);

      const sidebar = container.querySelector('aside');
      expect(sidebar).toHaveClass('border-r');
      expect(sidebar).toHaveClass('border-gray-200');
    });

    it('has fixed positioning and full height', () => {
      const { container } = render(<Sidebar {...mockProps} />);

      const sidebar = container.querySelector('aside');
      expect(sidebar).toHaveClass('fixed');
      expect(sidebar).toHaveClass('inset-y-0');
      expect(sidebar).toHaveClass('left-0');
    });

    it('has correct z-index for layering', () => {
      const { container } = render(<Sidebar {...mockProps} />);

      const sidebar = container.querySelector('aside');
      expect(sidebar).toHaveClass('z-50');
    });
  });
});
