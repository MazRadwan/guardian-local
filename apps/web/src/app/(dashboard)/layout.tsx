'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useChatStore } from '@/stores/chatStore';
import { Sidebar } from '@/components/chat/Sidebar';
import { User, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, logout } = useAuth();

  const {
    sidebarOpen,
    sidebarMinimized,
    toggleSidebar,
    toggleSidebarMinimized,
    clearMessages,
    conversations,
    activeConversationId,
    setActiveConversation,
    deleteConversation,
  } = useChatStore();

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const handleNewChat = () => {
    clearMessages();
    // TODO: Future - create new conversation in backend
  };

  // Separate handlers for desktop vs mobile toggle behavior
  const handleDesktopToggle = () => {
    // Desktop: Always toggle minimized state
    toggleSidebarMinimized();
  };

  const handleMobileToggle = () => {
    // Mobile: Toggle open/closed state
    toggleSidebar();
  };

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  // Don't render dashboard if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        isMinimized={sidebarMinimized}
        onToggle={handleDesktopToggle}
        onCloseMobile={handleMobileToggle}
        onNewChat={handleNewChat}
        onLogout={handleLogout}
        userName={user?.name}
        userRole={user?.role}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={setActiveConversation}
        onDeleteConversation={deleteConversation}
      />

      {/* Main Content Area */}
      <div
        className={`
          flex flex-1 flex-col transition-all duration-300 ease-in-out
          ${sidebarMinimized ? 'md:ml-12' : 'md:ml-64'}
        `}
      >
        {/* Header */}
        <header className="flex items-center justify-between bg-white px-6 py-4">
          <div className="flex items-center gap-4">
            {/* Mobile menu button - only visible on mobile/tablet */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleMobileToggle}
              className="md:hidden"
              aria-label="Toggle sidebar"
            >
              <Menu className="h-5 w-5 text-gray-700" />
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Guardian</h1>
            {/* Connection status indicator */}
            <div className="flex items-center gap-2">
              <div
                className="h-2 w-2 rounded-full bg-green-500"
                aria-label="Connected"
              />
              <span className="text-sm text-gray-600">Connected</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User className="h-4 w-4" />
                <span>{user.name}</span>
                <span className="text-xs text-gray-400">({user.role})</span>
              </div>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
