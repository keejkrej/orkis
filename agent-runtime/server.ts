import { WebSocketServer, WebSocket } from "ws";
import { AgentManager } from "./agent-manager";
import type {
  RuntimeMessage,
  RuntimeResponse,
  RuntimeEvent,
  AgentStatus,
  Session,
  ToolActivity,
  PendingInputRequest,
  RalphLoopState,
  QueuedMessage,
  MessageQueueState,
  SteerMode,
} from "./types";

const PORT = 9847;
const agentManager = new AgentManager();

// Track client subscriptions
const subscriptions = new Map<WebSocket, Set<string>>();

const wss = new WebSocketServer({ port: PORT });

console.log(`Agent runtime server listening on ws://127.0.0.1:${PORT}`);
console.log("Supported features:");
console.log("  - Claude Code: hooks, subagents, MCP, permissions, sessions");
console.log("  - Codex: threads, approval modes, resume, web search");
console.log("  - Ralph Wiggum Mode: autonomous iteration loops for both SDKs");

wss.on("connection", (ws: WebSocket) => {
  console.log("Client connected");
  subscriptions.set(ws, new Set());

  ws.on("message", async (data: Buffer) => {
    try {
      const message: RuntimeMessage = JSON.parse(data.toString());
      const response = await handleMessage(ws, message);
      ws.send(JSON.stringify(response));
    } catch (error) {
      const errorResponse: RuntimeResponse = {
        type: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      };
      ws.send(JSON.stringify(errorResponse));
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    subscriptions.delete(ws);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    subscriptions.delete(ws);
  });
});

async function handleMessage(
  ws: WebSocket,
  message: RuntimeMessage
): Promise<RuntimeResponse> {
  switch (message.type) {
    // =========================================================================
    // Agent Lifecycle
    // =========================================================================

    case "start_agent": {
      const agent = await agentManager.startAgent(message.config);
      // Auto-subscribe to the new agent
      subscriptions.get(ws)?.add(agent.id);
      return { type: "agent", agent };
    }

    case "stop_agent": {
      await agentManager.stopAgent(message.agent_id);
      return { type: "success" };
    }

    case "list_agents": {
      const agents = agentManager.listAgents();
      return { type: "agents", agents };
    }

    case "get_agent": {
      const agent = agentManager.getAgent(message.agent_id);
      return { type: "agent_optional", agent };
    }

    // =========================================================================
    // Messaging
    // =========================================================================

    case "send_message": {
      await agentManager.sendMessage(message.agent_id, message.message);
      return { type: "success" };
    }

    case "respond_to_input": {
      await agentManager.respondToInput(
        message.agent_id,
        message.input_id,
        message.response
      );
      return { type: "success" };
    }

    // =========================================================================
    // Session Management
    // =========================================================================

    case "list_sessions": {
      const sessions = agentManager.listSessions(message.working_dir);
      return { type: "sessions", sessions };
    }

    case "resume_session": {
      const agent = await agentManager.resumeSession(message.session_id);
      if (agent) {
        subscriptions.get(ws)?.add(agent.id);
        return { type: "agent", agent };
      }
      return { type: "error", message: "Session not found" };
    }

    case "fork_session": {
      const agent = await agentManager.forkSession(
        message.session_id,
        message.new_name
      );
      if (agent) {
        subscriptions.get(ws)?.add(agent.id);
        return { type: "agent", agent };
      }
      return { type: "error", message: "Session not found" };
    }

    case "delete_session": {
      const deleted = agentManager.deleteSession(message.session_id);
      if (deleted) {
        return { type: "success" };
      }
      return { type: "error", message: "Session not found" };
    }

    // =========================================================================
    // Subscriptions
    // =========================================================================

    case "subscribe": {
      subscriptions.get(ws)?.add(message.agent_id);
      return { type: "success" };
    }

    case "unsubscribe": {
      subscriptions.get(ws)?.delete(message.agent_id);
      return { type: "success" };
    }

    // =========================================================================
    // Configuration
    // =========================================================================

    case "get_available_tools": {
      const tools = agentManager.getAvailableTools();
      return { type: "tools", tools };
    }

    case "get_available_models": {
      const models = agentManager.getAvailableModels();
      return { type: "models", models };
    }

    case "validate_config": {
      const { valid, errors } = agentManager.validateConfig(message.config);
      return { type: "validation", valid, errors };
    }

    // =========================================================================
    // Git Operations
    // =========================================================================

    case "get_git_info": {
      const git_info = await agentManager.getGitInfo(message.working_dir);
      return { type: "git_info", git_info };
    }

    case "get_git_diff": {
      const diff = await agentManager.getGitDiff(message.working_dir);
      return { type: "git_diff", diff };
    }

    case "commit_changes": {
      const success = await agentManager.commitChanges(
        message.agent_id,
        message.message
      );
      if (success) {
        return { type: "success" };
      }
      return { type: "error", message: "Failed to commit changes" };
    }

    // =========================================================================
    // MCP Server Management
    // =========================================================================

    case "list_mcp_tools": {
      const tools = await agentManager.listMCPTools(message.agent_id);
      return { type: "mcp_tools", tools };
    }

    case "add_mcp_server": {
      const success = await agentManager.addMCPServer(
        message.agent_id,
        message.name,
        message.config
      );
      if (success) {
        return { type: "success" };
      }
      return { type: "error", message: "Failed to add MCP server" };
    }

    case "remove_mcp_server": {
      const success = await agentManager.removeMCPServer(
        message.agent_id,
        message.name
      );
      if (success) {
        return { type: "success" };
      }
      return { type: "error", message: "Failed to remove MCP server" };
    }

    // =========================================================================
    // Ralph Wiggum Mode (Autonomous Loop)
    // =========================================================================

    case "start_ralph_loop": {
      const state = await agentManager.startRalphLoop(
        message.agent_id,
        message.config
      );
      if (state) {
        return { type: "ralph_state", state };
      }
      return { type: "error", message: "Failed to start Ralph loop" };
    }

    case "cancel_ralph_loop": {
      const cancelled = agentManager.cancelRalphLoop(message.agent_id);
      if (cancelled) {
        return { type: "success" };
      }
      return { type: "error", message: "No active Ralph loop to cancel" };
    }

    case "get_ralph_state": {
      const state = agentManager.getRalphState(message.agent_id);
      return { type: "ralph_state", state };
    }

    // =========================================================================
    // Prompt Steering (Message Queue)
    // =========================================================================

    case "queue_message": {
      const queuedMsg = agentManager.queueMessage(
        message.agent_id,
        message.message,
        message.priority
      );
      if (queuedMsg) {
        return { type: "success" };
      }
      return { type: "error", message: "Failed to queue message" };
    }

    case "send_steer_message": {
      const success = await agentManager.sendSteerMessage(
        message.agent_id,
        message.message
      );
      if (success) {
        return { type: "success" };
      }
      return { type: "error", message: "Failed to send steer message" };
    }

    case "clear_queue": {
      const cleared = agentManager.clearQueue(message.agent_id);
      if (cleared) {
        return { type: "success" };
      }
      return { type: "error", message: "Failed to clear queue" };
    }

    case "remove_queued_message": {
      const removed = agentManager.removeQueuedMessage(
        message.agent_id,
        message.message_id
      );
      if (removed) {
        return { type: "success" };
      }
      return { type: "error", message: "Failed to remove queued message" };
    }

    case "process_queue": {
      agentManager.processQueue(message.agent_id);
      return { type: "success" };
    }

    case "get_queue_state": {
      const queueState = agentManager.getQueueState(message.agent_id);
      if (queueState) {
        return { type: "queue_state", state: queueState };
      }
      return { type: "error", message: "Agent not found" };
    }

    case "set_steer_mode": {
      const modeSet = agentManager.setSteerMode(message.agent_id, message.mode);
      if (modeSet) {
        return { type: "success" };
      }
      return { type: "error", message: "Failed to set steer mode" };
    }

    case "interrupt_agent": {
      const interrupted = agentManager.interruptAgent(message.agent_id);
      if (interrupted) {
        return { type: "success" };
      }
      return { type: "error", message: "Failed to interrupt agent (agent may not be running)" };
    }

    default:
      return { type: "error", message: "Unknown message type" };
  }
}

// =============================================================================
// Event Broadcasting
// =============================================================================

function broadcastEvent(agentId: string, event: RuntimeEvent) {
  for (const [ws, subs] of subscriptions.entries()) {
    if (subs.has(agentId) && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }
}

// Status events
agentManager.on("agent:status", (data: { agent_id: string; status: AgentStatus }) => {
  broadcastEvent(data.agent_id, {
    type: "agent_status",
    agent_id: data.agent_id,
    status: data.status,
  });
});

// Message events
agentManager.on("agent:message", (data) => {
  broadcastEvent(data.agent_id, {
    type: "agent_message",
    agent_id: data.agent_id,
    message: data.message,
  });
});

// Tool events
agentManager.on("agent:tool_start", (data: { agent_id: string; activity: ToolActivity }) => {
  broadcastEvent(data.agent_id, {
    type: "agent_tool_start",
    agent_id: data.agent_id,
    activity: data.activity,
  });
});

agentManager.on("agent:tool_end", (data: { agent_id: string; activity: ToolActivity }) => {
  broadcastEvent(data.agent_id, {
    type: "agent_tool_end",
    agent_id: data.agent_id,
    activity: data.activity,
  });
});

// Plan events
agentManager.on("agent:plan", (data) => {
  broadcastEvent(data.agent_id, {
    type: "agent_plan",
    agent_id: data.agent_id,
    plan: data.plan,
  });
});

// Git events
agentManager.on("agent:git", (data) => {
  broadcastEvent(data.agent_id, {
    type: "agent_git",
    agent_id: data.agent_id,
    git_info: data.git_info,
  });
});

agentManager.on("agent:code_change", (data) => {
  broadcastEvent(data.agent_id, {
    type: "agent_code_change",
    agent_id: data.agent_id,
    change: data.change,
  });
});

// Input events
agentManager.on("agent:input_request", (data: { agent_id: string; request: PendingInputRequest }) => {
  broadcastEvent(data.agent_id, {
    type: "agent_input_request",
    agent_id: data.agent_id,
    request: data.request,
  });
});

agentManager.on("agent:input_response", (data: { agent_id: string; input_id: string; response: string }) => {
  broadcastEvent(data.agent_id, {
    type: "agent_input_response",
    agent_id: data.agent_id,
    input_id: data.input_id,
    response: data.response,
  });
});

// Session events
agentManager.on("agent:session_created", (data: { agent_id: string; session: Session }) => {
  broadcastEvent(data.agent_id, {
    type: "agent_session_created",
    agent_id: data.agent_id,
    session: data.session,
  });
});

agentManager.on("agent:session_resumed", (data: { agent_id: string; session: Session }) => {
  broadcastEvent(data.agent_id, {
    type: "agent_session_resumed",
    agent_id: data.agent_id,
    session: data.session,
  });
});

// Ralph Wiggum Mode events
agentManager.on("ralph:loop_started", (data: { agent_id: string; state: RalphLoopState }) => {
  broadcastEvent(data.agent_id, {
    type: "ralph_loop_started",
    agent_id: data.agent_id,
    state: data.state,
  });
});

agentManager.on("ralph:loop_iteration", (data: { agent_id: string; state: RalphLoopState }) => {
  broadcastEvent(data.agent_id, {
    type: "ralph_loop_iteration",
    agent_id: data.agent_id,
    state: data.state,
  });
});

agentManager.on("ralph:loop_completed", (data: { agent_id: string; state: RalphLoopState; reason: string }) => {
  broadcastEvent(data.agent_id, {
    type: "ralph_loop_completed",
    agent_id: data.agent_id,
    state: data.state,
    reason: data.reason as "completion_detected" | "max_iterations" | "cancelled" | "error",
  });
});

agentManager.on("ralph:loop_error", (data: { agent_id: string; state: RalphLoopState; error: string }) => {
  broadcastEvent(data.agent_id, {
    type: "ralph_loop_error",
    agent_id: data.agent_id,
    state: data.state,
    error: data.error,
  });
});

// Prompt Steering (Message Queue) events
agentManager.on("queue:message_added", (data: { agent_id: string; message: QueuedMessage }) => {
  broadcastEvent(data.agent_id, {
    type: "queue_message_added",
    agent_id: data.agent_id,
    message: data.message,
  });
});

agentManager.on("queue:message_removed", (data: { agent_id: string; message_id: string }) => {
  broadcastEvent(data.agent_id, {
    type: "queue_message_removed",
    agent_id: data.agent_id,
    message_id: data.message_id,
  });
});

agentManager.on("queue:cleared", (data: { agent_id: string }) => {
  broadcastEvent(data.agent_id, {
    type: "queue_cleared",
    agent_id: data.agent_id,
  });
});

agentManager.on("queue:processing_started", (data: { agent_id: string }) => {
  broadcastEvent(data.agent_id, {
    type: "queue_processing_started",
    agent_id: data.agent_id,
  });
});

agentManager.on("queue:processing_completed", (data: { agent_id: string }) => {
  broadcastEvent(data.agent_id, {
    type: "queue_processing_completed",
    agent_id: data.agent_id,
  });
});

agentManager.on("steer:mode_changed", (data: { agent_id: string; mode: SteerMode }) => {
  broadcastEvent(data.agent_id, {
    type: "steer_mode_changed",
    agent_id: data.agent_id,
    mode: data.mode,
  });
});

agentManager.on("agent:interrupted", (data: { agent_id: string }) => {
  broadcastEvent(data.agent_id, {
    type: "agent_interrupted",
    agent_id: data.agent_id,
  });
});

agentManager.on("steer:message_injected", (data: { agent_id: string; message: string }) => {
  broadcastEvent(data.agent_id, {
    type: "steer_message_injected",
    agent_id: data.agent_id,
    message: data.message,
  });
});

// =============================================================================
// Graceful Shutdown
// =============================================================================

process.on("SIGINT", () => {
  console.log("\nShutting down...");
  agentManager.stopAll();
  wss.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down...");
  agentManager.stopAll();
  wss.close();
  process.exit(0);
});
