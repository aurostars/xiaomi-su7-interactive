# Xiaomi SU7 Interactive

小米 SU7 的沉浸式 Web 交互体验，包含三维车辆舞台、车漆与座舱切换、车门控制、滚动叙事和技术展示。

## 环境要求

- Node.js 20 或更高版本
- pnpm 10.12.1（建议通过 Corepack 启用：`corepack enable`）

## 本地开发

```bash
pnpm install
pnpm dev
```

Vite 开发服务器会使用与 GitHub Pages 一致的 `/xiaomi-su7-interactive/` 基础路径。

## 测试与构建

```bash
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm e2e
```

端到端测试会先生成生产构建，再通过 Vite Preview 从 `/xiaomi-su7-interactive/` 子路径执行真实浏览器验收。首次运行 E2E 前需要安装 Chromium；Linux CI 可使用 `pnpm exec playwright install --with-deps chromium`。

## 资源体积策略

- 三维模型和展示图片使用适合网页分发的压缩格式，并通过 Vite 构建生成带哈希的静态资源。
- 非首屏图片采用原生懒加载，首屏三维体验在能力不足或加载失败时回退到静态车辆图片。
- 新增大型资源前应先压缩并评估构建产物；不要提交 `dist`、测试报告或浏览器二进制。

## GitHub Pages

1. 在仓库 **Settings → Pages → Build and deployment** 中将 Source 设为 **GitHub Actions**。
2. 推送到默认分支 `main` 后，`Deploy GitHub Pages` 工作流会测试、构建并发布 `dist`。
3. 线上地址格式：`https://<owner>.github.io/xiaomi-su7-interactive/`。

Vite 的 `base` 已设置为 `/xiaomi-su7-interactive/`，确保脚本、模型和图片在 Pages 项目子路径下正确加载。
