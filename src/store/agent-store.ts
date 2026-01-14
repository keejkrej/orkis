import { create } from "zustand";

export interface AgentConfig {
  agent_type: "claude-code" | "codex";
  name: string;
  working_dir: string;
  prompt?: string;
  model?: string;
}

// Steer mode determines how messages are handled when the agent is busy
export type SteerMode = "immediate" | "queue";

export interface QueuedMessage {
  id: string;
  content: string;
  timestamp: string;
  priority?: "normal" | "high";
}

export interface MessageQueueState {
  messages: QueuedMessage[];
  steerMode: SteerMode;
  processingQueue: boolean;
  selectedIndex: number;
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
  queue_state?: MessageQueueState;
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

  // Prompt Steering / Message Queue Actions
  queueMessage: (agentId: string, message: string, priority?: "normal" | "high") => Promise<void>;
  sendSteerMessage: (agentId: string, message: string) => Promise<void>;
  clearQueue: (agentId: string) => Promise<void>;
  removeQueuedMessage: (agentId: string, messageId: string) => Promise<void>;
  processQueue: (agentId: string) => Promise<void>;
  setSteerMode: (agentId: string, mode: SteerMode) => Promise<void>;
  interruptAgent: (agentId: string) => Promise<void>;
  handleUserInput: (agentId: string, message: string) => Promise<void>;
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

  // ===========================================================================
  // Prompt Steering / Message Queue Actions
  // ===========================================================================

  queueMessage: async (agentId: string, message: string, priority: "normal" | "high" = "normal"): Promise<void> => {
    const { ws } = get();
    if (!ws) throw new Error("Not connected");

    ws.send(
      JSON.stringify({ type: "queue_message", agent_id: agentId, message, priority })
    );
  },

  sendSteerMessage: async (agentId: string, message: string): Promise<void> => {
    const { ws } = get();
    if (!ws) throw new Error("Not connected");

    ws.send(
      JSON.stringify({ type: "send_steer_message", agent_id: agentId, message })
    );
  },

  clearQueue: async (agentId: string): Promise<void> => {
    const { ws } = get();
    if (!ws) throw new Error("Not connected");

    ws.send(JSON.stringify({ type: "clear_queue", agent_id: agentId }));
  },

  removeQueuedMessage: async (agentId: string, messageId: string): Promise<void> => {
    const { ws } = get();
    if (!ws) throw new Error("Not connected");

    ws.send(
      JSON.stringify({ type: "remove_queued_message", agent_id: agentId, message_id: messageId })
    );
  },

  processQueue: async (agentId: string): Promise<void> => {
    const { ws } = get();
    if (!ws) throw new Error("Not connected");

    ws.send(JSON.stringify({ type: "process_queue", agent_id: agentId }));
  },

  setSteerMode: async (agentId: string, mode: SteerMode): Promise<void> => {
    const { ws } = get();
    if (!ws) throw new Error("Not connected");

    ws.send(JSON.stringify({ type: "set_steer_mode", agent_id: agentId, mode }));
  },

  interruptAgent: async (agentId: string): Promise<void> => {
    const { ws } = get();
    if (!ws) throw new Error("Not connected");

    ws.send(JSON.stringify({ type: "interrupt_agent", agent_id: agentId }));
  },

  handleUserInput: async (agentId: string, message: string): Promise<void> => {
    const { ws, agents } = get();
    if (!ws) throw new Error("Not connected");

    const agent = agents.find((a) => a.id === agentId);
    if (!agent) throw new Error("Agent not found");

    // Get the steer mode from the agent's queue state
    const steerMode = agent.queue_state?.steerMode ?? "immediate";

    if (agent.status === "idle") {
      // Agent is idle, send directly
      ws.send(JSON.stringify({ type: "send_message", agent_id: agentId, message }));
    } else {
      // Agent is busy
      if (steerMode === "immediate") {
        // Immediate mode - try to steer the agent
        ws.send(JSON.stringify({ type: "send_steer_message", agent_id: agentId, message }));
      } else {
        // Queue mode - add to queue
        ws.send(JSON.stringify({ type: "queue_message", agent_id: agentId, message }));
      }
    }
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

    // Prompt Steering / Message Queue Events
    case "queue_message_added": {
      const { agent_id, message } = data as {
        agent_id: string;
        message: QueuedMessage;
      };
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === agent_id
            ? {
                ...a,
                queue_state: {
                  ...a.queue_state!,
                  messages: [...(a.queue_state?.messages || []), message],
                },
              }
            : a,
        ),
      }));
      break;
    }

    case "queue_message_removed": {
      const { agent_id, message_id } = data as {
        agent_id: string;
        message_id: string;
      };
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === agent_id
            ? {
                ...a,
                queue_state: {
                  ...a.queue_state!,
                  messages: (a.queue_state?.messages || []).filter(
                    (m) => m.id !== message_id
                  ),
                },
              }
            : a,
        ),
      }));
      break;
    }

    case "queue_cleared": {
      const { agent_id } = data as { agent_id: string };
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === agent_id
            ? {
                ...a,
                queue_state: {
                  ...a.queue_state!,
                  messages: [],
                  selectedIndex: -1,
                },
              }
            : a,
        ),
      }));
      break;
    }

    case "queue_processing_started": {
      const { agent_id } = data as { agent_id: string };
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === agent_id
            ? {
                ...a,
                queue_state: {
                  ...a.queue_state!,
                  processingQueue: true,
                },
              }
            : a,
        ),
      }));
      break;
    }

    case "queue_processing_completed": {
      const { agent_id } = data as { agent_id: string };
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === agent_id
            ? {
                ...a,
                queue_state: {
                  ...a.queue_state!,
                  processingQueue: false,
                },
              }
            : a,
        ),
      }));
      break;
    }

    case "steer_mode_changed": {
      const { agent_id, mode } = data as {
        agent_id: string;
        mode: SteerMode;
      };
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === agent_id
            ? {
                ...a,
                queue_state: {
                  ...a.queue_state!,
                  steerMode: mode,
                },
              }
            : a,
        ),
      }));
      break;
    }
  }
}
