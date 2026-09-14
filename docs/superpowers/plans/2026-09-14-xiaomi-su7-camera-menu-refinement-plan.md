# Xiaomi SU7 Camera and Floating Controls Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除影像与传感器章节，建立车外/座舱双模式 360° 拖拽相机，并以紧凑悬浮菜单、清晰提示和更鲜亮的官方车漆完成体验升级。

**Architecture:** 保留现有 Vite + TypeScript + Three.js 架构，以 `camera-controller` 作为相机姿态唯一写入者，新建纯数学 `view-drag-controller` 管理手动 yaw/pitch；`main-render-orchestration` 只协调 store、相机和渲染活动。页面结构和样式继续由 `render-shell.ts` 与 `styles.css` 管理，不引入框架或第三方相机库。

**Tech Stack:** TypeScript、Vite、Three.js、Vitest、Playwright、CSS

## Global Constraints

- 删除整个“智能驾驶 / 传感器”滚动章节和“影像”导航、Section、资源引用。
- 滚动进入 `cabin` 时自动切换 `mode='cabin'` 与 `seatView='rear'`。
- 车外相机围绕车辆中心水平 360°；座舱相机固定在当前座位原点水平 360° 环视。
- 用户松手后保持手动朝向；章节、模式或座位变化时清除手动偏移，由自动预设重新接管。
- 点击主驾、副驾或后排时，先恢复对应座位默认视角。
- 不开放滚轮/双指缩放，不增加惯性、回弹、陀螺仪或自由飞行。
- 不引入新依赖、第三方 OrbitControls 或 UI 框架。
- 保留初代 SU7 官方九种外观、四种内饰的名称、顺序和身份。
- 色名不常驻占位；必须通过 Tooltip、`aria-label`、键盘焦点提供完整名称。
- 桌面最小点击目标 44×44px；关键验收尺寸为 `390×844`、`768×600`、`900×700`、`1280×800`、`1440×900`。
- 保持现有四门反转、座舱灯光、stage exit、reduced motion 与约 500ms 空闲停止渲染行为。
- 所有行为变更遵循测试先行：先观察目标测试因缺少功能正确失败，再写最小实现。

---

## File Structure

### Create

- `src/interaction/view-drag-controller.ts`：指针生命周期、手动 yaw/pitch、模式约束和相机偏移纯计算。
- `tests/view-drag-controller.test.ts`：拖拽数学、360° 连续性、pitch 限制、重置和清理测试。

### Modify

- `src/content/story-chapters.ts`：移除 `intelligence` 章节。
- `src/content/vehicle-palettes.ts`：为每种外观增加可直接应用的材质参数。
- `src/scene/camera-controller.ts`：移除 sensing、修正副驾 preset、应用手动视角偏移。
- `src/state/vehicle-state.ts`：保证 cabin story 的默认后排语义与座位显式切换。
- `src/interaction/drag-controller.ts`：删除旧的“旋转车辆模型”实现或降为兼容导出后移除引用。
- `src/main-render-orchestration.ts`：将拖拽从 `rotateVehicle` 协调改为相机手动偏移协调。
- `src/main.ts`：创建/销毁新拖拽控制器，接入渲染活动和 camera controller。
- `src/scene/vehicle-controller.ts`：将每色材质参数应用到车身 `MeshPhysicalMaterial`。
- `src/ui/render-shell.ts`：删除影像，重构菜单 DOM，增加 Tooltip 与提示。
- `src/styles.css`：悬浮菜单、提示、响应式和拖拽光标。
- `tests/story-chapters.test.ts`：三章故事契约。
- `tests/camera-controller.test.ts`：副驾 preset、手动偏移和重置契约。
- `tests/vehicle-state.test.ts`：进入 cabin 默认后排。
- `tests/main-state-orchestration.test.ts`：章节、座位与相机状态转移。
- `tests/main-render-orchestration.test.ts`：拖拽控制器的创建、回调与销毁接线。
- `tests/ui-controls.test.ts`：紧凑色点、ARIA、Tooltip、提示和无影像结构。
- `tests/vehicle-palettes.test.ts`：材质参数合法性与九色身份。
- `e2e/site.spec.ts`：真实滚动、拖拽、座位、菜单、响应式和快照回归。

---

### Task 1: Remove Film and Sensing Story, Default Cabin to Rear

**Files:**
- Modify: `src/content/story-chapters.ts`
- Modify: `src/scene/camera-controller.ts`
- Modify: `src/state/vehicle-state.ts`
- Modify: `src/main-render-orchestration.ts`
- Modify: `src/ui/render-shell.ts`
- Modify: `src/styles.css`
- Test: `tests/story-chapters.test.ts`
- Test: `tests/vehicle-state.test.ts`
- Test: `tests/main-state-orchestration.test.ts`
- Test: `tests/ui-controls.test.ts`
- Test: `e2e/site.spec.ts`

**Interfaces:**
- Consumes: `VehicleStore.actions.setActiveStory`, `setMode`, `setSeatView`; `CameraController.setTarget(view)`。
- Produces: `CameraView` 不再包含 `'sensing'`；`STORY_CHAPTERS` 仅为 `aero/performance/cabin`；激活 cabin 的状态转移结果固定为 rear。

- [ ] **Step 1: Write failing story and shell tests**

在 `tests/story-chapters.test.ts` 将章节期望改为手写字面量：

```ts
expect(STORY_CHAPTERS.map(({ id }) => id)).toEqual([
  'aero',
  'performance',
  'cabin',
]);
```

在 `tests/ui-controls.test.ts` 渲染真实 shell 后断言用户可见行为：

```ts
const shell = renderShell(root);
expect(root.querySelector('#film')).toBeNull();
expect([...root.querySelectorAll('nav a')].map((node) => node.textContent?.trim()))
  .toEqual(['SU7', '细节', '科技']);
expect(shell.storySections).toHaveLength(3);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
corepack pnpm vitest run tests/story-chapters.test.ts tests/ui-controls.test.ts
```

Expected: FAIL because `intelligence` and `#film` still exist and navigation still contains “影像”。

- [ ] **Step 3: Remove obsolete content and presentation**

- 从 `STORY_CHAPTERS` 删除 `intelligence` 对象。
- 从 `CameraView`、`CAMERA_PRESETS` 和 story camera 分支删除 `sensing`。
- 从 `renderShell` 删除“影像”导航、`#film` Section 和 `gallery-su7.webp` 引用。
- 从 `styles.css` 删除仅服务 `.brand-film` 的规则；保留被其他模块共享的基础规则。
- 更新所有 exhaustiveness switch，禁止通过 `as CameraView` 掩盖缺失分支。

- [ ] **Step 4: Write the failing cabin state transition test**

在 `tests/vehicle-state.test.ts` 通过真实 store 验证章节边沿触发，而不是反复覆盖用户选择：

```ts
const store = createVehicleStore({
  mode: 'exterior',
  seatView: 'driver',
  activeStoryId: 'performance',
});
store.actions.setActiveStory('cabin');
expect(store.getState()).toMatchObject({
  activeStoryId: 'cabin',
  mode: 'cabin',
  seatView: 'rear',
});

store.actions.setSeatView('passenger');
store.actions.setActiveStory('cabin');
expect(store.getState().seatView).toBe('passenger');
```

在 `tests/main-state-orchestration.test.ts` 将 cabin 相机期望从 `cabin` 改为 `rear`，断言最终 `camera.getDiagnostics().view === 'rear'`。

- [ ] **Step 5: Run the focused state test and verify RED**

Run:

```bash
corepack pnpm vitest run tests/vehicle-state.test.ts tests/main-state-orchestration.test.ts
```

Expected: FAIL because cabin 仍沿用当前座位或默认 driver，而不是 rear。

- [ ] **Step 6: Implement the minimal cabin transition**

在 story 首次进入 cabin 时按固定顺序应用：

```ts
store.actions.setMode('cabin');
store.actions.setSeatView('rear');
cameraRender.setTarget('rear');
```

要求：

- 仅在 active story 从非 cabin 进入 cabin 时重置为 rear。
- cabin 内用户点击座位不被下一帧 store subscription 再次覆盖。
- 离开 cabin 时允许目标 story preset 接管。

- [ ] **Step 7: Run focused unit tests and verify GREEN**

Run:

```bash
corepack pnpm vitest run tests/story-chapters.test.ts tests/ui-controls.test.ts tests/vehicle-state.test.ts tests/main-state-orchestration.test.ts
```

Expected: all selected tests PASS。

- [ ] **Step 8: Update the narrow E2E contract**

更新 `e2e/site.spec.ts`：

```ts
await expect(page.locator('nav a')).toHaveText(['SU7', '细节', '科技']);
await expect(page.locator('#film')).toHaveCount(0);
await page.locator('[data-story-id="cabin"]').scrollIntoViewIfNeeded();
await expect.poll(() => readDiagnostics(page).then((d) => d.state.mode)).toBe('cabin');
await expect.poll(() => readDiagnostics(page).then((d) => d.state.seatView)).toBe('rear');
```

保留现有模型路由与 WebGL 稳定夹具，不新增固定 sleep。

- [ ] **Step 9: Commit Task 1**

```bash
git add src/content/story-chapters.ts src/scene/camera-controller.ts src/state/vehicle-state.ts src/main-render-orchestration.ts src/ui/render-shell.ts src/styles.css tests/story-chapters.test.ts tests/vehicle-state.test.ts tests/main-state-orchestration.test.ts tests/ui-controls.test.ts e2e/site.spec.ts
git commit -m "feat: simplify story and default cabin to rear"
```

---

### Task 2: Add Dual-Mode Camera Drag and Fix Passenger Preset

**Files:**
- Create: `src/interaction/view-drag-controller.ts`
- Create: `tests/view-drag-controller.test.ts`
- Modify: `src/scene/camera-controller.ts`
- Modify: `src/main-render-orchestration.ts`
- Modify: `src/main.ts`
- Delete: `src/interaction/drag-controller.ts` if no remaining imports exist
- Test: `tests/camera-controller.test.ts`
- Test: `tests/main-render-orchestration.test.ts`
- Test: existing drag-controller test file, renamed to `tests/view-drag-controller.test.ts`

**Interfaces:**
- Consumes: `CameraPreset.position/target`, `beginRenderActivity(reason)`, `endRenderActivity(reason)`, `requestRender()`。
- Produces:

```ts
export type ViewDragMode = 'exterior' | 'cabin';
export interface ManualViewOffset { yaw: number; pitch: number }
export interface ViewDragController {
  setEnabled(enabled: boolean): void;
  setMode(mode: ViewDragMode): void;
  reset(): void;
  dispose(): void;
}
export interface ViewDragCallbacks {
  applyOffset(offset: ManualViewOffset): void;
  beginInteraction(): void;
  endInteraction(): void;
  requestRender(): void;
}
export function createViewDragController(
  element: HTMLElement,
  callbacks: ViewDragCallbacks,
): ViewDragController;
```

`CameraController` 新增：

```ts
setManualOffset(offset: ManualViewOffset): void;
resetManualOffset(): void;
```

- [ ] **Step 1: Write failing pure interaction tests**

在 `tests/view-drag-controller.test.ts` 使用真实 DOM element 派发 PointerEvent，覆盖：

```ts
it('keeps exterior yaw continuous across a full rotation', () => {
  // pointerdown at x=200, then cumulative pointermove greater than one viewport width
  // assert last offset.yaw has magnitude > Math.PI * 2
});

it('clamps exterior and cabin pitch without clamping yaw', () => {
  // move beyond vertical bounds in each mode
  // assert literal pitch bounds and unbounded cumulative yaw
});

it.each(['pointerup', 'pointercancel'] as const)(
  'ends render activity on %s while preserving the final offset',
  (eventName) => { /* real event lifecycle assertions */ },
);

it('resets offsets and releases an active interaction on dispose', () => {
  // start a drag, dispose, then assert one balanced endInteraction and no later updates
});
```

使用计划实现时确定的常量字面量作为期望；不要用生产函数计算 expected。

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
corepack pnpm vitest run tests/view-drag-controller.test.ts
```

Expected: FAIL because the module and API do not exist。

- [ ] **Step 3: Implement `view-drag-controller` minimally**

实现规则：

```ts
const DRAG_THRESHOLD_PX = 3;
const YAW_RADIANS_PER_PIXEL = 0.006;
const EXTERIOR_PITCH_MIN = -0.28;
const EXTERIOR_PITCH_MAX = 0.42;
const CABIN_PITCH_MIN = -0.72;
const CABIN_PITCH_MAX = 0.72;
```

- pointerdown 仅记录位置并 capture pointer。
- 超过 3px 阈值后只调用一次 `beginInteraction()`。
- yaw 连续累积，不归一化到 `[-π, π]`。
- pitch 依据当前 mode clamp。
- 每次有效更新调用 `applyOffset` 与 `requestRender`。
- pointerup/cancel/blur/dispose 保证 begin/end 成对。
- `reset()` 设为 `{ yaw: 0, pitch: 0 }` 并通知 `applyOffset`。

- [ ] **Step 4: Run interaction tests and verify GREEN**

Run:

```bash
corepack pnpm vitest run tests/view-drag-controller.test.ts
```

Expected: all tests PASS，且无未处理事件警告。

- [ ] **Step 5: Write failing camera composition tests**

在 `tests/camera-controller.test.ts` 添加用户可见姿态测试：

```ts
controller.setTarget('aero');
controller.update(1, true);
const exteriorOrigin = camera.position.clone();
controller.setManualOffset({ yaw: Math.PI / 2, pitch: 0 });
controller.update(0, true);
expect(camera.position.distanceTo(exteriorOrigin)).toBeGreaterThan(1);

controller.setTarget('rear');
controller.update(1, true);
const cabinOrigin = camera.position.clone();
controller.setManualOffset({ yaw: Math.PI, pitch: 0 });
controller.update(0, true);
expect(camera.position.toArray()).toEqual(cabinOrigin.toArray());
expect(readCameraForward(camera)).toPointBehindSeat();
```

将最后一个断言写成现有 Three.js 向量字面量容差断言，不创建仅测试使用的生产 API。

副驾测试断言：默认位置位于靠背前方且默认 forward vector 指向仪表台可视区域。

- [ ] **Step 6: Run camera tests and verify RED**

Run:

```bash
corepack pnpm vitest run tests/camera-controller.test.ts
```

Expected: FAIL because controller 不支持 manual offset，且旧 passenger preset 位于遮挡区。

- [ ] **Step 7: Implement camera offset composition**

- 外观：从当前自动 preset 的 position-target 向量转球面坐标，加 manual yaw/pitch，再恢复 position；target 保持自动 preset target。
- 座舱：position 固定为自动 preset position，将 target-position 的单位方向用 yaw/pitch 旋转后乘回原 target distance。
- `setTarget` 和新的 story target 变化时调用 `resetManualOffset()`。
- passenger preset 向前并向车内中心移动，默认 target 指向仪表台；用 Task 测试定义的几何约束锁定。
- 不修改 vehicle root rotation。

- [ ] **Step 8: Replace orchestration and lifecycle wiring**

在 `main.ts` 用新控制器替换旧 `createDragController`：

```ts
const drag = createViewDragController(canvas, {
  applyOffset: (offset) => cameraRender.setManualOffset(offset),
  beginInteraction: () => beginRenderActivity('view-drag'),
  endInteraction: () => endRenderActivity('view-drag'),
  requestRender,
});
```

状态订阅中：

- WebGL ready 且 stage 非 hidden/inert 时 `setEnabled(true)`。
- mode 变化时调用 `setMode` 和 `reset`。
- seat/story 变化时调用 `reset`。
- attempt dispose 时调用 `drag.dispose()`。
- 删除 `rotateVehicle(deltaYaw)` 与 `suspendAutoCamera(durationMs)` 的拖拽调用链；若 `suspendAutoCamera` 仍服务其他功能则保留该 state action。

- [ ] **Step 9: Run Task 2 tests and verify GREEN**

Run:

```bash
corepack pnpm vitest run tests/view-drag-controller.test.ts tests/camera-controller.test.ts tests/main-render-orchestration.test.ts
```

Expected: all selected tests PASS。

- [ ] **Step 10: Commit Task 2**

```bash
git add src/interaction/view-drag-controller.ts src/scene/camera-controller.ts src/main-render-orchestration.ts src/main.ts tests/view-drag-controller.test.ts tests/camera-controller.test.ts tests/main-render-orchestration.test.ts
git add -u src/interaction/drag-controller.ts tests
git commit -m "feat: add exterior and cabin camera dragging"
```

---

### Task 3: Rebuild the Floating Controls and Interaction Hint

**Files:**
- Modify: `src/ui/render-shell.ts`
- Modify: `src/styles.css`
- Modify: `src/ui/bind-controls.ts`
- Test: `tests/ui-controls.test.ts`
- Test: `e2e/site.spec.ts`

**Interfaces:**
- Consumes: existing `data-mode`, `data-seat-view`, paint/interior ids, `aria-pressed` state and control binding selectors。
- Produces: stable groups `[data-control-group="mode|paint|interior|seat|doors"]`；swatches carry `aria-label` and `data-tooltip`；hint carries `[data-view-hint]`。

- [ ] **Step 1: Write failing shell behavior tests**

在 `tests/ui-controls.test.ts` 使用真实 shell DOM：

```ts
expect(root.querySelectorAll('[data-control-group]')).toHaveLength(5);

const paintButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-paint]')];
expect(paintButtons).toHaveLength(9);
for (const button of paintButtons) {
  expect(button.getAttribute('aria-label')).toMatch(/.+/);
  expect(button.getAttribute('data-tooltip')).toBe(button.getAttribute('aria-label'));
  expect(button.textContent?.trim()).toBe('');
}

expect(root.querySelector('[data-view-hint]')?.textContent).toContain(
  '拖拽车辆查看外观细节',
);
expect(root.querySelector('[data-view-hint]')?.textContent).toContain(
  '滚动页面切换细节，右侧会跟随叙事自动调整视角',
);
```

同时保留现有真实按钮点击后 store 状态变化测试，避免只测试静态 HTML。

- [ ] **Step 2: Run shell tests and verify RED**

Run:

```bash
corepack pnpm vitest run tests/ui-controls.test.ts
```

Expected: FAIL because分组、Tooltip 和提示结构尚不存在，色名仍占据布局。

- [ ] **Step 3: Implement semantic menu markup**

- 菜单分为模式、车漆、内饰、座位、车门五组。
- 色点按钮仅使用 CSS swatch 和视觉隐藏文本；可见 Tooltip 由 `data-tooltip` + CSS `::after` 实现。
- 每组有 `aria-label`，按钮保留 `aria-pressed`。
- 外观模式隐藏/弱化座位与内饰分组时使用 `hidden`/`aria-hidden` 与现有 state 同步，不能仅视觉透明后继续接受点击。
- 添加精确提示文案；座舱模式将首句切为“拖拽视角查看座舱细节”。

- [ ] **Step 4: Implement the reference-inspired visual system**

在 `styles.css`：

- 桌面右侧使用深色半透明、`backdrop-filter: blur(...)`、细边框、16–20px 外圆角。
- 控件目标最小 `44px`，active 状态同时使用描边和轻微 scale。
- 色点采用紧凑网格，Tooltip 绝对定位且不改变布局。
- stage/canvas enabled 时使用 `cursor: grab`，dragging 时使用 `cursor: grabbing`。
- 中宽变为紧凑 dock；移动端变为底部横向/分行控制区。
- 为无 `backdrop-filter` 浏览器提供不透明深色 fallback。
- `prefers-reduced-motion` 关闭菜单和 Tooltip 的非必要过渡。

- [ ] **Step 5: Run unit tests and verify GREEN**

Run:

```bash
corepack pnpm vitest run tests/ui-controls.test.ts
```

Expected: all selected tests PASS。

- [ ] **Step 6: Add focused responsive E2E assertions**

在 `e2e/site.spec.ts` 使用现有 overlap/focus-zone helpers，覆盖：

```ts
for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 600 },
  { width: 900, height: 700 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
]) {
  // assert controls and hint stay inside viewport
  // assert controls do not overlap story copy or the defined vehicle focus zone
}
```

不要仅比较 class 名；断言 `getBoundingClientRect()` 产生的真实布局边界。

- [ ] **Step 7: Commit Task 3**

```bash
git add src/ui/render-shell.ts src/styles.css tests/ui-controls.test.ts e2e/site.spec.ts
git add src/ui/*control*.ts
git commit -m "feat: redesign vehicle controls and guidance"
```

---

### Task 4: Brighten Official Paint Materials

**Files:**
- Modify: `src/content/vehicle-palettes.ts`
- Modify: `src/scene/vehicle-controller.ts`
- Test: `tests/vehicle-palettes.test.ts`
- Test: existing vehicle-controller material test, or create `tests/vehicle-controller-materials.test.ts`
- Test: `e2e/site.spec.ts`

**Interfaces:**
- Consumes: current `PaintId`, `VehiclePaletteOption`, vehicle body material discovery and state-driven paint application。
- Produces:

```ts
export interface PaintMaterialTuning {
  color: number;
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
}

export interface PaintPaletteOption<Id extends string>
  extends VehiclePaletteOption<Id> {
  material: PaintMaterialTuning;
}
```

- [ ] **Step 1: Write failing palette contract tests**

在 `tests/vehicle-palettes.test.ts` 对真实九色选项断言：

```ts
expect(PAINT_OPTIONS).toHaveLength(9);
expect(PAINT_OPTIONS.map(({ label }) => label)).toEqual([
  '海湾蓝', '雅灰', '橄榄绿', '珍珠白', '钻石黑',
  '流星蓝', '霞光紫', '熔岩橙', '寒武岩灰',
]);

for (const paint of PAINT_OPTIONS) {
  expect(paint.material.metalness).toBeGreaterThanOrEqual(0);
  expect(paint.material.metalness).toBeLessThanOrEqual(1);
  expect(paint.material.roughness).toBeGreaterThanOrEqual(0);
  expect(paint.material.roughness).toBeLessThanOrEqual(1);
  expect(paint.material.clearcoat).toBeGreaterThan(0);
  expect(paint.material.clearcoat).toBeLessThanOrEqual(1);
}
```

增加至少三项手写差异断言，防止所有颜色被同一参数抹平：钻石黑与珍珠白基础色不同；雅灰与寒武岩灰基础色不同；熔岩橙 clearcoat 不低于当前基线。

- [ ] **Step 2: Run palette tests and verify RED**

Run:

```bash
corepack pnpm vitest run tests/vehicle-palettes.test.ts
```

Expected: FAIL because `material` 不存在。

- [ ] **Step 3: Add typed per-paint material tuning**

- 为九色逐项提供 `material`，不通过一个共享默认对象掩盖差异。
- `swatch` 保持 UI 色点使用；`material.color` 专门为 Three.js 色调映射校准。
- 参数全部在 `[0,1]`，保持类型只读。
- 初始建议范围：metalness `0.55–0.82`、roughness `0.18–0.34`、clearcoat `0.72–1`、clearcoatRoughness `0.08–0.2`；最终每色值由视觉快照微调。

- [ ] **Step 4: Write failing material application test**

使用一个真实 `MeshPhysicalMaterial` 和最小 vehicle fixture：

```ts
controller.setPaint('lava-orange');
const expected = getPaintOption('lava-orange').material;
expect(bodyMaterial.color.getHexString()).toBe(new Color(expected.color).getHexString());
expect(bodyMaterial.metalness).toBe(expected.metalness);
expect(bodyMaterial.roughness).toBe(expected.roughness);
expect(bodyMaterial.clearcoat).toBe(expected.clearcoat);
expect(bodyMaterial.clearcoatRoughness).toBe(expected.clearcoatRoughness);
```

测试使用仓库现有 `PaintId`：`lava-orange`，不新增别名。

- [ ] **Step 5: Run material test and verify RED**

Run:

```bash
corepack pnpm vitest run tests/vehicle-controller-materials.test.ts tests/vehicle-palettes.test.ts
```

Expected: palette contract may pass, material application FAIL because controller 只更新 color 或旧字段。

- [ ] **Step 6: Apply all physical material fields**

在 `vehicle-controller.ts` 的真实车身材质更新路径设置：

```ts
material.color.set(paint.material.color);
material.metalness = paint.material.metalness;
material.roughness = paint.material.roughness;
material.clearcoat = paint.material.clearcoat;
material.clearcoatRoughness = paint.material.clearcoatRoughness;
material.needsUpdate = true;
```

仅更新识别为车漆的 `MeshPhysicalMaterial`；不要污染玻璃、轮胎、灯具或内饰材质。

- [ ] **Step 7: Run Task 4 tests and verify GREEN**

Run:

```bash
corepack pnpm vitest run tests/vehicle-palettes.test.ts tests/vehicle-controller-materials.test.ts tests/ui-controls.test.ts
```

Expected: all selected tests PASS。

- [ ] **Step 8: Commit Task 4**

```bash
git add src/content/vehicle-palettes.ts src/scene/vehicle-controller.ts tests/vehicle-palettes.test.ts tests/vehicle-controller-materials.test.ts e2e/site.spec.ts
git commit -m "feat: refine official SU7 paint materials"
```

---

### Task 5: Integrate, Verify Interaction, and Refresh Visual Baselines

**Files:**
- Modify: `e2e/site.spec.ts`
- Modify: `e2e/*.spec.ts-snapshots/*` only for intentional reviewed visual changes
- Modify: affected source/test files only when a new failing regression test demonstrates an integration defect

**Interfaces:**
- Consumes: Task 1–4 public behavior and diagnostics already exposed only in E2E builds。
- Produces: complete cross-feature proof without production-only test hooks。

- [ ] **Step 1: Write failing end-to-end drag scenarios**

使用 Playwright 真实 pointer input：

```ts
const canvas = page.locator('canvas');
const box = await canvas.boundingBox();
if (!box) throw new Error('canvas is not visible');

await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5, { steps: 8 });
await page.mouse.up();

const manual = await readDiagnostics(page);
expect(Math.abs(manual.camera.manualYaw)).toBeGreaterThan(0.2);
```

场景覆盖：

- 外观拖拽改变相机但不改变 vehicle root yaw。
- 松手后等待超过 500ms，手动角度仍保持且连续渲染停止。
- 滚动进入下一 story 后 manual offset 清零。
- cabin/rear 拖拽保持 camera position，仅改变观察方向。
- 点击 passenger 后恢复 passenger 默认视角，首帧无遮挡。

- [ ] **Step 2: Run the focused E2E tests and verify RED**

Run:

```bash
corepack pnpm e2e --grep "camera drag|cabin rear|passenger view"
```

Expected: FAIL on any missing integration or diagnostics behavior；如果全通过，先确认测试确实能因删除相应 production 行而失败，避免 change detector。

- [ ] **Step 3: Fix only demonstrated integration gaps**

对每个失败：

1. 先确认失败来自用户行为而非固定等待或 selector 漂移。
2. 添加/保留能复现的最窄测试。
3. 修改对应生产模块，不在 E2E 中放宽阈值掩盖真实问题。
4. 单独重跑该 grep 直到通过。

- [ ] **Step 4: Run all unit tests**

Run:

```bash
corepack pnpm test
```

Expected: all Vitest files and tests PASS，0 failures。

- [ ] **Step 5: Run the production build**

Run:

```bash
corepack pnpm build
```

Expected: TypeScript 与 Vite build exit 0；`dist` 不包含 E2E diagnostics。

- [ ] **Step 6: Run full Playwright with zero retries**

Run:

```bash
corepack pnpm exec playwright test --retries=0
```

Expected: all projects PASS，0 flaky retries。

- [ ] **Step 7: Review and update intentional snapshots**

逐个查看 Hero、三章故事、主驾、副驾、后排，以及五个验收 viewport 的截图。只对以下预期变化更新基线：

- 删除影像和传感器内容。
- 新悬浮菜单与提示。
- cabin 默认后排。
- passenger 无座椅遮挡。
- 更鲜亮但未过曝的九色车漆。

发现遮挡、裁切、过曝或焦点环缺失时，先新增能失败的布局/行为断言，再修复，不直接接受快照。

- [ ] **Step 8: Verify repository hygiene**

Run:

```bash
git diff --check
git status --short
git diff --stat main...HEAD
```

Expected: no whitespace errors；仅计划内源码、测试、文档和有意快照变更；无 `dist`、trace、report、临时图片或 node_modules。

- [ ] **Step 9: Commit integration verification**

```bash
git add e2e/site.spec.ts e2e
# Add any source/test regression fix files explicitly, never git add -A.
git commit -m "test: verify camera and controls refinement"
```

若没有新的可提交变更，跳过空提交，并在任务报告记录最终验证命令和结果。
