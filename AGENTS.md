# NekoBox project rules

## Product direction

NekoBox is a privacy/security-focused application. The UI should feel calm, trustworthy, modern and production-ready.

Preserve the existing Claude Design-inspired visual direction. Do not replace it with a generic SaaS dashboard style.

## UI/UX rules

When working on UI, always improve:
- visual hierarchy
- spacing and alignment
- typography scale and consistency
- responsive behavior
- loading, empty, error, disabled and hover states
- accessibility and keyboard usability
- consistency with existing components, tokens and layout patterns

Avoid:
- generic SaaS card-grid layouts
- random gradients, shadows or animations
- flashy landing-page style
- heavy UI libraries unless explicitly approved
- redesigning unrelated screens
- changing business logic during visual polish

## Implementation rules

For every UI task:
1. Inspect the existing component structure.
2. Reuse existing components, tokens, utilities and styling patterns.
3. Do not invent a parallel design system.
4. Keep routing, state, data flow and business logic stable.
5. Make minimal but high-impact visual changes.
6. Check desktop and mobile layouts.
7. After editing, summarize what changed visually.

## Visual validation

When a screenshot or reference is provided:
- treat it as the visual target
- match layout, spacing, hierarchy, typography and mood
- adapt it to the existing NekoBox architecture
- use Playwright/browser preview when possible
- compare the implementation against the reference, not only against build/test success
