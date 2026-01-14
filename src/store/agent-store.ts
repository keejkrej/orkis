import { create } from "zustand";

export interface AgentConfig {
  agent_type: "claude-code" | "codex";
  name: string;
  working_dir: string;
  prompt?: string;
  model?: string;
}

export interface Agent {
  id: string;
  agent_type: "claude-code" | "codex";
  name: string;
  status: "idle" | "running" | "stopped" | "error";
  working_dir: string;
  started_at: string;
  plans: Plan[];
  messages: AgentMessage[];
  git_info?: GitInfo;
  code_changes: CodeChange[];
}

export interface Plan {
  id: string;
  content: string;
  file_path: string;
  created_at: string;
}

export interface AgentMessage {
  id: string;
  message_type: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  tool_name?: string;
  tool_input?: unknown;
}

export interface GitInfo {
  branch: string;
  worktree?: string;
  uncommitted_changes: number;
  last_commit?: {
    hash: string;
    message: string;
    author: string;
    date: string;
  };
}

export interface CodeChange {
  file_path: string;
  lines_added: number;
  lines_removed: number;
  timestamp: string;
}

interface AgentState {
  agents: Agent[];
  selectedAgentId: string | null;
  connected: boolean;
  ws: WebSocket | null;

  // Actions
  connect: () => void;
  disconnect: () => void;
  startAgent: (config: AgentConfig) => Promise<Agent>;
  stopAgent: (agentId: string) => Promise<void>;
  selectAgent: (agentId: string | null) => void;
  sendMessage: (agentId: string, message: string) => Promise<void>;
  refreshAgents: () => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  selectedAgentId: null,
  connected: false,
  ws: null,

  connect: () => {
    const ws = new WebSocket("ws://127.0.0.1:9847");

    ws.onopen = () => {
      set({ connected: true, ws });
      // Refresh agents list on connect
      get().refreshAgents();
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleEvent(data, set, get);
    };

    ws.onclose = () => {
      set({ connected: false, ws: null });
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        if (!get().connected) {
          get().connect();
        }
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  },

  disconnect: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
    }
    set({ connected: false, ws: null });
  },

  startAgent: async (config: AgentConfig): Promise<Agent> => {
    const { ws } = get();
    if (!ws) throw new Error("Not connected");

    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        if (data.type === "agent") {
          ws.removeEventListener("message", handler);
          set((state) => ({
            agents: [...state.agents, data.agent],
            selectedAgentId: data.agent.id,
          }));
          resolve(data.agent);
        } else if (data.type === "error") {
          ws.removeEventListener("message", handler);
          reject(new Error(data.message));
        }
      };
      ws.addEventListener("message", handler);
      ws.send(JSON.stringify({ type: "start_agent", config }));
    });
  },

  stopAgent: async (agentId: string): Promise<void> => {
    const { ws } = get();
    if (!ws) throw new Error("Not connected");

    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        if (data.type === "success") {
          ws.removeEventListener("message", handler);
          set((state) => ({
            agents: state.agents.map((a) =>
              a.id === agentId ? { ...a, status: "stopped" as const } : a,
            ),
          }));
          resolve();
        } else if (data.type === "error") {
          ws.removeEventListener("message", handler);
          reject(new Error(data.message));
        }
      };
      ws.addEventListener("message", handler);
      ws.send(JSON.stringify({ type: "stop_agent", agent_id: agentId }));
    });
  },

  selectAgent: (agentId: string | null) => {
    set({ selectedAgentId: agentId });
  },

  sendMessage: async (agentId: string, message: string): Promise<void> => {
    const { ws } = get();
    if (!ws) throw new Error("Not connected");

    ws.send(
      JSON.stringify({ type: "send_message", agent_id: agentId, message }),
    );
  },

  refreshAgents: async (): Promise<void> => {
    const { ws } = get();
    if (!ws) return;

    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        if (data.type === "agents") {
          ws.removeEventListener("message", handler);
          set({ agents: data.agents });
          resolve();
        }
      };
      ws.addEventListener("message", handler);
      ws.send(JSON.stringify({ type: "list_agents" }));
    });
  },
}));

// Handle incoming events
function handleEvent(
  data: Record<string, unknown>,
  set: (fn: (state: AgentState) => Partial<AgentState>) => void,
  get: () => AgentState,
) {
  switch (data.type) {
    case "agent_status": {
      const { agent_id, status } = data as {
        agent_id: string;
        status: Agent["status"];
      };
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === agent_id ? { ...a, status } : a,
        ),
      }));
      break;
    }

    case "agent_message": {
      const { agent_id, message } = data as {
        agent_id: string;
        message: AgentMessage;
      };
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === agent_id ? { ...a, messages: [...a.messages, message] } : a,
        ),
      }));
      break;
    }

    case "agent_plan": {
      const { agent_id, plan } = data as { agent_id: string; plan: Plan };
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === agent_id ? { ...a, plans: [...a.plans, plan] } : a,
        ),
      }));
      break;
    }

    case "agent_git": {
      const { agent_id, git_info } = data as {
        agent_id: string;
        git_info: GitInfo;
      };
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === agent_id ? { ...a, git_info } : a,
        ),
      }));
      break;
    }

    case "agent_code_change": {
      const { agent_id, change } = data as {
        agent_id: string;
        change: CodeChange;
      };
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === agent_id
            ? { ...a, code_changes: [...a.code_changes, change] }
            : a,
        ),
      }));
      break;
    }
  }
}
