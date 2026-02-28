# 第 1 篇：基础 Chatbot

## 目标

搭建最简单的 Electron 桌面聊天应用——用户发送消息，AI 以流式文本回复，带打字机动画效果。

## 架构

- **主进程**：Hono HTTP 服务器监听 3315 端口，`POST /api/chat` 端点使用 AI SDK 的 `streamText` + `@ai-sdk/openai-compatible` 调用 LLM
- **渲染进程**：React UI，使用 `@ai-sdk/react` 的 `useChat` + `ai-elements` 组件渲染聊天界面
- **配置**：`.env` 文件存放 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`

技术栈详见 [README.md](../../README.md)。

## 实现步骤

1. **脚手架** — `yes "" | pnpm create @quick-start/electron myapp --template react-ts`（不需要 `--` 分隔符；下载失败时加 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`）

2. **安装依赖** — `ai`、`@ai-sdk/openai-compatible`、`@ai-sdk/react`、`hono`、`@hono/node-server`、`dotenv`、`tailwindcss`、`@tailwindcss/vite`、`clsx`、`tailwind-merge`、`class-variance-authority`、`lucide-react`、`tw-animate-css`、`shadcn`

3. **手动配置 shadcn** — `shadcn init` 不支持 electron-vite，需手动创建 `components.json`（设 `rsc: false`，aliases 指向 `@renderer/components` 等）和 `lib/utils.ts`（`cn()` 工具函数）

4. **安装 ai-elements** — `npx ai-elements@latest`，安装后**必须手动移动文件**到正确路径（它会写到字面的 `@renderer/` 和 `src/components/` 而非 `src/renderer/src/components/`）

5. **配置构建和样式** —
   - `electron.vite.config.ts` 的 renderer 中添加 `tailwindcss()` 插件
   - `main.css` 需要完整配置：`@import "tailwindcss"` + `@import "tw-animate-css"` + `@import "shadcn/tailwind.css"` + `@import "streamdown/styles.css"`，以及 `@theme inline` 色彩映射、`:root` / `.dark` zinc 主题色值、`@layer base` 全局样式
   - `index.html` 的 CSP 中添加 `connect-src 'self' http://localhost:3315`
   - 删除脚手架多余文件（Versions.tsx、base.css、SVG 等）

6. **搭建服务器** — `src/main/server.ts`，`dotenv` 必须在**此文件顶部**加载（不能放 index.ts——ES module import 会被提升，放在其他文件时 provider 创建时环境变量还未加载）

7. **连接主进程** — `src/main/index.ts` 在创建 BrowserWindow 前先启动 Hono 服务器

8. **构建 UI** — `ChatWindow.tsx`（useChat + ai-elements 组件）、`App.tsx`（布局）、清理 `main.tsx`
   - 优先使用 ai-elements 组件：`Conversation`、`Message`、`MessageResponse`、`PromptInput` 等
   - `MessageResponse` 传入 `mode="streaming"` + `animated` 实现打字机效果
   - `status === 'submitted'` 时显示 `Spinner` 加载指示器，让用户感知到 AI 正在处理
   - 事件处理函数用 `useCallback` 包裹，避免流式输出期间不必要的重渲染

9. **创建 `.env`** — 填入 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`，确保已加入 `.gitignore`

## 验收标准

- [ ] `pnpm dev` 正常启动，终端输出 `Hono server running on http://localhost:3315`
- [ ] Electron 窗口打开，展示聊天区域和空状态提示
- [ ] 输入消息，点击发送 → 出现加载指示器 → AI 以打字机动画流式回复
- [ ] DevTools 控制台无 CSP 错误、无 CORS 错误、无 API Key 错误
