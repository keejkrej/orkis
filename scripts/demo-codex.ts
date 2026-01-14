#!/usr/bin/env npx ts-node
/**
 * Demo: OpenAI Codex SDK - Comprehensive Feature Coverage
 *
 * This script demonstrates all major features of the OpenAI Codex SDK
 * as documented in the official documentation.
 *
 * Prerequisites:
 *   - OPENAI_API_KEY environment variable set
 *   - npm install @openai/codex-sdk zod zod-to-json-schema
 *
 * Usage:
 *   npx ts-node demo-codex.ts [example-name]
 *
 * Examples:
 *   npx ts-node demo-codex.ts basic
 *   npx ts-node demo-codex.ts streaming
 *   npx ts-node demo-codex.ts all
 */

import { Codex } from "@openai/codex-sdk";
import { z } from "zod";
// import { zodToJsonSchema } from "zod-to-json-schema";

// =============================================================================
// Configuration
// =============================================================================

const EXAMPLES = [
  "basic",
  "thread-options",
  "approval-modes",
  "sandbox-modes",
  "multi-turn",
  "thread-resume",
  "image-input",
  "web-search",
  "config-overrides",
  "streaming",
  "event-types",
  "background-events",
  "structured-output",
  "additional-dirs",
  "full-auto",
  "all-options",
];

const selectedExample = process.argv[2] || "basic";

// =============================================================================
// Helper Functions
// =============================================================================

function printSection(title: string) {
  console.log("\n" + "=".repeat(60));
  console.log(title);
  console.log("=".repeat(60) + "\n");
}

function processResult(result: unknown): void {
  if (typeof result === "string") {
    console.log(`[Response] ${result}`);
    return;
  }

  if (result && typeof result === "object") {
    const r = result as any;

    // Process items if available
    if (r.items && Array.isArray(r.items)) {
      for (const item of r.items) {
        switch (item.type) {
          case "reasoning":
            console.log(`[Reasoning] ${item.text?.slice(0, 80)}...`);
            break;
          case "agent_message":
            console.log(`[Message] ${item.text}`);
            break;
          case "tool_use":
          case "command_execution":
            console.log(`[Tool] ${item.tool || item.command}: ${JSON.stringify(item.input || item.args || "").slice(0, 50)}...`);
            if (item.output) {
              console.log(`  Output: ${JSON.stringify(item.output).slice(0, 80)}...`);
            }
            break;
          case "file_change":
            console.log(`[FileChange] ${item.path}: ${item.changeType}`);
            break;
          case "mcp_tool_call":
            console.log(`[MCP Tool] ${item.tool}: ${item.status}`);
            break;
          case "web_search":
            console.log(`[WebSearch] ${item.query}`);
            break;
          case "plan_update":
            console.log(`[Plan] Updated strategy`);
            break;
        }
      }
    }

    // Process final response
    if (r.finalResponse) {
      console.log(`[Final] ${r.finalResponse}`);
    } else if (!r.items) {
      console.log(`[Result] ${JSON.stringify(result).slice(0, 200)}...`);
    }
  }
}

// =============================================================================
// Example 1: Basic Thread
// =============================================================================

async function basicThread() {
  printSection("Example: Basic Thread");
  console.log("The simplest usage - create thread and run\n");

  const codex = new Codex();
  const thread = codex.startThread();

  console.log(`[Thread ID] ${thread.id}`);

  const result = await thread.run("What files are in the current directory?");
  processResult(result);
}

// =============================================================================
// Example 2: Thread Options
// =============================================================================

async function threadOptionsDemo() {
  printSection("Example: Thread Options");
  console.log("Configuring thread creation options\n");

  const codex = new Codex();

  // With working directory
  console.log("--- Custom Working Directory ---");
  const thread1 = codex.startThread({
    workingDirectory: process.cwd(),
  });
  console.log(`Thread created in: ${process.cwd()}`);

  // Skip git repo check
  console.log("\n--- Skip Git Repo Check ---");
  const thread2 = codex.startThread({
    skipGitRepoCheck: true, // Run even outside git repos
  });
  console.log("Git check bypassed");

  const result = await thread1.run("List one file");
  processResult(result);
}

// =============================================================================
// Example 3: Approval Modes
// =============================================================================

async function approvalModesDemo() {
  printSection("Example: Approval Modes");
  console.log("Different approval policies for tool execution\n");

  /*
   * Approval modes (--ask-for-approval):
   * - 'untrusted': Ask for everything (default)
   * - 'on-failure': Auto-retry failures, ask otherwise
   * - 'on-request': Only ask when explicitly requested
   * - 'never': Never ask (dangerous!)
   *
   * High-level modes:
   * - Suggest: Default, asks for every action
   * - Auto-Edit: Auto file ops, asks for commands outside workspace
   * - Full-Auto: No prompts (--full-auto flag)
   */

  console.log("--- Available Approval Modes ---");
  console.log(`
CLI Flags:
  --ask-for-approval untrusted   # Ask for everything (safest)
  --ask-for-approval on-failure  # Auto-retry on failure
  --ask-for-approval on-request  # Only ask when requested
  --ask-for-approval never       # Never ask (dangerous)

High-level:
  (default)    # Suggest mode - asks for every action
  --auto-edit  # Auto-edit mode - auto file ops
  --full-auto  # Full-auto mode - no prompts

Config.toml:
  approval_policy = "on-request"
`);

  // Example with auto mode
  const codex = new Codex();
  const thread = codex.startThread();

  console.log("--- Running with defaults ---");
  const result = await thread.run("Just say hello");
  processResult(result);
}

// =============================================================================
// Example 4: Sandbox Modes
// =============================================================================

async function sandboxModesDemo() {
  printSection("Example: Sandbox Modes");
  console.log("Controlling file system and command access\n");

  /*
   * Sandbox modes:
   * - 'read-only': Only read operations (default)
   * - 'workspace-write': Write within working directory
   * - 'danger-full-access': No restrictions (very dangerous!)
   */

  console.log("--- Available Sandbox Modes ---");
  console.log(`
CLI Flags:
  --sandbox read-only          # Read only (default, safest)
  --sandbox workspace-write    # Write in workspace only
  --sandbox danger-full-access # Full access (dangerous!)
  --yolo                       # Alias for full auto + full access

Config.toml:
  sandbox_mode = "workspace-write"

  [sandbox_workspace_write]
  network_access = true  # Allow network in workspace mode
`);

  const codex = new Codex();
  const thread = codex.startThread();

  console.log("--- Running with read-only sandbox ---");
  const result = await thread.run("List files in current directory");
  processResult(result);
}

// =============================================================================
// Example 5: Multi-Turn Conversation
// =============================================================================

async function multiTurnDemo() {
  printSection("Example: Multi-Turn Conversation");
  console.log("Maintaining context across multiple turns\n");

  const codex = new Codex();
  const thread = codex.startThread();

  // Turn 1
  console.log("--- Turn 1 ---");
  console.log("[User] Remember: The secret is ALPHA-BETA-123");
  let result = await thread.run("Remember this secret code: ALPHA-BETA-123. Just acknowledge.");
  processResult(result);

  // Turn 2
  console.log("\n--- Turn 2 ---");
  console.log("[User] What was the secret?");
  result = await thread.run("What was the secret code I told you?");
  processResult(result);

  // Turn 3
  console.log("\n--- Turn 3 ---");
  console.log("[User] What's the middle part?");
  result = await thread.run("What's the middle part of that code?");
  processResult(result);

  // Turn 4 - Context is preserved
  console.log("\n--- Turn 4 ---");
  console.log("[User] Multiply the number in the code by 2");
  result = await thread.run("What number appears in the code? Multiply it by 2.");
  processResult(result);
}

// =============================================================================
// Example 6: Thread Resume
// =============================================================================

async function threadResumeDemo() {
  printSection("Example: Thread Resume");
  console.log("Resuming threads after session restart\n");

  // Threads are persisted in ~/.codex/sessions
  // You can resume them by ID

  const codex1 = new Codex();
  const thread1 = codex1.startThread();
  const threadId = thread1.id;

  console.log(`--- Session 1: Creating thread ${threadId} ---`);
  let result = await thread1.run("Remember: Project codename is PHOENIX. Acknowledge.");
  processResult(result);

  // Simulate session restart
  console.log("\n[Simulating session restart...]\n");

  // Resume with new Codex instance
  const codex2 = new Codex();
  const thread2 = codex2.resumeThread(threadId);

  console.log(`--- Session 2: Resuming thread ${threadId} ---`);
  result = await thread2.run("What was the project codename?");
  processResult(result);

  // You can also use --last flag in CLI
  console.log("\n--- CLI Resume Options ---");
  console.log(`
# Resume most recent session
codex --last "continue our conversation"

# Resume specific thread
# (get thread ID from ~/.codex/sessions)
`);
}

// =============================================================================
// Example 7: Image Input
// =============================================================================

async function imageInputDemo() {
  printSection("Example: Image Input");
  console.log("Providing images for analysis\n");

  console.log("--- Image Input Formats ---");
  console.log(`
SDK Usage:
  const turn = await thread.run([
    { type: "text", text: "Analyze this screenshot" },
    { type: "local_image", path: "/path/to/image.png" }
  ]);

Multiple Images:
  const turn = await thread.run([
    { type: "text", text: "Compare these images" },
    { type: "local_image", path: "/path/to/image1.png" },
    { type: "local_image", path: "/path/to/image2.jpg" }
  ]);

CLI Usage:
  codex --image /path/to/image.png "Describe this image"
  codex --image img1.png,img2.jpg "Compare these images"

Supported formats: PNG, JPEG
`);

  // Note: Actual image analysis requires a valid image file
  const codex = new Codex();
  const thread = codex.startThread();

  console.log("--- Text-only demo (image would require file) ---");
  const result = await thread.run("Just say hello - image demo placeholder");
  processResult(result);
}

// =============================================================================
// Example 8: Web Search
// =============================================================================

async function webSearchDemo() {
  printSection("Example: Web Search");
  console.log("Enabling web search capability\n");

  console.log("--- Web Search Configuration ---");
  console.log(`
CLI Usage:
  codex --search "Find the latest React documentation"

Config.toml:
  [features]
  web_search_request = true

  [tools]
  web_search = true

  [sandbox_workspace_write]
  network_access = true  # Optional: for full network access
`);

  // Note: Web search requires proper configuration
  const codex = new Codex();
  const thread = codex.startThread();

  console.log("--- Demo without actual web search ---");
  const result = await thread.run("Just say hello - web search requires config");
  processResult(result);
}

// =============================================================================
// Example 9: Config Overrides
// =============================================================================

async function configOverridesDemo() {
  printSection("Example: Config Overrides");
  console.log("Overriding configuration via CLI and SDK\n");

  console.log("--- CLI Config Overrides ---");
  console.log(`
# Override single value
codex -c model=gpt-5.2-codex "prompt"
codex --config sandbox_mode=workspace-write "prompt"

# Override nested value
codex -c "features.web_search_request=true" "prompt"

# Multiple overrides
codex -c model=gpt-5.2-codex -c sandbox_mode=workspace-write "prompt"
`);

  console.log("\n--- SDK Environment Overrides ---");
  console.log(`
const codex = new Codex({
  env: {
    PATH: "/usr/local/bin:/usr/bin",
    CUSTOM_VAR: "value",
    // SDK auto-injects OPENAI_BASE_URL, CODEX_API_KEY
  }
});
`);

  console.log("\n--- Config File Locations ---");
  console.log(`
~/.codex/config.toml        # User config
requirements.toml           # Admin enforcement (enterprise)
`);

  console.log("\n--- Key Config Options ---");
  console.log(`
# Model selection
model = "gpt-5.2-codex"
model_provider = "openai"
model_reasoning_effort = "high"  # minimal | low | medium | high | xhigh

# Security
sandbox_mode = "workspace-write"
approval_policy = "on-request"

# Features
[features]
shell_tool = true
web_search_request = true
unified_exec = true

# Custom providers
[model_providers.custom]
base_url = "https://api.example.com"
env_key = "CUSTOM_API_KEY"
wire_api = "chat"  # or "responses"
`);

  const codex = new Codex({
    env: {
      // Custom environment variables
    },
  });
  const thread = codex.startThread();
  const result = await thread.run("Say hello");
  processResult(result);
}

// =============================================================================
// Example 10: Streaming (runStreamed)
// =============================================================================

async function streamingDemo() {
  printSection("Example: Streaming (runStreamed)");
  console.log("Getting real-time event updates\n");

  const codex = new Codex();
  const thread = codex.startThread();

  console.log("--- Streaming events ---");

  const { events } = await thread.runStreamed("List files and describe what you find");

  for await (const event of events) {
    switch (event.type) {
      case "thread.started":
        console.log(`[thread.started]`);
        break;
      case "turn.started":
        console.log(`[turn.started]`);
        break;
      case "turn.completed":
        console.log(`[turn.completed] Usage:`, (event as any).usage);
        break;
      case "turn.failed":
        console.log(`[turn.failed]`, (event as any).error);
        break;
      case "item.started":
        console.log(`[item.started] Type: ${(event as any).item?.type}`);
        break;
      case "item.completed":
        const item = (event as any).item;
        console.log(`[item.completed] Type: ${item?.type}`);
        if (item?.type === "agent_message") {
          console.log(`  Text: ${item.text?.slice(0, 60)}...`);
        }
        break;
      case "background_event":
        console.log(`[background_event] ${(event as any).message}`);
        break;
      case "error":
        console.log(`[error]`, (event as any).error);
        break;
      default:
        console.log(`[${event.type}]`);
    }
  }
}

// =============================================================================
// Example 11: Event Types
// =============================================================================

async function eventTypesDemo() {
  printSection("Example: Event Types");
  console.log("Understanding all streaming event types\n");

  console.log("--- Stream Event Types ---");
  console.log(`
| Event             | Description                        |
|-------------------|-----------------------------------|
| thread.started    | Session initialization            |
| turn.started      | Turn begins                       |
| turn.completed    | Turn finishes (includes usage)    |
| turn.failed       | Turn failed                       |
| item.started      | Item processing begins            |
| item.completed    | Item completed                    |
| background_event  | Progress notifications            |
| error             | Error occurred                    |
`);

  console.log("\n--- Item Types ---");
  console.log(`
| Item Type          | Description                       |
|-------------------|-----------------------------------|
| agent_message      | Assistant's text response         |
| reasoning          | Internal reasoning summary        |
| command_execution  | Shell command execution           |
| file_change        | Code modifications                |
| mcp_tool_call      | MCP tool call (with status)       |
| web_search         | Web search results                |
| plan_update        | Strategy revision                 |
`);

  console.log("\n--- MCP Tool Call Status ---");
  console.log(`
mcp_tool_call.status:
  - "in_progress": Tool is executing
  - "completed": Tool finished successfully
  - "failed": Tool execution failed
`);

  const codex = new Codex();
  const thread = codex.startThread();
  const result = await thread.run("Say hello");
  processResult(result);
}

// =============================================================================
// Example 12: Background Events
// =============================================================================

async function backgroundEventsDemo() {
  printSection("Example: Background Events");
  console.log("Sending progress updates during execution\n");

  console.log("--- Background Event Usage ---");
  console.log(`
// Send progress updates during streaming
await thread.sendBackgroundEvent("Gathering changelog entries...");
await thread.sendBackgroundEvent("Processing 15 files...");
await thread.sendBackgroundEvent("Almost done...");

// These appear as 'background_event' in the event stream
for await (const event of events) {
  if (event.type === "background_event") {
    console.log("Progress:", event.message);
  }
}
`);

  const codex = new Codex();
  const thread = codex.startThread();

  // Run with streaming to see events
  const { events } = await thread.runStreamed("Count to 5");

  for await (const event of events) {
    if (event.type === "background_event") {
      console.log(`[Progress] ${(event as any).message}`);
    } else if (event.type === "item.completed") {
      const item = (event as any).item;
      if (item?.type === "agent_message") {
        console.log(`[Message] ${item.text}`);
      }
    }
  }
}

// =============================================================================
// Example 13: Structured Output
// =============================================================================

async function structuredOutputDemo() {
  printSection("Example: Structured Output");
  console.log("Getting JSON responses with schema validation\n");

  const codex = new Codex();
  const thread = codex.startThread();

  // Define JSON schema
  const schema = {
    type: "object" as const,
    properties: {
      summary: { type: "string" as const },
      files: {
        type: "array" as const,
        items: { type: "string" as const },
      },
      count: { type: "number" as const },
    },
    required: ["summary", "files", "count"],
    additionalProperties: false,
  };

  console.log("--- With JSON Schema ---");
  const result = await thread.run("List 3 files and summarize", {
    outputSchema: schema,
  });

  if ((result as any).finalResponse) {
    try {
      const parsed = JSON.parse((result as any).finalResponse);
      console.log("[Structured Output]:");
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log("[Raw]:", (result as any).finalResponse);
    }
  } else {
    processResult(result);
  }

  console.log("\n--- Using Zod ---");
  console.log(`
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const schema = z.object({
  summary: z.string(),
  files: z.array(z.string()),
  count: z.number()
});

const result = await thread.run("List files", {
  outputSchema: zodToJsonSchema(schema, { target: "openAi" })
});
`);

  console.log("\n--- CLI Structured Output ---");
  console.log(`
# Use with schema file
codex exec "Extract metadata" --output-schema ./schema.json -o ./output.json
`);
}

// =============================================================================
// Example 14: Additional Directories
// =============================================================================

async function additionalDirsDemo() {
  printSection("Example: Additional Directories");
  console.log("Granting access to extra directories\n");

  console.log("--- CLI Usage ---");
  console.log(`
# Add extra directory access
codex --add-dir /path/to/extra "search in both directories"

# Change working directory
codex --cd /different/path "work here instead"
codex -C /different/path "work here instead"
`);

  console.log("\n--- Common Use Cases ---");
  console.log(`
# Access config files
codex --add-dir ~/.config "check my config"

# Access related project
codex --add-dir ../other-project "compare implementations"

# Access shared libraries
codex --add-dir /usr/local/lib "check available libraries"
`);

  const codex = new Codex();
  const thread = codex.startThread();
  const result = await thread.run("What directory am I in?");
  processResult(result);
}

// =============================================================================
// Example 15: Full Auto Mode
// =============================================================================

async function fullAutoDemo() {
  printSection("Example: Full Auto Mode");
  console.log("Running without any user prompts (DANGEROUS!)\n");

  console.log("--- Full Auto Configuration ---");
  console.log(`
CLI:
  codex --full-auto "complete this task autonomously"

  # Equivalent to:
  codex --sandbox workspace-write --ask-for-approval on-request "..."

  # Even more dangerous:
  codex --yolo "do everything without asking"
  # (alias for --full-auto + danger-full-access sandbox)

Config.toml:
  [defaults]
  full_auto = true  # Not recommended!

WARNING: Full auto mode can:
- Execute commands without approval
- Modify files without confirmation
- Make network requests
- Potentially cause damage

Only use in:
- Isolated environments
- Automated pipelines with proper safeguards
- Testing scenarios
`);

  const codex = new Codex();
  const thread = codex.startThread();

  console.log("\n--- Running with defaults (safe) ---");
  const result = await thread.run("Just say hello (not using full auto)");
  processResult(result);
}

// =============================================================================
// Example 16: All CLI Options Reference
// =============================================================================

async function allOptionsDemo() {
  printSection("Example: All CLI Options Reference");
  console.log("Complete reference of available options\n");

  console.log("--- Execution Options ---");
  console.log(`
--model, -m <model>       Override model
--profile, -p <name>      Load config profile
--cd, -C <path>           Set working directory
--add-dir <path>          Grant additional directory access
--skip-git-repo-check     Run outside Git repos
`);

  console.log("\n--- Output Options ---");
  console.log(`
--json                    Output JSONL stream
--output-last-message, -o Write final message to file
--output-schema <file>    JSON schema for structured output
`);

  console.log("\n--- Session Options ---");
  console.log(`
--last                    Resume most recent session
--thread <id>             Resume specific thread
`);

  console.log("\n--- Security Options ---");
  console.log(`
--sandbox <mode>          read-only | workspace-write | danger-full-access
--ask-for-approval <pol>  untrusted | on-failure | on-request | never
--auto-edit               Auto-approve file edits
--full-auto               No user prompts required
--yolo                    Full auto + full access (dangerous!)
`);

  console.log("\n--- Feature Flags ---");
  console.log(`
--enable <feature>        Enable a feature flag
--disable <feature>       Disable a feature flag
--search                  Enable web search for this query
--image <path>            Include image(s) in prompt
`);

  console.log("\n--- Model Options ---");
  console.log(`
--oss                     Use local OSS model (Ollama)
--provider <name>         Use custom model provider
`);

  console.log("\n--- Non-interactive Mode ---");
  console.log(`
codex exec "prompt"       Run non-interactively
codex exec -i file.txt    Read prompt from file
codex exec -i -            Read prompt from stdin
`);

  const codex = new Codex();
  const thread = codex.startThread();
  const result = await thread.run("Hello!");
  processResult(result);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║         OpenAI Codex SDK - Comprehensive Demo                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error("\nError: OPENAI_API_KEY environment variable is not set");
    console.error("Please set it before running this demo:");
    console.error("  export OPENAI_API_KEY=your-api-key");
    process.exit(1);
  }

  if (selectedExample === "all") {
    console.log("\nRunning ALL examples...\n");
    await basicThread();
    await threadOptionsDemo();
    await approvalModesDemo();
    await sandboxModesDemo();
    await multiTurnDemo();
    await threadResumeDemo();
    await imageInputDemo();
    await webSearchDemo();
    await configOverridesDemo();
    await streamingDemo();
    await eventTypesDemo();
    await backgroundEventsDemo();
    await structuredOutputDemo();
    await additionalDirsDemo();
    await fullAutoDemo();
    await allOptionsDemo();
  } else {
    console.log(`\nRunning example: ${selectedExample}`);
    console.log(`Available examples: ${EXAMPLES.join(", ")}`);
    console.log("Run 'all' to see all examples\n");

    switch (selectedExample) {
      case "basic":
        await basicThread();
        break;
      case "thread-options":
        await threadOptionsDemo();
        break;
      case "approval-modes":
        await approvalModesDemo();
        break;
      case "sandbox-modes":
        await sandboxModesDemo();
        break;
      case "multi-turn":
        await multiTurnDemo();
        break;
      case "thread-resume":
        await threadResumeDemo();
        break;
      case "image-input":
        await imageInputDemo();
        break;
      case "web-search":
        await webSearchDemo();
        break;
      case "config-overrides":
        await configOverridesDemo();
        break;
      case "streaming":
        await streamingDemo();
        break;
      case "event-types":
        await eventTypesDemo();
        break;
      case "background-events":
        await backgroundEventsDemo();
        break;
      case "structured-output":
        await structuredOutputDemo();
        break;
      case "additional-dirs":
        await additionalDirsDemo();
        break;
      case "full-auto":
        await fullAutoDemo();
        break;
      case "all-options":
        await allOptionsDemo();
        break;
      default:
        console.log(`Unknown example: ${selectedExample}`);
        console.log(`Available: ${EXAMPLES.join(", ")}`);
    }
  }

  printSection("Demo Complete!");
}

main().catch(console.error);
