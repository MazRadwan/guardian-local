import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChatMessage, EmbeddedComponent, ExportReadyPayload, QuestionnaireReadyPayload } from '@/lib/websocket';

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

  // Export readiness cache (per-conversation)
  exportReadyByConversation: Record<string, ExportReadyPayload>;

  /**
   * Pending questionnaire ready to be generated
   * Set when Claude calls questionnaire_ready tool
   * Cleared when user clicks Generate or changes conversation
   */
  pendingQuestionnaire: QuestionnaireReadyPayload | null;

  /**
   * Whether questionnaire generation is in progress
   * Used to show loading state on Generate button
   * Cleared on assistant_done or error event
   */
  isGeneratingQuestionnaire: boolean;

  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  updateLastMessage: (content: string) => void;
  appendToLastMessage: (chunk: string) => void;
  appendComponentToLastAssistantMessage: (component: EmbeddedComponent) => void;
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

  // Export readiness actions
  setExportReady: (conversationId: string, payload: ExportReadyPayload) => void;
  clearExportReady: (conversationId: string) => void;
  getExportReady: (conversationId: string) => ExportReadyPayload | undefined;

  /**
   * Set pending questionnaire (from questionnaire_ready event)
   */
  setPendingQuestionnaire: (payload: QuestionnaireReadyPayload) => void;

  /**
   * Clear pending questionnaire (after generation or conversation change)
   */
  clearPendingQuestionnaire: () => void;

  /**
   * Set generation state (true when generating, false on completion/error)
   */
  setGenerating: (value: boolean) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
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

      // Export readiness cache - defaults
      exportReadyByConversation: {},

      // Questionnaire generation - defaults
      pendingQuestionnaire: null,
      isGeneratingQuestionnaire: false,

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

      appendComponentToLastAssistantMessage: (component) =>
        set((state) => {
          const messages = [...state.messages];
          // Find last assistant message
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant') {
              const existingComponents = messages[i].components || [];
              // Deduplicate: check if this component already exists
              const isDuplicate = existingComponents.some(
                (c) =>
                  c.type === component.type &&
                  c.data?.assessmentId === component.data?.assessmentId
              );
              if (isDuplicate) {
                console.log('[chatStore] Component already exists, skipping duplicate');
                return state; // No change
              }
              messages[i] = {
                ...messages[i],
                components: [...existingComponents, component],
              };
              break;
            }
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

      setActiveConversation: (id) => {
        set({ activeConversationId: id });
        // Clear via action (DRY - uses same logic, enables future analytics)
        get().clearPendingQuestionnaire();
        // Also reset generation state
        get().setGenerating(false);
      },

      // Delete conversation immediately (used by tests and direct local operations)
      // For WebSocket-triggered deletes, use requestDeleteConversation instead
      deleteConversation: (id) =>
        set((state) => ({
          conversations: state.conversations.filter((conv) => conv.id !== id),
          // Clear active conversation if it's the one being deleted
          activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
        })),

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

      // Export readiness actions
      setExportReady: (conversationId, payload) => {
        console.log('[chatStore] Setting export ready for conversation:', conversationId);
        set((state) => ({
          exportReadyByConversation: {
            ...state.exportReadyByConversation,
            [conversationId]: payload,
          },
        }));
      },

      clearExportReady: (conversationId) => {
        console.log('[chatStore] Clearing export ready for conversation:', conversationId);
        set((state) => {
          const { [conversationId]: _, ...rest } = state.exportReadyByConversation;
          return { exportReadyByConversation: rest };
        });
      },

      getExportReady: (conversationId) => {
        return get().exportReadyByConversation[conversationId];
      },

      // Questionnaire generation actions
      setPendingQuestionnaire: (payload) => {
        console.log('[chatStore] Setting pending questionnaire:', payload.conversationId);
        set({ pendingQuestionnaire: payload });
      },

      clearPendingQuestionnaire: () => {
        console.log('[chatStore] Clearing pending questionnaire');
        set({ pendingQuestionnaire: null });
      },

      setGenerating: (value) => {
        console.log('[chatStore] Setting isGeneratingQuestionnaire:', value);
        set({ isGeneratingQuestionnaire: value });
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
