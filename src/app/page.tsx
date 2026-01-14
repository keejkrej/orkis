'use client'

import { useEffect } from 'react'
import { Sidebar } from '@/components/sidebar'
import { AgentPanel } from '@/components/agent-panel'
import { Titlebar } from '@/components/titlebar'
import { useAgentStore } from '@/store/agent-store'

export default function Home() {
  const { connect, connected } = useAgentStore()

  useEffect(() => {
    // Connect to the agent runtime on mount
    connect()
  }, [connect])

  return (
    <div className="flex flex-col h-screen">
      <Titlebar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          {connected ? (
            <AgentPanel />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Connecting to agent runtime...
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
