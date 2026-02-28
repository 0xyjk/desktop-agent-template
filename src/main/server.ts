import { config } from 'dotenv'
config()

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { streamText, UIMessage, convertToModelMessages } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

// 创建 OpenAI 兼容的 provider
// 可通过环境变量切换不同 provider（DeepSeek、Ollama 等）
const provider = createOpenAICompatible({
  name: 'custom',
  apiKey: process.env.LLM_API_KEY || '',
  baseURL: process.env.LLM_BASE_URL || 'https://api.openai.com/v1'
})

const app = new Hono()

// 允许来自渲染进程的跨域请求
app.use('/api/*', cors())

// 聊天 API 端点
app.post('/api/chat', async (c) => {
  const { messages }: { messages: UIMessage[] } = await c.req.json()

  const result = streamText({
    model: provider(process.env.LLM_MODEL || ''),
    system: 'You are a helpful assistant.',
    messages: await convertToModelMessages(messages)
  })

  return result.toUIMessageStreamResponse()
})

// 启动服务器并返回实际监听的端口
export function startServer(port = 3315): Promise<number> {
  return new Promise((resolve) => {
    serve(
      {
        fetch: app.fetch,
        port
      },
      (info) => {
        console.log(`Hono server running on http://localhost:${info.port}`)
        resolve(info.port)
      }
    )
  })
}
