import { tool } from 'ai'
import { z } from 'zod'
import { spawn, ChildProcess } from 'child_process'
import { createInterface, Interface } from 'readline'
import { join } from 'path'

type ExecuteResult = {
  stdout: string
  stderr: string
  images: string[]
  error: string | null
}

let kernelProcess: ChildProcess | null = null
let rl: Interface | null = null
let pendingResolve: ((result: ExecuteResult) => void) | null = null
let isReady = false

function getScriptPath(): string {
  // In electron-vite: dev → out/main/__dirname, prod → process.resourcesPath
  if (process.env.NODE_ENV === 'development' || !('resourcesPath' in process)) {
    return join(__dirname, '../../resources/kernel_server.py')
  }
  return join((process as NodeJS.Process & { resourcesPath: string }).resourcesPath, 'kernel_server.py')
}

function startKernel(): Promise<void> {
  return new Promise((resolve, reject) => {
    kernelProcess = spawn('python3', [getScriptPath()])

    rl = createInterface({ input: kernelProcess.stdout! })

    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line) as { status?: string } & ExecuteResult
        if (msg.status === 'ready') {
          isReady = true
          resolve()
        } else if (pendingResolve) {
          pendingResolve(msg as ExecuteResult)
          pendingResolve = null
        }
      } catch {
        // ignore non-JSON lines (e.g. Python warnings)
      }
    })

    kernelProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[kernel]', data.toString())
    })

    kernelProcess.on('error', (err) => {
      console.error('[kernel] failed to start:', err.message)
      reject(err)
    })

    kernelProcess.on('exit', () => {
      kernelProcess = null
      rl = null
      isReady = false
    })
  })
}

function executeCode(code: string): Promise<ExecuteResult> {
  return new Promise((resolve) => {
    pendingResolve = resolve
    kernelProcess!.stdin!.write(JSON.stringify({ code }) + '\n')
  })
}

export const pythonKernelTool = tool({
  description:
    'Execute Python code in a persistent IPython kernel. Variables and imports persist across calls within the same session. Returns text output and base64-encoded PNG images (e.g. matplotlib charts). Use for data analysis, computation, and visualization.',
  inputSchema: z.object({
    code: z.string().describe('Python code to execute')
  }),
  execute: async ({ code }) => {
    if (!kernelProcess || !isReady) {
      await startKernel()
    }
    return await executeCode(code)
  }
})

export function closeKernel(): void {
  kernelProcess?.kill()
  kernelProcess = null
  rl = null
  isReady = false
}
