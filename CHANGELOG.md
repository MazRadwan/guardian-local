# Changelog

All notable changes to Guardian App.

## [Unreleased] - Week of January 25-29, 2026

### Epic 30: Vision API Support
- **feat(epic-30):** Implement Vision API support for image analysis in Consult mode
- **feat(epic-30):** Enable Vision API support for Assessment mode
- Image files (PNG, JPG, JPEG, GIF, WebP) now analyzed using Claude's Vision API
- Automatic mode gating - Vision enabled for Consult and Assessment modes
- 4MB file size warning toast for large images
- VisionContentBuilder service for image content block creation
- Proper cache cleanup on WebSocket disconnect to prevent memory leaks

### Epic 31: Parallel File Upload Performance
- **feat(epic-31):** Async file extraction for parallel upload performance
- Background extraction service processes files asynchronously
- MessageHandler retry logic with exponential backoff for processing files
- Frontend file processing feedback with status indicators
- Upload timing reduced from sequential to parallel processing
- Files process in background while user continues chatting

### Epic 32: Questionnaire Progress Streaming
- **feat(epic-32):** Implement questionnaire progress streaming
- IProgressEmitter interface for streaming progress updates
- SocketProgressEmitter broadcasts progress via WebSocket
- Frontend progress integration with real-time status
- Section-by-section progress: "Generating Risk Governance questions... (1/10)"
- Reconnection handling preserves progress state

### Scoring Improvements
- **fix(scoring):** Correct /100 scale in follow-up context + enable prompt cache
- **feat(scoring):** Add temperature=0 for deterministic scoring output
- Scoring now consistently uses /10 scale throughout
- Prompt caching reduces API costs for repeated scoring operations
- Deterministic output prevents score variance between identical inputs

### Export Improvements
- **fix(exports):** Remove help text from questionnaires, cleaner output
- **fix(exports):** Replace per-question required indicators with single header note
- **feat(export):** Add progress status messages to scoring download button
- Download button shows alternating messages during 2-minute narrative generation:
  - "Generating detailed report..."
  - "This may take a minute..."
- **revert:** Restore purple theme for scoring report (better text contrast)

### Authentication & Session
- **feat(auth):** Extend token to 24h and add auto-logout on expiry
- JWT token extended from 4 hours to 24 hours
- Auto-logout with toast notification on session expiry
- WebSocket auth error detection triggers user-friendly redirect

### Chat UI Improvements
- **feat(ui):** Add fade-in animation to ScoringResultCard
- **fix(chat):** Improve questionnaire markdown rendering with proper heading spacing
- **fix(chat):** Add spacing for bold text subheadings in chat responses
- Questionnaire sections now display with proper h2/h3/hr styling
- Bold subheadings (e.g., "**Key Points:**") get visual separation

### Infrastructure
- **fix(backend):** Add global error handler for JSON error responses
- **fix:** Increase Socket.IO ping timeout for long-running operations
- **ci:** Increase deploy timeout to 2 minutes

### Documentation
- **docs(epic-30):** Add Vision API support specifications
- **docs(epic-30):** Update architecture diagrams and documentation
- **docs(epic-32):** Add questionnaire progress streaming specifications
- **docs:** Update C4 diagrams and database schema documentation

---

## Format

This changelog follows [Keep a Changelog](https://keepachangelog.com/) format.

Categories:
- **Added** - New features
- **Changed** - Changes in existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Vulnerability fixes
