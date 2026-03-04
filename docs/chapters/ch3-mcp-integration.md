# 第 3 篇：MCP 集成 — Streamable HTTP

## 目标

通过 MCP（Model Context Protocol）协议动态接入外部 HTTP 工具服务器，并提供 Settings 弹窗管理 MCP server 列表（增删、连接状态）。

## 架构变化

在 ch2 基础上新增：

- **MCP client 层**：`src/main/mcp.ts`，管理多个 MCP server 的连接生命周期，配置持久化到 `mcp.json`
- **管理 API**：`server.ts` 新增 `GET/POST/DELETE /api/mcp/servers`，MCP server 增删后重建 `ToolLoopAgent`
- **Settings 弹窗**：`MCPSettings.tsx`，放在 `PromptInputTools` 区域，管理 server 列表和请求头
- **双类型工具渲染**：本地工具（`tool-shell`）→ Terminal，MCP 工具（`dynamic-tool`）→ ai-elements `Tool` 组件族

```
mcp.json (userData 目录) → mcp.ts → createMCPClient(url, headers)
                                   ↓
                             getAllMCPTools() → ToolLoopAgent({ shell, ...mcpTools })
                                                      ↓
                              ChatWindow ← createAgentUIStreamResponse
```

## 涉及文件

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/main/mcp.ts` | 新建 | MCP client 生命周期、配置读写、工具聚合 |
| `src/main/server.ts` | 修改 | 异步初始化 agent + MCP 管理 API |
| `src/main/index.ts` | 修改 | 传入 `userData` 路径 + `before-quit` 清理 |
| `src/renderer/src/components/MCPSettings.tsx` | 新建 | Settings 弹窗：server 列表 + 请求头管理 |
| `src/renderer/src/components/ChatWindow.tsx` | 修改 | Settings 按钮 + `dynamic-tool` 渲染 |
| `package.json` | 修改 | 添加 `@ai-sdk/mcp` |

## 实现步骤

### 1. 安装依赖

```bash
pnpm add @ai-sdk/mcp
```

### 2. 创建 `src/main/mcp.ts`

关键设计：

- **配置格式**：兼容 Claude Desktop 的 `mcp.json`（`{ mcpServers: { name: { url, headers? } } }`）
- **并发连接**：`Promise.allSettled` 确保单个 server 失败不阻塞其他 server
- **运行时状态与配置分离**：`entries` Map 存连接状态，`mcp.json` 持久化配置
- **headers 支持**：透传给 `createMCPClient` 的 `transport.headers`，用于 Bearer Token / API Key 等认证

```typescript
const client = await createMCPClient({
  transport: {
    type: 'http',
    url: config.url,
    ...(config.headers ? { headers: config.headers } : {})
  }
})
const tools = await client.tools() // 从 MCP server 拉取工具列表，自动转为 AI SDK 格式
```

对外暴露：`initMCP`、`closeMCP`、`getAllMCPTools`、`getServerStatuses`、`addServer`、`removeServer`、`reconnectServer`

### 3. 修改 `src/main/server.ts`

`ToolLoopAgent` 改为延迟初始化，MCP server 增删后调用 `rebuildAgent()` 重建：

```typescript
let agent: ToolLoopAgent

function rebuildAgent(): void {
  agent = new ToolLoopAgent({
    model: provider(process.env.LLM_MODEL || ''),
    system: '你是一个智能助手。当可用工具能够帮助你更准确地解决用户问题时，主动调用工具。',
    tools: { shell: shellTool, ...getAllMCPTools() }
  })
}

export async function startServer(port = 3315, userDataPath: string): Promise<number> {
  await initMCP(userDataPath) // 读取 mcp.json，并发连接所有已配置 server
  rebuildAgent()
  // ...
}
```

新增 MCP 管理 API：`GET /api/mcp/servers`、`POST /api/mcp/servers`、`DELETE /api/mcp/servers/:name`、`POST /api/mcp/servers/:name/reconnect`

### 4. 修改 `src/main/index.ts`

```typescript
serverPort = await startServer(3315, app.getPath('userData'))

app.on('before-quit', async () => {
  await closeMCP() // 关闭所有 MCP client，终止连接
})
```

### 5. 新建 `src/renderer/src/components/MCPSettings.tsx`

Settings 弹窗放在 `PromptInputTools` 区域（`PromptInputButton` 触发）：

- 弹窗打开时 `fetch /api/mcp/servers` 刷新状态
- 服务器列表：名称 + URL + 状态图标（🟡连接中 / 🟢已连接 / 🔴错误）+ 工具名 Badge + 重连/删除按钮
- 请求头编辑器：可折叠的键值对列表，支持任意 HTTP 请求头（`Authorization`、`x-api-key` 等）

### 6. 修改 `ChatWindow.tsx`

在 `PromptInputTools` 加入 `<MCPSettings />`，工具渲染按 `part.type` 分 case：

```tsx
switch (part.type) {
  case 'text':         return <MessageResponse />
  case 'tool-shell':   return <Terminal />         // 本地 shell 工具
  case 'dynamic-tool': return <Tool>              // MCP 工具
                                <ToolHeader type={part.type} state={part.state} toolName={part.toolName} />
                                <ToolContent>
                                  <ToolInput input={part.input} />
                                  <ToolOutput output={part.output} errorText={part.errorText} />
                                </ToolContent>
                              </Tool>
  default:             return null
}
```

**关键发现**：MCP 工具经 `ToolLoopAgent` 调用后，`part.type` 是 `'dynamic-tool'`（非 `'tool-{name}'`），`ToolHeader` 需额外传 `toolName={part.toolName}`。

## 验收标准

- [ ] `pnpm dev` 正常启动
- [ ] 点击输入框左下角 ⚙️ → 弹出 MCP 服务器管理弹窗
- [ ] 添加 MCP server → 显示连接中 → 变为已连接 + 工具名 Badge
- [ ] 支持请求头认证（展开「请求头」填写 `Authorization` 等）
- [ ] 对话中调用 MCP 工具 → 聊天里出现可折叠 Tool 卡片（工具名 + 状态 + 入参/出参）
- [ ] 删除/重连 server → agent 工具集实时更新
- [ ] shell 工具正常工作，ch2 功能不退化
- [ ] 退出应用后 MCP 连接正常关闭
