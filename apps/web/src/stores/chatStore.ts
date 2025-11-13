import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChatMessage } from '@/lib/websocket';

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  currentStreamingMessage: string | null;

  // Sidebar state
  sidebarOpen: boolean;
  sidebarMinimized: boolean;

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
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      isLoading: false,
      error: null,
      currentStreamingMessage: null,

      // Sidebar state - defaults based on viewport
      sidebarOpen: typeof window !== 'undefined' && window.innerWidth >= 1024,
      sidebarMinimized: false,

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
    }),
    {
      name: 'guardian-chat-store',
      // Only persist sidebar preferences
      partialize: (state) => ({
        sidebarMinimized: state.sidebarMinimized,
      }),
    }
  )
);
