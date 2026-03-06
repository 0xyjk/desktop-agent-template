# 第 6 篇：Memory — 全局上下文注入

## 目标

为 agent 添加持久化全局记忆：用户在输入框工具栏点击 Brain 图标打开 Markdown 编辑器，编辑 `~/.agents/memory.md`，内容在保存后立即注入到 agent 的系统提示中，无需重启应用。

## 架构变化

在 ch5 基础上新增：

- **记忆读写层**：`server.ts` 中的 `getMemoryContent()`，每次重建 agent 时读取文件；`PUT /api/memory` 写入文件后调用 `rebuildAgent()` 使其立即生效
- **MemoryEditor 组件**：Dialog + Textarea，对话框打开时 `GET /api/memory` 加载内容，保存时 `PUT /api/memory` 写回并关闭对话框

```
用户点击 Brain 图标
    ↓ Dialog open
  GET /api/memory → 读取 ~/.agents/memory.md → setContent
    ↓ 编辑 Markdown
  PUT /api/memory → 写入 ~/.agents/memory.md → rebuildAgent()
    ↓
  ToolLoopAgent.instructions = [
    '你是一个智能助手...',
    '## 用户设置的全局上下文\n{memory.md 内容}',  ← 新增
    '{skills system prompt}'
  ]
```

**与 Skills 的区别**：Skills 是"工具包"，按需触发；Memory 是"用户画像"，始终存在于每次对话的系统提示中。

## 涉及文件

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/main/server.ts` | 修改 | 添加 `getMemoryContent()`，修改 `rebuildAgent()`，新增 `GET /PUT /api/memory` |
| `src/renderer/src/components/MemoryEditor.tsx` | 新建 | Dialog + Textarea，打开加载、保存写回 |
| `src/renderer/src/components/ChatWindow.tsx` | 修改 | 导入并在 `PromptInputTools` 中添加 `<MemoryEditor />` |

新增 Node.js 内置导入：`readFileSync`、`writeFileSync`、`mkdirSync`（来自 `fs`），`dirname`（来自 `path`）。

## 实现步骤

### 1. 修改 `src/main/server.ts`

**① 新增导入**

```typescript
import { join, dirname } from 'path'
import { homedir } from 'os'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
```

**② 添加 `getMemoryContent()`**（在 `rebuildAgent` 之前）

```typescript
function getMemoryContent(): string {
  const memPath = join(homedir(), '.agents', 'memory.md')
  try {
    return readFileSync(memPath, 'utf-8').trim()
  } catch {
    return ''
  }
}
```

文件不存在时静默返回空字符串，不影响启动。

**③ 修改 `rebuildAgent()`**

```typescript
function rebuildAgent(): void {
  const memoryContent = getMemoryContent()
  const skillsPrompt = getSkillsSystemPrompt()
  const instructions = [
    '你是一个智能助手。当可用工具能够帮助你更准确地解决用户问题时，主动调用工具。',
    memoryContent ? `## 用户设置的全局上下文\n${memoryContent}` : '',
    skillsPrompt
  ]
    .filter(Boolean)
    .join('\n\n')

  agent = new ToolLoopAgent({ model: ..., instructions, tools: ... })
}
```

`filter(Boolean)` 确保 memory 为空时不引入多余空行。

**④ 添加 API 端点**

```typescript
app.get('/api/memory', (c) => {
  return c.json({ content: getMemoryContent() })
})

app.put('/api/memory', async (c) => {
  const { content } = await c.req.json<{ content: string }>()
  const memPath = join(homedir(), '.agents', 'memory.md')
  mkdirSync(dirname(memPath), { recursive: true })
  writeFileSync(memPath, content, 'utf-8')
  rebuildAgent()
  return c.json({ ok: true })
})
```

`mkdirSync(..., { recursive: true })` 保证 `~/.agents/` 目录不存在时自动创建。

### 2. 新建 `src/renderer/src/components/MemoryEditor.tsx`

```tsx
export default function MemoryEditor() {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      fetch('http://localhost:3315/api/memory')
        .then((r) => r.json())
        .then((d) => setContent(d.content ?? ''))
        .catch(() => {})
    }
  }, [open])

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('http://localhost:3315/api/memory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      })
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <PromptInputButton tooltip="全局记忆">
          <BrainIcon className="size-4" />
        </PromptInputButton>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>全局记忆</DialogTitle></DialogHeader>
        <Textarea className="min-h-64 font-mono text-sm" value={content}
          onChange={(e) => setContent(e.target.value)} />
        <Button className="w-full" size="sm" disabled={saving} onClick={handleSave}>
          {saving ? '保存中...' : '保存'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
```

`open` 变化时触发 fetch，避免每次渲染都发请求；`saving` 状态防止重复提交。

### 3. 修改 `ChatWindow.tsx`

```tsx
import MemoryEditor from './MemoryEditor'

// PromptInputTools 中，MCPSettings 之后：
<PromptInputTools>
  <MCPSettings />
  <MemoryEditor />
  <SkillPicker ... />
</PromptInputTools>
```

## 验收标准

- [ ] `pnpm dev` 正常启动
- [ ] 工具栏出现 Brain 图标，点击弹出对话框
- [ ] 对话框打开时正确加载 `~/.agents/memory.md` 现有内容（不存在则为空）
- [ ] 编辑内容后点击保存，对话框关闭，`~/.agents/memory.md` 写入正确内容
- [ ] 保存后发送一条消息，AI 的回答体现了 memory 中设置的上下文
- [ ] memory 为空时 agent 系统提示中不出现多余空行
- [ ] `~/.agents/` 目录不存在时保存自动创建目录
- [ ] ch5 Python 执行功能不退化
