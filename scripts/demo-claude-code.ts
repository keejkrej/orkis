#!/usr/bin/env npx ts-node
/**
 * Demo: Claude Code SDK Usage
 *
 * This script demonstrates how to use the Claude Code SDK directly,
 * similar to how it's used in the Orkis agent-runtime.
 *
 * Prerequisites:
 *   - ANTHROPIC_API_KEY environment variable set
 *   - npm install @anthropic-ai/claude-agent-sdk
 *
 * Usage:
 *   npx ts-node demo-claude-code.ts
 *   # or with a custom prompt:
 *   npx ts-node demo-claude-code.ts "Create a hello world script"
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_PROMPT = "What files are in the current directory? List them.";

// Get prompt from command line or use default
const userPrompt = process.argv[2] || DEFAULT_PROMPT;

// =============================================================================
// Example 1: Basic Query
// =============================================================================

async function basicQuery() {
  console.log("=".repeat(60));
  console.log("Example 1: Basic Query");
  console.log("=".repeat(60));
  console.log(`Prompt: "${userPrompt}"\n`);

  try {
    // The simplest way to use the SDK - just pass a prompt
    const result = query({
      prompt: userPrompt,
      options: {
        cwd: process.cwd(),
      },
    });

    // The result is an async iterator that yields messages
    for await (const message of result) {
      const msg = message as any;

      if (msg.type === "system" && msg.subtype === "init") {
        console.log(`[System] Session ID: ${msg.session_id}`);
      } else if (msg.type === "assistant") {
        console.log(`[Assistant] ${extractText(msg.message)}`);
      } else if (msg.type === "result") {
        console.log(`[Result] Query completed`);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

// =============================================================================
// Example 2: Query with Hooks
// =============================================================================

async function queryWithHooks() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 2: Query with Hooks");
  console.log("=".repeat(60));
  console.log("Demonstrating tool tracking with hooks\n");

  const toolLog: { tool: string; input: any; timestamp: Date }[] = [];

  try {
    const result = query({
      prompt: "Read the package.json file and tell me the project name",
      options: {
        cwd: process.cwd(),
        hooks: {
          // Hook that runs BEFORE each tool use
          PreToolUse: [
            {
              hooks: [
                async (input: any) => {
                  console.log(`[PreToolUse] About to use: ${input.tool_name}`);
                  toolLog.push({
                    tool: input.tool_name,
                    input: input.tool_input,
                    timestamp: new Date(),
                  });

                  // Return empty object to continue (no modifications)
                  // You can also return { continue: false } to block the tool
                  return {};
                },
              ],
            },
          ],

          // Hook that runs AFTER each tool use
          PostToolUse: [
            {
              hooks: [
                async (input: any) => {
                  console.log(`[PostToolUse] Completed: ${input.tool_name}`);
                  return {};
                },
              ],
            },
          ],

          // Hook that runs when the agent stops
          Stop: [
            {
              hooks: [
                async () => {
                  console.log(`[Stop] Agent completed. Tools used: ${toolLog.length}`);
                  return {};
                },
              ],
            },
          ],
        },
      },
    });

    for await (const message of result) {
      const msg = message as any;
      if (msg.type === "assistant") {
        console.log(`[Assistant] ${extractText(msg.message)}`);
      }
    }

    // Print tool usage summary
    console.log("\n--- Tool Usage Summary ---");
    for (const entry of toolLog) {
      console.log(`  ${entry.tool}: ${JSON.stringify(entry.input).slice(0, 50)}...`);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

// =============================================================================
// Example 3: Query with Tool Restrictions
// =============================================================================

async function queryWithRestrictions() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 3: Query with Tool Restrictions");
  console.log("=".repeat(60));
  console.log("Only allowing Read and Glob tools (no Write/Edit)\n");

  try {
    const result = query({
      prompt: "List all TypeScript files in this project",
      options: {
        cwd: process.cwd(),
        // Only allow specific tools - prevents writing/editing
        allowedTools: ["Read", "Glob", "Grep", "Bash"],
      },
    });

    for await (const message of result) {
      const msg = message as any;
      if (msg.type === "assistant") {
        console.log(`[Assistant] ${extractText(msg.message)}`);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

// =============================================================================
// Example 4: Query with Custom System Prompt
// =============================================================================

async function queryWithSystemPrompt() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 4: Query with Custom System Prompt");
  console.log("=".repeat(60));
  console.log("Adding custom instructions via system prompt\n");

  try {
    const result = query({
      prompt: "What is 2 + 2?",
      options: {
        cwd: process.cwd(),
        systemPrompt: `You are a helpful assistant that always responds in haiku format.
Your responses should be exactly 3 lines with 5-7-5 syllable pattern.
Be creative while staying accurate!`,
      },
    });

    for await (const message of result) {
      const msg = message as any;
      if (msg.type === "assistant") {
        console.log(`[Assistant]\n${extractText(msg.message)}`);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

// =============================================================================
// Example 5: Query with Abort Controller
// =============================================================================

async function queryWithAbort() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 5: Query with Abort Controller");
  console.log("=".repeat(60));
  console.log("Demonstrating how to cancel a running query\n");

  const abortController = new AbortController();

  // Set a timeout to abort after 5 seconds
  const timeout = setTimeout(() => {
    console.log("[Timeout] Aborting query...");
    abortController.abort();
  }, 5000);

  try {
    const result = query({
      prompt: "Count from 1 to 100, printing each number slowly",
      options: {
        cwd: process.cwd(),
        abortController,
      },
    });

    for await (const message of result) {
      const msg = message as any;
      if (msg.type === "assistant") {
        console.log(`[Assistant] ${extractText(msg.message).slice(0, 100)}...`);
      }
    }
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.log("[Aborted] Query was cancelled successfully");
    } else {
      console.error("Error:", error);
    }
  } finally {
    clearTimeout(timeout);
  }
}

// =============================================================================
// Example 6: Session Resume
// =============================================================================

async function sessionResumeDemo() {
  console.log("\n" + "=".repeat(60));
  console.log("Example 6: Session Resume");
  console.log("=".repeat(60));
  console.log("Demonstrating session continuity\n");

  let sessionId: string | undefined;

  try {
    // First query - establish session
    console.log("--- First query (establishing session) ---");
    const result1 = query({
      prompt: "Remember this number: 42. Just acknowledge that you've noted it.",
      options: {
        cwd: process.cwd(),
      },
    });

    for await (const message of result1) {
      const msg = message as any;
      if (msg.type === "system" && msg.subtype === "init") {
        sessionId = msg.session_id;
        console.log(`[System] Session ID: ${sessionId}`);
      }
      if (msg.type === "assistant") {
        console.log(`[Assistant] ${extractText(msg.message)}`);
      }
    }

    // Second query - resume session
    if (sessionId) {
      console.log("\n--- Second query (resuming session) ---");
      const result2 = query({
        prompt: "What number did I ask you to remember?",
        options: {
          cwd: process.cwd(),
          resume: sessionId, // Resume the previous session
        },
      });

      for await (const message of result2) {
        const msg = message as any;
        if (msg.type === "assistant") {
          console.log(`[Assistant] ${extractText(msg.message)}`);
        }
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function extractText(message: unknown): string {
  if (typeof message === "string") return message;
  if (Array.isArray(message)) {
    return message
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text)
      .join("\n");
  }
  if (message && typeof message === "object" && "content" in message) {
    return extractText((message as any).content);
  }
  return JSON.stringify(message);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║           Claude Code SDK Demonstration                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is not set");
    console.error("Please set it before running this demo:");
    console.error("  export ANTHROPIC_API_KEY=your-api-key");
    process.exit(1);
  }

  // Run examples (comment out ones you don't want to run)
  await basicQuery();
  // await queryWithHooks();
  // await queryWithRestrictions();
  // await queryWithSystemPrompt();
  // await queryWithAbort();
  // await sessionResumeDemo();

  console.log("\n" + "=".repeat(60));
  console.log("Demo complete!");
  console.log("=".repeat(60));
}

main().catch(console.error);
