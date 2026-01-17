# Story 21.1: Add Font and Animations to Global Styles

## Description

Add Atkinson Hyperlegible font import and custom animations (pulse-shield, shimmer) to globals.css. This is the foundation for all other visual changes.

## Acceptance Criteria

- [ ] Atkinson Hyperlegible font imported from Google Fonts
- [ ] Font applied globally to body with sans-serif fallback
- [ ] `pulse-shield` keyframe animation defined (scale 1 to 1.18, sky-blue glow)
- [ ] `shimmer` keyframe animation defined (background sweep 200% to -200%)
- [ ] Utility classes `.animate-pulse-shield` and `.animate-shimmer` available
- [ ] No visual regressions in existing UI

## Technical Approach

1. Add Google Fonts import for Atkinson Hyperlegible at top of globals.css
2. Add `font-family: 'Atkinson Hyperlegible', sans-serif` to body in @layer base
3. Add pulse-shield keyframes: scale(1) to scale(1.18), box-shadow with rgba(14, 165, 233, 0.5)
4. Add shimmer keyframes: background-position 200% 0 to -200% 0
5. Add utility classes for both animations

### CSS Import Order (CRITICAL)

**The `@import` statement MUST be placed at the very top of globals.css, before any `@layer` or other CSS rules.**

CSS specification requires `@import` to appear before all other statements. Placing it after `@layer` blocks will cause invalid CSS and the font won't load.

```css
/* CORRECT - @import first */
@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible...');

@layer base { ... }

/* WRONG - @import after @layer */
@layer base { ... }
@import url('...'); /* Invalid - will be ignored */
```

## Files Touched

- `apps/web/src/app/globals.css` - Add font import and animations

## Agent Assignment

frontend-agent

## Tests Required

- Visual verification only (CSS changes)
- Snapshot test update if applicable

## Implementation Details

### Google Fonts Import

```css
@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap');
```

### Body Font Application

```css
@layer base {
  body {
    @apply bg-white text-gray-900;
    font-family: 'Atkinson Hyperlegible', sans-serif;
  }
}
```

### Pulse-Shield Animation

```css
@keyframes pulse-shield {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.5);
  }
  50% {
    transform: scale(1.18);
    box-shadow: 0 0 0 14px rgba(14, 165, 233, 0);
  }
}

.animate-pulse-shield {
  animation: pulse-shield 1.5s ease-in-out infinite;
}
```

### Shimmer Animation

```css
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.animate-shimmer {
  animation: shimmer 2s linear infinite;
}
```

## Dependencies

- None (foundational story)

## Estimated Effort

Small (single file, CSS only)
