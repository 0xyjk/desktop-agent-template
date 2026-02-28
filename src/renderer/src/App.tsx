import ChatWindow from '@renderer/components/ChatWindow'

function App(): React.ReactElement {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <ChatWindow />
    </div>
  )
}

export default App
