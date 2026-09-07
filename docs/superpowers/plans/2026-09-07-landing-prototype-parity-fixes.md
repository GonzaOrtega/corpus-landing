# Landing Prototype Parity Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the implemented landing page to the approved prototype's visual and interaction contract, eliminate all automatic document jumps, and add regression gates that prove the page remains stable across supported browsers and responsive layouts.

**Architecture:** Keep the homepage server-rendered and retain small client islands for behavior. Establish one document scroll container, replace the Lexicon's document-affecting selection logic with track-local scrolling, separate automatic and user-controlled playback state, and add a page-motion controller for the header, progress spine, and Philosophy theme. Replace the accumulated landing overrides with a single feature stylesheet whose selectors match the rendered component structure.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, TypeScript, CSS custom properties, GSAP 3.15 with ScrollTrigger, Playwright 1.63, Vitest, `next/font/google`.

**Spec:** `docs/superpowers/specs/2026-09-06-corpus-landing-design.md`; authoritative interaction and visual reference: `docs/design/prototypes/landing-lexicon.html`

## Global Constraints

- Treat `docs/design/prototypes/landing-lexicon.html` as the authoritative landing visual and interaction reference; do not redesign it.
- Preserve final early-access copy from Sections 3 and 4 of the design specification where it intentionally differs from the prototype.
- Preserve the canonical snapshotted mark at `public/brand/corpus-mark.svg`; adjust only its presentation size/alignment.
- Preserve real `/privacy` and `/terms` links, Server Action signup behavior, CAPTCHA behavior, and release-stage behavior.
- Keep static copy and structure in Server Components; use Client Components only for state, effects, event handlers, and browser APIs.
- Use `next/font/google`; do not restore the prototype's runtime Google Fonts request.
- GSAP remains the only JavaScript animation framework.
- Without JavaScript, all content and navigation must remain readable and usable.
- With `prefers-reduced-motion: reduce`, automatic movement and nonessential animation must remain disabled.
- Accessibility target remains WCAG 2.2 AA.
- Browser support remains the latest two major desktop versions of Chrome, Edge, Firefox, and Safari, plus current Chrome Android and Safari iOS.
- Do not change the early-access domain, persistence, email, security, operations, or deployment behavior.

---

## File Structure Map

```text
app/
├── globals.css                                  # reset, global tokens, legal/shared styles
└── layout.tsx                                   # fonts + landing stylesheet + motion preflight

public/
└── motion-preflight.js                          # pre-paint motion capability class and failsafe

src/features/landing/
├── landing.css                                  # authoritative landing-specific styles
├── motion/
│   ├── hero-motion.tsx                          # hero choreography and failure fallback
│   ├── page-motion.tsx                          # header, theme, spine, philosophy reveal
│   ├── scrollytelling-motion.tsx                # stage reveal/crossfade only
│   └── shared-motion.ts                         # GSAP loading, split text, pointer helpers
└── ui/
    ├── capture-enrich-practice.tsx              # desktop/mobile semantic stage layout
    ├── hero.tsx                                 # prototype-aligned hero markup
    ├── landing-shell.tsx                        # section metadata + page motion controller
    ├── living-lexicon.client.tsx                # local track behavior and autoplay state
    ├── living-lexicon.tsx                       # static Lexicon shell
    ├── philosophy-section.tsx                   # inversion and reveal hooks
    ├── progress-spine.tsx                       # track/fill/node markup
    ├── site-footer.tsx                          # prototype-aligned footer classes
    └── site-header.tsx                          # prototype-aligned header hooks

tests/e2e/
├── homepage.spec.ts                             # document scroll, anchors, header, spine, theme
├── landing-motion.spec.ts                       # pre-paint, reduced-motion, scrollytelling
├── landing-visual.spec.ts                       # reviewed desktop/mobile screenshot baselines
└── living-lexicon.spec.ts                       # local scrolling and autoplay contract
```

---

### Task 1: Restore a single document scroll container and prevent hydration jumps

**Files:**
- Modify: `app/globals.css:1-28`
- Modify: `src/features/landing/ui/living-lexicon.client.tsx:53-59`
- Modify: `tests/e2e/homepage.spec.ts`
- Modify: `tests/e2e/living-lexicon.spec.ts`

**Interfaces:**
- Produces: `scrollLexiconItem(track: HTMLElement, item: HTMLElement, behavior: ScrollBehavior): void`
- Guarantees: `document.scrollingElement` owns vertical scrolling; selecting a word changes only `.lex-track.scrollLeft`.

- [ ] **Step 1: Add failing document-scroll regression tests**

Add these cases to `tests/e2e/homepage.spec.ts`:

```ts
test('stays at the hero through hydration while the Lexicon is off-screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();

  await page.waitForTimeout(1_000);

  const position = await page.evaluate(() => ({
    bodyOverflowY: getComputedStyle(document.body).overflowY,
    bodyTop: document.body.scrollTop,
    documentTop: document.scrollingElement?.scrollTop ?? -1,
    hash: location.hash,
  }));

  expect(position).toEqual({
    bodyOverflowY: 'visible',
    bodyTop: 0,
    documentTop: 0,
    hash: '',
  });
});

test('keeps an anchor destination stable after hydration', async ({ page }) => {
  await page.goto('/#how');
  await page.waitForTimeout(1_000);

  await expect(page.locator('#how')).toBeInViewport();
  await expect(page.locator('#lexicon')).not.toBeInViewport();
});
```

Add to `tests/e2e/living-lexicon.spec.ts`:

```ts
test('word selection scrolls only the horizontal track', async ({ page }) => {
  await page.goto('/#lexicon');
  const before = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);

  await page.getByRole('button', { name: 'quotidian' }).click();

  const after = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: 'quotidian' })).toHaveAttribute(
    'aria-current',
    'true',
  );
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
bunx playwright test tests/e2e/homepage.spec.ts tests/e2e/living-lexicon.spec.ts --project=chromium
```

Expected: the hydration test reports a nonzero `bodyTop`, `bodyOverflowY` is `auto`, and selecting a Lexicon word changes vertical position.

- [ ] **Step 3: Make the document the only vertical scroll owner**

Replace the `html, body` height/overflow rule in `app/globals.css` with:

```css
html {
  min-height: 100%;
  scroll-behavior: smooth;
  -webkit-text-size-adjust: 100%;
}

body {
  min-height: 100%;
  overflow-x: clip;
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}
```

Do not set `height: 100%` or any vertical overflow value on `body`.

- [ ] **Step 4: Replace `scrollIntoView` with track-local positioning**

Define this function above `LivingLexiconClient`:

```ts
export function scrollLexiconItem(
  track: HTMLElement,
  item: HTMLElement,
  behavior: ScrollBehavior,
) {
  const inset = Number.parseFloat(getComputedStyle(track).paddingLeft) || 0;
  track.scrollTo({ left: item.offsetLeft - inset, behavior });
}
```

Replace the active-item effect with a call to `scrollLexiconItem`. The effect must never call `Element.scrollIntoView()`.

- [ ] **Step 5: Re-run the focused tests and verify GREEN**

Run the Step 2 command. Expected: all focused tests pass and the heading remains in the viewport after hydration.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css src/features/landing/ui/living-lexicon.client.tsx tests/e2e/homepage.spec.ts tests/e2e/living-lexicon.spec.ts
git commit -m "fix: keep lexicon scrolling local"
```

---

### Task 2: Rebuild the Living Lexicon playback and selection state machine

**Files:**
- Modify: `src/features/landing/ui/living-lexicon.client.tsx`
- Modify: `tests/e2e/living-lexicon.spec.ts`

**Interfaces:**
- Produces: independent `userPaused`, `interactionPaused`, `isInView`, and `directionRef` state.
- Consumes: `scrollLexiconItem()` from Task 1.
- Guarantees: autoplay runs only in view, traverses `0→7→0`, pauses correctly, and native horizontal scrolling selects the nearest word.

- [ ] **Step 1: Add failing playback tests**

Add tests covering the complete contract:

```ts
test('does not autoplay while the Lexicon is off-screen', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(5_500);
  await expect(page.getByRole('button', { name: 'lucent' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
});

test('autoplay ping-pongs through the whole Lexicon while visible', async ({ page }) => {
  await page.clock.install();
  await page.goto('/#lexicon');
  await page.clock.fastForward(35_100);
  await expect(page.getByRole('button', { name: 'fathom' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await page.clock.fastForward(10_000);
  await expect(page.getByRole('button', { name: 'quotidian' })).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('an interaction pause does not become an explicit pause', async ({ page }) => {
  await page.goto('/#lexicon');
  await page.getByRole('button', { name: 'petrichor' }).click();
  await expect(page.getByRole('button', { name: 'Pause the word browser' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
```

Add one test that sets `.lex-track.scrollLeft` through a wheel/track-local scroll action and asserts the nearest visible word, detail copy, and announced count agree.

- [ ] **Step 2: Run the Lexicon suite and verify RED**

```bash
bunx playwright test tests/e2e/living-lexicon.spec.ts --project=chromium
```

Expected: off-screen autoplay changes the active word; end traversal alternates only between the final two entries; interaction pause changes the button to “Play.”

- [ ] **Step 3: Separate playback state**

Replace `isPaused` with:

```ts
const [userPaused, setUserPaused] = useState(false);
const [interactionPaused, setInteractionPaused] = useState(false);
const [isInView, setIsInView] = useState(false);
const directionRef = useRef<1 | -1>(1);

const autoplayRunning =
  isHydrated && isInView && !userPaused && !interactionPaused && !reducedMotion;
```

Use an `IntersectionObserver` with `{ threshold: 0.35 }` on the `.browser` root. Disconnect it during cleanup. Clear both the autoplay interval and idle-resume timeout during cleanup.

- [ ] **Step 4: Implement full ping-pong traversal**

Use the direction ref inside the interval callback:

```ts
setActiveIndex((current) => {
  if (current >= entries.length - 1) directionRef.current = -1;
  else if (current <= 0) directionRef.current = 1;
  return current + directionRef.current;
});
```

Run the interval only when `autoplayRunning` is true.

- [ ] **Step 5: Synchronize native scrolling with the active entry**

Attach an `onScroll` handler that schedules one animation frame, measures the focus position `track.scrollLeft + paddingLeft`, finds the item with the smallest absolute distance from that position, and calls `setActiveIndex(nearestIndex)` without initiating another document scroll. Cancel the pending animation frame during cleanup.

Clicks, focus, and arrow keys must call `scrollLexiconItem()`. Pointer dragging must update only `track.scrollLeft`; pointer release must snap to the active item. Remove the fixed 80-pixel “one word only” selection branch.

- [ ] **Step 6: Preserve explicit pause semantics**

The pause button must toggle only `userPaused`. User interaction sets `interactionPaused=true`, leaves `aria-pressed={userPaused}`, and clears the transient pause after seven seconds. The button label remains “Pause the word browser” during an interaction pause and becomes “Play the word browser” only after an explicit pause.

- [ ] **Step 7: Re-run the Lexicon suite and verify GREEN**

Run the Step 2 command. Expected: every Lexicon test passes with Playwright's virtual clock and no document movement.

- [ ] **Step 8: Commit**

```bash
git add src/features/landing/ui/living-lexicon.client.tsx tests/e2e/living-lexicon.spec.ts
git commit -m "fix: restore lexicon playback behavior"
```

---

### Task 3: Replace accumulated overrides with the approved styling foundation

**Files:**
- Create: `src/features/landing/landing.css`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `tests/e2e/homepage.spec.ts`

**Interfaces:**
- Produces: semantic theme tokens `--bg`, `--fg`, `--accent`, `--panel`, `--muted`, `--rule`, and `--rule-2`.
- Guarantees: one definition per landing selector; legal/shared styles remain available on every route.

- [ ] **Step 1: Add computed-style assertions for the approved foundation**

Assert on the homepage:

```ts
expect(await page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor))
  .toBe('rgb(241, 239, 233)');
await expect(page.locator('.site-header')).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)');
await expect(page.getByRole('link', { name: 'How it works' })).toHaveCSS('text-decoration-line', 'none');
```

- [ ] **Step 2: Run the homepage suite and verify RED**

```bash
bunx playwright test tests/e2e/homepage.spec.ts --project=chromium
```

- [ ] **Step 3: Reduce `app/globals.css` to global responsibilities**

Keep the box-sizing reset, root/body foundation, fonts, link inheritance, heading defaults, paragraph reset, focus style, skip link, legal-page styles, and screen-reader utility. Remove landing-specific definitions for header, hero, sections, spine, stages, Lexicon, Philosophy, Early Access, and footer.

Use these tokens:

```css
:root {
  --paper: #f1efe9;
  --surface: #fbfaf6;
  --ink: #1c1a16;
  --clay: #b0503a;
  --night: #141419;
  --night-ink: #e7e4dd;
  --night-clay: #d98368;
  --bg: var(--paper);
  --fg: var(--ink);
  --accent: var(--clay);
  --panel: var(--surface);
  --maxw: 1140px;
  --pad: clamp(1.25rem, 5vw, 4rem);
  --indent: clamp(1.5rem, 4vw, 3.5rem);
  --step--1: clamp(0.8rem, 0.77rem + 0.15vw, 0.875rem);
  --step-0: clamp(1rem, 0.96rem + 0.2vw, 1.0625rem);
  --step-1: clamp(1.1rem, 1rem + 0.5vw, 1.3rem);
  --step-2: clamp(1.6rem, 1.35rem + 1.2vw, 2.25rem);
  --step-3: clamp(2.1rem, 1.6rem + 2.4vw, 3.4rem);
  --step-4: clamp(2.9rem, 1.9rem + 4.6vw, 6rem);
}

body {
  --muted: color-mix(in srgb, var(--fg) 56%, transparent);
  --rule: color-mix(in srgb, var(--fg) 15%, transparent);
  --rule-2: color-mix(in srgb, var(--fg) 8%, transparent);
  background: var(--bg);
  color: var(--fg);
}
```

- [ ] **Step 4: Create the feature stylesheet and import it once**

Move the authoritative landing rules into `src/features/landing/landing.css`, using the component's existing semantic class names. Start the file with shared landing primitives `.wrap`, `.column`, `.eyebrow`, `.lede`, `.button`, and theme transitions. Import it immediately after `./globals.css` in `app/layout.tsx`:

```ts
import './globals.css';
import '@/src/features/landing/landing.css';
```

Do not leave duplicate definitions in `app/globals.css`.

- [ ] **Step 5: Re-run static checks and the homepage suite**

```bash
bun run typecheck
bun run lint
bunx playwright test tests/e2e/homepage.spec.ts --project=chromium
```

Expected: all commands pass; the approved paper color, transparent initial header rule, and undecorated navigation are verified.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/layout.tsx src/features/landing/landing.css tests/e2e/homepage.spec.ts
git commit -m "refactor: establish landing style foundation"
```

---

### Task 4: Restore header, hero, specimen, and footer parity

**Files:**
- Modify: `src/features/landing/ui/site-header.tsx`
- Modify: `src/features/landing/ui/hero.tsx`
- Modify: `src/features/landing/ui/site-footer.tsx`
- Modify: `src/features/landing/landing.css`
- Modify: `src/features/landing/ui/landing-shell.test.tsx`
- Modify: `tests/e2e/homepage.spec.ts`

**Interfaces:**
- Produces: prototype-aligned structural hooks without converting static components into Client Components.
- Preserves: canonical `CorpusMark`, release-aware `ReleaseCta`, final signup copy, and real legal routes.

- [ ] **Step 1: Add failing structure and layout assertions**

Update the server-render test to assert:

```ts
expect(html).toContain('class="wrap"><div class="column hero-grid"');
expect(html).toContain('Near: luminous, radiant, translucent');
expect(html).not.toContain('<h2>lucent');
expect(html).toContain('data-stuck="false"');
```

In the desktop E2E test at `1440×900`, assert the hero heading's left edge is within two pixels of the `.column` edge and that the rendered heading occupies three lines.

- [ ] **Step 2: Run the focused component and homepage tests and verify RED**

```bash
bunx vitest run src/features/landing/ui/landing-shell.test.tsx
bunx playwright test tests/e2e/homepage.spec.ts --project=chromium
```

- [ ] **Step 3: Align the header markup and presentation hooks**

Render the header with `data-stuck="false"`. Keep the main hero CTA solid, but pass only `className="button"` to the header `ReleaseCta`, matching the prototype's outlined header action. Keep `CorpusMark` at 26×26 presentation size and do not replace its source SVG.

- [ ] **Step 4: Align the hero structure and semantic specimen markup**

Use this nesting and specimen structure:

```tsx
<HeroMotion>
  <div className="wrap">
    <div className="column hero-grid">
      {/* copy column */}
      <div className="hero-figure">
        {/* existing geometry */}
        <div className="capture-demo">
          {/* existing capture field */}
          <div className="specimen" data-hero="entry">
            <div>
              <span className="spec-word" data-hero="s1">lucent</span>
              <span className="spec-gram" data-hero="s2">adjective</span>
            </div>
            <div className="spec-ipa" data-hero="s3">/ˈluːs(ə)nt/</div>
            <p className="spec-def" data-hero="s4">
              Softly bright; glowing with, or reflecting, light.
            </p>
            <div className="spec-meta" data-hero="s5">
              <div>Heard in <b>a podcast</b>, 12 August</div>
              <div>Near: luminous, radiant, translucent</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</HeroMotion>
```

This removes the false `h2` from the accessibility outline and restores the missing metadata row.

- [ ] **Step 5: Port the exact header/hero/footer proportions**

From the prototype, reproduce: 68-pixel header minimum height; initial transparent header rule; 26-pixel mark; muted undecorated nav links; outlined header CTA; hero column indent; `12ch` headline width; clipped hero overflow; `--rule-2` note border; muted specimen grammar; two-row specimen metadata; and footer padding of `2.5rem 0 3.5rem`.

Keep the specification's current Early Access consent text and real legal links.

- [ ] **Step 6: Run tests and verify GREEN**

Run the Step 2 commands. Expected: both pass and the heading wraps `Learn / words from / real life.` at 1440×900.

- [ ] **Step 7: Commit**

```bash
git add src/features/landing/ui src/features/landing/landing.css tests/e2e/homepage.spec.ts
git commit -m "fix: align landing shell with prototype"
```

---

### Task 5: Restore page-level header, progress spine, theme, and philosophy motion

**Files:**
- Create: `src/features/landing/motion/page-motion.tsx`
- Modify: `src/features/landing/ui/landing-shell.tsx`
- Modify: `src/features/landing/ui/progress-spine.tsx`
- Modify: `src/features/landing/ui/philosophy-section.tsx`
- Modify: `src/features/early-access/ui/early-access-section.tsx`
- Modify: `src/features/landing/motion/shared-motion.ts`
- Modify: `src/features/landing/landing.css`
- Modify: `tests/e2e/homepage.spec.ts`
- Modify: `tests/e2e/landing-motion.spec.ts`

**Interfaces:**
- Produces: `PageMotion(): null`, which owns page-wide browser listeners and GSAP context cleanup.
- Consumes: `loadMotionEngine()` and section hooks `[data-section][data-index]`.

- [ ] **Step 1: Add failing page-motion acceptance tests**

Add assertions that:

```ts
await page.goto('/');
await expect(page.locator('.site-header')).toHaveAttribute('data-stuck', 'false');
await page.mouse.wheel(0, 200);
await expect(page.locator('.site-header')).toHaveAttribute('data-stuck', 'true');

await page.locator('#philosophy').scrollIntoViewIfNeeded();
await expect(page.locator('body')).toHaveClass(/theme-night/);
await expect(page.locator('.site-header')).toHaveCSS('color', 'rgb(231, 228, 221)');

const fill = page.locator('[data-progress-fill]');
expect(await fill.evaluate((node) => getComputedStyle(node).transform)).not.toBe('none');
await expect(page.locator('[data-progress-node="3"]')).toHaveAttribute('data-active', 'true');
```

Also assert the body returns to the light theme after scrolling to Early Access and that reduced-motion mode exposes the Philosophy heading without a transform.

- [ ] **Step 2: Run the focused suites and verify RED**

```bash
bunx playwright test tests/e2e/homepage.spec.ts tests/e2e/landing-motion.spec.ts --project=chromium
```

- [ ] **Step 3: Add section metadata and progress-spine hooks**

Give the five sections indexes `0` through `4`: Hero, How, Lexicon, Philosophy, Early Access. Render:

```tsx
<div aria-hidden="true" className="progress-spine">
  <div className="progress-track" />
  <div className="progress-fill" data-progress-fill />
  {[4, 30, 55, 78, 96].map((top, index) => (
    <span
      data-active="false"
      data-progress-node={index}
      key={top}
      style={{ top: `${top}%` }}
    />
  ))}
</div>
```

Add `data-theme-inversion` and `data-split-scroll` to the Philosophy section/heading. Give each Philosophy paragraph class `principle`.

- [ ] **Step 4: Implement `PageMotion` with bounded cleanup**

The controller must:

1. Update `data-stuck` from `window.scrollY > 8`.
2. On a requestAnimationFrame-throttled scroll/resize handler, toggle `body.theme-night` only when Philosophy contains the viewport midpoint.
3. Load GSAP/ScrollTrigger when motion is allowed.
4. Scrub `[data-progress-fill]` from `scaleY(0)` to `scaleY(1)` over the document.
5. Set each progress node's `data-active` while its indexed section owns the central viewport band.
6. Split and reveal the Philosophy heading on entry.
7. Remove listeners, kill animation frames, revert the GSAP context, restore split text, remove `theme-night`, and reset header/node attributes on unmount.

Use the document scroll root (`window`/`document.documentElement`), never `document.body.scrollTop`.

- [ ] **Step 5: Restore the prototype's Philosophy treatment**

Implement whole-page theme variables through `body.theme-night`; keep section padding `clamp(5rem, 12vw, 9rem)`, italic 300-weight heading, `1.5rem` principle gap, `--step-1` principle type, and one clay diamond per principle. The sticky header and progress spine must derive all colors from `--bg`, `--fg`, and `--accent` so they invert with the body.

- [ ] **Step 6: Run tests and verify GREEN**

Run the Step 2 command. Expected: all page-motion tests pass without changing the URL or creating another scroll container.

- [ ] **Step 7: Commit**

```bash
git add src/features/landing tests/e2e/homepage.spec.ts tests/e2e/landing-motion.spec.ts
git commit -m "fix: restore landing scroll choreography"
```

---

### Task 6: Pair each scrollytelling state with its stage on narrow layouts

**Files:**
- Create: `src/features/landing/content/practice-event.ts`
- Modify: `src/features/landing/ui/capture-enrich-practice.tsx`
- Modify: `src/features/landing/ui/cloze-demo.tsx`
- Modify: `src/features/landing/ui/living-lexicon.client.tsx`
- Modify: `src/features/landing/motion/scrollytelling-motion.tsx`
- Modify: `src/features/landing/landing.css`
- Modify: `tests/e2e/cloze.spec.ts`
- Modify: `tests/e2e/landing-motion.spec.ts`

**Interfaces:**
- Produces: `StageVisual({ index }: { index: number })`, a static render helper used in desktop and narrow presentations, plus one shared `PRACTICE_EVENT` constant.
- Guarantees: one visible state per stage on narrow screens; one sticky crossfading stack on desktop; hidden duplicate presentation is absent from the accessibility tree through `display: none`.

- [ ] **Step 1: Add failing narrow-layout order tests**

At `390×844`, assert each stage article contains its matching visible visual:

```ts
const capture = page.locator('[data-stage="0"]');
await expect(capture.getByText('Saved. Nothing else needed.')).toBeVisible();

const enrich = page.locator('[data-stage="1"]');
await expect(enrich.getByText('Near: luminous, radiant, translucent')).toBeVisible();

const practice = page.locator('[data-stage="2"]');
await expect(practice.getByText('The water was')).toBeVisible();
await expect(page.locator('.desktop-stage-visual')).toBeHidden();
```

At `1440×900`, assert the mobile visual copies are hidden and all three desktop states occupy the same sticky rectangle.

In `tests/e2e/cloze.spec.ts`, reveal the desktop cloze, resize to `390×844`, and assert the newly visible narrow cloze still says `lucent` and retains the completed hint.

- [ ] **Step 2: Run the motion suite and verify RED**

```bash
bunx playwright test tests/e2e/landing-motion.spec.ts --project=chromium
```

- [ ] **Step 3: Extract the deterministic `StageVisual` renderer**

Move the existing three state bodies behind `StageVisual({ index })`. Render a `.mobile-stage-visual` inside each matching stage and render the three `.state` elements once more inside `.desktop-stage-visual .sticky`.

Move `PRACTICE_EVENT` to `src/features/landing/content/practice-event.ts` and import it from both `cloze-demo.tsx` and `living-lexicon.client.tsx`. Each `ClozeDemo` instance must listen for this event and apply the revealed word/completed hint as well as dispatch it when activated. This keeps the CSS-hidden desktop and narrow presentations synchronized across responsive resizing.

CSS must use:

```css
.mobile-stage-visual { display: none; }

@media (max-width: 880px) {
  .desktop-stage-visual { display: none; }
  .mobile-stage-visual { display: block; margin-top: 1.6rem; }
  .stage { min-height: 0; padding-block: 2.5rem; }
}
```

Do not imperatively reparent React-owned DOM nodes. Keep the desktop ScrollTrigger logic scoped to `.desktop-stage-visual [data-state]`.

- [ ] **Step 4: Verify no-JavaScript and reduced-motion layouts**

Run:

```bash
bunx playwright test tests/e2e/landing-motion.spec.ts tests/e2e/cloze.spec.ts --project=chromium
```

Expected: desktop, narrow, no-JavaScript, and reduced-motion cases all pass; only the presentation appropriate to the media query is visible.

- [ ] **Step 5: Commit**

```bash
git add src/features/landing/content/practice-event.ts src/features/landing/ui/capture-enrich-practice.tsx src/features/landing/ui/cloze-demo.tsx src/features/landing/ui/living-lexicon.client.tsx src/features/landing/motion/scrollytelling-motion.tsx src/features/landing/landing.css tests/e2e/cloze.spec.ts tests/e2e/landing-motion.spec.ts
git commit -m "fix: pair scrollytelling visuals on mobile"
```

---

### Task 7: Restore Living Lexicon and remaining section-level visual parity

**Files:**
- Modify: `src/features/landing/ui/living-lexicon.client.tsx`
- Modify: `src/features/landing/ui/living-lexicon.tsx`
- Modify: `src/features/early-access/ui/early-access-section.tsx`
- Modify: `src/features/landing/ui/site-footer.tsx`
- Modify: `src/features/landing/landing.css`
- Modify: `tests/e2e/living-lexicon.spec.ts`
- Create: `tests/e2e/landing-visual.spec.ts`

**Interfaces:**
- Consumes: playback state from Task 2 and semantic tokens from Task 3.
- Produces: `data-running`, active-word falloff styles, a local autoplay progress indicator, and reviewed screenshot baselines.

- [ ] **Step 1: Add failing Lexicon presentation assertions**

Assert:

```ts
await page.goto('/#lexicon');
await expect(page.getByRole('button', { name: 'lucent' })).toHaveCSS('color', 'rgb(28, 26, 22)');
await expect(page.getByRole('button', { name: 'fathom' })).toHaveCSS('opacity', '0.06');
await expect(page.getByRole('button', { name: 'Pause the word browser' })).not.toBeInViewport();
await page.getByRole('button', { name: 'Pause the word browser' }).focus();
await expect(page.getByRole('button', { name: 'Pause the word browser' })).toBeInViewport();
```

Assert the first word's left edge aligns with the `.column` left edge within two pixels. Assert the detail uses equal-width columns, top rules between encounters, normal-case labels, and no permanent vertical encounter borders.

- [ ] **Step 2: Run the Lexicon suite and verify RED**

```bash
bunx playwright test tests/e2e/living-lexicon.spec.ts --project=chromium
```

- [ ] **Step 3: Restore the track, falloff, and controls**

Implement the prototype's focus-axis inset:

```css
.lex-track {
  --lex-inset: max(
    calc(var(--pad) + var(--indent)),
    calc(50% - var(--maxw) / 2 + var(--pad) + var(--indent))
  );
  align-items: baseline;
  gap: clamp(1.25rem, 3vw, 2.25rem);
  padding: 0.3rem 70% 0.9rem var(--lex-inset);
  scroll-padding-left: var(--lex-inset);
  cursor: grab;
  mask-image: linear-gradient(to right, #000 0, #000 42%, transparent 94%);
}

.lex-item { color: var(--fg); opacity: 0.06; }
.lex-item[aria-current="true"], .lex-item:focus-visible { opacity: 1; }
```

During the scroll animation frame from Task 2, calculate each word's opacity using the prototype formula `0.06 + Math.pow(1 - distanceRatio, 1.6) * 0.94`.

Keep the pause control off-screen with `left: -9999px` and reveal it on `:focus`. Change the ARIA label to describe only the controls that exist: “Word browser. Drag, swipe, click a word, or use the arrow keys to move through your lexicon.”

- [ ] **Step 4: Restore the progress rule and detail panel**

Place the diamond at the left origin, animate the underline fill from `scaleX(0)` to `scaleX(1)` only while `autoplayRunning`, and restart it for each automatic interval. Use equal detail columns, horizontal encounter rules, normal-case labels, serif encounter values, and responsive single-column encounters at 480 pixels.

- [ ] **Step 5: Finish Early Access and footer parity without reverting production copy**

Use the prototype's section spacing, `44ch` body width, 30-rem form width, surface input, focus treatment, and footer layout. Keep the final consent wording, server status output, canonical mark, and real legal links unchanged.

- [ ] **Step 6: Add reviewed visual regression snapshots**

Create `tests/e2e/landing-visual.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test.use({ colorScheme: 'light', reducedMotion: 'reduce' });

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  test(`${viewport.name} landing matches the approved composition`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`landing-${viewport.name}.png`, {
      animations: 'disabled',
      fullPage: true,
    });
  });
}
```

Generate the baselines once, manually compare them section-by-section with `docs/design/prototypes/landing-lexicon.html` and the approved screenshot, and accept them only after header, hero, stages, Lexicon, Philosophy, Early Access, and footer match. Do not update snapshots merely to make a failing test green.

- [ ] **Step 7: Run tests and verify GREEN**

```bash
bunx playwright test tests/e2e/living-lexicon.spec.ts tests/e2e/landing-visual.spec.ts --project=chromium
```

- [ ] **Step 8: Commit**

```bash
git add src/features/landing src/features/early-access/ui/early-access-section.tsx tests/e2e/living-lexicon.spec.ts tests/e2e/landing-visual.spec.ts tests/e2e/landing-visual.spec.ts-snapshots
git commit -m "fix: restore landing visual parity"
```

---

### Task 8: Prevent hero flash and verify progressive enhancement

**Files:**
- Create: `public/motion-preflight.js`
- Modify: `app/layout.tsx`
- Modify: `src/features/landing/motion/hero-motion.tsx`
- Modify: `src/features/landing/motion/page-motion.tsx`
- Modify: `src/features/landing/motion/scrollytelling-motion.tsx`
- Modify: `src/features/landing/landing.css`
- Modify: `tests/e2e/landing-motion.spec.ts`

**Interfaces:**
- Produces: root classes `motion-enabled` and `motion-fallback`, plus `data-hero-motion-ready`, `data-page-motion-ready`, and `data-scrollytelling-motion-ready` attributes set by the three motion controllers.
- Guarantees: no fully-rendered-then-hidden flash; script, import, or GSAP failure reveals static content.

- [ ] **Step 1: Add failing pre-paint and failure-fallback tests**

Use Playwright routing to delay GSAP chunks and take an early screenshot/DOM-style sample. Assert hero animation targets are already in their pre-animation state before the delayed chunk resolves. Add a second case that aborts the GSAP chunk and asserts all hero content becomes visible within 2.6 seconds.

Keep the existing JavaScript-disabled and reduced-motion assertions.

- [ ] **Step 2: Run the motion suite and verify RED**

```bash
bunx playwright test tests/e2e/landing-motion.spec.ts --project=chromium
```

- [ ] **Step 3: Add a self-hosted preflight script**

Create `public/motion-preflight.js` with this behavior:

```js
(function () {
  var root = document.documentElement;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('motion-fallback');
    return;
  }
  root.classList.add('motion-enabled');
  window.setTimeout(function () {
    var ready = root.dataset.heroMotionReady === 'true' &&
      root.dataset.pageMotionReady === 'true' &&
      root.dataset.scrollytellingMotionReady === 'true';
    if (!ready) {
      root.classList.remove('motion-enabled');
      root.classList.add('motion-fallback');
    }
  }, 2500);
})();
```

Load it from `app/layout.tsx` with Next.js `<Script src="/motion-preflight.js" strategy="beforeInteractive" />`. This remains compatible with the existing self-only script policy and avoids a runtime CDN dependency.

- [ ] **Step 4: Make motion readiness and failure explicit**

Each controller must set only its own readiness attribute after it has installed its complete timeline/listener set. If any dynamic import rejects, remove `motion-enabled`, add `motion-fallback`, restore split text, restore the full typed word, and reveal every target. Cleanup must remove that controller's readiness attribute and must not leave the legal routes or a later soft navigation in an animation-hidden state.

- [ ] **Step 5: Scope pre-animation CSS to the root capability class**

Use `.motion-enabled` for hidden/translated initial states and `.motion-fallback`/`noscript` to force visibility. The server HTML itself remains complete and readable.

- [ ] **Step 6: Run progressive-enhancement tests and verify GREEN**

```bash
bunx playwright test tests/e2e/landing-motion.spec.ts --project=chromium
bunx playwright test tests/e2e/landing-motion.spec.ts --project=webkit
```

- [ ] **Step 7: Commit**

```bash
git add public/motion-preflight.js app/layout.tsx src/features/landing/motion src/features/landing/landing.css tests/e2e/landing-motion.spec.ts
git commit -m "fix: prevent landing motion flash"
```

---

### Task 9: Complete cross-browser, accessibility, and final parity verification

**Files:**
- Modify: `tests/e2e/accessibility.spec.ts`
- Modify: `tests/e2e/homepage.spec.ts`
- Modify: `tests/e2e/landing-motion.spec.ts`
- Modify: `tests/e2e/living-lexicon.spec.ts`
- Modify: `docs/context/overview.md`

**Interfaces:**
- Consumes: all completed tasks.
- Produces: final automated and manual evidence that every diagnosed issue is covered.

- [ ] **Step 1: Extend accessibility coverage for moving content**

Add assertions that the pause control is keyboard reachable, `aria-pressed` represents only explicit pause, automatic detail updates use `aria-live="off"`, user-driven detail updates use `aria-live="polite"`, and the page outline contains only the intended section headings—not the decorative hero specimen.

- [ ] **Step 2: Run all landing E2E projects**

```bash
bun run e2e
```

Expected: Chromium full suite, Firefox/WebKit smoke paths, and mobile Chrome/Safari tagged paths all pass.

- [ ] **Step 3: Run repository gates**

```bash
bun run test
bun run check
bun run build
```

Expected: all commands exit `0` with no new console errors, hydration warnings, or animation import failures.

- [ ] **Step 4: Perform browser QA against the authoritative prototype**

At 1440×900 and 390×844, verify in Chrome and WebKit:

1. Fresh `/` load remains on the hero before and after hydration and after six seconds.
2. Header and hero geometry, wrapping, colors, type, spacing, specimen, and CTAs match.
3. Anchor links settle on their requested section and remain there.
4. Header stuck rule, progress fill/nodes, stage crossfades, and Philosophy inversion activate at the same viewport thresholds.
5. Narrow stages show their own matching visual.
6. Lexicon click, focus, arrows, swipe, drag, autoplay, pause, falloff, detail, and progress rule match.
7. Early Access retains final specification copy and functional Server Action behavior while matching the reference layout.
8. Footer retains real legal routes and canonical brand asset while matching reference spacing.
9. Reduced-motion and JavaScript-disabled modes show all essential content without automatic movement.
10. Only one vertical scrollbar exists throughout.

- [ ] **Step 5: Record the corrected landing contract**

Update `docs/context/overview.md` with the authoritative prototype path, the two supported viewport QA sizes, the single-scroll-container rule, the off-screen autoplay prohibition, and the commands used for visual/motion regression verification.

- [ ] **Step 6: Confirm the worktree contains only intended changes**

```bash
git status --short
git diff --check
git diff --stat
```

Expected: no generated Playwright traces, videos, temporary screenshots, or unrelated files are staged.

- [ ] **Step 7: Commit final verification updates**

```bash
git add tests/e2e docs/context/overview.md
git commit -m "test: lock landing prototype parity"
```

---

## Diagnostic Coverage Matrix

| Diagnosed issue | Planned task |
|---|---:|
| Initial hydration jump | 1 |
| Recurring autoplay document jump | 1–2 |
| Nested body/document scrollbars | 1 |
| Off-screen autoplay | 2 |
| Broken end-of-list ping-pong | 2 |
| Native scroll/detail desynchronization | 2 |
| Transient and explicit pause conflation | 2 |
| Accumulated/duplicated CSS rules | 3 |
| Paper, muted, and rule token drift | 3 |
| Header CTA, rule, nav, and spacing drift | 4–5 |
| Hero indent, wrapping, semantics, and metadata drift | 4 |
| Static progress spine | 5 |
| Missing whole-page Philosophy inversion | 5 |
| Missing Philosophy typography, diamonds, and reveal | 5 |
| Narrow scrollytelling visuals grouped at section end | 6 |
| Lexicon axis, opacity, controls, progress, and detail drift | 7 |
| Early Access/footer spacing drift | 7 |
| Hero visible-then-hidden animation flash | 8 |
| Missing viewport/visual/accessibility regression gates | 1–9 |

## Explicitly Preserved Intentional Differences

- The canonical snapshotted Corpus mark remains authoritative over the prototype's inline SVG drawing.
- Final consent and signup copy remain as specified in the approved design specification.
- Privacy and Terms remain real application routes.
- Fonts remain self-hosted through `next/font/google`, not fetched from Google at runtime.
- Signup remains a functional Server Action with CAPTCHA and release-stage handling; it is not replaced by the prototype's local demonstration handler.
