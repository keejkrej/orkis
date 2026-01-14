'use client'

import { useAgentStore } from '@/store/agent-store'
import { AgentHeader } from './agent-header'
import { AgentTabs } from './agent-tabs'

export function AgentPanel() {
  const { agents, selectedAgentId } = useAgentStore()
  const selectedAgent = agents.find((a) => a.id === selectedAgentId)

  if (!selectedAgent) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <p className="text-lg mb-2">No agent selected</p>
          <p className="text-sm">
            Create a new agent or select one from the sidebar
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <AgentHeader agent={selectedAgent} />
      <AgentTabs agent={selectedAgent} />
    </div>
  )
}
