import { createMCPClient } from '@ai-sdk/mcp'
import type { ToolSet } from 'ai'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

export type MCPServerConfig = {
  name: string
  url: string
  headers?: Record<string, string>
}
export type MCPServerStatus = MCPServerConfig & {
  status: 'connecting' | 'connected' | 'error'
  toolNames: string[]
  error?: string
}

type MCPEntry = {
  client: Awaited<ReturnType<typeof createMCPClient>> | null
  tools: ToolSet
  status: MCPServerStatus
}

const entries = new Map<string, MCPEntry>()
let configPath = ''

// ---- Config read/write ----

function readConfig(): MCPServerConfig[] {
  if (!existsSync(configPath)) return []
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
    return Object.entries(raw.mcpServers ?? {}).map(([name, v]) => ({
      name,
      url: (v as { url: string; headers?: Record<string, string> }).url,
      headers: (v as { url: string; headers?: Record<string, string> }).headers
    }))
  } catch {
    return []
  }
}

function writeConfig(servers: MCPServerConfig[]): void {
  const mcpServers = Object.fromEntries(
    servers.map((s) => [s.name, { url: s.url, ...(s.headers ? { headers: s.headers } : {}) }])
  )
  writeFileSync(configPath, JSON.stringify({ mcpServers }, null, 2))
}

// ---- Connection management ----

export async function connectServer(config: MCPServerConfig): Promise<void> {
  // Mark as connecting immediately so callers can see the state
  entries.set(config.name, {
    client: null,
    tools: {},
    status: { ...config, status: 'connecting', toolNames: [] }
  })

  try {
    const client = await createMCPClient({
      transport: {
        type: 'http',
        url: config.url,
        ...(config.headers ? { headers: config.headers } : {})
      }
    })
    const tools = await client.tools()
    entries.set(config.name, {
      client,
      tools,
      status: { ...config, status: 'connected', toolNames: Object.keys(tools) }
    })
  } catch (err) {
    entries.set(config.name, {
      client: null,
      tools: {},
      status: {
        ...config,
        status: 'error',
        toolNames: [],
        error: err instanceof Error ? err.message : String(err)
      }
    })
  }
}

export async function disconnectServer(name: string): Promise<void> {
  const entry = entries.get(name)
  if (!entry) return
  try {
    await entry.client?.close()
  } finally {
    entries.delete(name)
  }
}

// ---- Tool aggregation ----

/** Merge tools from all connected servers. Later entries override earlier ones on name conflict. */
export function getAllMCPTools(): ToolSet {
  const tools: ToolSet = {}
  for (const { tools: serverTools } of entries.values()) {
    Object.assign(tools, serverTools)
  }
  return tools
}

// ---- CRUD (called by Hono API) ----

export function getServerStatuses(): MCPServerStatus[] {
  return [...entries.values()].map((e) => e.status)
}

export async function addServer(config: MCPServerConfig): Promise<void> {
  const existing = readConfig().filter((s) => s.name !== config.name)
  writeConfig([...existing, config])
  await connectServer(config)
}

export async function reconnectServer(name: string): Promise<void> {
  const configs = readConfig()
  const config = configs.find((s) => s.name === name)
  if (!config) return
  await disconnectServer(name)
  await connectServer(config)
}

export async function removeServer(name: string): Promise<void> {
  writeConfig(readConfig().filter((s) => s.name !== name))
  await disconnectServer(name)
}

// ---- Init / cleanup ----

export async function initMCP(userDataPath: string): Promise<void> {
  configPath = join(userDataPath, 'mcp.json')
  const configs = readConfig()
  await Promise.allSettled(configs.map(connectServer))
}

export async function closeMCP(): Promise<void> {
  await Promise.allSettled([...entries.keys()].map(disconnectServer))
}
