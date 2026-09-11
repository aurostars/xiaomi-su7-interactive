# Xiaomi SU7 三维交互官网 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个高相似度复刻参考页面的 Xiaomi SU7 三维交互官网，并通过 GitHub Pages 发布。

**Architecture:** 使用 Vite、TypeScript 与原生 Three.js 构建纯静态应用。UI、车辆状态、三维场景、相机、滚动叙事和性能降级通过明确接口解耦，渲染循环只负责将目标状态平滑应用到场景。

**Tech Stack:** Vite、TypeScript、Three.js、GSAP、Vitest、Playwright（仅用于项目自动化验收）、GitHub Actions、GitHub Pages

## Global Constraints

- 页面必须高相似度复刻参考页面 `https://magic.solutionsuite.cn/html-box/vk9vPHOMQU7`。
- 车辆必须是可信 SU7 三维模型，不得用临时几何体冒充最终效果。
- “开门”只控制车门，不自动进入座舱；“进入座舱”才切换车内相机。
- 页面不得出现 Demo、Prototype、技术调试说明或内部跳转。
- Vite 资源路径必须兼容 `/xiaomi-su7-interactive/` GitHub Pages 子路径。
- 模型加载状态必须显示在车辆舞台位置；加载失败时提供重试与静态车辆图兜底。
- 移动端保留核心交互，并尊重 `prefers-reduced-motion`。
- 每个任务必须先写失败测试，再实现，再运行测试并单独提交。

---

## Planned File Structure

- `package.json`：依赖、开发、测试、构建和检查脚本。
- `vite.config.ts`：Vite、Vitest 与 GitHub Pages 基础路径配置。
- `index.html`：应用入口和基础元数据。
- `src/main.ts`：装配 UI、状态、Three.js 场景与滚动叙事。
- `src/styles.css`：全局设计系统、布局、响应式与降级样式。
- `src/state/vehicle-state.ts`：车辆交互状态与订阅接口。
- `src/scene/create-scene.ts`：渲染器、场景、灯光、尺寸与渲染循环。
- `src/scene/load-vehicle.ts`：GLB 加载、节点识别、材质映射与加载进度。
- `src/scene/vehicle-controller.ts`：车漆、内饰、车门和模型姿态控制。
- `src/scene/camera-controller.ts`：外观、热点和座位视角预设与镜头插值。
- `src/interaction/drag-controller.ts`：指针拖拽和自动镜头临时覆盖。
- `src/interaction/scroll-story.ts`：章节进度、激活场景与滚动同步。
- `src/ui/render-shell.ts`：导航、首屏、控制面板、章节和收尾内容。
- `src/ui/bind-controls.ts`：DOM 控件与状态层绑定。
- `src/performance/capabilities.ts`：WebGL、设备质量与减少动态效果判断。
- `src/assets/`：车辆模型、环境资源、品牌图片和静态兜底图。
- `tests/`：状态、相机、滚动、性能和 UI 单元测试。
- `e2e/site.spec.ts`：核心用户路径和 GitHub Pages 子路径验收。
- `.github/workflows/deploy-pages.yml`：GitHub Pages 自动部署。
- `README.md`：运行、构建、资源与发布说明。

---

### Task 1: Scaffold and Deployment-Safe Foundation

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/styles.css`
- Create: `tests/smoke.test.ts`
- Create: `.gitignore`

**Interfaces:**
- Produces: Vite 应用入口、`npm run dev`、`npm run test`、`npm run build`。
- Produces: `import.meta.env.BASE_URL` 驱动的资源基础路径。

- [ ] **Step 1: 初始化官方项目骨架**

Run:

```bash
aime_create_web_app xiaomi-su7-interactive "高相似度 Xiaomi SU7 三维交互官网"
```

将生成内容合并到当前仓库根目录，不覆盖 `docs/` 与 `.git/`。

- [ ] **Step 2: 写失败的基础路径测试**

```ts
import { describe, expect, it } from 'vitest';
import config from '../vite.config';

describe('vite deployment config', () => {
  it('uses the GitHub Pages repository base path', () => {
    expect(config.base).toBe('/xiaomi-su7-interactive/');
  });
});
```

- [ ] **Step 3: 运行测试并确认失败**

Run: `pnpm test -- tests/smoke.test.ts`

Expected: FAIL，因为 `base` 尚未配置为 `/xiaomi-su7-interactive/`。

- [ ] **Step 4: 配置最小入口与基础路径**

在 `vite.config.ts` 中导出：

```ts
export default defineConfig({
  base: '/xiaomi-su7-interactive/',
  test: { environment: 'jsdom' },
});
```

`src/main.ts` 先只挂载 `<main id="app">`，`src/styles.css` 写入颜色变量、字体栈和基础 reset。

- [ ] **Step 5: 验证测试与构建**

Run: `pnpm test -- tests/smoke.test.ts && pnpm build`

Expected: 测试 PASS，生产构建成功。

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vite.config.ts index.html src tests .gitignore
git commit -m "chore: scaffold su7 interactive site"
```

---

### Task 2: Vehicle State and Interaction Contract

**Files:**
- Create: `src/state/vehicle-state.ts`
- Create: `tests/vehicle-state.test.ts`

**Interfaces:**
- Produces: `createVehicleStore(initial?: Partial<VehicleState>): VehicleStore`。
- Produces: `VehicleMode = 'exterior' | 'cabin'`。
- Produces: `SeatView = 'driver' | 'passenger' | 'rear'`。
- Produces: `setMode`、`setPaint`、`setInterior`、`toggleDoors`、`setSeatView`、`setHotspot`、`suspendAutoCamera`。

- [ ] **Step 1: 写状态约束失败测试**

```ts
it('opening doors does not enter cabin mode', () => {
  const store = createVehicleStore();
  store.actions.toggleDoors();
  expect(store.getState().doorsOpen).toBe(true);
  expect(store.getState().mode).toBe('exterior');
});

it('selecting a seat enters cabin mode', () => {
  const store = createVehicleStore();
  store.actions.setSeatView('passenger');
  expect(store.getState()).toMatchObject({ mode: 'cabin', seatView: 'passenger' });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test -- tests/vehicle-state.test.ts`

Expected: FAIL，因为状态模块不存在。

- [ ] **Step 3: 实现可订阅状态容器**

状态初值：`mode: 'exterior'`、`paint: 'lava-orange'`、`interior: 'obsidian-black'`、`doorsOpen: false`、`seatView: 'driver'`、`hotspot: 'hero'`、`autoCameraSuspendedUntil: 0`。

`subscribe(listener)` 返回取消订阅函数；每个 action 只更新相关字段并通知订阅者。

- [ ] **Step 4: 验证状态行为**

Run: `pnpm test -- tests/vehicle-state.test.ts`

Expected: PASS，包括开门不进座舱、座位切换进入座舱、拖拽暂停自动镜头。

- [ ] **Step 5: Commit**

```bash
git add src/state/vehicle-state.ts tests/vehicle-state.test.ts
git commit -m "feat: add vehicle interaction state"
```

---

### Task 3: Three.js Scene, Model Loading, and Vehicle Controller

**Files:**
- Create: `src/scene/create-scene.ts`
- Create: `src/scene/load-vehicle.ts`
- Create: `src/scene/vehicle-controller.ts`
- Create: `src/assets/models/xiaomi-su7.glb`
- Create: `src/assets/images/vehicle-fallback.webp`
- Create: `tests/vehicle-controller.test.ts`

**Interfaces:**
- Consumes: `VehicleState` from `src/state/vehicle-state.ts`。
- Produces: `createScene(canvas, quality): SceneRuntime`，包含 `scene`、`camera`、`renderer`、`resize`、`start`、`dispose`。
- Produces: `loadVehicle(url, onProgress): Promise<LoadedVehicle>`，返回根节点、车身材质、内饰材质和可动车门节点。
- Produces: `createVehicleController(vehicle): VehicleController`，包含 `applyState(state)`、`setRotation(y)`、`dispose()`。

- [ ] **Step 1: 写车辆控制失败测试**

用 Three.js 测试节点构建模拟车辆，验证 `applyState` 只改变已识别的车漆/内饰材质，并将左右门旋转到目标角度。

```ts
expect(bodyMaterial.color.getHexString()).toBe('ff4b2b');
expect(leftDoor.rotation.y).toBeCloseTo(-1.05);
expect(rightDoor.rotation.y).toBeCloseTo(1.05);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test -- tests/vehicle-controller.test.ts`

Expected: FAIL，因为车辆控制器尚不存在。

- [ ] **Step 3: 接入可信模型与加载器**

使用 `GLTFLoader`，模型压缩类型匹配时接入 `DRACOLoader` 或 `MeshoptDecoder`。通过明确节点名数组识别车身、内饰和左右车门；无法识别时返回 capability 标记，而不是抛出导致整页崩溃。

- [ ] **Step 4: 实现场景和车辆控制**

创建物理合理的环境光、主轮廓灯、冷青侧光和暖色补光；限制 `renderer.setPixelRatio`。车门角度、车漆颜色和内饰颜色使用插值更新。

- [ ] **Step 5: 验证控制器与生产构建**

Run: `pnpm test -- tests/vehicle-controller.test.ts && pnpm build`

Expected: 测试 PASS，GLB 与图片进入构建产物，且无资源路径错误。

- [ ] **Step 6: Commit**

```bash
git add src/scene src/assets tests/vehicle-controller.test.ts
git commit -m "feat: add interactive su7 three scene"
```

---

### Task 4: Camera Presets, Drag Control, and Scroll Story

**Files:**
- Create: `src/scene/camera-controller.ts`
- Create: `src/interaction/drag-controller.ts`
- Create: `src/interaction/scroll-story.ts`
- Create: `tests/camera-controller.test.ts`
- Create: `tests/scroll-story.test.ts`

**Interfaces:**
- Produces: `CAMERA_PRESETS: Record<CameraView, CameraPreset>`。
- Produces: `createCameraController(camera): CameraController`，包含 `setTarget(view)`、`update(delta)`。
- Produces: `createDragController(element, callbacks): DragController`。
- Produces: `createScrollStory(sections, onProgress): ScrollStory`。

- [ ] **Step 1: 写相机与章节映射失败测试**

验证 `driver`、`passenger`、`rear` 预设互不相同；验证四个内容章节按滚动中心点映射到 `aero`、`performance`、`cabin`、`sensing`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test -- tests/camera-controller.test.ts tests/scroll-story.test.ts`

Expected: FAIL，因为相机与滚动模块不存在。

- [ ] **Step 3: 实现镜头预设与阻尼插值**

`CameraPreset` 包含 `position`、`target`、`fov`、`vehicleYaw`。`update(delta)` 使用与帧率无关的指数阻尼，不直接跳转。

- [ ] **Step 4: 实现拖拽与滚动叙事**

拖拽按指针移动增量更新车辆 yaw，并调用 `suspendAutoCamera(1400)`；滚动叙事只在暂停时间结束后继续驱动镜头。

- [ ] **Step 5: 验证全部测试**

Run: `pnpm test -- tests/camera-controller.test.ts tests/scroll-story.test.ts`

Expected: PASS，章节边界和暂停逻辑可重复验证。

- [ ] **Step 6: Commit**

```bash
git add src/scene/camera-controller.ts src/interaction tests/camera-controller.test.ts tests/scroll-story.test.ts
git commit -m "feat: add cinematic camera storytelling"
```

---

### Task 5: High-Fidelity Page UI and Responsive Controls

**Files:**
- Create: `src/ui/render-shell.ts`
- Create: `src/ui/bind-controls.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Create: `src/assets/images/tech-platform.webp`
- Create: `src/assets/images/tech-drive.webp`
- Create: `src/assets/images/tech-cabin.webp`
- Create: `src/assets/images/gallery-su7.webp`
- Create: `tests/ui-controls.test.ts`

**Interfaces:**
- Consumes: `VehicleStore`、`SceneRuntime`、`VehicleController`、`CameraController`。
- Produces: `renderShell(root): ShellElements`，返回 canvas、控制按钮和章节节点引用。
- Produces: `bindControls(elements, store): () => void`，返回解绑函数。

- [ ] **Step 1: 写 UI 语义和交互失败测试**

测试必须找到 `region` 名称、外观/座舱 tabs、十个颜色按钮、开门按钮、四个叙事标题、科技卡片和返回车辆舞台链接；点击开门后仍保持外观模式。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test -- tests/ui-controls.test.ts`

Expected: FAIL，因为页面壳与控件尚不存在。

- [ ] **Step 3: 实现页面语义结构与正式文案**

写入参考页面对应的导航、首屏、四段车辆说明、科技卡片、品牌影像、收尾 CTA 与页脚。禁止调试文案和空占位符。

- [ ] **Step 4: 实现视觉系统与响应式**

桌面首屏采用左文案、右车辆舞台；控制面板位于右上方。四段叙事使用大纵向间距保持舞台连续。移动端将控件改为底部可横向浏览的紧凑面板，并降低字号与空白但保留核心层级。

- [ ] **Step 5: 接线应用**

`src/main.ts` 依次创建 Shell、能力检测、Scene、Store、Vehicle、Camera、Controls 和 ScrollStory；所有 `dispose` 在页面卸载时调用。

- [ ] **Step 6: 验证 UI 与构建**

Run: `pnpm test -- tests/ui-controls.test.ts && pnpm build`

Expected: UI 测试 PASS，构建成功。

- [ ] **Step 7: Commit**

```bash
git add src/main.ts src/styles.css src/ui src/assets/images tests/ui-controls.test.ts
git commit -m "feat: build high fidelity su7 experience"
```

---

### Task 6: Capability Detection, Loading, and Fallbacks

**Files:**
- Create: `src/performance/capabilities.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Create: `tests/capabilities.test.ts`

**Interfaces:**
- Produces: `detectCapabilities(environment?): Capabilities`，包含 `webgl`、`reducedMotion`、`quality`。
- Consumes: `loadVehicle` 的进度与失败结果。

- [ ] **Step 1: 写能力判断失败测试**

```ts
expect(detectCapabilities({ webgl: false }).quality).toBe('fallback');
expect(detectCapabilities({ reducedMotion: true }).reducedMotion).toBe(true);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test -- tests/capabilities.test.ts`

Expected: FAIL，因为能力模块不存在。

- [ ] **Step 3: 实现能力判断和质量分级**

质量仅有 `high`、`balanced`、`fallback`；减少动态效果时禁用非必要浮动和强视差，低性能设备限制像素比与阴影。

- [ ] **Step 4: 实现舞台内 Loading、重试与静态兜底**

Loading、进度、错误说明和重试按钮都置于车辆画布容器；WebGL 或模型失败时显示 `vehicle-fallback.webp`，但保留所有内容章节与导航。

- [ ] **Step 5: 验证全部单元测试和构建**

Run: `pnpm test && pnpm build`

Expected: 全部测试 PASS，构建成功。

- [ ] **Step 6: Commit**

```bash
git add src/performance src/main.ts src/styles.css tests/capabilities.test.ts
git commit -m "feat: add resilient loading and fallbacks"
```

---

### Task 7: End-to-End Acceptance and GitHub Pages Workflow

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/site.spec.ts`
- Create: `.github/workflows/deploy-pages.yml`
- Create: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: 生产构建和完整页面。
- Produces: `pnpm e2e` 与默认分支 Pages 自动部署。

- [ ] **Step 1: 写端到端验收测试**

测试打开 `/xiaomi-su7-interactive/`，确认首屏标题、车辆舞台、外观/座舱、开门、科技区和返回 CTA；点击开门后验证按钮状态，点击进入座舱后验证座位控制出现。

- [ ] **Step 2: 运行测试并确认必要失败**

Run: `pnpm e2e`

Expected: 在工作流或测试配置尚未完成时 FAIL。

- [ ] **Step 3: 配置 Pages 工作流**

工作流使用 `actions/checkout`、`pnpm/action-setup`、`actions/setup-node`、`actions/configure-pages`、`actions/upload-pages-artifact` 和 `actions/deploy-pages`；发布目录为 `dist`，权限包含 `pages: write` 与 `id-token: write`。

- [ ] **Step 4: 编写项目说明**

README 说明 Node/pnpm 要求、本地启动、测试、构建、资源体积策略、Pages 启用步骤和线上地址格式。

- [ ] **Step 5: 完整验证**

Run:

```bash
pnpm test
pnpm build
pnpm e2e
```

Expected: 单元测试、生产构建和端到端测试全部通过，无资源 404 或阻断级控制台错误。

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e .github/workflows/deploy-pages.yml README.md package.json pnpm-lock.yaml
git commit -m "ci: add github pages deployment"
```

---

### Task 8: Final Visual Review and Delivery Preparation

**Files:**
- Modify: 仅修改视觉审查中确认存在问题的源码文件。

**Interfaces:**
- Consumes: 完整站点和参考页面截图。
- Produces: 可推送的新仓库与 GitHub Pages 发布候选版本。

- [ ] **Step 1: 启动生产等价预览**

Run: `pnpm build && pnpm preview --host 0.0.0.0`

- [ ] **Step 2: 检查桌面与移动视口**

检查 1440×900、1280×800、390×844：首屏构图、车辆占比、控制面板遮挡、章节节奏、科技卡片和收尾 CTA。

- [ ] **Step 3: 检查交互与控制台**

逐项验证拖拽、换色、开门、外观/座舱、三个座位、四个滚动热点、锚点与返回按钮，并确认无资源 404 和阻断级错误。

- [ ] **Step 4: 修复审查发现的问题并回归测试**

Run: `pnpm test && pnpm build && pnpm e2e`

Expected: 全部通过。

- [ ] **Step 5: 最终提交**

```bash
git add src/main.ts src/styles.css src/ui src/scene src/interaction src/performance tests e2e
git diff --cached --quiet || git commit -m "fix: polish final su7 experience"
```

- [ ] **Step 6: 准备远程发布**

检查 `git status --short` 为空，记录当前分支和提交。创建 GitHub 远程仓库、推送和启用 Pages 前，确认用户已明确授权远端写操作。
