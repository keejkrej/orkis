#!/usr/bin/env npx ts-node
/**
 * Demo: Agent Prompt Steering (Message Queue)
 *
 * This script demonstrates the prompt steering feature that allows users
 * to send messages to an agent while it's still working - similar to
 * Claude Code's message queue and Codex's "Steer mode".
 *
 * This connects to the Orkis agent-runtime server via WebSocket.
 *
 * Prerequisites:
 *   - Orkis agent-runtime server running (npx ts-node agent-runtime/server.ts)
 *   - npm install ws
 *
 * Usage:
 *   npx ts-node demo-steering.ts
 */

import WebSocket from "ws";

const RUNTIME_URL = "ws://127.0.0.1:9847";

// =============================================================================
// Types (matching agent-runtime/types.ts)
// =============================================================================

interface AgentConfig {
  agent_type: "claude-code" | "codex";
  name: string;
  working_dir: string;
  prompt?: string;
}

interface QueuedMessage {
  id: string;
  content: string;
  timestamp: string;
  priority?: "normal" | "high";
}

type SteerMode = "immediate" | "queue";

// =============================================================================
// WebSocket Client
// =============================================================================

class OrkisClient {
  private ws: WebSocket | null = null;
  private responseHandlers: Map<string, (data: any) => void> = new Map();
  private eventHandlers: ((event: any) => void)[] = [];

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(RUNTIME_URL);

      this.ws.on("open", () => {
        console.log("[Connected] to Orkis runtime server");
        resolve();
      });

      this.ws.on("message", (data) => {
        const message = JSON.parse(data.toString());

        // Check if it's a response to a request
        if (message.type && this.responseHandlers.has(message.type)) {
          const handler = this.responseHandlers.get(message.type);
          this.responseHandlers.delete(message.type);
          handler?.(message);
        }

        // Also notify event handlers
        for (const handler of this.eventHandlers) {
          handler(message);
        }
      });

      this.ws.on("error", reject);
      this.ws.on("close", () => {
        console.log("[Disconnected] from Orkis runtime server");
      });
    });
  }

  disconnect(): void {
    this.ws?.close();
  }

  onEvent(handler: (event: any) => void): void {
    this.eventHandlers.push(handler);
  }

  private async send(message: any): Promise<any> {
    return new Promise((resolve) => {
      // Set up response handler based on expected response type
      const expectedResponse = this.getExpectedResponseType(message.type);
      if (expectedResponse) {
        this.responseHandlers.set(expectedResponse, resolve);
      }

      this.ws?.send(JSON.stringify(message));

      // If no expected response, resolve immediately
      if (!expectedResponse) {
        resolve({ type: "sent" });
      }
    });
  }

  private getExpectedResponseType(requestType: string): string | null {
    const responseMap: Record<string, string> = {
      start_agent: "agent",
      list_agents: "agents",
      get_agent: "agent_optional",
      get_queue_state: "queue_state",
      stop_agent: "success",
      send_message: "success",
      queue_message: "success",
      send_steer_message: "success",
      clear_queue: "success",
      set_steer_mode: "success",
      interrupt_agent: "success",
    };
    return responseMap[requestType] || null;
  }

  // Agent operations
  async startAgent(config: AgentConfig): Promise<any> {
    return this.send({ type: "start_agent", config });
  }

  async stopAgent(agentId: string): Promise<void> {
    await this.send({ type: "stop_agent", agent_id: agentId });
  }

  async subscribe(agentId: string): Promise<void> {
    await this.send({ type: "subscribe", agent_id: agentId });
  }

  // Messaging
  async sendMessage(agentId: string, message: string): Promise<void> {
    await this.send({ type: "send_message", agent_id: agentId, message });
  }

  // Queue operations
  async queueMessage(
    agentId: string,
    message: string,
    priority: "normal" | "high" = "normal"
  ): Promise<void> {
    await this.send({ type: "queue_message", agent_id: agentId, message, priority });
  }

  async sendSteerMessage(agentId: string, message: string): Promise<void> {
    await this.send({ type: "send_steer_message", agent_id: agentId, message });
  }

  async clearQueue(agentId: string): Promise<void> {
    await this.send({ type: "clear_queue", agent_id: agentId });
  }

  async setSteerMode(agentId: string, mode: SteerMode): Promise<void> {
    await this.send({ type: "set_steer_mode", agent_id: agentId, mode });
  }

  async interruptAgent(agentId: string): Promise<void> {
    await this.send({ type: "interrupt_agent", agent_id: agentId });
  }

  async getQueueState(agentId: string): Promise<any> {
    return this.send({ type: "get_queue_state", agent_id: agentId });
  }
}

// =============================================================================
// Demo Scenarios
// =============================================================================

async function demoQueueMode(client: OrkisClient, agentId: string) {
  console.log("\n" + "=".repeat(60));
  console.log("Demo: Queue Mode");
  console.log("=".repeat(60));
  console.log("Messages will be queued while the agent is busy\n");

  // Set to queue mode
  await client.setSteerMode(agentId, "queue");
  console.log("[Set] Steer mode: queue");

  // Start a long-running task
  console.log("[Sending] Long task: 'Count from 1 to 50'");
  await client.sendMessage(agentId, "Count from 1 to 50, one number per line");

  // Wait a moment for the agent to start
  await sleep(1000);

  // Queue additional messages while agent is busy
  console.log("[Queuing] 'Also calculate 10 * 5'");
  await client.queueMessage(agentId, "Also calculate 10 * 5");

  console.log("[Queuing] 'And tell me a joke'");
  await client.queueMessage(agentId, "And tell me a joke");

  // Check queue state
  const queueState = await client.getQueueState(agentId);
  console.log(`[Queue] ${queueState.state?.messages?.length || 0} messages queued`);

  // Wait for completion
  console.log("[Waiting] for agent to process queue...");
}

async function demoSteerMode(client: OrkisClient, agentId: string) {
  console.log("\n" + "=".repeat(60));
  console.log("Demo: Steer Mode (Immediate)");
  console.log("=".repeat(60));
  console.log("Messages will interrupt and steer the agent\n");

  // Set to immediate mode
  await client.setSteerMode(agentId, "immediate");
  console.log("[Set] Steer mode: immediate");

  // Start a task
  console.log("[Sending] Task: 'Search for all .ts files'");
  await client.sendMessage(agentId, "Search for all TypeScript files in this project");

  // Wait a moment
  await sleep(500);

  // Send a steering message
  console.log("[Steering] 'Actually, focus only on the scripts folder'");
  await client.sendSteerMessage(agentId, "Actually, focus only on the scripts folder");

  console.log("[Waiting] for agent to process...");
}

async function demoInterrupt(client: OrkisClient, agentId: string) {
  console.log("\n" + "=".repeat(60));
  console.log("Demo: Interrupt Agent");
  console.log("=".repeat(60));
  console.log("Demonstrating how to interrupt a running agent\n");

  // Start a potentially long task
  console.log("[Sending] Long task: 'List all files recursively'");
  await client.sendMessage(agentId, "List all files in this project recursively with full paths");

  // Wait a moment
  await sleep(2000);

  // Interrupt the agent
  console.log("[Interrupt] Stopping agent mid-operation...");
  await client.interruptAgent(agentId);

  // Send a new message after interrupt
  console.log("[Sending] New task after interrupt: 'Just say hello'");
  await client.sendMessage(agentId, "Just say hello");
}

async function demoPriorityQueue(client: OrkisClient, agentId: string) {
  console.log("\n" + "=".repeat(60));
  console.log("Demo: Priority Queue");
  console.log("=".repeat(60));
  console.log("High priority messages are processed first\n");

  // Set to queue mode
  await client.setSteerMode(agentId, "queue");

  // Start a task
  console.log("[Sending] Initial task");
  await client.sendMessage(agentId, "Read the README.md file");

  await sleep(500);

  // Queue messages with different priorities
  console.log("[Queuing] Normal priority: 'Also read tsconfig.json'");
  await client.queueMessage(agentId, "Also read tsconfig.json", "normal");

  console.log("[Queuing] HIGH priority: 'URGENT: Stop and just say OK'");
  await client.queueMessage(agentId, "URGENT: Stop everything and just say OK", "high");

  console.log("[Queuing] Normal priority: 'And read package.json'");
  await client.queueMessage(agentId, "And read package.json", "normal");

  // Check queue - high priority should be first
  const queueState = await client.getQueueState(agentId);
  console.log("\n[Queue Order]:");
  for (const msg of queueState.state?.messages || []) {
    console.log(`  ${msg.priority === "high" ? "HIGH" : "normal"}: ${msg.content.slice(0, 40)}...`);
  }
}

async function demoClearQueue(client: OrkisClient, agentId: string) {
  console.log("\n" + "=".repeat(60));
  console.log("Demo: Clear Queue");
  console.log("=".repeat(60));
  console.log("Clearing all queued messages\n");

  // Set to queue mode
  await client.setSteerMode(agentId, "queue");

  // Start a task
  await client.sendMessage(agentId, "Count from 1 to 100");
  await sleep(500);

  // Queue several messages
  await client.queueMessage(agentId, "Message 1");
  await client.queueMessage(agentId, "Message 2");
  await client.queueMessage(agentId, "Message 3");

  let queueState = await client.getQueueState(agentId);
  console.log(`[Before Clear] ${queueState.state?.messages?.length || 0} messages queued`);

  // Clear the queue
  console.log("[Clearing] queue...");
  await client.clearQueue(agentId);

  queueState = await client.getQueueState(agentId);
  console.log(`[After Clear] ${queueState.state?.messages?.length || 0} messages queued`);
}

// =============================================================================
// Event Logger
// =============================================================================

function setupEventLogger(client: OrkisClient) {
  client.onEvent((event) => {
    switch (event.type) {
      case "agent_status":
        console.log(`[Event] Status: ${event.status}`);
        break;
      case "agent_message":
        const content = event.message.content?.slice(0, 80) || "";
        console.log(`[Event] Message (${event.message.message_type}): ${content}...`);
        break;
      case "queue_message_added":
        console.log(`[Event] Queue +1: "${event.message.content.slice(0, 40)}..."`);
        break;
      case "queue_message_removed":
        console.log(`[Event] Queue -1: ${event.message_id}`);
        break;
      case "queue_cleared":
        console.log(`[Event] Queue cleared`);
        break;
      case "steer_mode_changed":
        console.log(`[Event] Steer mode: ${event.mode}`);
        break;
      case "agent_interrupted":
        console.log(`[Event] Agent interrupted!`);
        break;
      case "steer_message_injected":
        console.log(`[Event] Steer message injected: "${event.message.slice(0, 40)}..."`);
        break;
    }
  });
}

// =============================================================================
// Main
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║         Agent Prompt Steering Demonstration              ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("This demo shows how to:");
  console.log("  - Queue messages while agent is busy");
  console.log("  - Steer (redirect) a running agent mid-task");
  console.log("  - Interrupt an agent operation");
  console.log("  - Use priority queue for urgent messages");
  console.log("");

  const client = new OrkisClient();

  try {
    // Connect to runtime
    await client.connect();

    // Start an agent
    console.log("[Starting] Claude Code agent...");
    const response = await client.startAgent({
      agent_type: "claude-code",
      name: "Steering Demo Agent",
      working_dir: process.cwd(),
      prompt: "Hello! I'm ready to help.",
    });

    const agentId = response.agent.id;
    console.log(`[Started] Agent ID: ${agentId}`);

    // Subscribe to events
    await client.subscribe(agentId);

    // Set up event logging
    setupEventLogger(client);

    // Wait for initial response
    await sleep(2000);

    // Run demos (uncomment the ones you want to run)
    // Each demo is independent - run one at a time for best results

    await demoQueueMode(client, agentId);
    // await demoSteerMode(client, agentId);
    // await demoInterrupt(client, agentId);
    // await demoPriorityQueue(client, agentId);
    // await demoClearQueue(client, agentId);

    // Wait for everything to complete
    console.log("\n[Waiting] for all operations to complete...");
    await sleep(10000);

    // Stop the agent
    console.log("\n[Stopping] agent...");
    await client.stopAgent(agentId);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    client.disconnect();
  }

  console.log("\n" + "=".repeat(60));
  console.log("Demo complete!");
  console.log("=".repeat(60));
}

main().catch(console.error);
