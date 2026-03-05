# 第 4 篇：Skills — 模块化能力包

## 目标

为 agent 添加 Skills 支持：将领域指令放在 `~/.agents/skills/` 目录下，agent 启动时自动加载；用户可通过 `/skill-name` 斜杠命令主动触发，无需修改代码即可扩展 agent 行为。

## 架构变化

在 ch3 基础上新增：

- **Skills 加载层**：`src/main/skills.ts`，扫描 `~/.agents/skills/`，缓存 name + description 元数据
- **两种触发方式**：被动（agent 自主调用 `use_skill` 工具）和主动（用户输入 `/skill-name`，消息预处理直接注入）
- **SkillPicker UI**：`/` 按钮 + Popover + Command 组件，支持鼠标点击和键盘输入两种方式触发

```
~/.agents/skills/my-skill/SKILL.md  ← name + description（frontmatter）+ 指令（正文）

skills.ts → getSkillsSystemPrompt()    → 注入 instructions（被动触发入口）
          → useSkillTool               → agent 按需读取完整 SKILL.md
          → injectSkillFromCommand     → 主动触发：发送前直接注入完整内容
          → getSkillsList()            → GET /api/skills（供前端列表）
```

**渐进式披露**：启动时只加载 name + description（~100 tokens/skill），完整指令按需读取。

## 涉及文件

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/main/skills.ts` | 新建 | skill 扫描、system prompt、`use_skill` 工具、slash 注入 |
| `src/main/server.ts` | 修改 | 初始化 skills、`GET /api/skills`、chat 消息预处理 |
| `src/renderer/src/components/SkillPicker.tsx` | 新建 | Popover + Command 选择器 |
| `src/renderer/src/components/ChatWindow.tsx` | 修改 | 集成 SkillPicker，检测 `/` 自动弹出 |

无需新增依赖，只用 Node.js 内置的 `fs` 和 `os` 模块。

## 实现步骤

### 1. SKILL.md 格式

```markdown
---
name: my-skill
description: What this skill does and when to use it.
---

# My Skill

## Instructions
1. Step one...
```

`name` 小写字母 + 连字符，与目录名一致；`description` 决定 agent 是否自主触发该 skill。

### 2. 创建 `src/main/skills.ts`

四个导出：`initSkills`（扫描目录）、`getSkillsSystemPrompt`（生成 instructions 片段）、`useSkillTool`（被动触发工具）、`injectSkillFromCommand`（主动触发预处理）。

`injectSkillFromCommand` 是核心：检测最后一条 user 消息是否以 `/skill-name` 开头，若匹配则将完整 SKILL.md 注入到消息的 text part 中：

```typescript
const match = textPart.text.match(/^\/([a-z][a-z0-9-]*)[ \t]*([\s\S]*)$/)
// enriched = <skill name="..."> + SKILL.md 内容 + </skill> + 用户请求
updated[lastUserIdx] = {
  ...msg,
  parts: msg.parts.map((p) => (p.type === 'text' ? { ...p, text: enriched } : p))
} as UIMessage
```

### 3. 修改 `src/main/server.ts`

```typescript
import { homedir } from 'os'

function rebuildAgent(): void {
  agent = new ToolLoopAgent({
    model: provider(process.env.LLM_MODEL || ''),
    instructions: ['你是一个智能助手...', getSkillsSystemPrompt()].filter(Boolean).join('\n\n'),
    tools: { shell: shellTool, use_skill: useSkillTool, ...getAllMCPTools() }
  })
}

app.get('/api/skills', (c) => c.json(getSkillsList()))

app.post('/api/chat', async (c) => {
  const { messages }: { messages: UIMessage[] } = await c.req.json()
  return createAgentUIStreamResponse({ agent, uiMessages: injectSkillFromCommand(messages) })
})

// startServer 中：
initSkills(join(homedir(), '.agents', 'skills'))
```

注意：AI SDK v6 用 `instructions`，不是 `system`。

### 4. 新建 `SkillPicker.tsx` + 修改 `ChatWindow.tsx`

`SkillPicker` 以 `PromptInputButton`（`/`）为触发器，内置 shadcn `Command` 搜索。

```tsx
// ChatWindow.tsx
const slashMatch = text.match(/^\/([a-z0-9-]*)$/)
const [skillPickerOpen, setSkillPickerOpen] = useState(false)

useEffect(() => { setSkillPickerOpen(!!slashMatch) }, [!!slashMatch])

// PromptInputTools 中：
<SkillPicker
  open={skillPickerOpen}
  onOpenChange={setSkillPickerOpen}
  initialQuery={slashMatch?.[1] ?? ''}
  onSelect={(name) => { setText(`/${name} `); setSkillPickerOpen(false) }}
/>
```

## 验收标准

- [ ] `pnpm dev` 正常启动，控制台输出 `Skills loaded: ...`
- [ ] 点击 `/` 按钮或输入框输入 `/` → SkillPicker 弹出，输入字母实时过滤
- [ ] 选中 skill → 填入 `/skill-name `，追加请求内容后发送 → agent 直接按 skill 指令响应
- [ ] `~/.agents/skills/` 新增 skill → 重启后自动出现
- [ ] `~/.agents/skills/` 不存在时正常启动（自动创建）
- [ ] ch3 MCP 功能不退化
