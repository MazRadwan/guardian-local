'use client';

import { useEffect, useState, useCallback } from 'react';
import { SquarePen, LogOut, Search, PanelLeft, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConversationList } from './ConversationList';
import { ConversationSearchModal } from './ConversationSearchModal';
import { Conversation, useChatStore } from '@/stores/chatStore';
import { updateConversationTitle } from '@/lib/api/conversation';

interface SidebarProps {
  isOpen: boolean;
  isMinimized: boolean;
  onToggle: () => void;
  onCloseMobile?: () => void;
  onNewChat: () => void;
  onLogout: () => void;
  userName?: string;
  userRole?: string;
  // Conversation management
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  // Auth token for API calls
  token?: string;
}

export function Sidebar({
  isOpen,
  isMinimized,
  onToggle,
  onCloseMobile,
  onNewChat,
  onLogout,
  userName,
  userRole,
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  token,
}: SidebarProps) {
  // Mobile: drawer overlay pattern
  // Desktop: persistent sidebar with toggle

  // Search modal state
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Get store actions for editing state and title updates
  const editingConversationId = useChatStore((state) => state.editingConversationId);
  const setEditingConversationId = useChatStore((state) => state.setEditingConversationId);
  const updateStoreTitle = useChatStore((state) => state.updateConversationTitle);
  const setConversationTitleManuallyEdited = useChatStore(
    (state) => state.setConversationTitleManuallyEdited
  );

  // Keyboard support: Close mobile drawer with Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      // Only close on mobile when drawer is open
      if (e.key === 'Escape' && isOpen && window.innerWidth < 768) {
        onCloseMobile?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCloseMobile]);

  // Handle rename start
  const handleRenameStart = useCallback((id: string) => {
    setEditingConversationId(id);
  }, [setEditingConversationId]);

  // Handle rename cancel
  const handleRenameCancel = useCallback(() => {
    setEditingConversationId(null);
  }, [setEditingConversationId]);

  // Handle rename complete - API call
  const handleRenameComplete = useCallback(
    async (id: string, newTitle: string) => {
      // Optimistically update the UI
      updateStoreTitle(id, newTitle);
      setEditingConversationId(null);

      // Mark as manually edited to prevent auto-update
      setConversationTitleManuallyEdited(id, true);

      // Call API if token is available
      if (token) {
        try {
          await updateConversationTitle(id, newTitle, token);
          console.log('[Sidebar] Title updated successfully via API');
        } catch (error) {
          console.error('[Sidebar] Failed to update title via API:', error);
          // Revert the optimistic update on failure would be nice,
          // but for simplicity we keep the local change
        }
      }
    },
    [token, updateStoreTitle, setEditingConversationId, setConversationTitleManuallyEdited]
  );

  return (
    <>
      {/* Backdrop for mobile drawer */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col border-r border-gray-200
          transition-all duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${isMinimized ? 'md:w-12 bg-white' : 'md:w-64 bg-gray-50'}
          w-64 bg-gray-50
        `}
        role="navigation"
        aria-label="Sidebar navigation"
        data-testid="sidebar"
      >
        {/* Section 1: Header & Toggle */}
        {isMinimized ? (
          <div className="p-2">
            <button
              onClick={onToggle}
              className="flex h-10 w-10 mx-auto items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              title="Expand sidebar"
              aria-label="Expand sidebar"
              aria-expanded={false}
            >
              <PanelLeft className="h-5 w-5 text-gray-700" />
            </button>
          </div>
        ) : (
          <div className="flex items-center h-14 justify-between p-3">
            <div className="flex items-center gap-2 pl-2">
              <Shield className="h-5 w-5 text-gray-900" />
              <span className="font-semibold text-lg text-gray-900">Guardian</span>
            </div>
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  onCloseMobile?.();
                } else {
                  onToggle();
                }
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              title="Minimize sidebar"
              aria-label="Minimize sidebar"
              aria-expanded={true}
            >
              <PanelLeft className="h-5 w-5 text-gray-700 rotate-180" />
            </button>
          </div>
        )}

        {/* Section 2: New Chat Button */}
        <div className="p-2">
          {isMinimized ? (
            <button
              onClick={onNewChat}
              className="flex h-10 w-10 mx-auto items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              title="New Chat"
              aria-label="New Chat"
            >
              <SquarePen className="h-5 w-5 text-gray-700" />
            </button>
          ) : (
            <Button
              onClick={onNewChat}
              variant="ghost"
              className="w-full flex items-center gap-2 justify-start hover:bg-gray-100"
            >
              <SquarePen className="h-[18px] w-[18px]" />
              <span>New chat</span>
            </Button>
          )}
        </div>

        {/* Middle Section - Conversation List */}
        {isMinimized ? (
          // Minimized: Show search icon only
          <div className="p-2">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="flex h-10 w-10 mx-auto items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              title="Search conversations"
              aria-label="Search conversations"
            >
              <Search className="h-5 w-5 text-gray-700" />
            </button>
          </div>
        ) : (
          // Expanded: Show full conversation list
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            editingConversationId={editingConversationId}
            onSelectConversation={onSelectConversation}
            onDeleteConversation={onDeleteConversation}
            onRenameStart={handleRenameStart}
            onRenameComplete={handleRenameComplete}
            onRenameCancel={handleRenameCancel}
          />
        )}

        {/* Footer Section - Logout */}
        <div className="p-3">
          {!isMinimized && (
            // Expanded: Full button with user info
            <div className="space-y-2">
              {userName && (
                <div className="px-3 py-2 text-sm">
                  <div className="font-medium text-gray-900">{userName}</div>
                  {userRole && (
                    <div className="text-xs text-gray-500">({userRole})</div>
                  )}
                </div>
              )}
              <Button
                onClick={onLogout}
                variant="ghost"
                className="w-full flex items-center gap-2 justify-start text-gray-700 hover:text-gray-900 hover:bg-gray-100"
              >
                <LogOut className="h-[18px] w-[18px]" />
                <span>Logout</span>
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Search Modal */}
      <ConversationSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        conversations={conversations}
        onSelectConversation={(id) => {
          onSelectConversation(id);
          setIsSearchOpen(false);
        }}
      />
    </>
  );
}
