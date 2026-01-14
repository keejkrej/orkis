#!/usr/bin/env npx ts-node
/**
 * Demo: OpenAI Codex SDK Usage
 *
 * This script demonstrates how to use the OpenAI Codex SDK directly,
 * similar to how it's used in the Orkis agent-runtime.
 *
 * Prerequisites:
 *   - OPENAI_API_KEY environment variable set
 *   - npm install @openai/codex-sdk
 *
 * Usage:
 *   npx ts-node demo-codex.ts
 *   # or with a custom prompt:
 *   npx ts-node demo-codex.ts "Create a hello world script"
 */

import { Codex } from "@openai/codex-sdk";

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_PROMPT = "What files are in the current directory? List them.";

// Get prompt from command line or use default
const userPrompt = process.argv[2] || DEFAULT_PROMPT;

// =============================================================================
// Example 1: Basic Thread
// =============================================================================

async function basicThread() {
  console.log("=".repeat(60));
  console.log("Example 1: Basic Thread");
  console.log("=".repeat(60));
  console.log(`Prompt: "${userPrompt}"\n`);

  try {
    // Create Codex instance with default settings
    const codex = new Codex();

    // Start a new thread
    const thread = codex.startThread();

    // Run the thread with the prompt
    const result = await thread.run(userPrompt);

    // Process and display the result
    processResult(result);

    // Get thread ID for potential resume later
    console.log(`\n[Info] Thread ID: ${thread.id}`);
  } catch (error) {
    console.error("Error:", error);
  }
}

// =============================================================================
// Example 2: Thread with Approval Modes
// =============================================================================

async function threadWithApproval() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 2: Thread with Approval Modes");
  console.log("=".repeat(60));
  console.log("Demonstrating different approval modes\n");

  try {
    // Create Codex with auto-approval for all operations
    // Available modes: 'auto', 'untrusted', 'on-failure', 'on-request', 'never'
    const codex = new Codex({
      approvalMode: "auto", // Automatically approve all operations
    });

    const thread = codex.startThread();

    console.log("[Mode] Auto-approval enabled");
    console.log("[Prompt] Reading package.json...\n");

    const result = await thread.run("Read the package.json file and tell me the project name");

    processResult(result);
  } catch (error) {
    console.error("Error:", error);
  }
}

// =============================================================================
// Example 3: Thread with Sandbox Modes
// =============================================================================

async function threadWithSandbox() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 3: Thread with Sandbox Modes");
  console.log("=".repeat(60));
  console.log("Demonstrating different sandbox modes\n");

  try {
    // Available sandbox modes:
    // - 'read-only': Can only read files
    // - 'workspace-write': Can write to workspace
    // - 'danger-full-access': Full system access (use with caution!)

    const codex = new Codex({
      sandboxMode: "read-only", // Restrict to read-only operations
      approvalMode: "auto",
    });

    const thread = codex.startThread();

    console.log("[Mode] Read-only sandbox");
    console.log("[Prompt] Listing TypeScript files...\n");

    const result = await thread.run("List all TypeScript files in this project");

    processResult(result);
  } catch (error) {
    console.error("Error:", error);
  }
}

// =============================================================================
// Example 4: Multi-Turn Conversation
// =============================================================================

async function multiTurnConversation() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 4: Multi-Turn Conversation");
  console.log("=".repeat(60));
  console.log("Demonstrating conversation continuity\n");

  try {
    const codex = new Codex({
      approvalMode: "auto",
    });

    const thread = codex.startThread();

    // First turn
    console.log("--- Turn 1 ---");
    console.log("[User] Remember this number: 42\n");

    let result = await thread.run("Remember this number: 42. Just acknowledge that you've noted it.");
    processResult(result);

    // Second turn - continues the same thread
    console.log("\n--- Turn 2 ---");
    console.log("[User] What number did I tell you to remember?\n");

    result = await thread.run("What number did I tell you to remember?");
    processResult(result);

    // Third turn
    console.log("\n--- Turn 3 ---");
    console.log("[User] Multiply it by 2\n");

    result = await thread.run("Multiply that number by 2 and tell me the result");
    processResult(result);
  } catch (error) {
    console.error("Error:", error);
  }
}

// =============================================================================
// Example 5: Thread Resume
// =============================================================================

async function threadResume() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 5: Thread Resume");
  console.log("=".repeat(60));
  console.log("Demonstrating thread resume functionality\n");

  let threadId: string | undefined;

  try {
    // First session
    console.log("--- Session 1: Creating thread ---");

    const codex1 = new Codex({ approvalMode: "auto" });
    const thread1 = codex1.startThread();

    const result1 = await thread1.run("Remember: The secret code is ALPHA-BRAVO-123");
    processResult(result1);

    threadId = thread1.id;
    console.log(`[Saved] Thread ID: ${threadId}`);

    // Simulate closing and reopening
    console.log("\n[Simulating session restart...]\n");

    // Second session - resume the thread
    console.log("--- Session 2: Resuming thread ---");

    const codex2 = new Codex({ approvalMode: "auto" });
    const thread2 = codex2.resumeThread(threadId!);

    const result2 = await thread2.run("What was the secret code I told you?");
    processResult(result2);
  } catch (error) {
    console.error("Error:", error);
  }
}

// =============================================================================
// Example 6: Web Search Integration
// =============================================================================

async function webSearchDemo() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 6: Web Search Integration");
  console.log("=".repeat(60));
  console.log("Demonstrating web search capability\n");

  try {
    const codex = new Codex({
      approvalMode: "auto",
      webSearch: true, // Enable web search
    });

    const thread = codex.startThread();

    console.log("[Prompt] What is the current weather in New York?\n");

    const result = await thread.run(
      "What is the current weather in New York City? Search the web for current conditions."
    );

    processResult(result);
  } catch (error) {
    console.error("Error:", error);
  }
}

// =============================================================================
// Example 7: Full Auto Mode
// =============================================================================

async function fullAutoDemo() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 7: Full Auto Mode");
  console.log("=".repeat(60));
  console.log("WARNING: This mode auto-approves everything!\n");

  try {
    const codex = new Codex({
      fullAuto: true, // Full auto mode - no approvals needed
    });

    const thread = codex.startThread();

    console.log("[Prompt] List files and show package.json\n");

    const result = await thread.run(
      "List the files in the current directory, then show the contents of package.json"
    );

    processResult(result);
  } catch (error) {
    console.error("Error:", error);
  }
}

// =============================================================================
// Example 8: Additional Directories
// =============================================================================

async function additionalDirsDemo() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 8: Additional Directories");
  console.log("=".repeat(60));
  console.log("Giving Codex access to additional directories\n");

  try {
    const codex = new Codex({
      approvalMode: "auto",
      additionalDirs: ["/tmp", process.env.HOME || "~"], // Add extra directories
    });

    const thread = codex.startThread();

    console.log(`[Config] Added dirs: /tmp, ${process.env.HOME}`);
    console.log("[Prompt] List files in both current dir and /tmp\n");

    const result = await thread.run(
      "List the files in the current directory, and also list what's in /tmp"
    );

    processResult(result);
  } catch (error) {
    console.error("Error:", error);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function processResult(result: unknown): void {
  if (typeof result === "string") {
    console.log(`[Response] ${result}`);
    return;
  }

  if (result && typeof result === "object") {
    const r = result as any;

    // Process items if available (reasoning, messages, tool uses)
    if (r.items && Array.isArray(r.items)) {
      for (const item of r.items) {
        switch (item.type) {
          case "reasoning":
            console.log(`[Reasoning] ${item.text?.slice(0, 100)}...`);
            break;
          case "agent_message":
            console.log(`[Response] ${item.text}`);
            break;
          case "tool_use":
            console.log(`[Tool] ${item.tool}: ${JSON.stringify(item.input).slice(0, 50)}...`);
            if (item.output) {
              console.log(`[Output] ${JSON.stringify(item.output).slice(0, 100)}...`);
            }
            break;
        }
      }
    }

    // Process final response
    if (r.finalResponse) {
      console.log(`[Final] ${r.finalResponse}`);
    } else if (!r.items) {
      console.log(`[Response] ${JSON.stringify(result).slice(0, 200)}...`);
    }
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║              OpenAI Codex SDK Demonstration              ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");

  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY environment variable is not set");
    console.error("Please set it before running this demo:");
    console.error("  export OPENAI_API_KEY=your-api-key");
    process.exit(1);
  }

  // Run examples (comment out ones you don't want to run)
  await basicThread();
  // await threadWithApproval();
  // await threadWithSandbox();
  // await multiTurnConversation();
  // await threadResume();
  // await webSearchDemo();
  // await fullAutoDemo();
  // await additionalDirsDemo();

  console.log("\n" + "=".repeat(60));
  console.log("Demo complete!");
  console.log("=".repeat(60));
}

main().catch(console.error);
