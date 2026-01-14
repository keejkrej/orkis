"use client";

import {
  Wrench,
  FileEdit,
  Terminal,
  Search,
  Globe,
  Activity,
} from "lucide-react";
import { Agent, AgentMessage } from "@/store/agent-store";
import { cn } from "@/lib/utils";

interface ActivityTabProps {
  agent: Agent;
}

// Map tool names to icons and colors
const toolConfig: Record<string, { icon: typeof Wrench; color: string }> = {
  Edit: { icon: FileEdit, color: "text-blue-500" },
  Write: { icon: FileEdit, color: "text-green-500" },
  Read: { icon: FileEdit, color: "text-gray-500" },
  Bash: { icon: Terminal, color: "text-yellow-500" },
  Grep: { icon: Search, color: "text-purple-500" },
  Glob: { icon: Search, color: "text-purple-400" },
  WebFetch: { icon: Globe, color: "text-cyan-500" },
  WebSearch: { icon: Globe, color: "text-cyan-400" },
};

export function ActivityTab({ agent }: ActivityTabProps) {
  // Filter only tool messages
  const toolMessages = agent.messages.filter((m) => m.message_type === "tool");

  if (toolMessages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No tool activity yet</p>
          <p className="text-sm mt-1">
            Activity will appear when the agent uses tools
          </p>
        </div>
      </div>
    );
  }

  // Group activities by time (rough buckets)
  const groupedActivities = groupByTime(toolMessages);

  return (
    <div className="h-full overflow-y-auto p-4">
      {groupedActivities.map((group, groupIndex) => (
        <div key={group.label} className="mb-6">
          <div className="text-sm font-medium text-muted-foreground mb-3">
            {group.label}
          </div>
          <div className="space-y-2">
            {group.messages.map((message, msgIndex) => (
              <ActivityItem key={message.id} message={message} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityItem({ message }: { message: AgentMessage }) {
  const config = message.tool_name
    ? toolConfig[message.tool_name] || {
        icon: Wrench,
        color: "text-muted-foreground",
      }
    : { icon: Wrench, color: "text-muted-foreground" };

  const Icon = config.icon;

  // Parse tool input for display
  const inputSummary = getInputSummary(
    message.tool_name || "",
    message.tool_input,
  );

  return (
    <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/30 transition-colors">
      <div className={cn("p-2 rounded-md bg-muted", config.color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium">
            {message.tool_name || "Unknown Tool"}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>
        {inputSummary && (
          <div className="text-sm text-muted-foreground font-mono truncate">
            {inputSummary}
          </div>
        )}
      </div>
    </div>
  );
}

function getInputSummary(toolName: string, input: unknown): string | null {
  if (!input || typeof input !== "object") return null;

  const obj = input as Record<string, unknown>;

  switch (toolName) {
    case "Edit":
    case "Write":
    case "Read":
      return (obj.file_path as string) || null;
    case "Bash":
      return (obj.command as string) || null;
    case "Grep":
    case "Glob":
      return (obj.pattern as string) || null;
    case "WebFetch":
    case "WebSearch":
      return ((obj.url || obj.query) as string) || null;
    default:
      return null;
  }
}

interface TimeGroup {
  label: string;
  messages: AgentMessage[];
}

function groupByTime(messages: AgentMessage[]): TimeGroup[] {
  const now = new Date();
  const groups: TimeGroup[] = [];

  const sortedMessages = [...messages].reverse(); // Most recent first

  let currentGroup: TimeGroup | null = null;

  for (const message of sortedMessages) {
    const msgDate = new Date(message.timestamp);
    const diffMinutes = (now.getTime() - msgDate.getTime()) / (1000 * 60);

    let label: string;
    if (diffMinutes < 1) {
      label = "Just now";
    } else if (diffMinutes < 5) {
      label = "A few minutes ago";
    } else if (diffMinutes < 60) {
      label = `${Math.floor(diffMinutes)} minutes ago`;
    } else {
      label = msgDate.toLocaleTimeString();
    }

    if (!currentGroup || currentGroup.label !== label) {
      currentGroup = { label, messages: [] };
      groups.push(currentGroup);
    }

    currentGroup.messages.push(message);
  }

  return groups;
}
