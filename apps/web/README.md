# Guardian Frontend (Next.js)

Real-time chat interface for Guardian AI vendor assessment platform.

## Tech Stack

- **Next.js 16** - App Router, React 19, Turbopack
- **Tailwind CSS v4** - Styling with `@tailwindcss/postcss`
- **Shadcn/ui** - Accessible UI components
- **Socket.IO Client** - Real-time WebSocket communication
- **Zustand** - State management
- **React Markdown** - Message formatting
- **Lucide React** - Icon library

## Features

- Real-time chat interface with streaming messages
- WebSocket connection to backend (auto-reconnect)
- Conversation mode switching (Consult/Assessment)
- Markdown message rendering
- Embedded UI components (buttons, links, forms)
- Responsive design (desktop + tablet)
- Accessible UI (ARIA labels, keyboard navigation)

## Getting Started

### Prerequisites

- Node.js >= 22.11.0
- pnpm >= 9.0.0
- Backend WebSocket server running (port 8000)

### Installation

```bash
cd apps/web
pnpm install
```

### Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_WEBSOCKET_URL=http://localhost:8000
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000/chat](http://localhost:3000/chat)

### Testing

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test -- --watch
```

### Build

```bash
pnpm build
pnpm start
```

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/chat/    # Chat page
│   ├── layout.tsx           # Root layout
│   └── globals.css          # Tailwind imports
├── components/
│   ├── chat/                # Chat UI components
│   │   ├── ChatInterface.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageInput.tsx
│   │   ├── ModeSwitcher.tsx
│   │   └── DownloadButton.tsx
│   └── ui/                  # Shadcn components
│       ├── button.tsx
│       ├── input.tsx
│       └── select.tsx
├── hooks/
│   ├── useWebSocket.ts      # WebSocket connection hook
│   └── useConversationMode.ts
├── lib/
│   ├── websocket.ts         # WebSocket client class
│   └── utils.ts             # Utilities (cn)
└── stores/
    └── chatStore.ts         # Zustand state management
```

## Key Components

### ChatInterface

Main orchestrator component connecting all chat features.

```tsx
import { ChatInterface } from '@/components/chat/ChatInterface';

export default function ChatPage() {
  return <ChatInterface />;
}
```

### ChatMessage

Renders individual messages with support for markdown and embedded components.

```tsx
<ChatMessage
  role="assistant"
  content="Hello! How can I help?"
  components={[{ type: 'button', data: { label: 'Start Assessment' } }]}
  timestamp={new Date()}
/>
```

### useWebSocket Hook

React hook for managing WebSocket connections.

```tsx
const { isConnected, sendMessage } = useWebSocket({
  url: 'http://localhost:8000',
  onMessage: (message) => console.log(message),
  onMessageStream: (chunk) => console.log(chunk),
  onError: (error) => console.error(error),
});
```

## WebSocket Events

### Client → Server

- `send_message` - Send user message

```ts
socket.emit('send_message', { content: 'Hello' });
```

### Server → Client

- `message` - Complete message received
- `message:stream` - Streaming message chunk
- `error` - Error occurred

## Testing

Tests use Jest + React Testing Library.

**Component Tests:**
- ChatMessage (6 tests)
- MessageInput (6 tests)
- ModeSwitcher (4 tests)

**Hook Tests:**
- useWebSocket (5 tests)

**Total: 21 tests passing**

Run specific test:
```bash
pnpm test ChatMessage
```

## Troubleshooting

### WebSocket Connection Issues

1. Ensure backend server is running on port 8000
2. Check `.env.local` has correct `NEXT_PUBLIC_WEBSOCKET_URL`
3. Check browser console for connection errors

### Build Errors

**Tailwind CSS errors:**
- Ensure `@tailwindcss/postcss` is installed
- Check `postcss.config.js` uses `@tailwindcss/postcss`

**Type errors:**
- Run `pnpm build` to see all errors
- Check `tsconfig.json` paths are correct

## Architecture

Frontend follows **Presentation Layer** rules:

✅ **CAN:**
- Render UI components
- Capture user input
- Make HTTP/WebSocket calls to backend
- Manage UI state

❌ **CANNOT:**
- Access database directly
- Call Claude API directly
- Implement business logic
- Store sensitive data

All business logic happens in backend (packages/backend).

## Dependencies

See `package.json` for full list.

**Key dependencies:**
- next: ^16.0.0
- react: ^19.0.0
- socket.io-client: ^4.8.1
- zustand: ^5.0.8
- tailwindcss: ^4.0.0

## Contributing

1. Create feature branch
2. Write tests for new features
3. Ensure all tests pass: `pnpm test`
4. Build succeeds: `pnpm build`
5. Submit PR

## License

Private - Guardian App
