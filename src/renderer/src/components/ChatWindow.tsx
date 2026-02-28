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
import { Spinner } from '@renderer/components/ui/spinner'
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit
} from '@renderer/components/ai-elements/prompt-input'
import { useCallback, useState } from 'react'

// Hono 服务器地址
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

  return (
    <div className="relative flex size-full flex-col divide-y overflow-hidden">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="开始和 AI 对话吧"
              description="在下方输入消息，按回车发送"
            />
          ) : (
            <>
              {messages.map((message, index) => {
                // 最后一条 assistant 消息 + 正在流式输出时，启用 streaming 模式和动画
                const isLastAssistant =
                  message.role === 'assistant' && index === messages.length - 1 && isStreaming

                return (
                  <Message key={message.id} from={message.role}>
                    <MessageContent>
                      {message.parts.map((part, i) =>
                        part.type === 'text' ? (
                          <MessageResponse
                            key={`${message.id}-${i}`}
                            mode={isLastAssistant ? 'streaming' : 'static'}
                            animated={isLastAssistant}
                          >
                            {part.text}
                          </MessageResponse>
                        ) : null
                      )}
                    </MessageContent>
                  </Message>
                )
              })}
              {/* 已提交但 AI 尚未开始回复时，显示加载指示器 */}
              {status === 'submitted' && (
                <Message from="assistant">
                  <MessageContent>
                    <Spinner />
                  </MessageContent>
                </Message>
              )}
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
            <PromptInputTools />
            <PromptInputSubmit status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
