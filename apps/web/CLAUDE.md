# Frontend Rules (apps/web)

This file contains frontend-specific rules and learnings. Updated automatically when GPT-5.2 catches issues during code review.

## Tech Stack

- Next.js 16 (App Router)
- React 19 (Server Components)
- Tailwind CSS v4 (CSS-first, no config file)
- Shadcn/ui
- Zustand (state management)
- TypeScript (strict mode)

## Conventions

### Components
- Use functional components with TypeScript interfaces for props
- Add `data-testid` attributes for testable components
- Keep components focused - extract sub-components when complexity grows

### Hooks
- Custom hooks go in `src/hooks/`
- Use `use` prefix for all custom hooks
- Return object with named properties, not arrays

### State Management
- Use Zustand for global state
- Keep stores in `src/stores/`
- Prefer derived state over duplicated state

### Testing
- Every component should have tests
- Use React Testing Library
- Test behavior, not implementation

---

## Learnings from GPT Reviews

<!-- Auto-appended by orchestrator when GPT catches issues -->

### Epic 19.5 - Drag & Drop (2026-01-14)

**Library Integration:**
- Prefer library APIs directly (e.g., react-dropzone) over custom wrapper hooks
- Wrapper hooks over stable library APIs add unnecessary abstraction

**Dropzone Specific:**
- Add `noClick: true, noKeyboard: true` to prevent hijacking textarea focus/shortcuts
- Use single input path via `getInputProps()` - avoid multiple input elements
- Clamp `maxFiles` with `Math.max(0, limit - current)` to avoid negative values

**Accessibility:**
- Add `aria-live` regions for rejection announcements
- Include non-color cues (text) alongside color feedback

**Testing:**
- Use `data-testid` selectors, not brittle CSS selectors (`.max-w-3xl > div`)
- Prioritize integration tests on component behavior over unit tests on wrappers

**Security:**
- Ensure client-side constraints mirror server validation
- Treat filenames as untrusted input
