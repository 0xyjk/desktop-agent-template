# 第 2 篇：Tool Calling — Shell 工具

## 目标

让 LLM 能调用工具执行 shell 命令，从"聊天机器人"迈向"Agent"。用户提问后，AI 可自主决定是否调用 shell 工具获取系统信息，并基于工具返回的结果生成回复。

## 架构变化

在 ch1 基础上新增：

- **工具定义层**：`src/main/tools/shell.ts`，使用 AI SDK 的 `tool()` + Zod schema 定义工具
- **Agent 模式**：使用 `ToolLoopAgent` 替代 `streamText`，内置多步工具调用循环（默认最多 20 步）
- **工具 UI**：ChatWindow 使用 ai-elements 的 `Terminal` 组件渲染 shell 工具调用过程

```
用户输入 → ToolLoopAgent 决定调用 shell 工具 → 执行命令 → 返回结果 → Agent 生成最终回复
```

## 涉及文件

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/main/tools/shell.ts` | 新建 | shell 工具定义 + 跨平台执行逻辑 |
| `src/main/server.ts` | 修改 | 使用 `ToolLoopAgent` + `createAgentUIStreamResponse` |
| `src/renderer/src/components/ChatWindow.tsx` | 修改 | 用 `Terminal` 组件渲染 shell 工具调用 |
| `package.json` | 修改 | 添加 zod 依赖 |

## 实现步骤

### 1. 安装依赖

```bash
pnpm add zod
```

### 2. 创建 shell 工具

`src/main/tools/shell.ts` — 工具定义放在 `src/main/tools/` 目录，每个工具一个文件。

关键设计：
- **跨平台**：macOS/Linux 使用 `$SHELL`（默认 `/bin/bash`），Windows 使用 PowerShell
- **超时保护**：`execFile` 设置 30 秒超时
- **输出截断**：stdout 限制 5000 字符、stderr 限制 2000 字符，防止 token 爆炸
- **AI SDK v6**：使用 `inputSchema`（非 `parameters`）定义工具输入

### 3. 修改 server.ts

使用 `ToolLoopAgent` 替代 `streamText`：

```typescript
import { ToolLoopAgent, createAgentUIStreamResponse, UIMessage } from 'ai'

const agent = new ToolLoopAgent({
  model: provider(process.env.LLM_MODEL || ''),
  tools: { shell: shellTool }
})

// 在路由中：
return createAgentUIStreamResponse({
  agent,
  uiMessages: messages
})
```

相比 `streamText` 的优势：
- 内置 agent loop，默认 `stepCountIs(20)`，无需手动配置
- `createAgentUIStreamResponse` 自动处理 `UIMessage` → model messages 转换，省掉 `convertToModelMessages`
- 代码更简洁

### 4. 修改 ChatWindow.tsx

使用 `switch (part.type)` 模式（ai-elements 官方推荐）渲染 message parts：

- **text part**：`MessageResponse` 组件，支持 streaming 模式和打字动画
- **tool part**：用 `isStaticToolUIPart()` 类型守卫识别，使用 `Terminal` 组件渲染
  - 头部：`$ command` + 状态 badge（Running / Completed / Error）
  - 执行中：深色终端背景 + 闪烁光标
  - 完成后：直接展示 stdout 输出
- **加载状态**：Agent 工作中但尚无文字输出时显示 Spinner

## 验收标准

- [ ] `pnpm dev` 正常启动
- [ ] 输入"列出当前目录的文件" → AI 调用 shell tool → Terminal 组件展示命令和输出 → AI 基于结果生成文字回复
- [ ] 输入"查看系统信息" → AI 执行 `uname -a` 或类似命令 → 正确显示结果
- [ ] 工具执行中显示 Running 状态和光标动画，完成后显示 Completed
- [ ] 工具执行完等待回复时，气泡内显示 Spinner 加载指示器
- [ ] 工具超时或报错时，UI 显示错误状态
