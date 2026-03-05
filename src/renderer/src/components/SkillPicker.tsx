import { useEffect, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@renderer/components/ui/command'
import { PromptInputButton } from '@renderer/components/ai-elements/prompt-input'

const API_URL = 'http://localhost:3315'

type Skill = { name: string; description: string }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-fill the search box (e.g. chars typed after "/" in textarea) */
  initialQuery?: string
  onSelect: (name: string) => void
}

export default function SkillPicker({ open, onOpenChange, initialQuery = '', onSelect }: Props) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [search, setSearch] = useState(initialQuery)

  // Sync search input when picker opens or initialQuery changes
  useEffect(() => {
    if (open) setSearch(initialQuery)
  }, [open, initialQuery])

  useEffect(() => {
    fetch(`${API_URL}/api/skills`)
      .then((r) => r.json())
      .then(setSkills)
      .catch(() => {})
  }, [])

  const handleSelect = (name: string) => {
    onSelect(name)
    onOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <PromptInputButton tooltip={{ content: 'Skills', shortcut: '/' }}>
          <span className="font-mono text-sm font-semibold">/</span>
        </PromptInputButton>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Search skills..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No skills found.</CommandEmpty>
            <CommandGroup heading="Skills">
              {skills.map((skill) => (
                <CommandItem
                  key={skill.name}
                  value={skill.name}
                  onSelect={() => handleSelect(skill.name)}
                >
                  <span className="whitespace-nowrap font-mono text-blue-400">/{skill.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
