import { tool } from 'ai'
import type { UIMessage } from 'ai'
import { z } from 'zod'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

type SkillMeta = {
  name: string
  description: string
  /** Absolute path to the SKILL.md file */
  contentPath: string
}

let loaded: SkillMeta[] = []

/** Minimal YAML frontmatter parser — handles simple `key: value` lines only. */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}

  const result: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    if (key) result[key] = value
  }
  return result
}

/**
 * Scan a directory for skills and cache their metadata.
 * Creates the directory if it doesn't exist.
 */
export function initSkills(skillsDir: string): void {
  mkdirSync(skillsDir, { recursive: true })
  loaded = []

  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const skillFile = join(skillsDir, entry.name, 'SKILL.md')
    if (!existsSync(skillFile)) continue

    const content = readFileSync(skillFile, 'utf-8')
    const meta = parseFrontmatter(content)
    if (meta.name && meta.description) {
      loaded.push({ name: meta.name, description: meta.description, contentPath: skillFile })
    }
  }

  console.log(`Skills loaded: ${loaded.map((s) => s.name).join(', ') || '(none)'}`)
}

/**
 * Returns a system prompt section listing available skills.
 * Returns an empty string if no skills are loaded.
 */
export function getSkillsSystemPrompt(): string {
  if (loaded.length === 0) return ''

  const list = loaded.map((s) => `- **${s.name}**: ${s.description}`).join('\n')
  return [
    '## Available Skills',
    'Use the `use_skill` tool to load full instructions for a skill before performing a skill-based task.',
    list
  ].join('\n')
}

/**
 * Tool: load the full SKILL.md content for a given skill.
 * The agent calls this to get detailed instructions before executing a skill.
 */
export const useSkillTool = tool({
  description:
    'Load full instructions for a skill by name. Call this before performing a skill-based task.',
  inputSchema: z.object({
    name: z.string().describe('The skill name to load')
  }),
  execute: async ({ name }) => {
    const skill = loaded.find((s) => s.name === name)
    if (!skill) {
      const available = loaded.map((s) => s.name).join(', ')
      return { error: `Skill "${name}" not found. Available: ${available || 'none'}` }
    }
    return { content: readFileSync(skill.contentPath, 'utf-8') }
  }
})

/** Return a flat list of skill metadata for API consumers (e.g. frontend autocomplete). */
export function getSkillsList(): { name: string; description: string }[] {
  return loaded.map(({ name, description }) => ({ name, description }))
}

/**
 * If the last user message starts with /skill-name, inject the full SKILL.md
 * content directly into the message so the agent receives instructions without
 * needing to call use_skill.
 */
export function injectSkillFromCommand(messages: UIMessage[]): UIMessage[] {
  let lastUserIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIdx = i
      break
    }
  }
  if (lastUserIdx === -1) return messages

  const msg = messages[lastUserIdx]
  const textPart = msg.parts.find((p) => p.type === 'text') as
    | { type: 'text'; text: string }
    | undefined
  if (!textPart) return messages

  // Match /skill-name followed by optional request text
  const match = textPart.text.match(/^\/([a-z][a-z0-9-]*)[ \t]*([\s\S]*)$/)
  if (!match) return messages

  const skill = loaded.find((s) => s.name === match[1])
  if (!skill) return messages

  const skillContent = readFileSync(skill.contentPath, 'utf-8')
  const userRequest = match[2].trim()
  const enriched = [
    `<skill name="${match[1]}">`,
    skillContent,
    `</skill>`,
    '',
    userRequest || `Execute the ${match[1]} skill.`
  ].join('\n')

  const updated = [...messages]
  updated[lastUserIdx] = {
    ...msg,
    parts: msg.parts.map((p) => (p.type === 'text' ? { ...p, text: enriched } : p))
  } as UIMessage
  return updated
}
