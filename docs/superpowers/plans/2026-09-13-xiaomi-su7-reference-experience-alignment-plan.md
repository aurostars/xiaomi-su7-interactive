# Xiaomi SU7 Reference Experience Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对齐参考站的四热点故事、空间构图和控制面板，同时改善座舱暗部，并把生产场景改为活动驱动渲染。

**Architecture:** 保留现有 VehicleStore、Three.js 场景和控制器边界，新增纯函数式渲染调度器与统一 story 配置。所有可见状态变化调用 `requestRender()`，动画控制器通过失效回调请求下一帧；四热点、滚动章节、相机和详情卡只消费一个 `activeStoryId`。

**Tech Stack:** TypeScript 5.8、Vite 5、Three.js 0.164、Vitest 1.6、Playwright 1.55、vanilla CSS

## Global Constraints

- 不新增 npm 依赖，不迁移框架。
- 保留四门准确门轴、反向动画、三座席、座舱内关门和移动端互斥布局。
- 所有行为变更必须执行测试先失败、实现后通过的 RED→GREEN 流程。
- 正常动画期间保持连续视觉更新，静止 500ms 后停止新增渲染帧。
- `prefers-reduced-motion` 立即到达终态，但必须生成最终渲染帧。
- 生产 `dist` 不得包含 `__SU7_E2E_READ_DIAGNOSTICS__`。
- 移动端触控目标保持至少 44px。
- 视觉基准只能在人工确认构图、灯光和遮挡均正确后更新。

---

## File Structure

**Create**

- `src/scene/render-scheduler.ts`：合并单帧请求、管理活动 reason、停止空闲 RAF。
- `src/content/story-chapters.ts`：四章节唯一数据源和 `StoryId` 类型。
- `tests/render-scheduler.test.ts`：调度器时序、引用计数和 dispose 测试。
- `tests/story-chapters.test.ts`：章节顺序、唯一 ID 和完整内容测试。

**Modify**

- `src/scene/create-scene.ts`：接入调度器、地面展示组和资源释放。
- `src/scene/camera-controller.ts`：首页低机位构图、settled 状态与帧请求语义。
- `src/scene/vehicle-controller.ts`：门动画每步通知场景失效。
- `src/scene/cabin-lighting.ts`：座席补光与每步失效通知。
- `src/state/vehicle-state.ts`：将故事当前项统一为 `activeStoryId`。
- `src/interaction/scroll-story.ts`：滚动只写统一故事状态。
- `src/ui/render-shell.ts`：四热点、常驻详情卡、移动章节轨道和内联图标。
- `src/ui/bind-controls.ts`：热点/滚动/卡片双向同步及桌面双配色面板。
- `src/main.ts`：编排渲染失效、diagnostics 和 context restore。
- `src/styles.css`：热点、详情卡、控制面板、地面层和移动端样式。
- `tests/create-scene-resize.test.ts`：按需渲染生命周期和展示地面释放。
- `tests/camera-controller.test.ts`：新首页预设与 settled 行为。
- `tests/cabin-lighting.test.ts`：三座席暗部补光和质量分级。
- `tests/vehicle-controller.test.ts`：门动画失效通知。
- `tests/vehicle-state.test.ts`：统一故事状态。
- `tests/scroll-story.test.ts`：滚动章节写入。
- `tests/ui-controls.test.ts`：四热点、常驻卡片、图标、色板和移动轨道。
- `tests/final-visual-regression.test.ts`：新增故事态视觉契约。
- `e2e/site.spec.ts`：故事双向同步、idle render、移动端几何与视觉基准。
- `e2e/site.spec.ts-snapshots/*.png`：经人工确认后的首页、故事态和座舱基准。

---

### Task 1: Activity-Driven Render Scheduler

**Files:**
- Create: `src/scene/render-scheduler.ts`
- Create: `tests/render-scheduler.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type RenderReason = 'camera' | 'doors' | 'lighting' | 'drag' | 'story';

  export interface RenderScheduler {
    requestFrame(): void;
    begin(reason: RenderReason): void;
    end(reason: RenderReason): void;
    isActive(): boolean;
    getActiveReasons(): readonly RenderReason[];
    dispose(): void;
  }

  export function createRenderScheduler(options: {
    requestAnimationFrame: (callback: FrameRequestCallback) => number;
    cancelAnimationFrame: (handle: number) => void;
    renderFrame: (time: number) => void;
  }): RenderScheduler;
  ```

- [ ] **Step 1: Write scheduler tests before production code**

  Cover four behaviors with fake RAF:

  ```ts
  it('coalesces repeated single-frame requests', () => {
    const scheduler = createHarness();
    scheduler.runtime.requestFrame();
    scheduler.runtime.requestFrame();
    expect(scheduler.pendingCount()).toBe(1);
  });

  it('continues while a reason is active and stops after end', () => {
    const scheduler = createHarness();
    scheduler.runtime.begin('camera');
    scheduler.flush(0);
    expect(scheduler.pendingCount()).toBe(1);
    scheduler.runtime.end('camera');
    scheduler.flush(16);
    expect(scheduler.pendingCount()).toBe(0);
  });

  it('does not stop until every active reason ends', () => {
    const scheduler = createHarness();
    scheduler.runtime.begin('camera');
    scheduler.runtime.begin('doors');
    scheduler.runtime.end('camera');
    expect(scheduler.runtime.isActive()).toBe(true);
  });

  it('cancels pending work and ignores new requests after dispose', () => {
    const scheduler = createHarness();
    scheduler.runtime.requestFrame();
    scheduler.runtime.dispose();
    expect(scheduler.cancelledCount()).toBe(1);
  });
  ```

- [ ] **Step 2: Run RED**

  Run: `corepack pnpm vitest run tests/render-scheduler.test.ts`

  Expected: FAIL because `src/scene/render-scheduler.ts` does not exist.

- [ ] **Step 3: Implement the scheduler**

  Use a `Set<RenderReason>`, one nullable RAF handle and a disposed flag. `requestFrame()` must coalesce calls. After `renderFrame(time)`, schedule another frame only when `reasons.size > 0`.

- [ ] **Step 4: Run GREEN**

  Run: `corepack pnpm vitest run tests/render-scheduler.test.ts`

  Expected: 4 tests pass with no pending timer warning.

- [ ] **Step 5: Commit**

  ```bash
  git add src/scene/render-scheduler.ts tests/render-scheduler.test.ts
  git commit -m "feat: add activity-driven render scheduler"
  ```

---

### Task 2: Integrate On-Demand Rendering Across the Scene

**Files:**
- Modify: `src/scene/create-scene.ts`
- Modify: `src/scene/camera-controller.ts`
- Modify: `src/scene/vehicle-controller.ts`
- Modify: `src/scene/cabin-lighting.ts`
- Modify: `src/main.ts`
- Modify: `tests/create-scene-resize.test.ts`
- Modify: `tests/camera-controller.test.ts`
- Modify: `tests/vehicle-controller.test.ts`
- Modify: `tests/cabin-lighting.test.ts`

**Interfaces:**
- Consumes: `createRenderScheduler()` from Task 1.
- Produces additions to `SceneRuntime`:
  ```ts
  requestRender(): void;
  beginRenderActivity(reason: RenderReason): void;
  endRenderActivity(reason: RenderReason): void;
  isRenderActive(): boolean;
  getActiveRenderReasons(): readonly RenderReason[];
  ```
- Produces controller hooks:
  ```ts
  type Invalidate = () => void;
  createVehicleController(vehicle, reducedMotion, invalidate?: Invalidate)
  createCabinLighting(scene, renderer, quality, reducedMotion, invalidate?: Invalidate)
  CameraController.isSettled(): boolean
  ```

- [ ] **Step 1: Add failing scene lifecycle tests**

  Replace the old periodic-render assertion with:

  ```ts
  it('renders once when invalidated and remains idle afterward', () => {
    runtime.requestRender();
    flushAnimationFrame(0);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(pendingAnimationFrames()).toBe(0);
  });

  it('keeps rendering only while an activity reason is retained', () => {
    runtime.beginRenderActivity('camera');
    flushAnimationFrame(0);
    flushAnimationFrame(16);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    runtime.endRenderActivity('camera');
    flushAnimationFrame(32);
    expect(pendingAnimationFrames()).toBe(0);
  });
  ```

  Add controller tests proving each non-reduced animation invokes `invalidate`, and reduced-motion invokes it exactly once for the terminal state.

- [ ] **Step 2: Run RED**

  Run:
  `corepack pnpm vitest run tests/create-scene-resize.test.ts tests/camera-controller.test.ts tests/vehicle-controller.test.ts tests/cabin-lighting.test.ts`

  Expected: FAIL because runtime APIs and invalidate hooks are absent.

- [ ] **Step 3: Wire scheduler into `createScene`**

  Remove the permanent RAF interval. Preserve exact frame order:

  ```ts
  scheduler = createRenderScheduler({
    requestAnimationFrame,
    cancelAnimationFrame,
    renderFrame: (time) => {
      beforeRender?.(time);
      renderer.render(scene, camera);
      onRendered?.();
    },
  });
  ```

  Resize, context restore and manual `render()` call `requestRender()`.

- [ ] **Step 4: Add invalidation to controllers and main orchestration**

  - Vehicle door timer calls `invalidate()` after changing angles.
  - Cabin lighting RAF calls `invalidate()` after intensity or exposure changes.
  - Camera activity begins before target transitions and ends when `isSettled()` is true.
  - Drag and story progress request frames through SceneRuntime.
  - Visibility restoration requests one frame.

- [ ] **Step 5: Run GREEN and regression suite**

  Run:
  `corepack pnpm vitest run tests/create-scene-resize.test.ts tests/camera-controller.test.ts tests/vehicle-controller.test.ts tests/cabin-lighting.test.ts`

  Then: `corepack pnpm test`

- [ ] **Step 6: Commit**

  ```bash
  git add src/scene/create-scene.ts src/scene/camera-controller.ts src/scene/vehicle-controller.ts src/scene/cabin-lighting.ts src/main.ts tests/create-scene-resize.test.ts tests/camera-controller.test.ts tests/vehicle-controller.test.ts tests/cabin-lighting.test.ts
  git commit -m "perf: render the vehicle scene only while active"
  ```

---

### Task 3: Unified Four-Chapter Story State

**Files:**
- Create: `src/content/story-chapters.ts`
- Create: `tests/story-chapters.test.ts`
- Modify: `src/state/vehicle-state.ts`
- Modify: `src/interaction/scroll-story.ts`
- Modify: `tests/vehicle-state.test.ts`
- Modify: `tests/scroll-story.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type StoryId = 'aero' | 'performance' | 'cabin' | 'intelligence';

  export interface StoryChapter {
    id: StoryId;
    eyebrow: string;
    title: string;
    description: string;
    tags: readonly string[];
    hotspot: { x: number; y: number; label: string };
  }

  export const STORY_CHAPTERS: readonly StoryChapter[];
  ```
- `VehicleState.activeStoryId: StoryId` replaces `hotspot`.
- `VehicleStore.actions.setActiveStory(id: StoryId): void` replaces `setHotspot`.

- [ ] **Step 1: Write failing content and state tests**

  Verify exactly four unique ordered IDs, non-empty tags, default `activeStoryId === 'aero'`, and that unrelated store actions preserve it.

- [ ] **Step 2: Run RED**

  Run:
  `corepack pnpm vitest run tests/story-chapters.test.ts tests/vehicle-state.test.ts tests/scroll-story.test.ts`

  Expected: FAIL because the content module and state field do not exist.

- [ ] **Step 3: Extract chapter content and migrate state**

  Move chapter copy out of `render-shell.ts`. Update ScrollStory callbacks to emit `StoryId`; remove all `hotspot`/`setHotspot` state references.

- [ ] **Step 4: Run GREEN and search for stale API**

  Run the focused tests, then:
  `rg -n "setHotspot|state\.hotspot|hotspot:" src tests e2e`

  Expected: no stale store API; occurrences referring to visual hotspot coordinates are allowed only in `story-chapters.ts`.

- [ ] **Step 5: Commit**

  ```bash
  git add src/content/story-chapters.ts src/state/vehicle-state.ts src/interaction/scroll-story.ts tests/story-chapters.test.ts tests/vehicle-state.test.ts tests/scroll-story.test.ts
  git commit -m "refactor: unify the active story chapter state"
  ```

---

### Task 4: Persistent Hotspots and Story Detail Card

**Files:**
- Modify: `src/ui/render-shell.ts`
- Modify: `src/ui/bind-controls.ts`
- Modify: `src/styles.css`
- Modify: `tests/ui-controls.test.ts`

**Interfaces:**
- Consumes: `STORY_CHAPTERS`, `StoryId`, `setActiveStory()` from Task 3.
- Produces `ShellElements` additions:
  ```ts
  storyHotspots: HTMLElement[];
  storyDetail: HTMLElement;
  mobileStoryRail: HTMLElement;
  mobileStoryButtons: HTMLButtonElement[];
  ```

- [ ] **Step 1: Write failing DOM and interaction tests**

  Assert:

  ```ts
  expect(shell.storyHotspots).toHaveLength(4);
  expect(shell.storyDetail.hidden).toBe(false);
  expect(shell.storyDetail.textContent).toContain('低趴轿跑姿态');
  expect(shell.storyHotspots[0].getAttribute('aria-current')).toBe('true');
  ```

  Click the performance hotspot and assert one `setActiveStory('performance')` call. Publish a store update and assert the second hotspot and matching mobile button become current while the detail card remains visible.

- [ ] **Step 2: Run RED**

  Run: `corepack pnpm vitest run tests/ui-controls.test.ts`

  Expected: FAIL because only one hotspot exists and the card starts hidden.

- [ ] **Step 3: Render four hotspots and persistent card**

  Use `STORY_CHAPTERS.map()` to generate four buttons. Do not inject chapter copy from two separate constants. Each button receives `data-story-id`, `aria-label` and `aria-current`.

- [ ] **Step 4: Bind click and store synchronization**

  Clicking a desktop hotspot or mobile rail button calls `setActiveStory(id)` and `document.querySelector([data-story-section=id])?.scrollIntoView({ behavior })`. Store updates refresh all current states and card content; no code may set `storyDetail.hidden = true`.

- [ ] **Step 5: Add responsive styles**

  Desktop: all four spatial hotspots visible; current/focus expands label. Mobile: hide free-positioned non-current hotspots and show four-button horizontal rail.

- [ ] **Step 6: Run GREEN**

  Run: `corepack pnpm vitest run tests/ui-controls.test.ts tests/scroll-story.test.ts`

- [ ] **Step 7: Commit**

  ```bash
  git add src/ui/render-shell.ts src/ui/bind-controls.ts src/styles.css tests/ui-controls.test.ts
  git commit -m "feat: align the persistent four-hotspot story"
  ```

---

### Task 5: Cabin Dark-Detail Lighting

**Files:**
- Modify: `src/scene/cabin-lighting.ts`
- Modify: `tests/cabin-lighting.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes existing `SeatView` and `QualityTier`.
- Produces:
  ```ts
  CabinLightingController.apply(options: {
    enabled: boolean;
    seatView: SeatView;
  }): void;
  ```
  Existing callers must pass the current seat view so one light rig can alter weights without allocating new lights.

- [ ] **Step 1: Add failing seat-aware lighting tests**

  Assert that cabin mode contains a cool, broad fill; driver/passenger presets keep roof and screen lights; rear preset increases rear-fill weight; low quality has no footwell lights; exterior terminal intensity is zero.

  Test directions rather than a single fragile value:

  ```ts
  expect(rearFill.intensity).toBeGreaterThan(driverRearFill.intensity);
  expect(screenLight.color.b).toBeGreaterThan(screenLight.color.r);
  expect(renderer.toneMappingExposure).toBeLessThanOrEqual(1);
  ```

- [ ] **Step 2: Run RED**

  Run: `corepack pnpm vitest run tests/cabin-lighting.test.ts`

  Expected: FAIL because `apply` does not accept `seatView` and no rear fill exists.

- [ ] **Step 3: Implement one seat-aware rig**

  Add a broad cool fill and one rear-focused fill. Reweight existing lights by seat view; do not create/destroy lights during seat changes. Preserve the 240ms transition and invalidation hook from Task 2.

- [ ] **Step 4: Wire main state**

  Pass both `state.mode === 'cabin'` and `state.seatView`. Seat-only changes must adjust lighting without reopening doors.

- [ ] **Step 5: Run GREEN**

  Run: `corepack pnpm vitest run tests/cabin-lighting.test.ts tests/vehicle-controller.test.ts`

- [ ] **Step 6: Commit**

  ```bash
  git add src/scene/cabin-lighting.ts src/main.ts tests/cabin-lighting.test.ts
  git commit -m "feat: reveal cabin dark-detail by seat"
  ```

---

### Task 6: Lower Hero Camera and Spatial Display Ground

**Files:**
- Modify: `src/scene/camera-controller.ts`
- Modify: `src/scene/create-scene.ts`
- Modify: `tests/camera-controller.test.ts`
- Modify: `tests/create-scene-resize.test.ts`

**Interfaces:**
- Produces a named `display-ground` group containing `display-grid`, `display-accent-cyan`, `display-accent-orange` and the existing contact shadow.
- No public API change beyond SceneRuntime resource ownership.

- [ ] **Step 1: Write failing camera and scene tests**

  Camera test must constrain the new `aero` preset instead of locking arbitrary exact values:

  ```ts
  expect(aero.position[1]).toBeLessThan(2.8);
  expect(aero.fov).toBeGreaterThanOrEqual(30);
  expect(aero.fov).toBeLessThanOrEqual(35);
  ```

  Scene test asserts named ground children exist, low quality omits accent meshes, and repeated `dispose()` releases their geometry/material exactly once.

- [ ] **Step 2: Run RED**

  Run:
  `corepack pnpm vitest run tests/camera-controller.test.ts tests/create-scene-resize.test.ts`

- [ ] **Step 3: Tune aero preset**

  Lower camera Y and shorten camera-to-target distance enough to produce a 10%–15% larger vehicle while preserving the full body at 1440×900. Keep story and cabin presets unchanged in this step.

- [ ] **Step 4: Build the ground group**

  Use Three.js primitives only:

  - `GridHelper` or a line-segment grid with low opacity;
  - two transparent `MeshBasicMaterial` accent meshes below the tires;
  - existing `ShadowMaterial` contact plane;
  - `depthWrite: false` for decorative accents;
  - render order below vehicle and door meshes.

- [ ] **Step 5: Run GREEN**

  Run the focused tests and `corepack pnpm test`.

- [ ] **Step 6: Commit**

  ```bash
  git add src/scene/camera-controller.ts src/scene/create-scene.ts tests/camera-controller.test.ts tests/create-scene-resize.test.ts
  git commit -m "feat: strengthen the SU7 stage composition"
  ```

---

### Task 7: Reference-Aligned Control Panel

**Files:**
- Modify: `src/ui/render-shell.ts`
- Modify: `src/ui/bind-controls.ts`
- Modify: `src/styles.css`
- Modify: `tests/ui-controls.test.ts`

**Interfaces:**
- Consumes existing store paint/interior/mode/door/seat actions.
- Adds no dependency; icons are inline SVG with `aria-hidden="true"`.

- [ ] **Step 1: Add failing control-layout tests**

  Assert both paint and interior fieldsets are present and not hidden in a desktop DOM state, mode/door controls each contain SVG, active controls expose `aria-pressed`, and disabled seat controls remain focus-safe.

  Add a narrow-viewport class/dataset test proving secondary controls collapse without removing the 44px primary targets.

- [ ] **Step 2: Run RED**

  Run: `corepack pnpm vitest run tests/ui-controls.test.ts`

- [ ] **Step 3: Add inline icons and desktop dual palettes**

  Define small local SVG helpers in `render-shell.ts`; do not import an icon package. Keep color swatch accessible names and visible labels. On desktop both palettes remain visible; mode only changes seat-control emphasis.

- [ ] **Step 4: Refine styles**

  Use a lighter translucent surface, 1px inner border, consistent cool-gray shadows, 200–240ms hover/pressed transitions, and `focus-visible`. Mobile rules retain current cabin/hero mutual exclusion and collapse secondary palettes by mode.

- [ ] **Step 5: Run GREEN**

  Run: `corepack pnpm vitest run tests/ui-controls.test.ts tests/final-visual-regression.test.ts`

- [ ] **Step 6: Commit**

  ```bash
  git add src/ui/render-shell.ts src/ui/bind-controls.ts src/styles.css tests/ui-controls.test.ts tests/final-visual-regression.test.ts
  git commit -m "feat: align the vehicle control panel"
  ```

---

### Task 8: Diagnostics, E2E, Visual Acceptance, and Delivery

**Files:**
- Modify: `src/main.ts`
- Modify: `e2e/site.spec.ts`
- Modify: `tests/final-visual-regression.test.ts`
- Modify: `e2e/site.spec.ts-snapshots/hero-1440x900.png`
- Create or modify: `e2e/site.spec.ts-snapshots/story-aero-1440x900.png`
- Modify only after inspection: `e2e/site.spec.ts-snapshots/cabin-driver-1440x900.png`
- Modify only after inspection: `e2e/site.spec.ts-snapshots/cabin-passenger-1440x900.png`
- Modify only after inspection: `e2e/site.spec.ts-snapshots/cabin-rear-1440x900.png`

**Interfaces:**
- Add diagnostics fields inside E2E-only exposure:
  ```ts
  activeStoryId: StoryId;
  renderActive: boolean;
  pendingRenderReasons: RenderReason[];
  renderRevision: number;
  ```

- [ ] **Step 1: Add failing E2E behavior tests before snapshot updates**

  Cover:

  1. Four desktop hotspots are visible and exactly one has `aria-current="true"`.
  2. Scrolling to each story section updates hotspot, persistent detail card and rendered camera.
  3. Clicking a non-current hotspot scrolls to its section and keeps the card visible.
  4. After the scene settles, two diagnostics reads separated by condition polling show unchanged `renderRevision`; a paint or seat interaction increases it.
  5. Mobile story rail, vehicle focus zone, cabin card and primary controls do not overlap.
  6. Existing non-reduced four-door reversal and three cabin seat flows still pass.

  Do not use `waitForTimeout`. Poll `renderRevision`, `activeStoryId`, `renderedView` and `renderedCamera`.

- [ ] **Step 2: Run RED against the targeted scenarios**

  Run:
  `CI=1 corepack pnpm e2e --grep "persistent story|idle render|mobile story rail"`

  Expected: FAIL because diagnostics and final integration are incomplete.

- [ ] **Step 3: Complete diagnostics and orchestration**

  Expose only JSON-safe fields under `import.meta.env.VITE_E2E_DIAGNOSTICS`. Ensure store updates call `requestRender()` but unrelated state does not reopen doors or restart settled animations.

- [ ] **Step 4: Run behavior GREEN twice**

  Run targeted E2E twice. Both runs must pass without retries or fixed waits.

- [ ] **Step 5: Generate visual candidates**

  Run:
  `CI=1 corepack pnpm e2e --grep "visual" --update-snapshots`

  Inspect every changed image. Reject and tune if any of these appear:

  - cropped wheels or roof;
  - hotspots over hero copy or controls;
  - ground accents crossing doors/tires;
  - cabin black crush, pure-white roof, or screen bloom;
  - mobile control/card/focus overlap.

- [ ] **Step 6: Run visual baselines without update**

  Run:
  `CI=1 corepack pnpm e2e --grep "visual"`

  Expected: all visual checks pass without changing files.

- [ ] **Step 7: Full verification**

  Run in order:

  ```bash
  corepack pnpm test
  corepack pnpm exec tsc --noEmit
  corepack pnpm build
  CI=1 corepack pnpm e2e
  CI=1 corepack pnpm e2e
  rg -n "__SU7_E2E_READ_DIAGNOSTICS__|VITE_E2E_DIAGNOSTICS" dist && exit 1 || true
  git diff --check
  git status --short
  ```

  Required evidence:

  - all unit tests pass;
  - TypeScript and production build exit 0;
  - both full E2E runs pass;
  - production diagnostics scan returns no matches;
  - only intended source, test, docs and accepted snapshot files are tracked.

- [ ] **Step 8: Commit**

  ```bash
  git add src/main.ts e2e/site.spec.ts tests/final-visual-regression.test.ts e2e/site.spec.ts-snapshots
  git commit -m "test: verify reference-aligned SU7 experience"
  ```

- [ ] **Step 9: Final branch review**

  Request a whole-branch review against:

  - `docs/superpowers/specs/2026-09-13-xiaomi-su7-reference-experience-alignment-design.md`
  - this implementation plan
  - base `origin/main`
  - feature branch HEAD

  Fix all Critical and Important findings before presenting integration options. Do not push or merge until explicitly authorized.
