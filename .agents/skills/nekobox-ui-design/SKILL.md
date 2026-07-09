---
name: nekobox-ui-design
description: Use when improving, redesigning, polishing, implementing or reviewing NekoBox UI, UX, visual design, layout, spacing, typography, responsiveness or app screens.
---

# NekoBox UI Design Skill

Use this skill when the user asks to improve, redesign, polish, modernize, implement or review UI in NekoBox.

Goal:
Make the interface feel like a clean, modern, production-ready privacy/security application while preserving existing product logic.

Design direction:
- calm
- focused
- trustworthy
- privacy/security oriented
- modern but not flashy
- serious app, not landing page
- not generic SaaS dashboard

Always check:
1. Visual hierarchy
2. Spacing and alignment
3. Typography scale
4. Component proportions
5. Responsive behavior
6. Loading states
7. Empty states
8. Error states
9. Hover/focus/disabled states
10. Accessibility

Process:
1. Read the relevant UI files.
2. Understand the current visual system.
3. Identify what makes the current UI feel weak.
4. Reuse existing components, tokens and utilities.
5. Apply targeted improvements.
6. Avoid huge rewrites unless necessary.
7. Preserve routing, state, data flow and business logic.
8. Run the app or use browser/Playwright preview when possible.
9. Compare the result visually against the reference or stated goal.
10. Iterate on spacing, sizing, hierarchy and responsiveness.

When the user provides a screenshot or reference:
- treat it as the visual target
- match layout, spacing, hierarchy, typography and mood
- do not copy blindly
- adapt the reference to NekoBox architecture
- prefer project tokens and components over hardcoded random styles

Avoid:
- generic card grids
- random Tailwind spam
- unnecessary animations
- huge dependencies
- changing business logic during visual polish
- replacing the app style with unrelated templates
- overdesigned gradients or decorative clutter

After implementation:
- briefly explain what improved
- mention any assumptions
- mention files changed
- mention how to preview/test the result
