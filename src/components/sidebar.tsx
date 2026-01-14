'use client'

import { useState } from 'react'
import { Plus, Bot, Cpu } from 'lucide-react'
import { useAgentStore, Agent, AgentConfig } from '@/store/agent-store'
import { NewAgentDialog } from './new-agent-dialog'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const { agents, selectedAgentId, selectAgent, startAgent } = useAgentStore()
  const [showNewDialog, setShowNewDialog] = useState(false)

  const handleCreateAgent = async (config: AgentConfig) => {
    await startAgent(config)
    setShowNewDialog(false)
  }

  return (
    <div className="w-64 border-r bg-muted/30 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <button
          onClick={() => setShowNewDialog(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Agent</span>
        </button>
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto p-2">
        {agents.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            No agents running
          </div>
        ) : (
          <div className="space-y-1">
            {agents.map((agent) => (
              <AgentListItem
                key={agent.id}
                agent={agent}
                isSelected={agent.id === selectedAgentId}
                onClick={() => selectAgent(agent.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* New Agent Dialog */}
      <NewAgentDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onCreate={handleCreateAgent}
      />
    </div>
  )
}

function AgentListItem({
  agent,
  isSelected,
  onClick,
}: {
  agent: Agent
  isSelected: boolean
  onClick: () => void
}) {
  const statusColors = {
    idle: 'bg-yellow-500',
    running: 'bg-green-500 animate-pulse',
    stopped: 'bg-gray-500',
    error: 'bg-red-500',
  }

  const Icon = agent.agent_type === 'claude-code' ? Bot : Cpu

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors',
        isSelected
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
      )}
    >
      <div className="relative">
        <Icon
          className={cn(
            'w-5 h-5',
            agent.agent_type === 'claude-code'
              ? 'text-claude'
              : 'text-codex'
          )}
        />
        <div
          className={cn(
            'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-background',
            statusColors[agent.status]
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{agent.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {agent.git_info?.branch || 'No branch'}
        </div>
      </div>
    </button>
  )
}
