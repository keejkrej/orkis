# Codex SDK Overview

The Codex SDK enables programmatic control of local Codex agents. It's designed for scenarios requiring integration beyond the standard CLI, IDE extension, or web interface.

## Use Cases

- Control Codex as part of your CI/CD pipeline
- Create your own agent that can engage with Codex to perform complex engineering tasks
- Build Codex into your own internal tools and workflows
- Integrate Codex within your own application

## TypeScript Library

### Requirements
- Node.js 18 or later
- Server-side implementation only

### Installation

```bash
npm install @openai/codex-sdk
```

### Basic Usage

**Starting a new thread:**

```typescript
import { Codex } from "@openai/codex-sdk";

const codex = new Codex();
const thread = codex.startThread();
const result = await thread.run(
  "Make a plan to diagnose and fix the CI failures"
);

console.log(result);
```

**Continuing an existing thread:**

```typescript
const result = await thread.run("Implement the plan");
console.log(result);
```

**Resuming past threads:**

```typescript
const threadId = "<thread-id>";
const thread2 = codex.resumeThread(threadId);
const result2 = await thread2.run("Pick up where you left off");
console.log(result2);
```

## Codex CLI Features

### Core Modes

#### Interactive Mode
Launch the full-screen terminal UI:
```bash
codex
```
Or specify an initial prompt:
```bash
codex "Explain this codebase to me"
```

#### Non-Interactive Automation
Run Codex without UI interaction:
```bash
codex exec "fix the CI failure"
```
Results pipe to stdout for scripting integration.

### Session Management

Codex stores your transcripts locally so you can pick up where you left off.

```bash
codex resume              # Interactive picker of recent sessions
codex resume --all        # Show all local runs
codex resume --last       # Jump to most recent session
codex resume <SESSION_ID> # Target specific run
```

### Image Inputs

Attach screenshots or design specifications:
```bash
codex -i screenshot.png "Explain this error"
codex --image img1.png,img2.jpg "Summarize these diagrams"
```

### Code Review

Type `/review` in CLI to access review presets:
- Review against base branch
- Review uncommitted changes
- Review specific commits
- Custom review instructions

### Web Search

Enable in `~/.codex/config.toml`:
```toml
[features]
web_search_request = true

[sandbox_workspace_write]
network_access = true
```

### Approval Modes

Control confirmation requirements:
- **Auto** (default) - Edit/run within working directory only
- **Read-only** - Browse files, requires approval for changes
- **Full Access** - Unrestricted access to machine and network

## CLI Command Options

| Flag | Type | Purpose |
|------|------|---------|
| `--add-dir` | path | Grant additional directories write access |
| `--ask-for-approval, -a` | mode | Controls approval timing before running commands |
| `--cd, -C` | path | Sets working directory |
| `--config, -c` | key=value | Overrides configuration values |
| `--dangerously-bypass-approvals-and-sandbox, --yolo` | boolean | Run every command without approvals (dangerous) |
| `--disable` | feature | Force-disables a feature flag |
| `--enable` | feature | Force-enables a feature flag |
| `--full-auto` | boolean | Shortcut for low-friction local work |
| `--image, -i` | path[,path...] | Attaches image files to initial prompt |
| `--model, -m` | string | Overrides configured model selection |
| `--oss` | boolean | Uses local open source provider (requires Ollama) |
| `--profile, -p` | string | Loads configuration profile |
| `--sandbox, -s` | mode | Selects sandbox policy for shell commands |
| `--search` | boolean | Enables web search capability |

## Sandbox Modes

- `read-only` - Only read operations allowed
- `workspace-write` - Write to working directory only
- `danger-full-access` - Full system access (use with caution)

## Model Context Protocol (MCP)

Connect additional tools via servers configured in `~/.codex/config.toml` or managed with `codex mcp` commands.

## Advanced Features

### Prompt Editor
Press Ctrl+G to open system editor (respects `VISUAL`/`EDITOR` environment variables)

### Slash Commands
Access specialized workflows like `/review` and `/fork`, plus custom team-specific commands

### Cloud Integration
```bash
codex cloud exec --env ENV_ID "Summarize open bugs"
codex cloud exec --env ENV_ID --attempts 3 "Generate solutions"
```

## Resources

- [Official Documentation](https://developers.openai.com/codex/)
- [CLI Reference](https://developers.openai.com/codex/cli/reference/)
- [CLI Features](https://developers.openai.com/codex/cli/features/)
- [Codex SDK](https://developers.openai.com/codex/sdk/)
- [Quickstart](https://developers.openai.com/codex/quickstart/)
- [TypeScript Repository](https://github.com/openai/codex/tree/main/sdk/typescript)
