import { tool } from 'ai'
import { z } from 'zod'
import { execFile } from 'child_process'

/** Cross-platform shell selection */
function getShellConfig(): { shell: string; flag: string } {
  if (process.platform === 'win32') {
    return { shell: 'powershell.exe', flag: '-Command' }
  }
  return { shell: process.env.SHELL || '/bin/bash', flag: '-lc' }
}

/** Execute a shell command with timeout and output truncation */
function executeCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  const { shell, flag } = getShellConfig()

  // Windows PowerShell UTF-8 encoding
  const finalCommand =
    process.platform === 'win32'
      ? `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; ${command}`
      : command

  return new Promise((resolve) => {
    execFile(shell, [flag, finalCommand], { timeout: 30_000 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout.slice(0, 5000),
        stderr: error ? (stderr || error.message).slice(0, 2000) : stderr.slice(0, 2000)
      })
    })
  })
}

export const shellTool = tool({
  description:
    "Execute a shell command on the user's system. Use this to run commands, check files, install packages, etc.",
  inputSchema: z.object({
    command: z.string().describe('The shell command to execute')
  }),
  execute: async ({ command }) => {
    return await executeCommand(command)
  }
})
