# Story 19.5.1: Install react-dropzone dependency

## Description

Install the react-dropzone library as a production dependency. This is a prerequisite for the Composer integration story.

## Acceptance Criteria

- [ ] react-dropzone installed as production dependency
- [ ] Package version is latest stable
- [ ] No TypeScript type issues (types included or @types installed)
- [ ] pnpm lockfile updated

## Technical Approach

```bash
pnpm --filter @guardian/web add react-dropzone
```

Verify installation:
```bash
pnpm --filter @guardian/web list react-dropzone
```

## Files Touched

- `apps/web/package.json` - Add react-dropzone dependency
- `pnpm-lock.yaml` - Updated lockfile

## Agent Assignment

- [x] frontend-agent

## Tests Required

- None (dependency installation only)

## Definition of Done

- [ ] react-dropzone in package.json dependencies
- [ ] pnpm install succeeds
- [ ] TypeScript can import useDropzone without errors

## Estimated Time

~5 minutes

## Notes

- react-dropzone includes TypeScript types (no @types package needed)
- Current latest version: check npm for exact version
