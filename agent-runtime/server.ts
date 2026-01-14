import { WebSocketServer, WebSocket } from "ws";
import { AgentManager } from "./agent-manager";
import type { RuntimeMessage, RuntimeResponse, RuntimeEvent } from "./types";

const PORT = 9847;
const agentManager = new AgentManager();

// Track client subscriptions
const subscriptions = new Map<WebSocket, Set<string>>();

const wss = new WebSocketServer({ port: PORT });

console.log(`Agent runtime server listening on ws://127.0.0.1:${PORT}`);

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
  message: RuntimeMessage,
): Promise<RuntimeResponse> {
  switch (message.type) {
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

    case "send_message": {
      await agentManager.sendMessage(message.agent_id, message.message);
      return { type: "success" };
    }

    case "subscribe": {
      subscriptions.get(ws)?.add(message.agent_id);
      return { type: "success" };
    }

    case "unsubscribe": {
      subscriptions.get(ws)?.delete(message.agent_id);
      return { type: "success" };
    }

    default:
      return { type: "error", message: "Unknown message type" };
  }
}

// Forward events to subscribed clients
function broadcastEvent(agentId: string, event: RuntimeEvent) {
  for (const [ws, subs] of subscriptions.entries()) {
    if (subs.has(agentId) && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }
}

agentManager.on("agent:status", (data) => {
  broadcastEvent(data.agent_id, {
    type: "agent_status",
    agent_id: data.agent_id,
    status: data.status,
  });
});

agentManager.on("agent:message", (data) => {
  broadcastEvent(data.agent_id, {
    type: "agent_message",
    agent_id: data.agent_id,
    message: data.message,
  });
});

agentManager.on("agent:plan", (data) => {
  broadcastEvent(data.agent_id, {
    type: "agent_plan",
    agent_id: data.agent_id,
    plan: data.plan,
  });
});

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

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down...");
  agentManager.stopAll();
  wss.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Shutting down...");
  agentManager.stopAll();
  wss.close();
  process.exit(0);
});
