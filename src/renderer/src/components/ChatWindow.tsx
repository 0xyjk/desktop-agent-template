import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { PromptInputMessage } from '@renderer/components/ai-elements/prompt-input'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton
} from '@renderer/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@renderer/components/ai-elements/message'
import { Terminal } from '@renderer/components/ai-elements/terminal'
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  getStatusBadge
} from '@renderer/components/ai-elements/tool'
import { Spinner } from '@renderer/components/ui/spinner'
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit
} from '@renderer/components/ai-elements/prompt-input'
import MCPSettings from './MCPSettings'
import { useCallback, useState } from 'react'

const API_URL = 'http://localhost:3315/api/chat'

export default function ChatWindow() {
  const [text, setText] = useState('')

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: API_URL })
  })

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      if (!message.text?.trim()) return
      sendMessage({ text: message.text })
      setText('')
    },
    [sendMessage]
  )

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value),
    []
  )

  const isStreaming = status === 'streaming' || status === 'submitted'
  const lastMsg = messages.at(-1)
  const showSpinner =
    isStreaming && !(lastMsg?.role === 'assistant' && lastMsg.parts.at(-1)?.type === 'text')

  return (
    <div className="relative flex size-full flex-col divide-y overflow-hidden">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 && !isStreaming ? (
            <ConversationEmptyState
              title="开始和 AI 对话吧"
              description="在下方输入消息，按回车发送"
            />
          ) : (
            <>
              {messages.map((message, index) => {
                const isLastAssistant =
                  message.role === 'assistant' && index === messages.length - 1 && isStreaming

                return (
                  <Message key={message.id} from={message.role}>
                    <MessageContent>
                      {message.parts.map((part, i) => {
                        switch (part.type) {
                          case 'text':
                            return (
                              <MessageResponse
                                key={`${message.id}-${i}`}
                                mode={isLastAssistant ? 'streaming' : 'static'}
                                animated={isLastAssistant}
                              >
                                {part.text}
                              </MessageResponse>
                            )
                          case 'tool-shell': {
                            const isRunning =
                              part.state === 'input-available' ||
                              part.state === 'input-streaming'
                            const output = part.output as
                              | { stdout?: string; stderr?: string }
                              | undefined
                            const terminalOutput = part.errorText
                              ? `Error: ${part.errorText}`
                              : output?.stderr
                                ? `${output.stdout ?? ''}\n\nstderr:\n${output.stderr}`
                                : (output?.stdout ?? '')
                            return (
                              <Terminal
                                key={`${message.id}-${i}`}
                                output={terminalOutput}
                                isStreaming={isRunning}
                              >
                                <div className="flex items-center justify-between border-zinc-800 border-b px-4 py-2">
                                  <code className="text-xs text-zinc-300">
                                    $ {(part.input as { command?: string })?.command ?? 'shell'}
                                  </code>
                                  {getStatusBadge(part.state)}
                                </div>
                                {!isRunning && terminalOutput && (
                                  <div className="max-h-64 overflow-auto p-4 font-mono text-xs leading-relaxed">
                                    <pre className="whitespace-pre-wrap break-words text-zinc-100">
                                      {terminalOutput}
                                    </pre>
                                  </div>
                                )}
                              </Terminal>
                            )
                          }
                          case 'dynamic-tool':
                            return (
                              <Tool key={`${message.id}-${i}`}>
                                <ToolHeader
                                  type={part.type}
                                  state={part.state}
                                  toolName={part.toolName}
                                />
                                <ToolContent>
                                  <ToolInput input={part.input} />
                                  <ToolOutput output={part.output} errorText={part.errorText} />
                                </ToolContent>
                              </Tool>
                            )
                          default:
                            return null
                        }
                      })}
                    </MessageContent>
                  </Message>
                )
              })}
              {showSpinner && <Spinner />}
            </>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 px-4 py-4">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              value={text}
              onChange={handleTextChange}
              placeholder="输入消息..."
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <MCPSettings />
            </PromptInputTools>
            <PromptInputSubmit status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
