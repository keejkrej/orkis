"use client";

import { useState } from "react";
import { Bot, Cpu, FolderOpen } from "lucide-react";
import { AgentConfig } from "@/store/agent-store";
import { cn } from "@/lib/utils";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

interface NewAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (config: AgentConfig) => Promise<void>;
}

export function NewAgentDialog({
  open,
  onOpenChange,
  onCreate,
}: NewAgentDialogProps) {
  const [agentType, setAgentType] = useState<"claude-code" | "codex">(
    "claude-code",
  );
  const [name, setName] = useState("");
  const [workingDir, setWorkingDir] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !workingDir.trim()) return;

    setLoading(true);
    try {
      await onCreate({
        agent_type: agentType,
        name: name.trim(),
        working_dir: workingDir.trim(),
        prompt: prompt.trim() || undefined,
      });
      // Reset form
      setName("");
      setWorkingDir("");
      setPrompt("");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className="relative bg-card border rounded-lg shadow-lg w-full max-w-md mx-4">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">Create New Agent</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Agent Type Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Agent Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAgentType("claude-code")}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-md border transition-colors",
                    agentType === "claude-code"
                      ? "border-claude bg-claude/10 text-claude"
                      : "border-border hover:border-claude/50",
                  )}
                >
                  <Bot className="w-5 h-5" />
                  <span className="font-medium">Claude Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAgentType("codex")}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-md border transition-colors",
                    agentType === "codex"
                      ? "border-codex bg-codex/10 text-codex"
                      : "border-border hover:border-codex/50",
                  )}
                >
                  <Cpu className="w-5 h-5" />
                  <span className="font-medium">Codex</span>
                </button>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Agent"
                className="w-full px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            {/* Working Directory */}
            <div className="space-y-2">
              <label htmlFor="workingDir" className="text-sm font-medium">
                Working Directory
              </label>
              <div className="flex gap-2">
                <input
                  id="workingDir"
                  type="text"
                  value={workingDir}
                  onChange={(e) => setWorkingDir(e.target.value)}
                  placeholder="/path/to/project"
                  className="flex-1 px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
                <button
                  type="button"
                  className="px-3 py-2 border rounded-md hover:bg-accent"
                  onClick={async () => {
                    try {
                      const selected = await openDialog({
                        directory: true,
                        multiple: false,
                        title: "Select Working Directory"
                      });
                      if (selected && typeof selected === "string") {
                        setWorkingDir(selected);
                      }
                    } catch (error) {
                      console.error("Failed to open dialog:", error);
                    }
                  }}
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Initial Prompt */}
            <div className="space-y-2">
              <label htmlFor="prompt" className="text-sm font-medium">
                Initial Prompt (optional)
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What would you like the agent to do?"
                rows={3}
                className="w-full px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="px-4 py-2 text-sm border rounded-md hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !name.trim() || !workingDir.trim()}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creating..." : "Create Agent"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
