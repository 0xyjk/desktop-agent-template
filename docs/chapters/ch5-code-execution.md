# 第 5 篇：Python Kernel — 有状态代码执行

## 目标

为 agent 添加持久化 Python 执行环境：变量和导入在对话轮次间保持，支持 matplotlib 图表以 base64 PNG 形式内联显示在聊天界面。

## 架构变化

在 ch4 基础上新增：

- **Python 内核服务**：`resources/kernel_server.py`，通过 `jupyter_client` 管理 IPython kernel，使用 stdin/stdout newline-delimited JSON 协议与 Node.js 通信
- **Node.js 工具封装**：`src/main/tools/python_kernel.ts`，懒启动 Python 子进程，单 pending 请求模型
- **图片渲染组件**：`PythonResult.tsx`，使用 `Sandbox` + `SandboxTabs` 展示代码和输出，执行完毕自动切换到 Output 标签

```
agent → execute_python tool
            ↓ spawn once (lazy)
      kernel_server.py          stdin:  {"code": "..."}
            ↓ jupyter_client    stdout: {"stdout": "...", "images": ["base64..."], "error": null}
      IPython kernel process
            ↑ display_data (base64 PNG)
      PythonResult.tsx
        ├─ Code tab:   CodeBlock (shiki 语法高亮)
        └─ Output tab: text + <img src="data:image/png;base64,...">
```

**与 shellTool 的关键区别**：shellTool 每次调用是独立进程，变量不共享；IPython kernel 在整个会话期间持续运行，`df`、已加载的模型、中间计算结果在多轮执行间保持。

## 涉及文件

| 文件 | 操作 | 说明 |
|---|---|---|
| `resources/kernel_server.py` | 新建 | IPython kernel 管理，JSON 协议，matplotlib 中文字体初始化 |
| `src/main/tools/python_kernel.ts` | 新建 | Node.js 工具，懒启动 kernel 子进程，readline 读响应 |
| `src/main/server.ts` | 修改 | 注册 `execute_python` 工具，导出 `closeKernel` |
| `src/main/index.ts` | 修改 | `before-quit` 时调用 `closeKernel()` |
| `src/renderer/src/components/PythonResult.tsx` | 新建 | Sandbox + SandboxTabs，执行完自动切换到 Output 标签 |
| `src/renderer/src/components/ChatWindow.tsx` | 修改 | 新增 `tool-execute_python` case、接入 `stop`、清理 skill 注入显示 |

前置依赖：`pip install jupyter_client ipykernel matplotlib pandas openpyxl`

## 实现步骤

### 1. `resources/kernel_server.py`

常驻 Python 脚本，启动后循环读取 stdin JSON、执行代码、写回结果：

```python
km = KernelManager(kernel_name='python3')
km.start_kernel()
kc = km.client()
kc.start_channels()
kc.wait_for_ready(timeout=30)

# 初始化：inline 图表 + 中文字体
init_code = """
%matplotlib inline
import matplotlib.pyplot as plt, matplotlib.font_manager as fm
_fonts = ['Arial Unicode MS', 'STHeiti', 'Songti SC', 'Microsoft YaHei', 'SimHei']
_avail = {f.name for f in fm.fontManager.ttflist}
for _f in _fonts:
    if _f in _avail:
        plt.rcParams['font.family'] = _f
        break
plt.rcParams['axes.unicode_minus'] = False
"""
collect_outputs(kc, kc.execute(init_code))
print(json.dumps({'status': 'ready'}), flush=True)

for line in sys.stdin:
    request = json.loads(line.strip())
    msg_id = kc.execute(request['code'])
    result = collect_outputs(kc, msg_id)
    print(json.dumps(result), flush=True)
```

`collect_outputs` 收集所有 iopub 消息直到 `status: idle`：`stream`（stdout/stderr）、`display_data`（图片 base64）、`execute_result`（返回值）、`error`（traceback，strip ANSI 转义码）。

### 2. `src/main/tools/python_kernel.ts`

懒启动：第一次调用时 spawn 子进程；对话串行，单 `pendingResolve` 足够，无需队列。

```typescript
export const pythonKernelTool = tool({
  description: 'Execute Python code in a persistent IPython kernel. State persists across calls.',
  inputSchema: z.object({ code: z.string() }),
  execute: async ({ code }) => {
    if (!kernelProcess || !isReady) await startKernel()
    return await executeCode(code)
  }
})

function startKernel(): Promise<void> {
  return new Promise((resolve, reject) => {
    kernelProcess = spawn('python3', [getScriptPath()])
    rl = createInterface({ input: kernelProcess.stdout! })
    rl.on('line', (line) => {
      const msg = JSON.parse(line)
      if (msg.status === 'ready') { isReady = true; resolve() }
      else if (pendingResolve) { pendingResolve(msg); pendingResolve = null }
    })
    kernelProcess.on('error', reject)
  })
}
```

脚本路径通过 `__dirname` 相对定位，开发模式下指向 `resources/kernel_server.py`。

### 3. 修改 `src/main/server.ts` + `index.ts`

```typescript
// server.ts
import { pythonKernelTool, closeKernel } from './tools/python_kernel'

tools: { shell: shellTool, use_skill: useSkillTool, execute_python: pythonKernelTool, ...getAllMCPTools() }

export { closeMCP, closeKernel }

// index.ts
app.on('before-quit', async () => {
  closeKernel()
  await closeMCP()
})
```

### 4. 新建 `PythonResult.tsx`

使用 `Sandbox` 组件（可折叠 + 状态 badge）+ `SandboxTabs` 分 Code/Output 两个标签页：

```tsx
const [tab, setTab] = useState<'code' | 'output'>('code')

useEffect(() => {
  if (hasOutput) setTab('output')  // 执行完毕自动切到 Output
}, [hasOutput])

return (
  <Sandbox>
    <SandboxHeader title="Python" state={state} />
    <SandboxContent>
      <SandboxTabs value={tab} onValueChange={(v) => setTab(v as 'code' | 'output')}>
        <SandboxTabsTrigger value="code">Code</SandboxTabsTrigger>
        <SandboxTabsTrigger value="output">Output</SandboxTabsTrigger>
        <SandboxTabContent value="code">
          <CodeBlockContent code={code} language="python" showLineNumbers />
        </SandboxTabContent>
        <SandboxTabContent value="output">
          {textOutput && <pre>{textOutput}</pre>}
          {output?.images?.map((img, idx) => (
            <img key={idx} src={`data:image/png;base64,${img}`} />
          ))}
        </SandboxTabContent>
      </SandboxTabs>
    </SandboxContent>
  </Sandbox>
)
```

### 5. 修改 `ChatWindow.tsx`

三处改动：

**① `tool-execute_python` 渲染**

```tsx
case 'tool-execute_python': {
  const output = part.output as { stdout?; stderr?; images?; error? } | undefined
  return <PythonResult code={part.input?.code ?? ''} output={output} state={part.state} />
}
```

**② 停止按钮**

```tsx
const { messages, sendMessage, status, stop } = useChat(...)
// ...
<PromptInputSubmit status={status} onStop={stop} />
```

`PromptInputSubmit` 在 `isGenerating && onStop` 时才切换为 `type="button"` 并调用 `onStop()`，缺少 `onStop` 时点击无效。

**③ Skill 注入内容不透出**

`injectSkillFromCommand` 把完整 SKILL.md 注入到用户消息里，直接显示会导致消息气泡出现大段 skill 指令。用 `getDisplayText` 提取原始请求：

```typescript
function getDisplayText(role: string, text: string): string {
  if (role !== 'user') return text
  const match = text.match(/^<skill name="([^"]+)">[\s\S]*?<\/skill>\n*([\s\S]*)$/)
  if (!match) return text
  const [, skillName, userRequest] = match
  const req = userRequest.trim()
  if (req && req !== `Execute the ${skillName} skill.`) return `/${skillName} ${req}`
  return `/${skillName}`
}
```

## 验收标准

- [ ] `pnpm dev` 正常启动
- [ ] `import pandas as pd; print(pd.__version__)` → 输出 pandas 版本
- [ ] 多轮变量共享：第1轮 `x = 42`，第2轮 `print(x)` → 输出 `42`
- [ ] matplotlib 图表含中文标签正常渲染，图片内联显示在 Output 标签
- [ ] 执行完毕自动切换到 Output 标签，可手动切回 Code 标签查看代码
- [ ] 流式生成中停止按钮有效
- [ ] `/skill-name` 触发后消息气泡只显示 `/skill-name [请求]`，不显示 SKILL.md 内容
- [ ] ch4 skill 功能不退化
