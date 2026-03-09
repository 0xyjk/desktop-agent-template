# Desktop Agent

使用 Electron 构建的桌面端 AI Agent 应用。以 8 篇教程系列的形式从零开发，每篇对应一个功能完整的 commit，逐步从基础聊天机器人演进为全功能桌面 Agent。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron（通过 electron-vite 构建） |
| 前端 | React + TypeScript + Tailwind CSS + shadcn/ui + ai-elements |
| 内嵌 API 服务器 | Hono |
| AI 集成 | Vercel AI SDK（`ai` + `@ai-sdk/react`） |
| LLM 接入 | OpenAI 兼容 API（DeepSeek、Ollama 等） |
| 包管理器 | pnpm |

## 架构

```
┌─────────────────────────────────────┐
│            Electron App             │
│                                     │
│  ┌─────────────┐  ┌──────────────┐  │
│  │  主进程      │  │  渲染进程     │  │
│  │              │  │  (React)     │  │
│  │  Hono Server │◄─┤              │  │
│  │  /api/chat   │  │  useChat()   │  │
│  │              │──►  ai-elements │  │
│  │  AI SDK      │  │  shadcn/ui   │  │
│  │  streamText  │  │              │  │
│  └─────────────┘  └──────────────┘  │
│         │                           │
└─────────┼───────────────────────────┘
          │ HTTPS
          ▼
   ┌──────────────┐
   │ LLM Provider │
   │ (OpenAI API) │
   └──────────────┘
```

- 主进程启动 Hono HTTP 服务器，监听本地端口，处理 AI SDK 调用
- 渲染进程通过 `useChat` + `DefaultChatTransport` 与主进程 HTTP 通信
- ai-elements 组件渲染聊天 UI

## 项目结构

```
src/
├── main/           # Electron 主进程 + Hono 服务器
├── preload/        # Electron 预加载脚本
└── renderer/       # React 前端（渲染进程）
    └── src/
        ├── components/
        │   └── ai-elements/   # ai-elements UI 组件
        ├── App.tsx
        └── main.tsx
```

## 快速开始

```bash
pnpm install
pnpm dev
```

## 配置

在项目根目录创建 `.env` 文件：

```env
LLM_API_KEY=your-api-key-here
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

支持任何 OpenAI 兼容的 provider（DeepSeek、Ollama 等）。

## 教程系列

| 篇 | 标题 | 核心功能 |
|----|------|---------|
| 1 | 基础 Chatbot | 与 LLM 文本对话 |
| 2 | Tool Calling | LLM 执行函数 |
| 3 | MCP | 接入外部服务 |
| 4 | Skill 系统 | 可插拔能力 |
| 5 | 代码执行 | 沙箱中运行代码 |
| 6 | 记忆系统 | 持久化上下文 |

每篇的实现指南在 [`docs/chapters/`](docs/chapters/) 目录下。

---

## AI 编码助手指令

> 以下内容为 AI 编码助手（Claude Code、Cursor、Copilot、Trae 等）提供编码规范。

### 开发命令

```bash
pnpm install          # 安装依赖
pnpm dev              # 启动开发服务器（electron-vite）
pnpm build            # 生产构建
pnpm lint             # 运行代码检查
```

### 编码规范

- 语言: TypeScript（严格模式）
- 代码注释使用中文，commit message 使用英文
- UI 界面文本使用中文
- 使用 ES modules（`import`/`export`），不使用 CommonJS
- 使用 AI SDK 相关 API 前，先查阅 `node_modules/ai/docs/` 获取最新用法，不要依赖记忆
- 禁止硬编码 API Key，统一使用环境变量或用户设置
- 聊天场景优先使用 `streamText` 而非 `generateText`

### 文件命名规范

- React 组件: PascalCase（如 `ChatWindow.tsx`）
- 工具函数: camelCase（如 `formatMessage.ts`）
- AI SDK 工具定义: 放在 `src/main/tools/` 目录，每个工具一个文件

### Git 工作流

- 每篇教程对应一个聚焦的 commit
- Commit message 格式: `ch<N>: <description>`（如 `ch1: basic chatbot with streaming`）
- 保持 commit 原子性——每个 commit 只包含一个功能，对应一篇教程

### 重要提示

- ai-elements 组件位于 `src/renderer/src/components/ai-elements/`（通过 `npx ai-elements@latest` 安装）
- **UI 优先使用 ai-elements 自带的组件**，不要自己从零写。常用组件包括：
  - `Conversation` / `ConversationContent` / `ConversationScrollButton` — 对话容器和自动滚动
  - `Message` / `MessageContent` / `MessageResponse` — 消息渲染（内置 markdown + 流式效果）
  - `PromptInput` / `PromptInputTextarea` / `PromptInputSubmit` — 输入框（支持快捷键提交、状态图标）
  - `Reasoning` / `Sources` / `Suggestion` 等 — 按需使用
  - 官方示例参考：https://elements.ai-sdk.dev/examples/chatbot
- Hono 路由放在 `src/main/` 目录下，保持服务器配置简洁
- 每篇教程的实现指南在 `docs/chapters/` 目录下
