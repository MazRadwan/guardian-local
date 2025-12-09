 #Appendix 2: Pre-Epic 13 Architecture
 
 Updated architecture reflecting the current code (tool-triggered questionnaire flow, expanded WebSocket
  events, and hybrid generation service). Key pieces: chat UI with questionnaire card/indicator in apps/
  web/src/components/chat/ChatInterface.tsx, WebSocket handling in apps/web/src/infrastructure/websocket.ts
  + useWebSocket* hooks, and server-side orchestration in packages/backend/src/infrastructure/websocket/
  ChatServer.ts with QuestionnaireReadyService/QuestionnaireGenerationService.

  flowchart TB
    subgraph Presentation["Presentation (Next.js 16 / React 19)"]
      ChatInterface["ChatInterface"]
      Composer["Composer + ModeSelector"]
      MessageList["MessageList"]
      Sidebar["Sidebar + ConversationList/Search"]
      QuestionnairePrompt["QuestionnairePromptCard"]
      StickyIndicator["StickyQuestionnaireIndicator"]
    end

    subgraph HooksState["Hooks & State"]
      useChatController["useChatController"]
      useWebSocketAdapter["useWebSocketAdapter"]
      useWebSocketEvents["useWebSocketEvents"]
      useHistoryManager["useHistoryManager"]
      useConversationSync["useConversationSync"]
      useConversationMode["useConversationMode"]
      useQuestionnairePersistence["useQuestionnairePersistence"]
      useAuth["useAuth"]
      chatStore["Zustand chatStore"]
      ChatServiceFE["ChatService (FE)"]
      ConversationServiceFE["ConversationService (FE)"]
    end

    subgraph WebSocket["WebSocket Layer (Socket.IO /chat)"]
      WSClient["WebSocketClient"]
      ClientEvents["Client emits:\nsend_message\nstart_new_conversation\nswitch_mode\nget_history/
  get_conversations\ndelete_conversation\nabort_stream\ngenerate_questionnaire"]
      ServerEvents["Server emits:\nmessage / assistant_token / assistant_done\nconnection_ready /
  history\nconversations_list / conversation_created\nconversation_title_updated /
  conversation_deleted\nconversation_mode_updated / stream_aborted\nquestionnaire_ready / export_ready /
  extraction_failed"]
    end

    subgraph Backend["Backend (Express 5 + Socket.IO)"]
      ChatServer["ChatServer (/chat namespace)"]
      RateLimiter["RateLimiter"]
      HttpRoutes["HTTP routes:\n/api/auth\n/api/vendors\n/api/assessments\n/api/questions\n/api/assessments/:id/
  export/{pdf|word|excel}"]
      Controllers["Auth / Vendor / Assessment /\nQuestion / Export Controllers"]
    end

    subgraph Services["Application Services"]
      AuthService
      ConversationService
      AssessmentService
      VendorService
      QuestionService["QuestionService (legacy gen)"]
      QuestionnaireReadyService
      QuestionnaireGenerationService
      ExportService
    end

    subgraph Domain["Domain Entities"]
      User
      Conversation
      Assessment
      Vendor
      Question
      Message
    end

    subgraph AI["AI & Rendering"]
      ClaudeClient["ClaudeClient (Sonnet 4.5)"]
      PromptCacheManager
      assessmentModeTools["assessmentModeTools\n(questionnaire_ready tool)"]
      questionnaireOutputTool["questionnaireOutputTool\n(structured JSON)"]
      questionGenPrompt["questionGeneration prompt"]
      QuestionnaireSchemaAdapter
      questionnaireToMarkdown["questionnaireToMarkdown"]
    end

    subgraph Data["Data Layer (Drizzle + PostgreSQL 17)"]
      UserRepo
      ConversationRepo
      MessageRepo
      VendorRepo
      AssessmentRepo
      QuestionRepo
      Tables["users, conversations,\nmessages, vendors,\nassessments, questions"]
      Exporters["PDFExporter / WordExporter / ExcelExporter"]
      JWTProvider
    end

    subgraph External["External"]
      ClaudeAPI["Anthropic Claude API"]
    end

    ChatInterface --> useChatController
    Sidebar --> useChatController
    useChatController --> ChatServiceFE
    useChatController --> ConversationServiceFE
    useChatController --> useWebSocketAdapter
    useChatController --> useWebSocketEvents
    useChatController --> useHistoryManager
    useChatController --> useConversationSync
    useChatController --> useQuestionnairePersistence
    useChatController --> chatStore
    ChatServiceFE --> useWebSocketAdapter
    ConversationServiceFE --> useWebSocketAdapter
    useWebSocketAdapter --> WSClient
    WSClient --> ClientEvents
    WSClient --> ServerEvents
    ClientEvents --> ChatServer
    ChatServer --> ServerEvents
    ChatServer --> RateLimiter
    ChatServer --> ConversationService
    ChatServer --> QuestionnaireReadyService
    ChatServer --> QuestionnaireGenerationService
    ChatServer --> PromptCacheManager
    PromptCacheManager --> ClaudeClient
    ChatServer --> HttpRoutes
    HttpRoutes --> Controllers
    Controllers --> AuthService
    Controllers --> VendorService
    Controllers --> AssessmentService
    Controllers --> QuestionService
    Controllers --> ExportService
    AuthService --> JWTProvider
    ConversationService --> ConversationRepo --> Tables
    ConversationService --> MessageRepo --> Tables
    QuestionService --> QuestionRepo --> Tables
    QuestionnaireGenerationService --> ClaudeClient
    QuestionnaireGenerationService --> QuestionnaireSchemaAdapter --> QuestionRepo
    QuestionnaireGenerationService --> AssessmentService
    QuestionnaireGenerationService --> VendorService
    QuestionnaireGenerationService --> questionnaireToMarkdown
    ExportService --> Exporters
    ClaudeClient <--> ClaudeAPI