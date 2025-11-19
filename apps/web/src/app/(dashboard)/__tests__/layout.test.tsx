import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '../layout';
import { useAuth } from '@/hooks/useAuth';
import { useChatStore } from '@/stores/chatStore';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/stores/chatStore', () => ({
  useChatStore: jest.fn(),
}));

jest.mock('@/components/chat/Sidebar', () => ({
  Sidebar: ({
    isOpen,
    isMinimized,
    onToggle,
    onNewChat,
    onLogout,
    userName,
    userRole,
    conversations,
    activeConversationId,
    onSelectConversation,
    onDeleteConversation
  }: any) => (
    <div data-testid="sidebar">
      <div data-testid="sidebar-state">
        {isOpen ? 'open' : 'closed'} / {isMinimized ? 'minimized' : 'expanded'}
      </div>
      <button data-testid="sidebar-toggle" onClick={onToggle}>Toggle</button>
      <button data-testid="sidebar-new-chat" onClick={onNewChat}>New Chat</button>
      <button data-testid="sidebar-logout" onClick={onLogout}>Logout</button>
      {userName && <div data-testid="sidebar-user-name">{userName}</div>}
      {userRole && <div data-testid="sidebar-user-role">{userRole}</div>}
      <div data-testid="sidebar-conversations-count">{conversations?.length || 0}</div>
      {activeConversationId && <div data-testid="sidebar-active-conversation">{activeConversationId}</div>}
    </div>
  ),
}));

describe('DashboardLayout', () => {
  const mockPush = jest.fn();
  const mockRouter = { push: mockPush };

  const mockChatStore = {
    sidebarOpen: true,
    sidebarMinimized: false,
    toggleSidebar: jest.fn(),
    toggleSidebarMinimized: jest.fn(),
    clearMessages: jest.fn(),
    conversations: [],
    activeConversationId: null,
    setActiveConversation: jest.fn(),
    deleteConversation: jest.fn(),
    requestNewChat: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useChatStore as unknown as jest.Mock).mockReturnValue(mockChatStore);
  });

  describe('Authentication Flow', () => {
    it('shows loading state while checking authentication', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
        user: null,
        logout: jest.fn(),
      });

      render(
        <DashboardLayout>
          <div>Test Content</div>
        </DashboardLayout>
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
    });

    it('redirects to login when not authenticated', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        logout: jest.fn(),
      });

      render(
        <DashboardLayout>
          <div>Test Content</div>
        </DashboardLayout>
      );

      expect(mockPush).toHaveBeenCalledWith('/login');
    });

    it('renders dashboard when authenticated', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { name: 'Test User', email: 'test@example.com', role: 'analyst' },
        logout: jest.fn(),
      });

      render(
        <DashboardLayout>
          <div>Test Content</div>
        </DashboardLayout>
      );

      expect(screen.getByText('Test Content')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    });
  });

  describe('Layout Structure', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { name: 'Test User', email: 'test@example.com', role: 'analyst' },
        logout: jest.fn(),
      });
    });

    it('renders sidebar and main content area side-by-side', () => {
      render(
        <DashboardLayout>
          <div>Main Content</div>
        </DashboardLayout>
      );

      expect(screen.getByTestId('sidebar')).toBeInTheDocument();
      expect(screen.getByText('Main Content')).toBeInTheDocument();
    });

    it('renders header with Guardian branding', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      expect(screen.getByText('Guardian')).toBeInTheDocument();
    });

    it('displays user information in header', () => {
      const { container } = render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      // User info appears in both sidebar and header, so check header specifically
      const header = container.querySelector('header');
      expect(header).toBeInTheDocument();
      expect(header?.textContent).toContain('Test User');
      expect(header?.textContent).toContain('(analyst)');
    });

    it('passes correct props to Sidebar component', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      expect(screen.getByTestId('sidebar-state')).toHaveTextContent('open / expanded');
      expect(screen.getByTestId('sidebar-user-name')).toHaveTextContent('Test User');
      expect(screen.getByTestId('sidebar-user-role')).toHaveTextContent('analyst');
    });
  });

  describe('Sidebar State Management', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { name: 'Test User', email: 'test@example.com', role: 'analyst' },
        logout: jest.fn(),
      });
    });

    it('reflects sidebar open state from chatStore', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        sidebarOpen: true,
      });

      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      expect(screen.getByTestId('sidebar-state')).toHaveTextContent('open');
    });

    it('reflects sidebar minimized state from chatStore', () => {
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        sidebarMinimized: true,
      });

      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      expect(screen.getByTestId('sidebar-state')).toHaveTextContent('minimized');
    });
  });

  describe('Desktop Toggle Behavior', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { name: 'Test User', email: 'test@example.com', role: 'analyst' },
        logout: jest.fn(),
      });
    });

    it('calls toggleSidebarMinimized when desktop toggle is triggered', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      // Simulate toggle from Sidebar component (desktop)
      fireEvent.click(screen.getByTestId('sidebar-toggle'));

      expect(mockChatStore.toggleSidebarMinimized).toHaveBeenCalledTimes(1);
      expect(mockChatStore.toggleSidebar).not.toHaveBeenCalled();
    });
  });

  describe('Mobile Toggle Behavior', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { name: 'Test User', email: 'test@example.com', role: 'analyst' },
        logout: jest.fn(),
      });
    });

    it('renders mobile menu button', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      const menuButton = screen.getByLabelText('Toggle sidebar');
      expect(menuButton).toBeInTheDocument();
    });

    it('calls toggleSidebar when mobile menu button is clicked', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      const menuButton = screen.getByLabelText('Toggle sidebar');
      fireEvent.click(menuButton);

      expect(mockChatStore.toggleSidebar).toHaveBeenCalledTimes(1);
      expect(mockChatStore.toggleSidebarMinimized).not.toHaveBeenCalled();
    });
  });

  describe('User Actions', () => {
    const mockLogout = jest.fn();

    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { name: 'Test User', email: 'test@example.com', role: 'analyst' },
        logout: mockLogout,
      });
    });

    it('handles logout button click from sidebar', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      fireEvent.click(screen.getByTestId('sidebar-logout'));

      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/login');
    });

    it('handles new chat button click from sidebar', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      fireEvent.click(screen.getByTestId('sidebar-new-chat'));

      // Verify requestNewChat is called and navigation happens
      expect(mockChatStore.requestNewChat).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/chat');
    });

    it('clears URL parameter when starting new chat', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      fireEvent.click(screen.getByTestId('sidebar-new-chat'));

      // Verify URL is cleared to /chat
      expect(mockPush).toHaveBeenCalledWith('/chat');
    });
  });

  describe('Responsive Layout', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { name: 'Test User', email: 'test@example.com', role: 'analyst' },
        logout: jest.fn(),
      });
    });

    it('renders without layout shift when sidebar state changes', () => {
      const { rerender } = render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      // Verify initial state
      expect(screen.getByText('Content')).toBeInTheDocument();

      // Simulate sidebar state change
      (useChatStore as unknown as jest.Mock).mockReturnValue({
        ...mockChatStore,
        sidebarMinimized: true,
      });

      rerender(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      // Content should still be rendered
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { name: 'Test User', email: 'test@example.com', role: 'analyst' },
        logout: jest.fn(),
      });
    });

    it('handles missing user information gracefully', () => {
      (useAuth as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: null,
        logout: jest.fn(),
      });

      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      // Should render without user info
      expect(screen.queryByTestId('sidebar-user-name')).not.toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('renders children content in main area', () => {
      render(
        <DashboardLayout>
          <div data-testid="child-component">Custom Child Content</div>
        </DashboardLayout>
      );

      expect(screen.getByTestId('child-component')).toBeInTheDocument();
      expect(screen.getByText('Custom Child Content')).toBeInTheDocument();
    });
  });
});
