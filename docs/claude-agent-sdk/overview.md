# Claude Agent SDK Overview

Build production AI agents with Claude Code as a library

> **Note**: The Claude Code SDK has been renamed to the Claude Agent SDK.

Build AI agents that autonomously read files, run commands, search the web, edit code, and more. The Agent SDK gives you the same tools, agent loop, and context management that power Claude Code, programmable in Python and TypeScript.

## Quick Start

### Python
```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    async for message in query(
        prompt="Find and fix the bug in auth.py",
        options=ClaudeAgentOptions(allowed_tools=["Read", "Edit", "Bash"])
    ):
        print(message)  # Claude reads the file, finds the bug, edits it

asyncio.run(main())
```

### TypeScript
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Find and fix the bug in auth.py",
  options: { allowedTools: ["Read", "Edit", "Bash"] }
})) {
  console.log(message);  // Claude reads the file, finds the bug, edits it
}
```

## Capabilities

### Built-in Tools

Your agent can read files, run commands, and search codebases out of the box:

| Tool | What it does |
|------|--------------|
| **Read** | Read any file in the working directory |
| **Write** | Create new files |
| **Edit** | Make precise edits to existing files |
| **Bash** | Run terminal commands, scripts, git operations |
| **Glob** | Find files by pattern (`**/*.ts`, `src/**/*.py`) |
| **Grep** | Search file contents with regex |
| **WebSearch** | Search the web for current information |
| **WebFetch** | Fetch and parse web page content |
| **AskUserQuestion** | Ask the user clarifying questions with multiple choice options |

### Hooks

Run custom code at key points in the agent lifecycle. SDK hooks use callback functions to validate, log, block, or transform agent behavior.

**Available hooks:** `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`, and more.

```typescript
import { query, HookCallback } from "@anthropic-ai/claude-agent-sdk";
import { appendFileSync } from "fs";

const logFileChange: HookCallback = async (input) => {
  const filePath = (input as any).tool_input?.file_path ?? "unknown";
  appendFileSync("./audit.log", `${new Date().toISOString()}: modified ${filePath}\n`);
  return {};
};

for await (const message of query({
  prompt: "Refactor utils.py to improve readability",
  options: {
    permissionMode: "acceptEdits",
    hooks: {
      PostToolUse: [{ matcher: "Edit|Write", hooks: [logFileChange] }]
    }
  }
})) {
  if ("result" in message) console.log(message.result);
}
```

### Subagents

Spawn specialized agents to handle focused subtasks. Your main agent delegates work, and subagents report back with results.

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Use the code-reviewer agent to review this codebase",
  options: {
    allowedTools: ["Read", "Glob", "Grep", "Task"],
    agents: {
      "code-reviewer": {
        description: "Expert code reviewer for quality and security reviews.",
        prompt: "Analyze code quality and suggest improvements.",
        tools: ["Read", "Glob", "Grep"]
      }
    }
  }
})) {
  if ("result" in message) console.log(message.result);
}
```

### MCP (Model Context Protocol)

Connect to external systems via the Model Context Protocol: databases, browsers, APIs, and more.

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Open example.com and describe what you see",
  options: {
    mcpServers: {
      playwright: { command: "npx", args: ["@playwright/mcp@latest"] }
    }
  }
})) {
  if ("result" in message) console.log(message.result);
}
```

### Permissions

Control exactly which tools your agent can use. Allow safe operations, block dangerous ones, or require approval for sensitive actions.

**Permission Modes:**
- `bypassPermissions` - Skip all permission prompts (read-only operations)
- `acceptEdits` - Auto-accept file edit operations
- `default` - Require approval for sensitive operations

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Review this code for best practices",
  options: {
    allowedTools: ["Read", "Glob", "Grep"],
    permissionMode: "bypassPermissions"
  }
})) {
  if ("result" in message) console.log(message.result);
}
```

### Sessions

Maintain context across multiple exchanges. Claude remembers files read, analysis done, and conversation history. Resume sessions later, or fork them to explore different approaches.

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

let sessionId: string | undefined;

// First query: capture the session ID
for await (const message of query({
  prompt: "Read the authentication module",
  options: { allowedTools: ["Read", "Glob"] }
})) {
  if (message.type === "system" && message.subtype === "init") {
    sessionId = message.session_id;
  }
}

// Resume with full context from the first query
for await (const message of query({
  prompt: "Now find all places that call it",  // "it" = auth module
  options: { resume: sessionId }
})) {
  if ("result" in message) console.log(message.result);
}
```

## Claude Code Features

The SDK also supports Claude Code's filesystem-based configuration:

| Feature | Description | Location |
|---------|-------------|----------|
| Skills | Specialized capabilities defined in Markdown | `.claude/skills/SKILL.md` |
| Slash commands | Custom commands for common tasks | `.claude/commands/*.md` |
| Memory | Project context and instructions | `CLAUDE.md` or `.claude/CLAUDE.md` |
| Plugins | Extend with custom commands, agents, and MCP servers | Programmatic via `plugins` option |

## Configuration Options (ClaudeAgentOptions)

| Option | Type | Description |
|--------|------|-------------|
| `prompt` | string | The prompt to send to the agent |
| `systemPrompt` | string | Custom system prompt |
| `allowedTools` | string[] | List of tools the agent can use |
| `permissionMode` | string | Permission handling mode |
| `cwd` | string | Working directory for the agent |
| `model` | string | Model to use (e.g., "claude-sonnet-4-20250514") |
| `maxTurns` | number | Maximum conversation turns |
| `mcpServers` | object | MCP server configurations |
| `hooks` | object | Hook callbacks for lifecycle events |
| `agents` | object | Custom subagent definitions |
| `resume` | string | Session ID to resume |
| `abortController` | AbortController | For cancelling the agent |
| `settingSources` | string[] | Settings sources (e.g., ["project"]) |

## Message Types

- **AssistantMessage** - Response from Claude
- **UserMessage** - User input
- **SystemMessage** - System instructions
- **ResultMessage** - Tool execution results

## Installation

```bash
# TypeScript
npm install @anthropic-ai/claude-agent-sdk

# Python
pip install claude-agent-sdk
```

## Environment Variables

```bash
export ANTHROPIC_API_KEY=your-api-key

# Alternative providers
export CLAUDE_CODE_USE_BEDROCK=1  # Amazon Bedrock
export CLAUDE_CODE_USE_VERTEX=1  # Google Vertex AI
export CLAUDE_CODE_USE_FOUNDRY=1  # Microsoft Foundry
```

## Resources

- [Official Documentation](https://platform.claude.com/docs/en/agent-sdk/overview)
- [TypeScript SDK GitHub](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Python SDK GitHub](https://github.com/anthropics/claude-agent-sdk-python)
- [Example Agents](https://github.com/anthropics/claude-agent-sdk-demos)
