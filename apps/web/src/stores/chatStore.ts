import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChatMessage } from '@/lib/websocket';

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  mode: 'consult' | 'assessment';
  messageCount: number;
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  currentStreamingMessage: string | null;

  // Sidebar state
  sidebarOpen: boolean;
  sidebarMinimized: boolean;

  // Conversation management
  conversations: Conversation[];
  activeConversationId: string | null;

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
  updateConversationTitle: (id: string, title: string) => void;
  updateConversationMessageCount: (id: string, count: number) => void;
  setConversations: (conversations: Conversation[]) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      isLoading: false,
      error: null,
      currentStreamingMessage: null,

      // Sidebar state - closed by default on all devices (mobile-first)
      sidebarOpen: false,
      sidebarMinimized: false,

      // Conversation management - defaults
      conversations: [],
      activeConversationId: null,

      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, message],
        })),

      setMessages: (messages) =>
        set({
          messages,
        }),

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
        }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      clearMessages: () => set({ messages: [], error: null }),

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
        set((state) => ({
          conversations: [...state.conversations, conversation],
        })),

      setActiveConversation: (id) =>
        set({
          activeConversationId: id,
        }),

      deleteConversation: (id) =>
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

      updateConversationMessageCount: (id, count) =>
        set((state) => ({
          conversations: state.conversations.map((conv) =>
            conv.id === id ? { ...conv, messageCount: count, updatedAt: new Date() } : conv
          ),
        })),

      setConversations: (conversations) =>
        set({
          conversations,
        }),
    }),
    {
      name: 'guardian-chat-store',
      // Persist sidebar preferences, active conversation ID, and conversations array
      partialize: (state) => ({
        sidebarMinimized: state.sidebarMinimized,
        activeConversationId: state.activeConversationId,
        conversations: state.conversations,
      }),
    }
  )
);
