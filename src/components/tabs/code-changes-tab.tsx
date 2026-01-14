'use client'

import { FileCode, Plus, Minus, Clock } from 'lucide-react'
import { Agent } from '@/store/agent-store'
import { cn } from '@/lib/utils'

interface CodeChangesTabProps {
  agent: Agent
}

export function CodeChangesTab({ agent }: CodeChangesTabProps) {
  if (agent.code_changes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <FileCode className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No code changes yet</p>
          <p className="text-sm mt-1">
            Changes will appear when the agent modifies files
          </p>
        </div>
      </div>
    )
  }

  // Group changes by file
  const changesByFile = agent.code_changes.reduce(
    (acc, change) => {
      if (!acc[change.file_path]) {
        acc[change.file_path] = []
      }
      acc[change.file_path].push(change)
      return acc
    },
    {} as Record<string, typeof agent.code_changes>
  )

  // Calculate totals per file
  const fileSummaries = Object.entries(changesByFile).map(([path, changes]) => ({
    path,
    totalAdded: changes.reduce((sum, c) => sum + c.lines_added, 0),
    totalRemoved: changes.reduce((sum, c) => sum + c.lines_removed, 0),
    changeCount: changes.length,
    lastChange: changes[changes.length - 1].timestamp,
  }))

  // Sort by most recent
  fileSummaries.sort(
    (a, b) => new Date(b.lastChange).getTime() - new Date(a.lastChange).getTime()
  )

  return (
    <div className="h-full overflow-y-auto p-4">
      {/* Summary Header */}
      <div className="mb-4 p-4 bg-muted/30 rounded-lg">
        <div className="text-sm text-muted-foreground mb-2">Total Changes</div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-green-500" />
            <span className="text-lg font-semibold text-green-500">
              {agent.code_changes.reduce((sum, c) => sum + c.lines_added, 0)}
            </span>
            <span className="text-muted-foreground">lines added</span>
          </div>
          <div className="flex items-center gap-2">
            <Minus className="w-4 h-4 text-red-500" />
            <span className="text-lg font-semibold text-red-500">
              {agent.code_changes.reduce((sum, c) => sum + c.lines_removed, 0)}
            </span>
            <span className="text-muted-foreground">lines removed</span>
          </div>
        </div>
      </div>

      {/* File List */}
      <div className="space-y-2">
        {fileSummaries.map((summary) => (
          <div
            key={summary.path}
            className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
          >
            <FileCode className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-mono text-sm truncate">{summary.path}</div>
              <div className="text-xs text-muted-foreground">
                {summary.changeCount} change{summary.changeCount > 1 ? 's' : ''}
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-green-500 flex items-center gap-1">
                <Plus className="w-3 h-3" />
                {summary.totalAdded}
              </span>
              <span className="text-red-500 flex items-center gap-1">
                <Minus className="w-3 h-3" />
                {summary.totalRemoved}
              </span>
              <span className="text-muted-foreground text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(summary.lastChange).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
