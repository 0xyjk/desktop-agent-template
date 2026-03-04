import ChatWindow from '@renderer/components/ChatWindow'
import { TooltipProvider } from '@renderer/components/ui/tooltip'

function App(): React.ReactElement {
  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background text-foreground">
        <ChatWindow />
      </div>
    </TooltipProvider>
  )
}

export default App
