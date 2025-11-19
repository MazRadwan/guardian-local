'use client';

import { useEffect, useState } from 'react';
import { SquarePen, LogOut, Search, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConversationList } from './ConversationList';
import { ConversationSearchModal } from './ConversationSearchModal';
import { Conversation } from '@/stores/chatStore';

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
}: SidebarProps) {
  // Mobile: drawer overlay pattern
  // Desktop: persistent sidebar with toggle

  // Search modal state
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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
      >
        {/* Section 1: Header & Toggle */}
        <div className="flex items-center justify-between p-3 h-14">
          {!isMinimized && (
            <span className="font-semibold text-lg text-gray-900 pl-2">Guardian</span>
          )}
          {/* Desktop: minimize/expand button, Mobile: close drawer button */}
          <button
            onClick={() => {
              // Mobile: close drawer, Desktop: toggle minimize
              if (window.innerWidth < 768) {
                onCloseMobile?.();
              } else {
                onToggle();
              }
            }}
            className={`flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors ${
              isMinimized ? 'h-10 w-10 mx-auto' : 'h-8 w-8'
            }`}
            title={isMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
            aria-label={isMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
            aria-expanded={!isMinimized}
          >
            <PanelLeft className={`h-5 w-5 text-gray-700 ${isMinimized ? '' : 'rotate-180'}`} />
          </button>
        </div>

        {/* Section 2: New Chat Button */}
        <div className="p-2">
          {isMinimized ? (
            <button
              onClick={onNewChat}
              className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
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
              className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
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
            onSelectConversation={onSelectConversation}
            onDeleteConversation={onDeleteConversation}
          />
        )}

        {/* Footer Section - Logout */}
        <div className="p-3">
          {isMinimized ? (
            // Minimized: Icon only
            <button
              onClick={onLogout}
              className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="h-5 w-5 text-gray-700" />
            </button>
          ) : (
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
