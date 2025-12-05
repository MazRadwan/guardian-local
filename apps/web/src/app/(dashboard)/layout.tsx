'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useChatStore } from '@/stores/chatStore';
import { useQuestionnairePersistence } from '@/hooks/useQuestionnairePersistence';
import { Sidebar } from '@/components/chat/Sidebar';
import { PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, logout } = useAuth();

  // Questionnaire persistence for logout cleanup (Story 4.3.5)
  const persistence = useQuestionnairePersistence(user?.id);

  const {
    sidebarOpen,
    sidebarMinimized,
    toggleSidebar,
    toggleSidebarMinimized,
    setSidebarMinimized,
    clearMessages,
    conversations,
    activeConversationId,
    setActiveConversation,
    requestDeleteConversation,
    requestNewChat,
  } = useChatStore();

  // Debug: Log conversations whenever they change
  useEffect(() => {
    console.log('[DashboardLayout] Conversations from chatStore:', conversations.length);
  }, [conversations]);

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const handleLogout = () => {
    // Story 4.3.5: Clear all questionnaire state for this user
    persistence.clearAllForUser();

    logout();
    router.push('/login');
  };

  const handleNewChat = () => {
    console.log('[DashboardLayout] New Chat button clicked');

    // Request new chat creation (ChatInterface will handle it)
    requestNewChat();

    // Navigate to chat page
    router.push('/chat');
  };

  // Separate handlers for desktop vs mobile toggle behavior
  const handleDesktopToggle = () => {
    // Desktop: Always toggle minimized state
    toggleSidebarMinimized();
  };

  const handleMobileToggle = () => {
    // Mobile: Toggle open/closed state AND ensure expanded (conversation history visible)
    toggleSidebar();
    // When opening sidebar on mobile, always show full conversation list (not minimized)
    if (!sidebarOpen) {
      setSidebarMinimized(false);
    }
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
        onDeleteConversation={requestDeleteConversation}
      />

      {/* Main Content Area */}
      <div
        className={`
          flex flex-1 flex-col h-full min-w-0 transition-all duration-300 ease-in-out
          ${sidebarMinimized ? 'md:ml-12' : 'md:ml-64'}
        `}
      >
        {/* Mobile Header (Hidden on Desktop) */}
        <header className="md:hidden flex shrink-0 items-center justify-between bg-white px-4 py-2 border-b">
           <Button variant="ghost" onClick={handleMobileToggle} aria-label="Toggle sidebar">
             <PanelLeft className="h-5 w-5" />
           </Button>
           <span className="font-semibold">Guardian</span>
           <div className="w-8" /> {/* Spacer */}
        </header>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          {children}
        </main>
      </div>
    </div>
  );
}
