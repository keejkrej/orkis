'use client'

import { useState } from 'react'
import { MessageSquare, FileText, Code, Activity } from 'lucide-react'
import { Agent } from '@/store/agent-store'
import { cn } from '@/lib/utils'
import { MessagesTab } from './tabs/messages-tab'
import { PlansTab } from './tabs/plans-tab'
import { CodeChangesTab } from './tabs/code-changes-tab'
import { ActivityTab } from './tabs/activity-tab'

type TabId = 'messages' | 'plans' | 'code-changes' | 'activity'

interface Tab {
  id: TabId
  label: string
  icon: typeof MessageSquare
}

const tabs: Tab[] = [
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'plans', label: 'Plans', icon: FileText },
  { id: 'code-changes', label: 'Code Changes', icon: Code },
  { id: 'activity', label: 'Activity', icon: Activity },
]

interface AgentTabsProps {
  agent: Agent
}

export function AgentTabs({ agent }: AgentTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('messages')

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab Headers */}
      <div className="border-b flex">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const count = getTabCount(tab.id, agent)

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {count > 0 && (
                <span className="px-1.5 py-0.5 text-xs bg-muted rounded-full">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'messages' && <MessagesTab agent={agent} />}
        {activeTab === 'plans' && <PlansTab agent={agent} />}
        {activeTab === 'code-changes' && <CodeChangesTab agent={agent} />}
        {activeTab === 'activity' && <ActivityTab agent={agent} />}
      </div>
    </div>
  )
}

function getTabCount(tabId: TabId, agent: Agent): number {
  switch (tabId) {
    case 'messages':
      return agent.messages.length
    case 'plans':
      return agent.plans.length
    case 'code-changes':
      return agent.code_changes.length
    case 'activity':
      return agent.messages.filter((m) => m.message_type === 'tool').length
    default:
      return 0
  }
}
