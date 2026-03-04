import { useState, useEffect, useCallback } from 'react'
import {
  SettingsIcon,
  Trash2Icon,
  PlusIcon,
  CircleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RefreshCwIcon
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { PromptInputButton } from '@renderer/components/ai-elements/prompt-input'
import { Badge } from '@renderer/components/ui/badge'
import { ScrollArea } from '@renderer/components/ui/scroll-area'

const API = 'http://localhost:3315/api/mcp'

type HeaderRow = { key: string; value: string }

type ServerStatus = {
  name: string
  url: string
  status: 'connecting' | 'connected' | 'error'
  toolNames: string[]
  error?: string
}

const statusIcon = {
  connecting: <CircleIcon className="size-3 animate-pulse text-yellow-500" />,
  connected: <CheckCircleIcon className="size-3 text-green-500" />,
  error: <XCircleIcon className="size-3 text-red-500" />
}

export default function MCPSettings() {
  const [servers, setServers] = useState<ServerStatus[]>([])
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>([])
  const [showHeaders, setShowHeaders] = useState(false)
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch(`${API}/servers`)
      setServers(await res.json())
    } catch {
      // server may not be ready yet
    }
  }, [])

  useEffect(() => {
    if (open) fetchServers()
  }, [open, fetchServers])

  const updateHeaderRow = (index: number, field: 'key' | 'value', val: string) => {
    setHeaderRows((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: val } : r)))
  }

  const removeHeaderRow = (index: number) => {
    setHeaderRows((rows) => rows.filter((_, i) => i !== index))
  }

  const buildHeaders = (): Record<string, string> | undefined => {
    const entries = headerRows.filter((r) => r.key.trim())
    if (entries.length === 0) return undefined
    return Object.fromEntries(entries.map((r) => [r.key.trim(), r.value]))
  }

  const handleAdd = async () => {
    if (!name.trim() || !url.trim()) return
    setAdding(true)
    try {
      await fetch(`${API}/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), url: url.trim(), headers: buildHeaders() })
      })
      setName('')
      setUrl('')
      setHeaderRows([])
      setShowHeaders(false)
      await fetchServers()
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (serverName: string) => {
    await fetch(`${API}/servers/${encodeURIComponent(serverName)}`, { method: 'DELETE' })
    await fetchServers()
  }

  const handleReconnect = async (serverName: string) => {
    await fetch(`${API}/servers/${encodeURIComponent(serverName)}/reconnect`, { method: 'POST' })
    await fetchServers()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <PromptInputButton tooltip="MCP 服务器">
          <SettingsIcon className="size-4" />
        </PromptInputButton>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>MCP 服务器</DialogTitle>
        </DialogHeader>

        {/* 服务器列表 */}
        <ScrollArea className="max-h-56">
          {servers.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground text-sm">暂无服务器</p>
          ) : (
            <div className="space-y-2 px-1">
              {servers.map((s) => (
                <div key={s.name} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {statusIcon[s.status]}
                      <span className="truncate font-medium text-sm">{s.name}</span>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => handleReconnect(s.name)}
                      >
                        <RefreshCwIcon className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => handleRemove(s.name)}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1 truncate text-muted-foreground text-xs">{s.url}</p>
                  {s.status === 'connected' && s.toolNames.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {s.toolNames.map((t) => (
                        <Badge key={t} className="text-xs" variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {s.status === 'error' && (
                    <p className="mt-1 text-destructive text-xs">{s.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* 添加服务器表单 */}
        <div className="space-y-2 border-t pt-4">
          <Input
            placeholder="服务器名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="URL（如 https://my-mcp.com/mcp）"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />

          {/* 请求头（可折叠） */}
          <button
            type="button"
            className="flex w-full items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
            onClick={() => setShowHeaders((v) => !v)}
          >
            {showHeaders ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
            请求头（可选）
          </button>

          {showHeaders && (
            <div className="space-y-1.5 rounded-md border p-2">
              {headerRows.map((row, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    className="h-7 text-xs"
                    placeholder="键（如 Authorization）"
                    value={row.key}
                    onChange={(e) => updateHeaderRow(i, 'key', e.target.value)}
                  />
                  <Input
                    className="h-7 text-xs"
                    placeholder="值"
                    value={row.value}
                    onChange={(e) => updateHeaderRow(i, 'value', e.target.value)}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    onClick={() => removeHeaderRow(i)}
                  >
                    <Trash2Icon className="size-3" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-full text-xs"
                onClick={() => setHeaderRows((rows) => [...rows, { key: '', value: '' }])}
              >
                <PlusIcon className="mr-1 size-3" />
                添加请求头
              </Button>
            </div>
          )}

          <Button className="w-full" size="sm" disabled={adding} onClick={handleAdd}>
            <PlusIcon className="mr-2 size-4" />
            {adding ? '连接中...' : '添加服务器'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
