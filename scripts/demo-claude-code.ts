#!/usr/bin/env npx ts-node
/**
 * Demo: Claude Agent SDK - Comprehensive Feature Coverage
 *
 * This script demonstrates all major features of the Claude Agent SDK
 * as documented in the official documentation.
 *
 * Prerequisites:
 *   - ANTHROPIC_API_KEY environment variable set
 *   - npm install @anthropic-ai/claude-agent-sdk zod
 *
 * Usage:
 *   npx ts-node demo-claude-code.ts [example-name]
 *
 * Examples:
 *   npx ts-node demo-claude-code.ts basic
 *   npx ts-node demo-claude-code.ts hooks
 *   npx ts-node demo-claude-code.ts all
 */

import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// =============================================================================
// Configuration
// =============================================================================

const EXAMPLES = [
  "basic",
  "hooks",
  "all-hooks",
  "tool-restrictions",
  "system-prompt",
  "abort",
  "session-resume",
  "session-fork",
  "subagents",
  "permissions",
  "mcp-server",
  "context-options",
  "structured-output",
  "can-use-tool",
  "settings-sources",
  "file-checkpointing",
  "sandbox",
];

const selectedExample = process.argv[2] || "basic";

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

function printSection(title: string) {
  console.log("\n" + "=".repeat(60));
  console.log(title);
  console.log("=".repeat(60) + "\n");
}

// =============================================================================
// Example 1: Basic Query
// =============================================================================

async function basicQuery() {
  printSection("Example: Basic Query");
  console.log("The simplest usage - just pass a prompt\n");

  const result = query({
    prompt: "What files are in the current directory?",
    options: {
      cwd: process.cwd(),
    },
  });

  for await (const message of result) {
    const msg = message as any;
    if (msg.type === "system" && msg.subtype === "init") {
      console.log(`[Init] Session: ${msg.session_id}`);
    } else if (msg.type === "assistant") {
      console.log(`[Assistant] ${extractText(msg.message)}`);
    } else if (msg.type === "result") {
      console.log(`[Complete]`);
    }
  }
}

// =============================================================================
// Example 2: All Hook Types
// =============================================================================

async function allHooksDemo() {
  printSection("Example: All Hook Types");
  console.log("Demonstrating all available hook events\n");

  /*
   * Available hooks:
   * - PreToolUse: Before tool execution (can block/modify)
   * - PostToolUse: After successful tool execution
   * - PostToolUseFailure: After failed tool execution
   * - UserPromptSubmit: When user submits a prompt
   * - Stop: When agent stops
   * - SubagentStart: When subagent initializes
   * - SubagentStop: When subagent completes
   * - PreCompact: Before conversation compaction
   * - PermissionRequest: When permission dialog shown
   * - SessionStart: When session initializes
   * - SessionEnd: When session terminates
   * - Notification: On agent status messages
   */

  const hookLog: string[] = [];

  const result = query({
    prompt: "Read the package.json file and tell me the project name",
    options: {
      cwd: process.cwd(),
      hooks: {
        // PreToolUse - runs before each tool call
        PreToolUse: [
          {
            hooks: [
              async (input: any) => {
                hookLog.push(`PreToolUse: ${input.tool_name}`);
                console.log(`[Hook:PreToolUse] Tool: ${input.tool_name}`);
                console.log(`  Input: ${JSON.stringify(input.tool_input).slice(0, 50)}...`);

                // Can return permission decisions:
                // { hookSpecificOutput: { permissionDecision: 'allow' | 'deny' | 'ask' } }
                // Can modify input:
                // { hookSpecificOutput: { updatedInput: { ...modified } } }
                return {};
              },
            ],
          },
        ],

        // PostToolUse - runs after successful tool execution
        PostToolUse: [
          {
            hooks: [
              async (input: any) => {
                hookLog.push(`PostToolUse: ${input.tool_name}`);
                console.log(`[Hook:PostToolUse] Tool: ${input.tool_name}`);
                console.log(`  Response length: ${JSON.stringify(input.tool_response || "").length} chars`);
                return {};
              },
            ],
          },
        ],

        // Stop - runs when agent completes
        Stop: [
          {
            hooks: [
              async (input: any) => {
                hookLog.push(`Stop`);
                console.log(`[Hook:Stop] Agent completed`);
                console.log(`  Session: ${input.session_id}`);
                return {};
              },
            ],
          },
        ],

        // SessionStart - runs when session initializes
        SessionStart: [
          {
            hooks: [
              async (input: any) => {
                hookLog.push(`SessionStart: ${input.source}`);
                console.log(`[Hook:SessionStart] Source: ${input.source}`);
                // source can be: 'startup' | 'resume' | 'clear' | 'compact'
                return {};
              },
            ],
          },
        ],

        // Notification - runs on status messages
        Notification: [
          {
            hooks: [
              async (input: any) => {
                hookLog.push(`Notification`);
                console.log(`[Hook:Notification] Status update`);
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

  console.log("\n--- Hook Execution Summary ---");
  for (const entry of hookLog) {
    console.log(`  ${entry}`);
  }
}

// =============================================================================
// Example 3: Tool Matcher Hooks
// =============================================================================

async function hooksWithMatchers() {
  printSection("Example: Hooks with Matchers");
  console.log("Using matchers to target specific tools\n");

  const result = query({
    prompt: "List TypeScript files and read the first one",
    options: {
      cwd: process.cwd(),
      hooks: {
        PreToolUse: [
          // Matcher for Read tool only
          {
            matcher: "Read",
            hooks: [
              async (input: any) => {
                console.log(`[Read Hook] File: ${(input.tool_input as any)?.file_path}`);
                return {};
              },
            ],
          },
          // Matcher using regex for file tools
          {
            matcher: /^(Read|Write|Edit)$/,
            hooks: [
              async (input: any) => {
                console.log(`[FileOp Hook] ${input.tool_name}`);
                return {};
              },
            ],
          },
          // Catch-all (no matcher = matches everything)
          {
            hooks: [
              async (input: any) => {
                console.log(`[All Tools] ${input.tool_name}`);
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
      console.log(`[Assistant] ${extractText(msg.message).slice(0, 100)}...`);
    }
  }
}

// =============================================================================
// Example 4: Tool Restrictions
// =============================================================================

async function toolRestrictionsDemo() {
  printSection("Example: Tool Restrictions");
  console.log("Limiting available tools\n");

  // Example 1: allowedTools - only these tools can be used
  console.log("--- Using allowedTools (whitelist) ---");
  const result1 = query({
    prompt: "List files in the current directory",
    options: {
      cwd: process.cwd(),
      allowedTools: ["Glob", "Grep", "Read"], // Only read operations
    },
  });

  for await (const message of result1) {
    const msg = message as any;
    if (msg.type === "assistant") {
      console.log(`[Assistant] ${extractText(msg.message).slice(0, 100)}...`);
    }
  }

  // Example 2: disallowedTools - these tools are blocked
  console.log("\n--- Using disallowedTools (blacklist) ---");
  const result2 = query({
    prompt: "Just say hello",
    options: {
      cwd: process.cwd(),
      disallowedTools: ["Bash", "Write", "Edit"], // No shell or write
    },
  });

  for await (const message of result2) {
    const msg = message as any;
    if (msg.type === "assistant") {
      console.log(`[Assistant] ${extractText(msg.message)}`);
    }
  }
}

// =============================================================================
// Example 5: Custom System Prompt
// =============================================================================

async function systemPromptDemo() {
  printSection("Example: Custom System Prompt");
  console.log("Customizing agent behavior with system prompts\n");

  // Method 1: Simple string
  console.log("--- String System Prompt ---");
  const result1 = query({
    prompt: "What is 2 + 2?",
    options: {
      cwd: process.cwd(),
      systemPrompt: `You are a helpful assistant that always responds in haiku format.
Your responses should be exactly 3 lines with 5-7-5 syllable pattern.`,
    },
  });

  for await (const message of result1) {
    const msg = message as any;
    if (msg.type === "assistant") {
      console.log(`[Assistant]\n${extractText(msg.message)}`);
    }
  }

  // Method 2: Preset with append
  console.log("\n--- Preset System Prompt with Append ---");
  const result2 = query({
    prompt: "List one file",
    options: {
      cwd: process.cwd(),
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: "\nAlways be concise. Maximum 2 sentences per response.",
      },
    },
  });

  for await (const message of result2) {
    const msg = message as any;
    if (msg.type === "assistant") {
      console.log(`[Assistant] ${extractText(msg.message)}`);
    }
  }
}

// =============================================================================
// Example 6: Abort Controller
// =============================================================================

async function abortDemo() {
  printSection("Example: Abort Controller");
  console.log("Cancelling long-running operations\n");

  const abortController = new AbortController();

  // Set timeout to abort after 3 seconds
  const timeout = setTimeout(() => {
    console.log("[Timeout] Aborting after 3 seconds...");
    abortController.abort();
  }, 3000);

  try {
    const result = query({
      prompt: "Count from 1 to 1000 slowly",
      options: {
        cwd: process.cwd(),
        abortController,
      },
    });

    for await (const message of result) {
      const msg = message as any;
      if (msg.type === "assistant") {
        console.log(`[Assistant] ${extractText(msg.message).slice(0, 50)}...`);
      }
    }
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.log("[Success] Query was aborted as expected");
    } else {
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }

  // Also demonstrate the interrupt() method
  console.log("\n--- Using query.interrupt() ---");
  const result2 = query({
    prompt: "Count to 100",
    options: { cwd: process.cwd() },
  });

  setTimeout(async () => {
    console.log("[Interrupt] Calling interrupt()...");
    await result2.interrupt();
  }, 1000);

  try {
    for await (const message of result2) {
      const msg = message as any;
      if (msg.type === "assistant") {
        console.log(`[Assistant] ${extractText(msg.message).slice(0, 30)}...`);
      }
    }
  } catch {
    console.log("[Success] Query interrupted");
  }
}

// =============================================================================
// Example 7: Session Resume
// =============================================================================

async function sessionResumeDemo() {
  printSection("Example: Session Resume");
  console.log("Continuing conversations across queries\n");

  let sessionId: string | undefined;

  // First query - establish session
  console.log("--- Session 1: Establishing ---");
  const result1 = query({
    prompt: "Remember: The secret code is ALPHA-123. Just acknowledge.",
    options: { cwd: process.cwd() },
  });

  for await (const message of result1) {
    const msg = message as any;
    if (msg.type === "system" && msg.subtype === "init") {
      sessionId = msg.session_id;
      console.log(`[Session ID] ${sessionId}`);
    }
    if (msg.type === "assistant") {
      console.log(`[Assistant] ${extractText(msg.message)}`);
    }
  }

  // Second query - resume session
  if (sessionId) {
    console.log("\n--- Session 2: Resuming ---");
    const result2 = query({
      prompt: "What was the secret code I told you?",
      options: {
        cwd: process.cwd(),
        resume: sessionId,
      },
    });

    for await (const message of result2) {
      const msg = message as any;
      if (msg.type === "assistant") {
        console.log(`[Assistant] ${extractText(msg.message)}`);
      }
    }

    // Third query - continue with 'continue' option
    console.log("\n--- Session 3: Using continue option ---");
    const result3 = query({
      prompt: "And what was the second word of the code?",
      options: {
        cwd: process.cwd(),
        continue: true, // Continues most recent conversation
      },
    });

    for await (const message of result3) {
      const msg = message as any;
      if (msg.type === "assistant") {
        console.log(`[Assistant] ${extractText(msg.message)}`);
      }
    }
  }
}

// =============================================================================
// Example 8: Session Fork
// =============================================================================

async function sessionForkDemo() {
  printSection("Example: Session Fork");
  console.log("Creating a branch from an existing session\n");

  let sessionId: string | undefined;

  // Original session
  console.log("--- Original Session ---");
  const result1 = query({
    prompt: "We are working on Project X. Acknowledge.",
    options: { cwd: process.cwd() },
  });

  for await (const message of result1) {
    const msg = message as any;
    if (msg.type === "system" && msg.subtype === "init") {
      sessionId = msg.session_id;
    }
    if (msg.type === "assistant") {
      console.log(`[Assistant] ${extractText(msg.message)}`);
    }
  }

  if (sessionId) {
    // Fork to a new session (preserves history but new ID)
    console.log("\n--- Forked Session ---");
    const result2 = query({
      prompt: "What project are we working on? (This is a forked session)",
      options: {
        cwd: process.cwd(),
        resume: sessionId,
        forkSession: true, // Creates new session ID
      },
    });

    for await (const message of result2) {
      const msg = message as any;
      if (msg.type === "system" && msg.subtype === "init") {
        console.log(`[New Session ID] ${msg.session_id}`);
      }
      if (msg.type === "assistant") {
        console.log(`[Assistant] ${extractText(msg.message)}`);
      }
    }
  }
}

// =============================================================================
// Example 9: Subagents (Custom Agents)
// =============================================================================

async function subagentsDemo() {
  printSection("Example: Subagents (Custom Agents)");
  console.log("Defining specialized subagents for task delegation\n");

  const result = query({
    prompt: "Review the code structure of this project",
    options: {
      cwd: process.cwd(),
      allowedTools: ["Read", "Glob", "Grep", "Task"], // Task required for subagents
      agents: {
        // Code reviewer agent - read-only access
        "code-reviewer": {
          description: "Expert at reviewing code for quality and best practices",
          prompt: `You are a code review specialist. Analyze code for:
- Code quality and readability
- Potential bugs
- Best practices
- Performance issues
Only use read operations - never modify code.`,
          tools: ["Read", "Glob", "Grep"], // Read-only tools
          model: "sonnet",
        },

        // Documentation agent
        "doc-analyzer": {
          description: "Analyzes documentation and README files",
          prompt: `You are a documentation specialist. Focus on:
- README completeness
- API documentation
- Code comments
Provide concise summaries.`,
          tools: ["Read", "Glob"],
          model: "haiku", // Use faster model for simple tasks
        },

        // Inherits all tools if not specified
        "general-helper": {
          description: "General purpose helper for misc tasks",
          prompt: "You are a helpful assistant.",
          // tools not specified = inherits all allowed tools
          // model not specified or 'inherit' = uses parent model
        },
      },
    },
  });

  for await (const message of result) {
    const msg = message as any;
    if (msg.type === "assistant") {
      console.log(`[Assistant] ${extractText(msg.message).slice(0, 200)}...`);
    }
  }
}

// =============================================================================
// Example 10: Permission Modes
// =============================================================================

async function permissionModesDemo() {
  printSection("Example: Permission Modes");
  console.log("Different permission modes for different use cases\n");

  /*
   * Permission modes:
   * - 'default': Standard behavior, uses canUseTool for unmatched tools
   * - 'acceptEdits': Auto-accept file edits (Edit, Write, mkdir, rm, mv, cp)
   * - 'dontAsk': Auto-deny unless explicitly allowed by rules
   * - 'bypassPermissions': Bypass all checks (requires allowDangerouslySkipPermissions)
   */

  // Default mode
  console.log("--- Default Mode ---");
  const result1 = query({
    prompt: "List files",
    options: {
      cwd: process.cwd(),
      permissionMode: "default",
    },
  });

  for await (const message of result1) {
    const msg = message as any;
    if (msg.type === "assistant") {
      console.log(`[Assistant] ${extractText(msg.message).slice(0, 50)}...`);
    }
  }

  // Accept edits mode - auto-approves file operations
  console.log("\n--- Accept Edits Mode ---");
  console.log("(Would auto-approve file edits if any were made)");

  // Don't ask mode - auto-denies unless explicitly allowed
  console.log("\n--- Don't Ask Mode ---");
  console.log("(Would auto-deny tools not in allowedTools)");

  // Bypass permissions - use with extreme caution!
  console.log("\n--- Bypass Permissions (DANGEROUS) ---");
  console.log("Requires allowDangerouslySkipPermissions: true");
  // const dangerousResult = query({
  //   prompt: "...",
  //   options: {
  //     permissionMode: 'bypassPermissions',
  //     allowDangerouslySkipPermissions: true,
  //   },
  // });
}

// =============================================================================
// Example 11: MCP Server Integration
// =============================================================================

async function mcpServerDemo() {
  printSection("Example: MCP Server Integration");
  console.log("Creating and using MCP servers\n");

  // Create an in-process MCP server with custom tools
  const calculatorTool = tool(
    "calculator",
    "Performs mathematical calculations",
    {
      expression: z.string().describe("Math expression to evaluate"),
    },
    async (args) => {
      try {
        // Simple eval for demo (use a proper math parser in production!)
        const result = eval(args.expression);
        return {
          content: [{ type: "text", text: `Result: ${result}` }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
          isError: true,
        };
      }
    }
  );

  const greetingTool = tool(
    "greet",
    "Generates a greeting message",
    {
      name: z.string().describe("Name to greet"),
      style: z.enum(["formal", "casual"]).optional().describe("Greeting style"),
    },
    async (args) => {
      const greeting =
        args.style === "formal"
          ? `Good day, ${args.name}. How may I assist you?`
          : `Hey ${args.name}! What's up?`;
      return {
        content: [{ type: "text", text: greeting }],
      };
    }
  );

  const mcpServer = createSdkMcpServer({
    name: "demo-tools",
    version: "1.0.0",
    tools: [calculatorTool, greetingTool],
  });

  const result = query({
    prompt: "Use the calculator to compute 15 * 7 + 3, then greet 'Alice' formally",
    options: {
      cwd: process.cwd(),
      mcpServers: {
        "demo-tools": mcpServer,
      },
    },
  });

  for await (const message of result) {
    const msg = message as any;
    if (msg.type === "assistant") {
      console.log(`[Assistant] ${extractText(msg.message)}`);
    }
  }

  // Show MCP server status
  console.log("\n--- External MCP Server Config Example ---");
  console.log(`
// Stdio transport (external process)
mcpServers: {
  "file-server": {
    type: "stdio",
    command: "npx",
    args: ["-y", "@anthropic-ai/mcp-server-filesystem"],
    env: { ALLOWED_DIRS: "/home/user" }
  }
}

// SSE transport (Server-Sent Events)
mcpServers: {
  "remote-server": {
    type: "sse",
    url: "https://example.com/mcp",
    headers: { "Authorization": "Bearer token" }
  }
}

// HTTP transport
mcpServers: {
  "http-server": {
    type: "http",
    url: "https://api.example.com/mcp",
    headers: { "X-API-Key": "key" }
  }
}
`);
}

// =============================================================================
// Example 12: Context Options
// =============================================================================

async function contextOptionsDemo() {
  printSection("Example: Context Options");
  console.log("Controlling conversation limits and budgets\n");

  console.log("--- Available context options ---");
  console.log(`
options: {
  // Limit conversation turns
  maxTurns: 10,

  // Control thinking tokens
  maxThinkingTokens: 8000,

  // Set cost budget (in USD)
  maxBudgetUsd: 1.00,

  // Enable 1M context beta
  betas: ['context-1m-2025-08-07'],

  // Fallback model if primary fails
  fallbackModel: 'claude-3-5-sonnet-20241022',

  // Specific model selection
  model: 'claude-sonnet-4-20250514',
}
`);

  const result = query({
    prompt: "Say hello briefly",
    options: {
      cwd: process.cwd(),
      maxTurns: 5, // Limit to 5 turns
      // maxBudgetUsd: 0.10, // Limit cost
    },
  });

  for await (const message of result) {
    const msg = message as any;
    if (msg.type === "assistant") {
      console.log(`[Assistant] ${extractText(msg.message)}`);
    }
  }

  // Demonstrate dynamic model/thinking changes
  console.log("\n--- Dynamic model changes via query methods ---");
  console.log(`
const result = query({ prompt: "...", options: {} });

// Change model mid-conversation
await result.setModel('claude-opus-4-20250514');

// Adjust thinking tokens
await result.setMaxThinkingTokens(16000);

// Change permission mode
await result.setPermissionMode('acceptEdits');

// Get account info
const account = await result.accountInfo();
console.log(account.balance);
`);
}

// =============================================================================
// Example 13: Structured Output
// =============================================================================

async function structuredOutputDemo() {
  printSection("Example: Structured Output");
  console.log("Getting JSON responses with schema validation\n");

  const result = query({
    prompt: "List 3 popular programming languages with their main use cases",
    options: {
      cwd: process.cwd(),
      outputFormat: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            languages: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  useCase: { type: "string" },
                  popularity: { type: "number", minimum: 1, maximum: 10 },
                },
                required: ["name", "useCase", "popularity"],
              },
            },
          },
          required: ["languages"],
        },
      },
    },
  });

  for await (const message of result) {
    const msg = message as any;
    if (msg.type === "assistant") {
      const text = extractText(msg.message);
      try {
        const parsed = JSON.parse(text);
        console.log("[Structured Output]:");
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log(`[Raw Output] ${text}`);
      }
    }
  }
}

// =============================================================================
// Example 14: canUseTool Callback
// =============================================================================

async function canUseToolDemo() {
  printSection("Example: canUseTool Callback");
  console.log("Custom permission logic for tool usage\n");

  const blockedPaths = ["/etc", "/var", "/root"];

  const result = query({
    prompt: "List files in the current directory",
    options: {
      cwd: process.cwd(),
      canUseTool: async (toolName, input, { signal, suggestions }) => {
        console.log(`[canUseTool] Checking: ${toolName}`);

        // Example: Block Read tool for sensitive paths
        if (toolName === "Read") {
          const filePath = (input as any)?.file_path || "";
          if (blockedPaths.some((p) => filePath.startsWith(p))) {
            return {
              behavior: "deny",
              message: `Access to ${filePath} is blocked`,
              interrupt: false, // Don't stop the agent, just deny this tool
            };
          }
        }

        // Example: Modify input for Bash tool
        if (toolName === "Bash") {
          console.log(`  Modifying Bash command...`);
          return {
            behavior: "allow",
            updatedInput: {
              ...input,
              // Could add safety wrappers, logging, etc.
            },
          };
        }

        // Allow everything else
        return {
          behavior: "allow",
          updatedInput: input,
        };
      },
    },
  });

  for await (const message of result) {
    const msg = message as any;
    if (msg.type === "assistant") {
      console.log(`[Assistant] ${extractText(msg.message).slice(0, 100)}...`);
    }
  }
}

// =============================================================================
// Example 15: Settings Sources
// =============================================================================

async function settingsSourcesDemo() {
  printSection("Example: Settings Sources");
  console.log("Controlling which config files to load\n");

  console.log(`
Settings sources control which configuration files are loaded:

- 'user':    ~/.claude/settings.json (personal config)
- 'project': .claude/settings.json (team-shared config)
- 'local':   .claude/settings.local.json (local overrides)

options: {
  // Only load project settings (ignore user config)
  settingSources: ['project'],

  // Load user and project, but not local
  settingSources: ['user', 'project'],

  // Empty array = load no filesystem settings
  settingSources: [],
}
`);

  const result = query({
    prompt: "Say hello",
    options: {
      cwd: process.cwd(),
      settingSources: ["project"], // Only project settings
    },
  });

  for await (const message of result) {
    const msg = message as any;
    if (msg.type === "assistant") {
      console.log(`[Assistant] ${extractText(msg.message)}`);
    }
  }
}

// =============================================================================
// Example 16: File Checkpointing
// =============================================================================

async function fileCheckpointingDemo() {
  printSection("Example: File Checkpointing");
  console.log("Enabling file change tracking for rewind capability\n");

  console.log(`
File checkpointing allows rewinding file changes:

const result = query({
  prompt: "Make some changes...",
  options: {
    enableFileCheckpointing: true,
  },
});

// Later, rewind to a specific message
await result.rewindFiles(userMessageUuid);

This is useful for:
- Undoing unwanted changes
- Creating "save points" in long sessions
- Reviewing changes incrementally
`);

  // Note: Actual rewind requires file changes to have been made
  const result = query({
    prompt: "Just say hello (checkpointing enabled)",
    options: {
      cwd: process.cwd(),
      enableFileCheckpointing: true,
    },
  });

  for await (const message of result) {
    const msg = message as any;
    if (msg.type === "assistant") {
      console.log(`[Assistant] ${extractText(msg.message)}`);
    }
  }
}

// =============================================================================
// Example 17: Sandbox Configuration
// =============================================================================

async function sandboxDemo() {
  printSection("Example: Sandbox Configuration");
  console.log("Configuring sandbox for secure execution\n");

  console.log(`
Sandbox options for secure command execution:

options: {
  sandbox: {
    enabled: true,
    autoAllowBashIfSandboxed: true,
    excludedCommands: ['sudo', 'rm -rf'],
    allowUnsandboxedCommands: false,
    network: {
      allowLocalBinding: true,
      allowUnixSockets: ['/tmp/socket'],
      httpProxyPort: 8080,
      socksProxyPort: 1080,
    },
    ignoreViolations: {
      file: ['/tmp/*'],
      network: ['localhost'],
    },
  },
}
`);

  const result = query({
    prompt: "List current directory",
    options: {
      cwd: process.cwd(),
      // sandbox: { enabled: true },
    },
  });

  for await (const message of result) {
    const msg = message as any;
    if (msg.type === "assistant") {
      console.log(`[Assistant] ${extractText(msg.message).slice(0, 100)}...`);
    }
  }
}

// =============================================================================
// Example 18: Query Object Methods
// =============================================================================

async function queryMethodsDemo() {
  printSection("Example: Query Object Methods");
  console.log("Additional methods available on the query object\n");

  const result = query({
    prompt: "Hello",
    options: { cwd: process.cwd() },
  });

  // Get supported commands (slash commands)
  console.log("--- Supported Commands ---");
  try {
    const commands = await result.supportedCommands();
    console.log(`Found ${commands.length} slash commands`);
    for (const cmd of commands.slice(0, 5)) {
      console.log(`  /${cmd.name}: ${cmd.description?.slice(0, 50)}...`);
    }
  } catch (e) {
    console.log("(Commands lookup not available in this mode)");
  }

  // Get supported models
  console.log("\n--- Supported Models ---");
  try {
    const models = await result.supportedModels();
    console.log(`Found ${models.length} models`);
    for (const model of models.slice(0, 5)) {
      console.log(`  ${model.name}`);
    }
  } catch (e) {
    console.log("(Models lookup not available in this mode)");
  }

  // Get MCP server status
  console.log("\n--- MCP Server Status ---");
  try {
    const status = await result.mcpServerStatus();
    console.log(`${status.length} MCP servers configured`);
  } catch (e) {
    console.log("(MCP status not available)");
  }

  // Consume remaining messages
  for await (const message of result) {
    const msg = message as any;
    if (msg.type === "assistant") {
      console.log(`\n[Assistant] ${extractText(msg.message)}`);
    }
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║        Claude Agent SDK - Comprehensive Demo                 ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("\nError: ANTHROPIC_API_KEY environment variable is not set");
    console.error("Please set it before running this demo:");
    console.error("  export ANTHROPIC_API_KEY=your-api-key");
    process.exit(1);
  }

  if (selectedExample === "all") {
    console.log("\nRunning ALL examples...\n");
    await basicQuery();
    await allHooksDemo();
    await hooksWithMatchers();
    await toolRestrictionsDemo();
    await systemPromptDemo();
    await abortDemo();
    await sessionResumeDemo();
    await sessionForkDemo();
    await subagentsDemo();
    await permissionModesDemo();
    await mcpServerDemo();
    await contextOptionsDemo();
    await structuredOutputDemo();
    await canUseToolDemo();
    await settingsSourcesDemo();
    await fileCheckpointingDemo();
    await sandboxDemo();
    await queryMethodsDemo();
  } else {
    console.log(`\nRunning example: ${selectedExample}`);
    console.log(`Available examples: ${EXAMPLES.join(", ")}`);
    console.log("Run 'all' to see all examples\n");

    switch (selectedExample) {
      case "basic":
        await basicQuery();
        break;
      case "hooks":
        await hooksWithMatchers();
        break;
      case "all-hooks":
        await allHooksDemo();
        break;
      case "tool-restrictions":
        await toolRestrictionsDemo();
        break;
      case "system-prompt":
        await systemPromptDemo();
        break;
      case "abort":
        await abortDemo();
        break;
      case "session-resume":
        await sessionResumeDemo();
        break;
      case "session-fork":
        await sessionForkDemo();
        break;
      case "subagents":
        await subagentsDemo();
        break;
      case "permissions":
        await permissionModesDemo();
        break;
      case "mcp-server":
        await mcpServerDemo();
        break;
      case "context-options":
        await contextOptionsDemo();
        break;
      case "structured-output":
        await structuredOutputDemo();
        break;
      case "can-use-tool":
        await canUseToolDemo();
        break;
      case "settings-sources":
        await settingsSourcesDemo();
        break;
      case "file-checkpointing":
        await fileCheckpointingDemo();
        break;
      case "sandbox":
        await sandboxDemo();
        break;
      case "query-methods":
        await queryMethodsDemo();
        break;
      default:
        console.log(`Unknown example: ${selectedExample}`);
        console.log(`Available: ${EXAMPLES.join(", ")}`);
    }
  }

  printSection("Demo Complete!");
}

main().catch(console.error);
