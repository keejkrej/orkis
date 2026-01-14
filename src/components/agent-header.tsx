"use client";

import { Bot, Cpu, GitBranch, FileCode, Square, ExternalLink } from "lucide-react";
import { Agent, useAgentStore } from "@/store/agent-store";
import { cn } from "@/lib/utils";
import { open as openPath } from "@tauri-apps/plugin-shell";

interface AgentHeaderProps {
  agent: Agent;
}

export function AgentHeader({ agent }: AgentHeaderProps) {
  const { stopAgent } = useAgentStore();

  const Icon = agent.agent_type === "claude-code" ? Bot : Cpu;

  const statusColors = {
    idle: "text-yellow-500",
    running: "text-green-500",
    stopped: "text-gray-500",
    error: "text-red-500",
  };

  const statusLabels = {
    idle: "Idle",
    running: "Running",
    stopped: "Stopped",
    error: "Error",
  };

  // Calculate total lines changed
  const totalLinesAdded = agent.code_changes.reduce(
    (sum, c) => sum + c.lines_added,
    0,
  );
  const totalLinesRemoved = agent.code_changes.reduce(
    (sum, c) => sum + c.lines_removed,
    0,
  );

  return (
    <div className="border-b p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Icon
            className={cn(
              "w-6 h-6",
              agent.agent_type === "claude-code" ? "text-claude" : "text-codex",
            )}
          />
          <div>
            <h2 className="font-semibold text-lg">{agent.name}</h2>
            <p className="text-sm text-muted-foreground">
              {agent.agent_type === "claude-code" ? "Claude Code" : "Codex"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div
            className={cn(
              "flex items-center gap-2",
              statusColors[agent.status],
            )}
          >
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                agent.status === "running" && "animate-pulse",
                agent.status === "idle" && "bg-yellow-500",
                agent.status === "running" && "bg-green-500",
                agent.status === "stopped" && "bg-gray-500",
                agent.status === "error" && "bg-red-500",
              )}
            />
            <span className="text-sm font-medium">
              {statusLabels[agent.status]}
            </span>
          </div>

          {agent.status === "running" && (
            <button
              onClick={() => stopAgent(agent.id)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
            >
              <Square className="w-3 h-3" />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-6 text-sm">
        {/* Git Branch */}
        <div className="flex items-center gap-2 text-muted-foreground">
          <GitBranch className="w-4 h-4" />
          <span>{agent.git_info?.branch || "No branch"}</span>
          {agent.git_info?.uncommitted_changes ? (
            <span className="text-yellow-500">
              ({agent.git_info.uncommitted_changes} uncommitted)
            </span>
          ) : null}
        </div>

        {/* Lines Changed */}
        {(totalLinesAdded > 0 || totalLinesRemoved > 0) && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileCode className="w-4 h-4" />
            <span className="text-green-500">+{totalLinesAdded}</span>
            <span className="text-red-500">-{totalLinesRemoved}</span>
          </div>
        )}

        {/* Working Directory */}
        <div className="flex items-center gap-2 flex-1 text-muted-foreground">
          <div className="flex-1 truncate">
            {agent.working_dir}
          </div>
          <button
            onClick={() => {
              openPath(agent.working_dir);
            }}
            className="p-1 hover:bg-accent rounded-sm transition-colors"
            title="Open in file manager"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
