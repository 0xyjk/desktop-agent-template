import { useState, useEffect, useCallback } from 'react'
import { BrainIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { PromptInputButton } from '@renderer/components/ai-elements/prompt-input'

const API = 'http://localhost:3315/api/memory'

export default function MemoryEditor() {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchMemory = useCallback(async () => {
    try {
      const res = await fetch(API)
      const data = await res.json()
      setContent(data.content ?? '')
    } catch {
      // server may not be ready yet
    }
  }, [])

  useEffect(() => {
    if (open) fetchMemory()
  }, [open, fetchMemory])

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch(API, {
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
        <DialogHeader>
          <DialogTitle>全局记忆</DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-xs">
          编辑 Markdown 内容，保存后将自动注入到 AI 的系统提示中。
        </p>

        <Textarea
          className="min-h-64 font-mono text-sm"
          placeholder="在此输入全局上下文，例如：你的偏好、背景信息、常用约定..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        <Button className="w-full" size="sm" disabled={saving} onClick={handleSave}>
          {saving ? '保存中...' : '保存'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
