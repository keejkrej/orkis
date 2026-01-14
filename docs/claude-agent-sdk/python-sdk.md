# Claude Agent SDK for Python

## Installation

```bash
pip install claude-agent-sdk
```

**Requirements:** Python 3.10+

**Note:** The Claude Code CLI is automatically bundled with the package. The SDK uses the bundled CLI by default.

## Quick Start

```python
import anyio
from claude_agent_sdk import query

async def main():
    async for message in query(prompt="What is 2 + 2?"):
        print(message)

anyio.run(main)
```

## Core APIs

### 1. `query()` Function

Simple async function for querying Claude Code. Returns an `AsyncIterator` of response messages.

```python
from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage, TextBlock

# Simple query
async for message in query(prompt="Hello Claude"):
    if isinstance(message, AssistantMessage):
        for block in message.content:
            if isinstance(block, TextBlock):
                print(block.text)

# With options
options = ClaudeAgentOptions(
    system_prompt="You are a helpful assistant",
    max_turns=1
)

async for message in query(prompt="Tell me a joke", options=options):
    print(message)
```

### Using Tools

```python
options = ClaudeAgentOptions(
    allowed_tools=["Read", "Write", "Bash"],
    permission_mode='acceptEdits'  # auto-accept file edits
)

async for message in query(
    prompt="Create a hello.py file",
    options=options
):
    # Process tool use and results
    pass
```

### Working Directory

```python
from pathlib import Path

options = ClaudeAgentOptions(
    cwd="/path/to/project"  # or Path("/path/to/project")
)
```

### 2. `ClaudeSDKClient` Class

Supports bidirectional, interactive conversations with Claude Code. Enables **custom tools** and **hooks**.

```python
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions

async with ClaudeSDKClient(options=options) as client:
    await client.query("Your prompt here")
    async for message in client.receive_response():
        print(message)
```

## Custom Tools (In-Process SDK MCP Servers)

Custom tools are Python functions offered to Claude via the `@tool` decorator.

```python
from claude_agent_sdk import tool, create_sdk_mcp_server, ClaudeAgentOptions, ClaudeSDKClient

# Define a tool using the @tool decorator
@tool("greet", "Greet a user", {"name": str})
async def greet_user(args):
    return {
        "content": [
            {"type": "text", "text": f"Hello, {args['name']}!"}
        ]
    }

# Create an SDK MCP server
server = create_sdk_mcp_server(
    name="my-tools",
    version="1.0.0",
    tools=[greet_user]
)

# Use it with Claude
options = ClaudeAgentOptions(
    mcp_servers={"tools": server},
    allowed_tools=["mcp__tools__greet"]
)

async with ClaudeSDKClient(options=options) as client:
    await client.query("Greet Alice")
    async for msg in client.receive_response():
        print(msg)
```

## Hooks

Hooks are Python functions invoked at specific agent loop points.

```python
from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient, HookMatcher

async def check_bash_command(input_data, tool_use_id, context):
    tool_name = input_data["tool_name"]
    tool_input = input_data["tool_input"]

    if tool_name != "Bash":
        return {}

    command = tool_input.get("command", "")
    block_patterns = ["foo.sh"]

    for pattern in block_patterns:
        if pattern in command:
            return {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": f"Command contains invalid pattern: {pattern}",
                }
            }
    return {}

options = ClaudeAgentOptions(
    allowed_tools=["Bash"],
    hooks={
        "PreToolUse": [
            HookMatcher(matcher="Bash", hooks=[check_bash_command]),
        ],
    }
)

async with ClaudeSDKClient(options=options) as client:
    await client.query("Run the bash command: echo 'Hello!'")
    async for msg in client.receive_response():
        print(msg)
```

## Configuration: ClaudeAgentOptions

| Option | Type | Description |
|--------|------|-------------|
| `system_prompt` | str | Custom system prompt |
| `max_turns` | int | Maximum conversation turns |
| `allowed_tools` | list[str] | List of tools Claude can use |
| `permission_mode` | str | Auto-accept file edits with `'acceptEdits'` |
| `cwd` | str or Path | Working directory |
| `mcp_servers` | dict | Dictionary of MCP servers |
| `hooks` | dict | Dictionary of hook matchers and handlers |
| `cli_path` | str | Custom Claude Code CLI path |

## Message Types

- **AssistantMessage** - Response from Claude
- **UserMessage** - User input
- **SystemMessage** - System instructions
- **ResultMessage** - Tool execution results

## Content Blocks

- **TextBlock** - Text content
- **ToolUseBlock** - Tool invocation
- **ToolResultBlock** - Tool execution result

## Error Handling

```python
from claude_agent_sdk import (
    ClaudeSDKError,        # Base error
    CLINotFoundError,      # Claude Code not installed
    CLIConnectionError,    # Connection issues
    ProcessError,          # Process failed
    CLIJSONDecodeError,    # JSON parsing issues
)

try:
    async for message in query(prompt="Hello"):
        pass
except CLINotFoundError:
    print("Please install Claude Code")
except ProcessError as e:
    print(f"Process failed with exit code: {e.exit_code}")
except CLIJSONDecodeError as e:
    print(f"Failed to parse response: {e}")
```

## Available Tools

| Tool | Description |
|------|-------------|
| Read | Read any file in the working directory |
| Write | Create new files |
| Edit | Make precise edits to existing files |
| Bash | Run terminal commands, scripts, git operations |
| Glob | Find files by pattern |
| Grep | Search file contents with regex |
| WebSearch | Search the web for current information |
| WebFetch | Fetch and parse web page content |
| AskUserQuestion | Ask the user clarifying questions |
| Task | Spawn subagents for focused subtasks |
