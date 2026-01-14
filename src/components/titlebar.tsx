"use client";

import { useAgentStore } from "@/store/agent-store";

export function Titlebar() {
  const { connected } = useAgentStore();

  return (
    <div className="titlebar h-12 bg-background border-b flex items-center justify-between px-4 pl-20">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold">Orkis</h1>
        <span className="text-xs text-muted-foreground">
          Coding Agent Manager
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            connected ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <span className="text-xs text-muted-foreground">
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>
    </div>
  );
}
