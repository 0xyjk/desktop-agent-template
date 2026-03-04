import { config } from 'dotenv'
config()

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

const provider = createOpenAICompatible({
  name: 'custom',
  apiKey: process.env.LLM_API_KEY || '',
  baseURL: process.env.LLM_BASE_URL || 'https://api.openai.com/v1'
})

let agent: ToolLoopAgent

/** Rebuild agent with current MCP tools. Called on startup and after any server add/remove. */
function rebuildAgent(): void {
  agent = new ToolLoopAgent({
    model: provider(process.env.LLM_MODEL || ''),
    system: '你是一个智能助手。当可用工具能够帮助你更准确地解决用户问题时，主动调用工具。',
    tools: { shell: shellTool, ...getAllMCPTools() }
  })
}

const app = new Hono()
app.use('/api/*', cors())

app.post('/api/chat', async (c) => {
  const { messages }: { messages: UIMessage[] } = await c.req.json()
  return createAgentUIStreamResponse({ agent, uiMessages: messages })
})

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
  rebuildAgent()

  return new Promise((resolve) => {
    serve({ fetch: app.fetch, port }, (info) => {
      console.log(`Hono server running on http://localhost:${info.port}`)
      resolve(info.port)
    })
  })
}

export { closeMCP }
