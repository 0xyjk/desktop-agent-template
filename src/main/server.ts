import { config } from 'dotenv'
config()

import { join } from 'path'
import { homedir } from 'os'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { ToolLoopAgent, createAgentUIStreamResponse, UIMessage } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { shellTool } from './tools/shell'
import {
  initMCP,
  closeMCP,
  getAllMCPTools,
  getServerStatuses,
  addServer,
  removeServer,
  reconnectServer
} from './mcp'
import { initSkills, getSkillsSystemPrompt, useSkillTool, getSkillsList, injectSkillFromCommand } from './skills'
import { pythonKernelTool, closeKernel } from './tools/python_kernel'

const provider = createOpenAICompatible({
  name: 'custom',
  apiKey: process.env.LLM_API_KEY || '',
  baseURL: process.env.LLM_BASE_URL || 'https://api.openai.com/v1'
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let agent: ToolLoopAgent<any, any, any>

/** Rebuild agent with current tools and instructions. Called on startup and after MCP changes. */
function rebuildAgent(): void {
  const skillsPrompt = getSkillsSystemPrompt()
  const instructions = [
    '你是一个智能助手。当可用工具能够帮助你更准确地解决用户问题时，主动调用工具。',
    skillsPrompt
  ]
    .filter(Boolean)
    .join('\n\n')

  agent = new ToolLoopAgent({
    model: provider(process.env.LLM_MODEL || ''),
    instructions,
    tools: { shell: shellTool, use_skill: useSkillTool, execute_python: pythonKernelTool, ...getAllMCPTools() }
  })
}

const app = new Hono()
app.use('/api/*', cors())

app.post('/api/chat', async (c) => {
  const { messages }: { messages: UIMessage[] } = await c.req.json()
  return createAgentUIStreamResponse({ agent, uiMessages: injectSkillFromCommand(messages) })
})

app.get('/api/skills', (c) => c.json(getSkillsList()))

// MCP management API
app.get('/api/mcp/servers', (c) => c.json(getServerStatuses()))

app.post('/api/mcp/servers', async (c) => {
  const { name, url, headers } = await c.req.json<{
    name: string
    url: string
    headers?: Record<string, string>
  }>()
  await addServer({ name, url, ...(headers ? { headers } : {}) })
  rebuildAgent()
  return c.json({ ok: true })
})

app.delete('/api/mcp/servers/:name', async (c) => {
  await removeServer(c.req.param('name'))
  rebuildAgent()
  return c.json({ ok: true })
})

app.post('/api/mcp/servers/:name/reconnect', async (c) => {
  await reconnectServer(c.req.param('name'))
  rebuildAgent()
  return c.json({ ok: true })
})

export async function startServer(port = 3315, userDataPath: string): Promise<number> {
  await initMCP(userDataPath)

  // Load skills from ~/.agents/skills
  initSkills(join(homedir(), '.agents', 'skills'))

  rebuildAgent()

  return new Promise((resolve) => {
    serve({ fetch: app.fetch, port }, (info) => {
      console.log(`Hono server running on http://localhost:${info.port}`)
      resolve(info.port)
    })
  })
}

export { closeMCP, closeKernel }
