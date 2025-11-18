import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChatMessage } from '@/lib/websocket';

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  mode: 'consult' | 'assessment';
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  currentStreamingMessage: string | null;
  isStreaming: boolean;

  // Sidebar state
  sidebarOpen: boolean;
  sidebarMinimized: boolean;

  // Conversation management
  conversations: Conversation[];
  activeConversationId: string | null;
  newChatRequested: boolean; // Flag to request new conversation creation
  deleteConversationRequested: string | null; // Conversation ID to delete

  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  updateLastMessage: (content: string) => void;
  appendToLastMessage: (chunk: string) => void;
  startStreaming: () => void;
  finishStreaming: () => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;

  // Sidebar actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebarMinimized: () => void;
  setSidebarMinimized: (minimized: boolean) => void;

  // Conversation management actions
  addConversation: (conversation: Conversation) => void;
  setActiveConversation: (id: string | null) => void;
  deleteConversation: (id: string) => void;
  removeConversationFromList: (id: string) => void;
  updateConversationTitle: (id: string, title: string) => void;
  setConversations: (conversations: Conversation[]) => void;
  requestNewChat: () => void;
  clearNewChatRequest: () => void;
  requestDeleteConversation: (id: string) => void;
  clearDeleteConversationRequest: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      isLoading: false,
      error: null,
      currentStreamingMessage: null,
      isStreaming: false,

      // Sidebar state - closed by default on all devices (mobile-first)
      sidebarOpen: false,
      sidebarMinimized: false,

      // Conversation management - defaults
      conversations: [],
      activeConversationId: null,
      newChatRequested: false,
      deleteConversationRequested: null,

      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, message],
        })),

      setMessages: (messages) => {
        console.log('[chatStore] setMessages called with', messages.length, 'messages');
        set({
          messages,
        });
        console.log('[chatStore] State updated with new messages');
      },

      updateLastMessage: (content) =>
        set((state) => {
          const messages = [...state.messages];
          if (messages.length > 0) {
            messages[messages.length - 1] = {
              ...messages[messages.length - 1],
              content,
            };
          }
          return { messages };
        }),

      appendToLastMessage: (chunk) =>
        set((state) => {
          const messages = [...state.messages];
          if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            messages[messages.length - 1] = {
              ...lastMessage,
              content: lastMessage.content + chunk,
            };
          }
          return { messages };
        }),

      startStreaming: () =>
        set((state) => ({
          currentStreamingMessage: '',
          isStreaming: true,
          messages: [
            ...state.messages,
            {
              role: 'assistant',
              content: '',
              timestamp: new Date(),
            },
          ],
        })),

      finishStreaming: () =>
        set({
          currentStreamingMessage: null,
          isStreaming: false,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      clearMessages: () => {
        console.log('[chatStore] clearMessages called');
        set({ messages: [], error: null });
      },

      // Sidebar actions
      toggleSidebar: () =>
        set((state) => ({
          sidebarOpen: !state.sidebarOpen,
        })),

      setSidebarOpen: (open) =>
        set({
          sidebarOpen: open,
        }),

      toggleSidebarMinimized: () =>
        set((state) => ({
          sidebarMinimized: !state.sidebarMinimized,
        })),

      setSidebarMinimized: (minimized) =>
        set({
          sidebarMinimized: minimized,
        }),

      // Conversation management actions
      addConversation: (conversation) =>
        set((state) => {
          // CRITICAL FIX: Check if conversation already exists (deduplicate)
          const exists = state.conversations.some((c) => c.id === conversation.id);
          if (exists) {
            console.log('[chatStore] Conversation', conversation.id, 'already exists - skipping duplicate');
            return state; // No change - idempotent add
          }

          console.log('[chatStore] Adding new conversation:', conversation.id);
          return {
            conversations: [...state.conversations, conversation],
          };
        }),

      setActiveConversation: (id) =>
        set({
          activeConversationId: id,
        }),

      // This is the old deleteConversation that only updates local state
      // Now we use requestDeleteConversation to trigger WebSocket delete
      deleteConversation: (id) => {
        console.log('[chatStore] deleteConversation (deprecated) - use requestDeleteConversation instead');
        set({ deleteConversationRequested: id });
      },

      // Remove conversation from list after backend confirms deletion
      removeConversationFromList: (id) =>
        set((state) => ({
          conversations: state.conversations.filter((conv) => conv.id !== id),
          // Clear active conversation if it's the one being deleted
          activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
        })),

      updateConversationTitle: (id, title) =>
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id ? { ...conv, title, updatedAt: new Date() } : conv
          ),
        })),

      setConversations: (conversations) => {
        console.log('[chatStore] setConversations called with', conversations.length, 'conversations');
        set({
          conversations,
        });
        console.log('[chatStore] State updated with new conversations');
      },

      requestNewChat: () => {
        console.log('[chatStore] New chat requested');
        set({ newChatRequested: true });
      },

      clearNewChatRequest: () => {
        console.log('[chatStore] Clearing new chat request');
        set({ newChatRequested: false });
      },

      requestDeleteConversation: (id) => {
        console.log('[chatStore] Delete conversation requested:', id);
        set({ deleteConversationRequested: id });
      },

      clearDeleteConversationRequest: () => {
        console.log('[chatStore] Clearing delete conversation request');
        set({ deleteConversationRequested: null });
      },
    }),
    {
      name: 'guardian-chat-store',
      // Persist sidebar preferences and active conversation ID only
      // Conversations are NOT persisted - always fetched from backend per user
      partialize: (state) => ({
        sidebarMinimized: state.sidebarMinimized,
        activeConversationId: state.activeConversationId,
        // conversations NOT persisted - prevents showing other users' conversations
      }),
    }
  )
);
