# Session Handoff - 2026-01-27

## CRITICAL RULES (READ FIRST)

### Hard Rule: Agent Delegation
**You are the ORCHESTRATOR. Keep your context clean and sharp.**
- Dispatch agents for ALL exploration, research, and implementation tasks
- Do NOT do the work yourself - delegate to specialist agents
- Use `run_in_background: true` for parallel work
- Only do: planning, delegation, reviewing summaries, responding to user

### Required KB Files (Read on Session Start)
Read these files from `.claude/documentation/kb/`:
1. `subagents-async.md` - How to dispatch and manage background agents
2. `claude-changelog.md` - Updates after 2.1+ (skills, hooks, context fixes)
3. `claude-code-skills-kb.md` - Skills and commands reference
4. `07-mcp-tool-search.md` - MCP tool search and on-demand loading

---

## Completed This Session

### Epic 31 - Parallel File Upload (MERGED TO MAIN)
- Async file extraction (47s → 1.3s performance improvement)
- Race condition mitigation with retry logic
- All tests passing (1780 backend, 1304 frontend)
- Commits: `0657e5c`, `4907916`

### Socket.IO Timeout Fix (MERGED TO MAIN)
- Root cause: Default pingTimeout (20s) expired during Claude API calls (20-40s)
- Fix: Added `pingTimeout: 60000`, `pingInterval: 30000` to server.ts
- Commit: `4907916`

### Puppeteer PDF Export (FIXED ON AWS)
- Issue: Missing Chrome dependencies on EC2
- Fix: `sudo yum install -y atk at-spi2-atk cups-libs libdrm libXcomposite libXdamage libXrandr mesa-libgbm pango alsa-lib`
- PM2 restarted, PDF export working

### Cleanup
- Deleted stray branch: `claude/fix-scoring-export-error-Nasuk`

---

## Current State

### Branches
- `main` - Up to date with all fixes
- `epic/31-parallel-file-upload` - Merged to main
- `epic/30-vision-api-support` - Previous work (Vision API)

### AWS Status
- Backend deployed with all fixes
- Socket.IO timeout: Fixed
- Puppeteer/PDF export: Working
- All systems operational

### Pending Tasks
1. **Task #1:** Implement session expired auto-logout with user message (PENDING)

### Next Up: Scoring Optimization
**Assessment file:** `docs/optimization/scoring-optimization-assessment.md`

**Quick wins (1-2 days, start here):**
1. Enable `usePromptCache: true` in DocumentParserService
2. Reduce extraction `maxTokens` 16384 → 8192
3. Add timing logs to confirm bottleneck

**Key files:**
- `packages/backend/src/infrastructure/ai/DocumentParserService.ts`
- `packages/backend/src/application/services/ScoringService.ts`

---

## Bug Reports Created

### BUG-001: Sequential File Processing
- Location: `docs/bugs/BUG-001-sequential-file-processing.md`
- Status: FIXED via Epic 31

### BUG-002: WebSocket Disconnect on Questionnaire Save
- Cause: Socket.IO ping timeout during long Claude API calls
- Status: FIXED via commit `4907916`

---

## Infrastructure Notes

### AWS EC2 (16.54.72.26)
- Backend: PM2 managed, auto-deploys from main via GitHub Actions
- CORS: Configured for Vercel domains
- Puppeteer deps: Installed

### Vercel
- Frontend: Auto-deploys from main
- Points to AWS backend via `NEXT_PUBLIC_API_URL`

---

## Quick Commands

```bash
# Start local dev
pnpm dev

# Run tests
pnpm test:unit
pnpm --filter @guardian/backend test:unit

# Check AWS logs
ssh ec2-user@16.54.72.26 "pm2 logs guardian-backend --lines 100"

# Check AWS status
ssh ec2-user@16.54.72.26 "pm2 status"
```

---

*Last updated: 2026-01-27*
