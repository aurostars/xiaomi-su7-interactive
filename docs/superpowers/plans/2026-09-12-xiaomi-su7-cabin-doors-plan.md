# Xiaomi SU7 Four-Door Cabin Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Xiaomi SU7 Three.js 页面中实现四门一键全开/全关、进入座舱自动开门、三个真实车内机位，以及屏幕、内饰和座舱灯光强化。

**Architecture:** 保持现有 store → UI binding → scene/controller 单向数据流。模型加载层负责识别四门、创建真实铰链并分组材质；车辆控制器只负责门和材质动画；相机与座舱灯光使用独立控制器；主入口仅编排状态变化、诊断和资源生命周期。

**Tech Stack:** Vite、TypeScript、Three.js、Vitest、JSDOM、Playwright、GitHub Actions、GitHub Pages。

## Global Constraints

- 交互逻辑以用户提供的 Xiaomi SU7 参考站为基准，但不得保留门体漂移、穿模、屏幕泛白或内饰发灰问题。
- 点击“座舱”或“进入座舱”必须自动全开四门并进入默认主驾机位。
- 座舱内关门不得退出座舱或重置座席；切换座席不得重新开门。
- 返回外观模式必须保留用户最后一次车门状态。
- 只提供四门一键全开/全关，不增加单门、后备箱、前备箱、车窗或座椅操作。
- 不替换现有 GLB，不新增运行时依赖，不改变 GitHub Pages base 路径。
- 所有生产代码严格执行 RED → GREEN → REFACTOR；每个新行为必须先观察到对应测试按预期失败。
- 前端新增模块保持单一职责；单文件尽量低于 300 行。
- 低性能设备可降低像素比、阴影与补光，但不得移除四门状态或三个座舱机位。
- `prefers-reduced-motion` 下门和相机可立即到达目标状态，最终状态必须与正常模式相同。

---

## File Structure

### Create

- `src/scene/cabin-lighting.ts`：创建、切换和销毁座舱顶灯、脚部氛围光与屏幕冷光。
- `tests/cabin-lighting.test.ts`：验证座舱灯光、曝光、低画质降级和销毁。

### Modify

- `src/state/vehicle-state.ts`：定义“进入座舱自动开门、座舱内换座不重开门”的状态契约。
- `src/scene/load-vehicle.ts`：识别 `DOOR1–DOOR4`、建立四个铰链、分组屏幕与内饰材质、报告细粒度能力。
- `src/scene/vehicle-controller.ts`：驱动四门可反向动画、内饰材质和屏幕自发光。
- `src/scene/camera-controller.ts`：校准主驾/副驾/后排机位与 near clipping plane。
- `src/scene/create-scene.ts`：暴露座舱灯光控制接口并纳入资源释放。
- `src/ui/render-shell.ts`：增加座席说明卡结构。
- `src/ui/bind-controls.ts`：同步座舱说明、门按钮能力和无障碍状态。
- `src/main.ts`：编排座舱模式、灯光、相机、四门诊断与生命周期。
- `src/styles.css`：参考站式座舱说明卡、座舱控制状态和移动端布局。
- `tests/vehicle-state.test.ts`：状态契约回归。
- `tests/load-vehicle.test.ts`：四门铰链、能力和材质识别。
- `tests/vehicle-controller.test.ts`：四门角度、动画反向和材质隔离。
- `tests/camera-controller.test.ts`：三个真实车内机位与裁剪面。
- `tests/create-scene-resize.test.ts`：SceneRuntime 座舱灯光委托。
- `tests/ui-controls.test.ts`：座舱说明、能力降级和键盘/ARIA。
- `e2e/site.spec.ts`：四门、座席、说明卡与正式页面回归。

---

### Task 1: Cabin Entry State Contract

**Files:**
- Modify: `src/state/vehicle-state.ts:14-65`
- Test: `tests/vehicle-state.test.ts:34-67`

**Interfaces:**
- Consumes: existing `VehicleState`, `VehicleStore` and immutable `update(fields)`.
- Produces: `setMode('cabin')` opens doors; `setSeatView(view)` opens doors only when it also enters cabin from exterior; manual door state survives seat changes and return to exterior.

- [ ] **Step 1: Write the failing state tests**

```ts
it('opens all doors when cabin mode is entered', () => {
  const store = createVehicleStore();
  store.actions.setMode('cabin');
  expect(store.getState()).toMatchObject({ mode: 'cabin', doorsOpen: true, seatView: 'driver' });
});

it('keeps manually closed doors closed while changing seats in cabin', () => {
  const store = createVehicleStore({ mode: 'cabin', doorsOpen: false });
  store.actions.setSeatView('passenger');
  expect(store.getState()).toMatchObject({ mode: 'cabin', doorsOpen: false, seatView: 'passenger' });
});

it('keeps the last door state when returning to exterior', () => {
  const store = createVehicleStore({ mode: 'cabin', doorsOpen: true });
  store.actions.setMode('exterior');
  expect(store.getState()).toMatchObject({ mode: 'exterior', doorsOpen: true });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `corepack pnpm vitest run tests/vehicle-state.test.ts`

Expected: the first test fails because `setMode('cabin')` currently leaves `doorsOpen` false.

- [ ] **Step 3: Implement the minimal transition rules**

```ts
setMode: (mode) => update(mode === 'cabin'
  ? { mode, doorsOpen: true }
  : { mode }),
setSeatView: (seatView) => update(state.mode === 'cabin'
  ? { seatView }
  : { mode: 'cabin', doorsOpen: true, seatView }),
```

Keep `toggleDoors()` independent so closing doors in cabin changes only `doorsOpen`.

- [ ] **Step 4: Run state tests and verify GREEN**

Run: `corepack pnpm vitest run tests/vehicle-state.test.ts`

Expected: all state tests pass, including immutable snapshot and no-op notification coverage.

- [ ] **Step 5: Commit**

```bash
git add src/state/vehicle-state.ts tests/vehicle-state.test.ts
git commit -m "feat: define cabin entry door behavior"
```

---

### Task 2: Four Door Hinges and Cabin Material Groups

**Files:**
- Modify: `src/scene/load-vehicle.ts:14-177`
- Test: `tests/load-vehicle.test.ts`

**Interfaces:**
- Consumes: GLB node names `DOOR1`, `DOOR2`, `DOOR3`, `DOOR4` and existing material traversal.
- Produces:

```ts
export type DoorId = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';
export type VehicleDoors = Partial<Record<DoorId, Object3D>>;

export interface VehicleCapabilities {
  bodyColor: boolean;
  interiorColor: boolean;
  screenGlow: boolean;
  doors: Record<DoorId, boolean>;
}

export interface LoadedVehicle {
  root: Object3D;
  bodyMaterials: Material[];
  interiorMaterials: Material[];
  screenMaterials: Material[];
  doors: VehicleDoors;
  capabilities: VehicleCapabilities;
  dispose(): void;
}
```

- [ ] **Step 1: Write failing tests for four independent hinges**

Build a fixture with four named door groups and unrelated body/interior groups. Assert:

```ts
const vehicle = createLoadedVehicle(root);
expect(Object.keys(vehicle.doors).sort()).toEqual([
  'frontLeft', 'frontRight', 'rearLeft', 'rearRight',
]);
expect(new Set(Object.values(vehicle.doors)).size).toBe(4);
expect(vehicle.capabilities.doors).toEqual({
  frontLeft: true,
  frontRight: true,
  rearLeft: true,
  rearRight: true,
});
expect(body.parent).toBe(root);
```

Also create a partial fixture containing only `DOOR1` and assert the other three capabilities are false without throwing.

- [ ] **Step 2: Run the loader test and verify RED**

Run: `corepack pnpm vitest run tests/load-vehicle.test.ts`

Expected: TypeScript/test failure because the old loader exposes only `left` and `right`.

- [ ] **Step 3: Implement declarative door definitions and real hinge placement**

```ts
const DOOR_DEFINITIONS = {
  frontLeft:  { names: ['door1'], side: 'left',  hinge: [-1.04, 0, -0.94] },
  rearLeft:   { names: ['door2'], side: 'left',  hinge: [-1.04, 0, 0.78] },
  frontRight: { names: ['door3'], side: 'right', hinge: [1.04, 0, -0.94] },
  rearRight:  { names: ['door4'], side: 'right', hinge: [1.04, 0, 0.78] },
} as const;
```

Create each pivot under the same stable root, use `pivot.attach(door)` to preserve world transform, and return only pivots whose nodes exist. The inspected GLB exposes `DOOR1–DOOR4` and `interior1–interior4`, but no semantic screen material. Add two small procedural display overlays named `cabin-center-display` and `cabin-instrument-display`, using `PlaneGeometry` plus `MeshStandardMaterial`; place them at calibrated dashboard transforms, append their materials to `screenMaterials`, and let `LoadedVehicle.dispose()` release their geometry/material with the existing deduplicated resource traversal. Tests must assert both names exist and both materials are returned.

- [ ] **Step 4: Run loader and lifecycle tests**

Run: `corepack pnpm vitest run tests/load-vehicle.test.ts tests/scene-environment.test.ts`

Expected: four-door, partial capability and idempotent GPU disposal tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scene/load-vehicle.ts tests/load-vehicle.test.ts
git commit -m "feat: map all four vehicle doors"
```

---

### Task 3: Reversible Four-Door Animation and Screen Materials

**Files:**
- Modify: `src/scene/vehicle-controller.ts:10-132`
- Modify: `src/main.ts:50-64`
- Test: `tests/vehicle-controller.test.ts`

**Interfaces:**
- Consumes: `LoadedVehicle.doors`, `screenMaterials`, `VehicleState.doorsOpen`.
- Produces:

```ts
export interface DoorAngles {
  frontLeft: number | null;
  frontRight: number | null;
  rearLeft: number | null;
  rearRight: number | null;
}

export interface VehicleControllerOptions {
  reducedMotion?: boolean;
}

export interface VehicleDiagnostics {
  paint: string | null;
  doorAngles: DoorAngles;
  yaw: number;
  materials: { body: number; interior: number; screens: number };
}
```

- [ ] **Step 1: Write failing controller tests**

Use four door groups and fake timers. Assert final values:

```ts
expect(controller.getDiagnostics().doorAngles).toEqual({
  frontLeft: -1.05,
  frontRight: 1.05,
  rearLeft: -0.92,
  rearRight: 0.92,
});
```

Start opening, advance 120 ms, apply closed state, advance to completion and assert all four angles are `0` without first jumping to their open targets. Add a reduced-motion test that reaches final angles synchronously. Add a material test proving screen emissive changes while an unrelated material remains unchanged.

- [ ] **Step 2: Run controller tests and verify RED**

Run: `corepack pnpm vitest run tests/vehicle-controller.test.ts`

Expected: failure because diagnostics and animation still expose only two doors.

- [ ] **Step 3: Implement per-door motion records**

```ts
const DOOR_OPEN_ANGLES: Record<DoorId, number> = {
  frontLeft: -1.05,
  frontRight: 1.05,
  rearLeft: -0.92,
  rearRight: 0.92,
};

type DoorMotion = { from: number; target: number };
```

On every `applyState`, cancel the pending frame, read each pivot's current `rotation.y` into `from`, set its target from `doorsOpen`, then animate all available pivots with the existing cubic easing. If `reducedMotion` is true, apply all targets immediately and do not schedule a timer.

For screen materials, only mutate materials supporting `emissive` and `emissiveIntensity`:

```ts
material.emissive.set('#72dfff');
material.emissiveIntensity = state.mode === 'cabin' ? 0.7 : 0.18;
material.needsUpdate = true;
```

- [ ] **Step 4: Extend E2E diagnostics in `main.ts`**

Return all four named angles and `{ body, interior, screens }`. Instantiate with:

```ts
vehicleController = createVehicleController(vehicle, {
  reducedMotion: capabilities.reducedMotion,
});
```

- [ ] **Step 5: Run focused and related tests**

Run: `corepack pnpm vitest run tests/vehicle-controller.test.ts tests/capabilities.test.ts`

Expected: all tests pass and no timer remains after `dispose()`.

- [ ] **Step 6: Commit**

```bash
git add src/scene/vehicle-controller.ts src/main.ts tests/vehicle-controller.test.ts
git commit -m "feat: animate four doors and cabin screens"
```

---

### Task 4: True Driver, Passenger, and Rear Camera Presets

**Files:**
- Modify: `src/scene/camera-controller.ts:16-108`
- Test: `tests/camera-controller.test.ts`

**Interfaces:**
- Consumes: existing `CameraView` and `PerspectiveCamera`.
- Produces an added `near` value per preset and camera diagnostics:

```ts
export interface CameraPreset {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  near: number;
  vehicleYaw: number;
}
```

- [ ] **Step 1: Write failing cabin camera tests**

Assert each cabin preset is inside the model cabin bounds, uses `near <= 0.03`, has a distinct position/target, and that applying `driver` then immediate update changes both `camera.near` and the projection matrix. Assert exterior presets retain `near: 0.1`.

- [ ] **Step 2: Run the camera test and verify RED**

Run: `corepack pnpm vitest run tests/camera-controller.test.ts`

Expected: failure because presets do not expose or interpolate/apply `near`.

- [ ] **Step 3: Calibrate and apply cabin presets**

Use the reference-site composition as the target, then tune against the existing GLB:

```ts
driver:    { position: [0.43, 1.34, 0.2], target: [0.2, 1.2, -1.55], fov: 52, near: 0.025, vehicleYaw: 0 },
passenger: { position: [-0.43, 1.34, 0.18], target: [0.18, 1.18, -1.35], fov: 50, near: 0.025, vehicleYaw: 0 },
rear:      { position: [0, 1.38, 1.18], target: [0, 1.16, -0.95], fov: 54, near: 0.025, vehicleYaw: 0 },
```

Treat these as the initial calibrated values; adjust only if screenshot review shows geometry intersection. Store `targetNear`, apply it with the same frame-rate-independent damping, and include `near` in diagnostics.

- [ ] **Step 4: Run camera tests and verify GREEN**

Run: `corepack pnpm vitest run tests/camera-controller.test.ts`

Expected: all camera interpolation, story progress and cabin near-plane tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/scene/camera-controller.ts tests/camera-controller.test.ts
git commit -m "feat: add true in-cabin camera presets"
```

---

### Task 5: Cabin Lighting Controller

**Files:**
- Create: `src/scene/cabin-lighting.ts`
- Create: `tests/cabin-lighting.test.ts`
- Modify: `src/scene/create-scene.ts:21-29,76-169`
- Modify: `tests/create-scene-resize.test.ts`

**Interfaces:**
- Consumes: `Scene`, `WebGLRenderer`, `SceneQuality`.
- Produces:

```ts
export interface CabinLightingController {
  setEnabled(enabled: boolean, immediate?: boolean): void;
  getDiagnostics(): { enabled: boolean; exposure: number; activeLights: number };
  dispose(): void;
}

export function createCabinLighting(
  scene: Scene,
  renderer: WebGLRenderer,
  quality: SceneQuality,
): CabinLightingController;
```

`SceneRuntime` gains `setCabinMode(enabled: boolean, immediate?: boolean): void` and `getCabinLightingDiagnostics()`.

- [ ] **Step 1: Write failing lighting tests**

With a real `Scene` and a renderer-shaped test object, assert cabin mode:

- adds a named warm roof light and cool screen light;
- adds footwell lights only for medium/high quality;
- lowers exterior exposure from `0.9` to a cabin target around `0.72`;
- restores exposure when disabled;
- removes all added lights on dispose;
- performs immediate state changes for reduced motion.

- [ ] **Step 2: Run tests and verify RED**

Run: `corepack pnpm vitest run tests/cabin-lighting.test.ts tests/create-scene-resize.test.ts`

Expected: module-not-found/interface failures because cabin lighting does not exist.

- [ ] **Step 3: Implement the focused controller**

Create a `Group` named `cabin-light-rig` containing:

```ts
const roof = new PointLight(0xffe7cf, 0, 3.2);
roof.name = 'cabin-roof-light';
roof.position.set(0, 1.62, 0.2);

const screen = new PointLight(0x72dfff, 0, 2.1);
screen.name = 'cabin-screen-light';
screen.position.set(0, 1.12, -0.72);
```

For medium/high, add two low-intensity footwell lights. `setEnabled` changes only the rig intensities and renderer exposure; it must not modify global exterior light objects. Keep animation state cancellable and idempotent.

- [ ] **Step 4: Wire it into `createScene`**

Instantiate after the renderer and scene exist, delegate the two runtime methods, and call `dispose()` before `renderer.dispose()`.

- [ ] **Step 5: Run lighting and scene tests**

Run: `corepack pnpm vitest run tests/cabin-lighting.test.ts tests/create-scene-resize.test.ts tests/scene-environment.test.ts`

Expected: all pass, including existing PMREM lifetime assertions.

- [ ] **Step 6: Commit**

```bash
git add src/scene/cabin-lighting.ts src/scene/create-scene.ts tests/cabin-lighting.test.ts tests/create-scene-resize.test.ts
git commit -m "feat: add adaptive cabin lighting"
```

---

### Task 6: Cabin Detail Card and Capability-Aware Controls

**Files:**
- Modify: `src/ui/render-shell.ts:6-15,87-120`
- Modify: `src/ui/bind-controls.ts:28-130`
- Modify: `src/styles.css`
- Test: `tests/ui-controls.test.ts`

**Interfaces:**
- Consumes: `VehicleState.mode`, `VehicleState.seatView`, `VehicleCapabilities.doors`.
- Produces `ShellElements.cabinDetail`, and deterministic seat content:

```ts
const CABIN_DETAILS = {
  driver: {
    title: '主驾沉浸视野',
    detail: '方向盘、前挡视野与中控信息围绕驾驶者展开。',
    tags: ['主驾位置', '方向盘', '前挡视野'],
  },
  passenger: {
    title: '副驾交互空间',
    detail: '从副驾横向观察中控屏、中央通道与驾驶区域。',
    tags: ['副驾位置', '侧窗', '中控屏'],
  },
  rear: {
    title: '后排空间关系',
    detail: '从后排中央观察前排座椅、中控与中央扶手。',
    tags: ['后排中央', '前排座椅', '中央扶手'],
  },
} as const;
```

- [ ] **Step 1: Write failing UI tests**

Assert that entering cabin displays `.cabin-detail`, sets the driver title/tags, and changes the door label to “关门”. Close doors and switch to passenger; assert mode remains cabin, door label stays “开门”, and the card updates. Pass partial door capabilities and assert the button is enabled if at least one door exists, disabled only if all four are false.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `corepack pnpm vitest run tests/ui-controls.test.ts`

Expected: missing `.cabin-detail` and old `leftDoor/rightDoor` capability failures.

- [ ] **Step 3: Add the semantic detail card**

Render inside the vehicle stage:

```html
<aside class="cabin-detail" aria-live="polite" hidden>
  <p>当前座舱</p>
  <h2></h2>
  <p data-cabin-description></p>
  <ul aria-label="当前座舱细节"></ul>
</aside>
```

In `sync()`, show it only when `mode === 'cabin'`, fill it from `CABIN_DETAILS[state.seatView]`, and preserve the existing story hotspot for exterior storytelling.

- [ ] **Step 4: Style against the reference composition**

Use a translucent dark panel anchored bottom-right of the vehicle stage, orange accent in cabin mode, and compact pill tags. On mobile, place it above the horizontal control rail without covering the hero actions or vehicle focal area. Maintain 44 px touch targets.

- [ ] **Step 5: Run UI tests and focused accessibility assertions**

Run: `corepack pnpm vitest run tests/ui-controls.test.ts tests/final-visual-regression.test.ts`

Expected: card content, ARIA, capability fallback and existing geometry contracts pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/render-shell.ts src/ui/bind-controls.ts src/styles.css tests/ui-controls.test.ts tests/final-visual-regression.test.ts
git commit -m "feat: add reference-style cabin controls"
```

---

### Task 7: Orchestrate Cabin Mode, Lighting, Camera, and Diagnostics

**Files:**
- Modify: `src/main.ts:36-179`
- Test: `tests/capabilities.test.ts`
- Test: `e2e/site.spec.ts:3-182`

**Interfaces:**
- Consumes: store subscriptions, `SceneRuntime.setCabinMode`, four-door diagnostics, camera presets, UI.
- Produces read-only diagnostics containing:

```ts
{
  doorAngles: DoorAngles;
  camera: CameraDiagnostics | null;
  cabinLighting: { enabled: boolean; exposure: number; activeLights: number } | null;
  materials: { body: number; interior: number; screens: number };
}
```

- [ ] **Step 1: Add a failing orchestration/E2E contract**

Extend the main interaction test to click the cabin tab from closed exterior state and poll for:

```ts
{
  mode: 'cabin',
  cameraView: 'driver',
  allDoorsOpen: true,
  cabinLighting: true,
}
```

Then click “关门”, assert all angles are approximately zero while camera view remains `driver`. Switch to passenger and rear and assert doors remain closed.

- [ ] **Step 2: Run the focused E2E test and verify RED**

Run: `CI=true GITHUB_PAGES=true corepack pnpm playwright test e2e/site.spec.ts -g "用户操作"`

Expected: fail because diagnostics still expose two doors and cabin mode does not activate lighting.

- [ ] **Step 3: Wire state changes once in the store subscription**

On each meaningful mode change:

```ts
runtime.setCabinMode(state.mode === 'cabin', capabilities.reducedMotion);
if (state.mode === 'cabin') camera.setTarget(state.seatView);
```

Do not call `setCabinMode` or `camera.setTarget` for an unrelated paint change. Keep story camera suspended while cabin mode is active. On activation, immediately apply the current store state, camera target, cabin lighting and one render so model-ready diagnostics never expose a half-initialized cabin.

- [ ] **Step 4: Extend diagnostics without production leakage**

Keep the reader behind `VITE_E2E_DIAGNOSTICS === '1'`; update only its returned shape. Do not expose setters or scene objects.

- [ ] **Step 5: Run focused unit and E2E tests**

Run:

```bash
corepack pnpm vitest run tests/capabilities.test.ts tests/vehicle-state.test.ts
CI=true GITHUB_PAGES=true corepack pnpm playwright test e2e/site.spec.ts -g "用户操作"
```

Expected: cabin entry, four-door close, seat persistence, lighting and diagnostics all pass.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts tests/capabilities.test.ts e2e/site.spec.ts
git commit -m "feat: orchestrate the complete cabin experience"
```

---

### Task 8: Visual Regression, Full Verification, and Delivery Preparation

**Files:**
- Modify: `e2e/site.spec.ts`
- Create: `e2e/site.spec.ts-snapshots/cabin-driver-1440x900.png`
- Create: `e2e/site.spec.ts-snapshots/cabin-passenger-1440x900.png`
- Create: `e2e/site.spec.ts-snapshots/cabin-rear-1440x900.png`
- Modify: `README.md` only if control behavior documentation is currently inaccurate.

**Interfaces:**
- Consumes: completed cabin experience.
- Produces: stable acceptance coverage and deployable production artifact.

- [ ] **Step 1: Add cabin visual and mobile geometry tests**

At `1440x900`, enter cabin and capture each seat after diagnostics report the matching camera view. Before each screenshot assert:

- four door angles are finite;
- the active seat button has `aria-pressed="true"`;
- the cabin detail title and three tags are visible;
- no failed model/image requests or console errors occurred.

At `390x844`, assert the detail card and vehicle control rail do not overlap the two hero CTAs, and every cabin/door button has height at least 44 px.

- [ ] **Step 2: Generate screenshots and inspect them manually**

Run:

```bash
CI=true GITHUB_PAGES=true corepack pnpm playwright test e2e/site.spec.ts -g "座舱视觉" --update-snapshots
```

Inspect all three PNGs. Reject and recalibrate if any camera crosses geometry, a door detaches, the screen is blown out, or the detail card obscures the focal area. Snapshot generation alone is not acceptance.

- [ ] **Step 3: Run full unit suite**

Run: `corepack pnpm test`

Expected: every Vitest file passes with zero failures.

- [ ] **Step 4: Run production build**

Run: `corepack pnpm build`

Expected: exit code 0; only the existing non-blocking chunk-size warning may remain.

- [ ] **Step 5: Run CI-equivalent E2E twice**

Run twice:

```bash
CI=true GITHUB_PAGES=true corepack pnpm e2e
```

Expected both times: all tests pass. Two runs are required because the project previously exposed SwiftShader timing failures in GitHub Actions.

- [ ] **Step 6: Rebuild and prove diagnostics isolation**

Run:

```bash
corepack pnpm build
rg "__SU7_E2E_READ_DIAGNOSTICS__" dist
```

Expected: build succeeds and `rg` exits with no match.

- [ ] **Step 7: Review the complete branch diff**

Run:

```bash
git diff --check origin/main...HEAD
git status --short
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors, only intended source/tests/docs/snapshots, and no `dist`, `dist-e2e`, logs or temporary files.

- [ ] **Step 8: Commit final acceptance assets**

```bash
git add e2e/site.spec.ts e2e/site.spec.ts-snapshots README.md
git commit -m "test: verify four-door cabin experience"
```

If `README.md` was unchanged, omit it from `git add`.

- [ ] **Step 9: Request final code review**

Dispatch a fresh reviewer with base `origin/main` and head `HEAD`. Fix every Critical and Important finding with a new RED/GREEN cycle, rerun the affected tests, and create a dedicated fix commit.

- [ ] **Step 10: Publish only after explicit authorization**

Do not push or merge merely because tests pass. After the user explicitly authorizes publishing, push the working branch or merge through the agreed GitHub workflow, observe GitHub Actions through completion, and verify `https://aurostars.github.io/xiaomi-su7-interactive/` returns HTTP 200 with the updated cabin interaction.
