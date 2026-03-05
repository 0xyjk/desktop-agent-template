import { useEffect, useState } from 'react'
import type { ToolUIPart } from 'ai'
import {
  Sandbox,
  SandboxContent,
  SandboxHeader,
  SandboxTabContent,
  SandboxTabs,
  SandboxTabsBar,
  SandboxTabsList,
  SandboxTabsTrigger
} from '@renderer/components/ai-elements/sandbox'
import { CodeBlockContent } from '@renderer/components/ai-elements/code-block'

type KernelOutput = {
  stdout?: string
  stderr?: string
  images?: string[]
  error?: string | null
}

type Props = {
  code: string
  output?: KernelOutput
  state: ToolUIPart['state']
}

export default function PythonResult({ code, output, state }: Props) {
  const isRunning = state === 'input-available' || state === 'input-streaming'

  const textOutput = output?.error
    ? `Error:\n${output.error}`
    : [output?.stdout, output?.stderr ? `stderr:\n${output.stderr}` : ''].filter(Boolean).join('\n')

  const hasOutput = !isRunning && (textOutput || (output?.images?.length ?? 0) > 0)

  const [tab, setTab] = useState<'code' | 'output'>('code')

  useEffect(() => {
    if (hasOutput) setTab('output')
  }, [hasOutput])

  return (
    <Sandbox>
      <SandboxHeader title="Python" state={state} />
      <SandboxContent>
        <SandboxTabs value={tab} onValueChange={(v) => setTab(v as 'code' | 'output')}>
          <SandboxTabsBar>
            <SandboxTabsList>
              <SandboxTabsTrigger value="code">Code</SandboxTabsTrigger>
              <SandboxTabsTrigger value="output">Output</SandboxTabsTrigger>
            </SandboxTabsList>
          </SandboxTabsBar>
          <SandboxTabContent value="code">
            <CodeBlockContent code={code} language="python" showLineNumbers />
          </SandboxTabContent>
          <SandboxTabContent value="output">
            {isRunning ? (
              <div className="p-4 font-mono text-xs text-muted-foreground animate-pulse">
                Running...
              </div>
            ) : (
              <>
                {textOutput && (
                  <pre className="max-h-64 overflow-auto p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
                    {textOutput}
                  </pre>
                )}
                {output?.images?.map((img, idx) => (
                  <img
                    key={idx}
                    src={`data:image/png;base64,${img}`}
                    alt="Python output"
                    className="max-w-full border-t border-border"
                  />
                ))}
                {!textOutput && !output?.images?.length && (
                  <div className="p-4 text-xs text-muted-foreground">(no output)</div>
                )}
              </>
            )}
          </SandboxTabContent>
        </SandboxTabs>
      </SandboxContent>
    </Sandbox>
  )
}
