#!/usr/bin/env npx ts-node
/**
 * Test Client: Interactive Orkis Runtime Testing
 *
 * This script provides an interactive command-line interface for testing
 * the Orkis agent-runtime server.
 *
 * Prerequisites:
 *   - Orkis agent-runtime server running (npx ts-node agent-runtime/server.ts)
 *   - npm install ws readline
 *
 * Usage:
 *   npx ts-node test-runtime-client.ts
 *
 * Commands (once connected):
 *   start <name>        - Start a new Claude Code agent
 *   start-codex <name>  - Start a new Codex agent
 *   stop <id>           - Stop an agent
 *   list                - List all agents
 *   send <id> <msg>     - Send a message to an agent
 *   queue <id> <msg>    - Queue a message
 *   steer <id> <msg>    - Send steering message
 *   mode <id> <mode>    - Set steer mode (immediate/queue)
 *   interrupt <id>      - Interrupt an agent
 *   clear <id>          - Clear message queue
 *   state <id>          - Get queue state
 *   sub <id>            - Subscribe to agent events
 *   help                - Show this help
 *   quit                - Exit
 */

import WebSocket from "ws";
import * as readline from "readline";

const RUNTIME_URL = "ws://127.0.0.1:9847";

// =============================================================================
// WebSocket Client
// =============================================================================

let ws: WebSocket | null = null;
let currentAgentId: string | null = null;

async function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(RUNTIME_URL);

    ws.on("open", () => {
      console.log("✓ Connected to Orkis runtime server");
      resolve();
    });

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());
      handleMessage(message);
    });

    ws.on("error", (error) => {
      console.error("✗ WebSocket error:", error.message);
      reject(error);
    });

    ws.on("close", () => {
      console.log("✗ Disconnected from server");
      ws = null;
    });
  });
}

function send(message: any): void {
  if (!ws) {
    console.log("✗ Not connected");
    return;
  }
  ws.send(JSON.stringify(message));
}

// =============================================================================
// Message Handlers
// =============================================================================

function handleMessage(msg: any): void {
  switch (msg.type) {
    // Responses
    case "agent":
      console.log("✓ Agent:", msg.agent.id, `(${msg.agent.name})`);
      console.log("  Status:", msg.agent.status);
      console.log("  Type:", msg.agent.agent_type);
      currentAgentId = msg.agent.id;
      break;

    case "agents":
      console.log("✓ Agents:", msg.agents.length);
      for (const agent of msg.agents) {
        console.log(`  - ${agent.id.slice(0, 8)}... ${agent.name} (${agent.status})`);
      }
      break;

    case "queue_state":
      console.log("✓ Queue State:");
      console.log("  Mode:", msg.state.steerMode);
      console.log("  Processing:", msg.state.processingQueue);
      console.log("  Messages:", msg.state.messages.length);
      for (const m of msg.state.messages) {
        console.log(`    - [${m.priority || "normal"}] ${m.content.slice(0, 40)}...`);
      }
      break;

    case "success":
      console.log("✓ Success");
      break;

    case "error":
      console.log("✗ Error:", msg.message);
      break;

    // Events
    case "agent_status":
      console.log(`[Event] Agent ${msg.agent_id.slice(0, 8)}... status: ${msg.status}`);
      break;

    case "agent_message":
      const content = msg.message.content?.slice(0, 60) || "";
      console.log(`[${msg.message.message_type}] ${content}${content.length >= 60 ? "..." : ""}`);
      break;

    case "agent_tool_start":
      console.log(`[Tool Start] ${msg.activity.tool_name}`);
      break;

    case "agent_tool_end":
      console.log(`[Tool End] ${msg.activity.tool_name} (${msg.activity.duration_ms}ms)`);
      break;

    case "queue_message_added":
      console.log(`[Queue +1] "${msg.message.content.slice(0, 30)}..."`);
      break;

    case "queue_message_removed":
      console.log(`[Queue -1] ${msg.message_id.slice(0, 8)}...`);
      break;

    case "queue_cleared":
      console.log(`[Queue Cleared]`);
      break;

    case "steer_mode_changed":
      console.log(`[Mode Changed] ${msg.mode}`);
      break;

    case "agent_interrupted":
      console.log(`[Interrupted] Agent stopped`);
      break;

    case "steer_message_injected":
      console.log(`[Steer] "${msg.message.slice(0, 30)}..."`);
      break;

    default:
      if (msg.type?.startsWith("ralph_")) {
        console.log(`[Ralph] ${msg.type}`);
      } else if (msg.type?.startsWith("agent_")) {
        console.log(`[Agent] ${msg.type}`);
      }
  }
}

// =============================================================================
// Commands
// =============================================================================

function processCommand(input: string): boolean {
  const parts = input.trim().split(" ");
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case "start":
      send({
        type: "start_agent",
        config: {
          agent_type: "claude-code",
          name: args.join(" ") || "Test Agent",
          working_dir: process.cwd(),
          prompt: "Hello! I'm ready to help.",
        },
      });
      break;

    case "start-codex":
      send({
        type: "start_agent",
        config: {
          agent_type: "codex",
          name: args.join(" ") || "Test Codex Agent",
          working_dir: process.cwd(),
          prompt: "Hello! I'm ready to help.",
        },
      });
      break;

    case "stop":
      const stopId = args[0] || currentAgentId;
      if (!stopId) {
        console.log("Usage: stop <agent_id>");
        break;
      }
      send({ type: "stop_agent", agent_id: stopId });
      break;

    case "list":
      send({ type: "list_agents" });
      break;

    case "send":
    case "s":
      const sendId = args[0] || currentAgentId;
      const sendMsg = args.slice(1).join(" ");
      if (!sendId || !sendMsg) {
        console.log("Usage: send <agent_id> <message>");
        break;
      }
      send({ type: "send_message", agent_id: sendId, message: sendMsg });
      break;

    case "queue":
    case "q":
      const queueId = args[0] || currentAgentId;
      const queueMsg = args.slice(1).join(" ");
      if (!queueId || !queueMsg) {
        console.log("Usage: queue <agent_id> <message>");
        break;
      }
      send({ type: "queue_message", agent_id: queueId, message: queueMsg });
      break;

    case "queue-high":
    case "qh":
      const qhId = args[0] || currentAgentId;
      const qhMsg = args.slice(1).join(" ");
      if (!qhId || !qhMsg) {
        console.log("Usage: queue-high <agent_id> <message>");
        break;
      }
      send({ type: "queue_message", agent_id: qhId, message: qhMsg, priority: "high" });
      break;

    case "steer":
    case "st":
      const steerId = args[0] || currentAgentId;
      const steerMsg = args.slice(1).join(" ");
      if (!steerId || !steerMsg) {
        console.log("Usage: steer <agent_id> <message>");
        break;
      }
      send({ type: "send_steer_message", agent_id: steerId, message: steerMsg });
      break;

    case "mode":
    case "m":
      const modeId = args[0] || currentAgentId;
      const mode = args[1];
      if (!modeId || !["immediate", "queue"].includes(mode)) {
        console.log("Usage: mode <agent_id> <immediate|queue>");
        break;
      }
      send({ type: "set_steer_mode", agent_id: modeId, mode });
      break;

    case "interrupt":
    case "i":
      const intId = args[0] || currentAgentId;
      if (!intId) {
        console.log("Usage: interrupt <agent_id>");
        break;
      }
      send({ type: "interrupt_agent", agent_id: intId });
      break;

    case "clear":
    case "c":
      const clearId = args[0] || currentAgentId;
      if (!clearId) {
        console.log("Usage: clear <agent_id>");
        break;
      }
      send({ type: "clear_queue", agent_id: clearId });
      break;

    case "state":
      const stateId = args[0] || currentAgentId;
      if (!stateId) {
        console.log("Usage: state <agent_id>");
        break;
      }
      send({ type: "get_queue_state", agent_id: stateId });
      break;

    case "sub":
      const subId = args[0] || currentAgentId;
      if (!subId) {
        console.log("Usage: sub <agent_id>");
        break;
      }
      send({ type: "subscribe", agent_id: subId });
      console.log("✓ Subscribed to agent events");
      break;

    case "unsub":
      const unsubId = args[0] || currentAgentId;
      if (!unsubId) {
        console.log("Usage: unsub <agent_id>");
        break;
      }
      send({ type: "unsubscribe", agent_id: unsubId });
      console.log("✓ Unsubscribed from agent events");
      break;

    case "get":
      const getId = args[0] || currentAgentId;
      if (!getId) {
        console.log("Usage: get <agent_id>");
        break;
      }
      send({ type: "get_agent", agent_id: getId });
      break;

    case "use":
      if (!args[0]) {
        console.log("Current agent:", currentAgentId || "(none)");
        console.log("Usage: use <agent_id>");
        break;
      }
      currentAgentId = args[0];
      console.log("✓ Now using agent:", currentAgentId);
      break;

    case "help":
    case "h":
    case "?":
      printHelp();
      break;

    case "quit":
    case "exit":
    case "q":
      return false;

    default:
      // If current agent is set, treat unknown commands as messages
      if (currentAgentId && input.trim()) {
        send({ type: "send_message", agent_id: currentAgentId, message: input.trim() });
      } else {
        console.log("Unknown command. Type 'help' for available commands.");
      }
  }

  return true;
}

function printHelp(): void {
  console.log(`
Available Commands:
──────────────────────────────────────────────────────────
  Agent Management:
    start [name]          Start a new Claude Code agent
    start-codex [name]    Start a new Codex agent
    stop [id]             Stop an agent
    list                  List all agents
    get [id]              Get agent details
    use <id>              Set current agent (for shortcuts)

  Messaging:
    send <id> <msg>       Send a message (or 's')
    queue <id> <msg>      Queue a message (or 'q')
    queue-high <id> <msg> Queue with high priority (or 'qh')
    steer <id> <msg>      Send steering message (or 'st')

  Queue Control:
    mode <id> <mode>      Set mode: immediate|queue (or 'm')
    interrupt <id>        Interrupt agent (or 'i')
    clear <id>            Clear message queue (or 'c')
    state <id>            Get queue state

  Subscriptions:
    sub <id>              Subscribe to agent events
    unsub <id>            Unsubscribe from agent events

  Other:
    help                  Show this help
    quit                  Exit

Shortcuts:
  - After 'use <id>', you can omit agent_id from commands
  - After 'use <id>', typing any text sends it as a message
──────────────────────────────────────────────────────────
`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║          Orkis Runtime Interactive Test Client           ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");

  try {
    await connect();
  } catch (error) {
    console.error("Failed to connect. Is the runtime server running?");
    console.error("Start it with: npx ts-node agent-runtime/server.ts");
    process.exit(1);
  }

  printHelp();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    const prefix = currentAgentId ? `[${currentAgentId.slice(0, 8)}...] ` : "";
    rl.question(`${prefix}orkis> `, (input) => {
      if (processCommand(input)) {
        prompt();
      } else {
        rl.close();
        ws?.close();
        console.log("Goodbye!");
        process.exit(0);
      }
    });
  };

  prompt();
}

main().catch(console.error);
