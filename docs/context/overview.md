# corpus-landing — context overview

The authoritative visual and interaction reference for the landing page is
`docs/design/prototypes/landing-lexicon.html`. Production copy, the canonical
brand mark, legal routes, and the functional early-access Server Action remain
authoritative where the application intentionally differs from that prototype.

## Landing contract

- QA the approved composition at 1440×900 and 390×844.
- `document.scrollingElement` is the only vertical scroll owner; `body` must not
  have a fixed height or vertical overflow rule.
- Living Lexicon selection and autoplay may scroll only `.lex-track` horizontally.
- Living Lexicon autoplay runs only while at least 35% of the browser is visible.
- Narrow scrollytelling stages render their matching visual beside each stage;
  desktop uses one sticky crossfading visual stack.
- Motion is progressively enhanced. No-JavaScript, reduced-motion, or failed
  motion imports must leave every essential element visible and usable.

## Verification

Run `bun run test` for Vitest or `bun run test:all` for every local gate. Run
`bun run test:e2e` for supported-browser journeys in the shared container.
Focused landing checks live in `tests/e2e/homepage.spec.ts`, `landing-motion.spec.ts`,
`living-lexicon.spec.ts`, and `landing-visual.spec.ts`.
