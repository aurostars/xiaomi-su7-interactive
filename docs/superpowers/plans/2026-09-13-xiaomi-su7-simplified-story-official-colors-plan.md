# Xiaomi SU7 Simplified Story and Official Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the page chrome and hotspot overlays requested by the user, switch to the initial-generation Xiaomi SU7 official 9+4 palette, and keep the sticky vehicle inside a collision-free story region that fully exits before the technology section.

**Architecture:** Centralize paint/interior metadata in one palette module consumed by UI and Three.js material code. Remove hotspot/detail UI while retaining `activeStoryId` as the scroll-to-camera state. Add a pure stage-visibility calculation plus a small DOM controller so the final story section owns the fade-out boundary and the technology section is always vehicle-free.

**Tech Stack:** TypeScript 5.8, Vite 5, Three.js 0.164, Vitest 1.6, Playwright 1.55, vanilla CSS

## Global Constraints

- Do not add npm dependencies or migrate frameworks.
- Remove the top-left `mi / 小米汽车`, top-right `预约试驾`, all four spatial `+ / −` hotspots, the mobile story rail, and the bottom-right story detail card without leaving hidden controls, stale listeners, or dead ARIA state.
- Retain `SU7 / 细节 / 科技 / 影像`, center the remaining navigation, and preserve keyboard focus plus anchor navigation.
- Retain four-door hinges and reversal, three cabin seats, in-cabin door closing, cabin lighting, paint/interior switching, scroll-driven camera chapters, and activity-driven rendering.
- The exact initial-generation exterior names/order are `海湾蓝 / 雅灰 / 橄榄绿 / 珍珠白 / 钻石黑 / 流星蓝 / 霞光紫 / 熔岩橙 / 寒武岩灰`.
- The exact initial-generation interior names/order are `银河灰 / 曜石黑 / 暮光红 / 迷雾紫`.
- Desktop story copy and the projected vehicle must not overlap at 1280×800 or 1440×900.
- The stage begins fading during the final 20% of the last story section and is fully invisible, non-interactive, and behind content before the technology section enters the viewport; upward scrolling restores it.
- `prefers-reduced-motion` jumps directly to the visible/hidden terminal state but still requests a final frame.
- Animation uses activity-driven rendering; after 500ms idle, no new frames are scheduled.
- All behavior changes follow RED→GREEN: run the named test and observe the expected failure before production changes.
- Production `dist` must not contain `__SU7_E2E_READ_DIAGNOSTICS__`.
- Mobile controls keep at least 44px touch targets.
- Visual baselines may be updated only after manual inspection confirms no removed overlays, no story-copy overlap, and no vehicle residue in the technology section.
- Do not push or merge without explicit user authorization.

## File Structure

- Create `src/content/vehicle-palettes.ts`: single source of truth for official labels, state values, UI swatches, and Three.js material colors.
- Create `src/interaction/stage-visibility.ts`: pure geometry-to-visibility calculation and the small scroll/resize DOM controller.
- Modify `src/state/vehicle-state.ts`: initialize and validate official palette values.
- Modify `src/ui/render-shell.ts`: consume palette data and remove brand, CTA, hotspots, mobile rail, and detail card.
- Modify `src/ui/bind-controls.ts`: retain paint/interior/mode/seat/door bindings while removing story-control bindings.
- Modify `src/content/story-chapters.ts`: retain story copy and camera IDs; remove hotspot coordinates.
- Modify `src/scene/load-vehicle.ts`: apply centralized official paint/interior material colors.
- Modify `src/scene/vehicle-controller.ts`: consume official palette values and preserve reversible cabin material treatment.
- Modify `src/main.ts`: keep scroll story state and integrate stage visibility controller.
- Modify `src/styles.css`: centered header, overlay removal cleanup, two-column story safety region, and stage fade/hidden states.
- Create `tests/vehicle-palettes.test.ts`: exact 9+4 labels/order, unique keys, and material-token coverage.
- Create `tests/stage-visibility.test.ts`: pure boundary calculation and controller terminal behavior.
- Modify `tests/ui-controls.test.ts`, `tests/vehicle-state.test.ts`, `tests/load-vehicle.test.ts`, `tests/vehicle-controller.test.ts`, `tests/final-visual-regression.test.ts`, `tests/main-state-orchestration.test.ts`: focused unit/integration regressions.
- Modify `e2e/site.spec.ts` and desktop/mobile snapshots: removed UI, text/vehicle separation, technology exit, upward restore, palettes, and existing vehicle flows.

---

### Task 1: Centralize the Official Initial-Generation 9+4 Palette

**Files:**
- Create: `src/content/vehicle-palettes.ts`
- Modify: `src/state/vehicle-state.ts`
- Modify: `src/ui/render-shell.ts`
- Modify: `src/scene/load-vehicle.ts`
- Modify: `src/scene/vehicle-controller.ts`
- Create: `tests/vehicle-palettes.test.ts`
- Modify: `tests/vehicle-state.test.ts`
- Modify: `tests/load-vehicle.test.ts`
- Modify: `tests/vehicle-controller.test.ts`
- Modify: `tests/ui-controls.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PaintId = typeof PAINT_OPTIONS[number]['id'];
  export type InteriorId = typeof INTERIOR_OPTIONS[number]['id'];

  export interface VehiclePaletteOption<Id extends string> {
    id: Id;
    label: string;
    swatch: string;
    materialColor: number;
  }

  export const PAINT_OPTIONS: readonly VehiclePaletteOption<string>[];
  export const INTERIOR_OPTIONS: readonly VehiclePaletteOption<string>[];
  export function getPaintOption(id: string): VehiclePaletteOption<string>;
  export function getInteriorOption(id: string): VehiclePaletteOption<string>;
  ```
- Consumed by `render-shell.ts`, `vehicle-state.ts`, `load-vehicle.ts`, and `vehicle-controller.ts`.

- [ ] **Step 1: Add failing exact-palette tests**

  Create `tests/vehicle-palettes.test.ts` with assertions equivalent to:

  ```ts
  expect(PAINT_OPTIONS.map(({ label }) => label)).toEqual([
    '海湾蓝', '雅灰', '橄榄绿', '珍珠白', '钻石黑',
    '流星蓝', '霞光紫', '熔岩橙', '寒武岩灰',
  ]);
  expect(INTERIOR_OPTIONS.map(({ label }) => label)).toEqual([
    '银河灰', '曜石黑', '暮光红', '迷雾紫',
  ]);
  expect(new Set(PAINT_OPTIONS.map(({ id }) => id)).size).toBe(9);
  expect(new Set(INTERIOR_OPTIONS.map(({ id }) => id)).size).toBe(4);
  PAINT_OPTIONS.forEach((option) => expect(option.materialColor).toBeTypeOf('number'));
  INTERIOR_OPTIONS.forEach((option) => expect(option.materialColor).toBeTypeOf('number'));
  ```

  Update state/UI/material tests to expect `gulf-blue`, `elegant-gray`, `olive-green`, `pearl-white`, `diamond-black`, `meteor-blue`, `radiant-purple`, `lava-orange`, `basalt-gray`, and interiors `galaxy-gray`, `obsidian-black`, `twilight-red`, `mist-purple`. Assert each UI control uses visible text, `aria-label`, and `aria-pressed`.

- [ ] **Step 2: Run RED**

  Run:
  `corepack pnpm vitest run tests/vehicle-palettes.test.ts tests/vehicle-state.test.ts tests/load-vehicle.test.ts tests/vehicle-controller.test.ts tests/ui-controls.test.ts`

  Expected: FAIL because the palette module and official names/keys do not yet exist.

- [ ] **Step 3: Implement the palette module**

  Define immutable arrays with these calibrated web-material tokens:

  ```ts
  export const PAINT_OPTIONS = [
    { id: 'gulf-blue', label: '海湾蓝', swatch: '#2f6f91', materialColor: 0x2f6f91 },
    { id: 'elegant-gray', label: '雅灰', swatch: '#868987', materialColor: 0x868987 },
    { id: 'olive-green', label: '橄榄绿', swatch: '#59614b', materialColor: 0x59614b },
    { id: 'pearl-white', label: '珍珠白', swatch: '#ecebe6', materialColor: 0xecebe6 },
    { id: 'diamond-black', label: '钻石黑', swatch: '#111315', materialColor: 0x111315 },
    { id: 'meteor-blue', label: '流星蓝', swatch: '#4d6675', materialColor: 0x4d6675 },
    { id: 'radiant-purple', label: '霞光紫', swatch: '#7a667b', materialColor: 0x7a667b },
    { id: 'lava-orange', label: '熔岩橙', swatch: '#c84a20', materialColor: 0xc84a20 },
    { id: 'basalt-gray', label: '寒武岩灰', swatch: '#44494d', materialColor: 0x44494d },
  ] as const;

  export const INTERIOR_OPTIONS = [
    { id: 'galaxy-gray', label: '银河灰', swatch: '#969793', materialColor: 0x969793 },
    { id: 'obsidian-black', label: '曜石黑', swatch: '#11161c', materialColor: 0x11161c },
    { id: 'twilight-red', label: '暮光红', swatch: '#642b34', materialColor: 0x642b34 },
    { id: 'mist-purple', label: '迷雾紫', swatch: '#6b5f70', materialColor: 0x6b5f70 },
  ] as const;
  ```

  Add strict lookup helpers that fall back to `gulf-blue` and `obsidian-black` only for unknown persisted values. Replace duplicated UI and material maps with these options. Preserve metallic body material settings and cabin-only dark-material restoration.

- [ ] **Step 4: Run GREEN**

  Run the Step 2 command. Expected: all named test files pass with exact 9+4 order and material updates.

- [ ] **Step 5: Commit**

  ```bash
  git add src/content/vehicle-palettes.ts src/state/vehicle-state.ts src/ui/render-shell.ts src/scene/load-vehicle.ts src/scene/vehicle-controller.ts tests/vehicle-palettes.test.ts tests/vehicle-state.test.ts tests/load-vehicle.test.ts tests/vehicle-controller.test.ts tests/ui-controls.test.ts
  git commit -m "feat: align SU7 official color palettes" --trailer "Co-Authored-By: Aime <aime@bytedance.com>"
  ```

---

### Task 2: Remove Brand Chrome, Trial CTA, Hotspots, and Story Detail UI

**Files:**
- Modify: `src/ui/render-shell.ts`
- Modify: `src/ui/bind-controls.ts`
- Modify: `src/content/story-chapters.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Modify: `tests/ui-controls.test.ts`
- Modify: `tests/final-visual-regression.test.ts`
- Modify: `tests/main-state-orchestration.test.ts`

**Interfaces:**
- `ShellElements` retains `stage`, `canvas`, mode/color/seat/door controls, `enterCabinButton`, `cabinDetail`, and story sections.
- `ShellElements` removes `hotspotLabel`, `storyHotspots`, `storyDetail`, `mobileStoryRail`, and `mobileStoryButtons`.
- `StoryChapter` retains `id`, `eyebrow`, `title`, `description`, and `bullets`; it removes `hotspot` coordinates.
- `activeStoryId` and `setActiveStory(id)` remain unchanged.

- [ ] **Step 1: Add failing DOM-removal tests**

  In `tests/ui-controls.test.ts`, render the shell and assert:

  ```ts
  expect(document.querySelector('.brand')).toBeNull();
  expect(document.querySelector('.header-cta')).toBeNull();
  expect(document.querySelectorAll('.story-hotspot')).toHaveLength(0);
  expect(document.querySelector('.story-detail')).toBeNull();
  expect(document.querySelector('.mobile-story-rail')).toBeNull();
  expect(document.querySelectorAll('.story-section')).toHaveLength(4);
  expect(document.querySelectorAll('.site-nav a')).toHaveLength(4);
  ```

  Update `tests/main-state-orchestration.test.ts` to prove a scroll-originated `setActiveStory('cabin')` still changes the camera chapter with no hotspot elements.

- [ ] **Step 2: Run RED**

  Run:
  `corepack pnpm vitest run tests/ui-controls.test.ts tests/main-state-orchestration.test.ts tests/final-visual-regression.test.ts`

  Expected: FAIL because removed elements and their styles still exist.

- [ ] **Step 3: Delete UI and stale bindings**

  Remove the brand and trial CTA markup; render only the centered nav. Delete hotspot/detail/mobile-rail render helpers and fields. Remove story-control click listeners, `aria-current` synchronization, detail-card text synchronization, and diagnostics tied only to hotspot DOM. Delete obsolete CSS selectors and mobile overrides. Keep story sections and store-driven camera updates.

- [ ] **Step 4: Run GREEN**

  Run the Step 2 command. Expected: all tests pass and static CSS scans confirm the removed selectors are absent.

- [ ] **Step 5: Commit**

  ```bash
  git add src/ui/render-shell.ts src/ui/bind-controls.ts src/content/story-chapters.ts src/main.ts src/styles.css tests/ui-controls.test.ts tests/final-visual-regression.test.ts tests/main-state-orchestration.test.ts
  git commit -m "refactor: remove SU7 story overlays" --trailer "Co-Authored-By: Aime <aime@bytedance.com>"
  ```

---

### Task 3: Add a Testable Stage Visibility Boundary

**Files:**
- Create: `src/interaction/stage-visibility.ts`
- Create: `tests/stage-visibility.test.ts`

**Interfaces:**
- Produces:

  ```ts
  export interface StageVisibilityInput {
    finalStoryTop: number;
    finalStoryHeight: number;
    technologyTop: number;
    viewportHeight: number;
    reducedMotion: boolean;
  }

  export interface StageVisibilityState {
    phase: 'visible' | 'fading' | 'hidden';
    progress: number; // 0 = visible, 1 = hidden
  }

  export function calculateStageVisibility(input: StageVisibilityInput): StageVisibilityState;

  export interface StageVisibilityController {
    update(): StageVisibilityState;
    dispose(): void;
  }

  export function createStageVisibilityController(options: {
    stage: HTMLElement;
    finalStory: HTMLElement;
    technology: HTMLElement;
    reducedMotion: boolean;
    onChange(state: StageVisibilityState): void;
  }): StageVisibilityController;
  ```

- [ ] **Step 1: Write failing boundary tests**

  Test these exact cases:

  ```ts
  expect(calculateStageVisibility({
    finalStoryTop: 900, finalStoryHeight: 1000, technologyTop: 1900,
    viewportHeight: 900, reducedMotion: false,
  })).toEqual({ phase: 'visible', progress: 0 });

  expect(calculateStageVisibility({
    finalStoryTop: -350, finalStoryHeight: 1000, technologyTop: 650,
    viewportHeight: 900, reducedMotion: false,
  }).phase).toBe('fading');

  expect(calculateStageVisibility({
    finalStoryTop: -800, finalStoryHeight: 1000, technologyTop: 850,
    viewportHeight: 900, reducedMotion: false,
  })).toEqual({ phase: 'hidden', progress: 1 });
  ```

  Also assert reduced motion converts every nonzero fade progress to the hidden terminal state, scrolling upward returns to `{ phase: 'visible', progress: 0 }`, the controller writes `--stage-exit-progress`, `data-stage-visibility`, and `aria-hidden`, and `dispose()` removes scroll/resize responses.

- [ ] **Step 2: Run RED**

  Run: `corepack pnpm vitest run tests/stage-visibility.test.ts`

  Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure calculation and controller**

  Calculate final-story progress at the viewport center:

  ```ts
  const viewportCenter = viewportHeight / 2;
  const storyProgress = clamp((viewportCenter - finalStoryTop) / finalStoryHeight, 0, 1);
  const fadeProgress = clamp((storyProgress - .8) / .2, 0, 1);
  const technologyEntered = technologyTop <= viewportHeight;
  const progress = technologyEntered ? 1 : fadeProgress;
  ```

  For reduced motion, return progress `1` whenever the non-reduced progress is greater than zero; otherwise return `0`. The controller sets CSS state, toggles `aria-hidden`, dispatches `onChange` only when phase/progress changes, and listens to passive scroll plus resize.

- [ ] **Step 4: Run GREEN**

  Run: `corepack pnpm vitest run tests/stage-visibility.test.ts`

  Expected: all boundary and cleanup tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/interaction/stage-visibility.ts tests/stage-visibility.test.ts
  git commit -m "feat: bound the vehicle stage to the story" --trailer "Co-Authored-By: Aime <aime@bytedance.com>"
  ```

---

### Task 4: Integrate Stage Exit and Collision-Free Story Layout

**Files:**
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Modify: `tests/main-render-orchestration.test.ts`
- Modify: `tests/final-visual-regression.test.ts`
- Modify: `e2e/site.spec.ts`

**Interfaces:**
- Consumes `createStageVisibilityController` from Task 3.
- The controller's `onChange` calls `requestRender('stage-visibility')` and wraps nonterminal opacity animation in `beginRenderActivity('stage-visibility')` / `endRenderActivity('stage-visibility')` or an equivalent existing orchestration seam.
- CSS consumes `--stage-exit-progress` and `data-stage-visibility`.

- [ ] **Step 1: Add failing integration and geometry tests**

  Unit coverage must assert:
  - controller creation receives the last `.story-section` and `#technology`;
  - state changes request a render;
  - reduced motion reaches the terminal hidden state and still requests one final frame;
  - disposal occurs during application cleanup.

  Add Playwright assertions at 1280×800 and 1440×900:

  ```ts
  const copy = page.locator('.story-section.is-active .story-copy');
  const vehicle = page.locator('[data-vehicle-focus-zone]');
  expect(rectanglesOverlap(await copy.boundingBox(), await vehicle.boundingBox())).toBe(false);
  ```

  Scroll until `#technology` enters the viewport and assert:

  ```ts
  await expect(page.locator('.vehicle-visual')).toHaveAttribute('data-stage-visibility', 'hidden');
  await expect(page.locator('.vehicle-visual')).toHaveCSS('pointer-events', 'none');
  await expect(page.locator('.vehicle-visual')).toHaveCSS('opacity', '0');
  ```

  Then scroll upward and assert the stage returns to `visible` or `fading` with the correct active story.

- [ ] **Step 2: Run RED**

  Run:
  `corepack pnpm vitest run tests/main-render-orchestration.test.ts tests/final-visual-regression.test.ts`

  Then run:
  `CI=1 corepack pnpm exec playwright test e2e/site.spec.ts --grep "story safety|technology exit" --retries=0`

  Expected: FAIL because main has no stage-visibility controller and the story layout still allows overlap/residue.

- [ ] **Step 3: Integrate lifecycle and CSS layout**

  In `main.ts`, resolve the final story and technology elements once, create the visibility controller after shell/scene setup, and dispose it with the existing cleanup path. Request a final render for every visibility state transition.

  In CSS:
  - center `.site-nav` in the simplified header;
  - define a desktop story grid with a left copy safe region and right vehicle region;
  - constrain `.story-copy` to the left region with a readable max width;
  - keep `.vehicle-focus-zone` inside the right region;
  - use `opacity: calc(1 - var(--stage-exit-progress))` and a small exit transform;
  - set `pointer-events: none` and a lower stacking context in the hidden phase;
  - preserve the current mobile single-column/mutual-exclusion layout.

- [ ] **Step 4: Run GREEN**

  Run both Step 2 commands. Expected: unit tests and targeted E2E pass at both desktop viewports with no overlap and a reversible technology exit.

- [ ] **Step 5: Commit**

  ```bash
  git add src/main.ts src/styles.css tests/main-render-orchestration.test.ts tests/final-visual-regression.test.ts e2e/site.spec.ts
  git commit -m "fix: contain the SU7 story stage" --trailer "Co-Authored-By: Aime <aime@bytedance.com>"
  ```

---

### Task 5: End-to-End Cleanup, Visual Acceptance, and Delivery Verification

**Files:**
- Modify: `e2e/site.spec.ts`
- Modify: `tests/final-visual-regression.test.ts`
- Modify: `e2e/site.spec.ts-snapshots/hero-1280x800.png`
- Modify: `e2e/site.spec.ts-snapshots/hero-1440x900.png`
- Modify: `e2e/site.spec.ts-snapshots/story-aero-1440x900.png`
- Modify only if pixels changed after inspection: `e2e/site.spec.ts-snapshots/cabin-driver-1440x900.png`
- Modify only if pixels changed after inspection: `e2e/site.spec.ts-snapshots/cabin-passenger-1440x900.png`
- Modify only if pixels changed after inspection: `e2e/site.spec.ts-snapshots/cabin-rear-1440x900.png`

**Interfaces:**
- Consumes all completed behavior from Tasks 1–4.
- Does not add production APIs.

- [ ] **Step 1: Add the final failing acceptance scenarios**

  Cover:
  1. Header contains exactly four centered nav links and no `.brand` or `.header-cta`.
  2. Page contains no `.story-hotspot`, `.story-detail`, or `.mobile-story-rail` at desktop and mobile sizes.
  3. Paint/interior controls expose the exact official 9+4 names and each selection changes diagnostics/material state.
  4. Every story copy rectangle is disjoint from the vehicle focus zone at 1280×800 and 1440×900.
  5. The stage fades during the final story tail, is fully hidden before technology content, and restores on upward scroll.
  6. Existing four-door reversal, driver/passenger/rear, in-cabin close, reduced-motion terminal frame, and 500ms idle-render checks still pass.

- [ ] **Step 2: Run targeted RED**

  Run:
  `CI=1 corepack pnpm exec playwright test e2e/site.spec.ts --grep "simplified chrome|official palettes|story safety|technology exit" --retries=0`

  Expected: FAIL until every final acceptance assertion and baseline is aligned.

- [ ] **Step 3: Generate visual candidates and inspect manually**

  Run:
  `CI=1 corepack pnpm exec playwright test e2e/site.spec.ts --grep "visual" --update-snapshots --retries=0`

  Open every changed PNG and confirm:
  - no brand, trial CTA, hotspot, rail, or detail card remains;
  - hero/story vehicle wheels and roof are complete;
  - story copy is fully readable and disjoint from the vehicle;
  - the technology screenshot contains no vehicle residue;
  - cabin screenshots preserve readable interior detail without bloom or black crush.

  Revert any snapshot that changed without an intentional visual change.

- [ ] **Step 4: Run complete fresh verification in this order**

  ```bash
  corepack pnpm test
  corepack pnpm exec tsc --noEmit
  corepack pnpm build
  CI=1 corepack pnpm exec playwright test --retries=0
  CI=1 corepack pnpm exec playwright test --retries=0
  ! grep -R "__SU7_E2E_READ_DIAGNOSTICS__" dist
  git diff --check
  git status --short
  ```

  Required evidence:
  - all Vitest tests pass;
  - TypeScript and build exit 0;
  - both E2E runs pass without retries;
  - production diagnostics scan has no matches;
  - only intended source, test, and accepted snapshot files are modified before commit.

- [ ] **Step 5: Commit**

  ```bash
  git add e2e/site.spec.ts tests/final-visual-regression.test.ts e2e/site.spec.ts-snapshots
  git commit -m "test: verify simplified SU7 story experience" --trailer "Co-Authored-By: Aime <aime@bytedance.com>"
  ```

- [ ] **Step 6: Prepare branch for review**

  Run `git status --short` and require no output. Record final test counts, E2E counts, changed snapshots, build warnings, and the branch HEAD for the task report. Do not push or merge until the user chooses a finishing option.
