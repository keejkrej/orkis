# Orkis Demo & Test Scripts

This directory contains demonstration and test scripts for the Orkis agent runtime. These scripts show how to use both the Claude Code SDK and OpenAI Codex SDK, as well as the prompt steering/message queue features.

## Prerequisites

1. **Install dependencies:**
   ```bash
   cd scripts
   npm install
   ```

2. **Set up API keys:**
   ```bash
   # For Claude Code demos
   export ANTHROPIC_API_KEY=your-anthropic-api-key

   # For Codex demos
   export OPENAI_API_KEY=your-openai-api-key
   ```

3. **Start the runtime server** (for steering and test client demos):
   ```bash
   cd ../agent-runtime
   npx ts-node server.ts
   ```

## Scripts

### 1. `demo-claude-code.ts` - Claude Code SDK Demo

Demonstrates direct usage of the Claude Code SDK with various features:

- **Basic Query**: Simple prompt execution
- **Hooks**: PreToolUse, PostToolUse, and Stop hooks for tracking
- **Tool Restrictions**: Limiting which tools the agent can use
- **Custom System Prompt**: Adding custom instructions
- **Abort Controller**: Cancelling running queries
- **Session Resume**: Continuing conversations across queries

```bash
# Run with default prompt
npx ts-node demo-claude-code.ts

# Run with custom prompt
npx ts-node demo-claude-code.ts "List all TypeScript files"
```

### 2. `demo-codex.ts` - OpenAI Codex SDK Demo

Demonstrates direct usage of the Codex SDK with various features:

- **Basic Thread**: Simple thread creation and execution
- **Approval Modes**: auto, untrusted, on-failure, on-request, never
- **Sandbox Modes**: read-only, workspace-write, danger-full-access
- **Multi-Turn Conversation**: Continuing conversations in a thread
- **Thread Resume**: Resuming threads by ID
- **Web Search**: Enabling web search capability
- **Full Auto Mode**: Auto-approving all operations

```bash
# Run with default prompt
npx ts-node demo-codex.ts

# Run with custom prompt
npx ts-node demo-codex.ts "Create a hello world script"
```

### 3. `demo-steering.ts` - Prompt Steering Demo

Demonstrates the prompt steering feature (requires runtime server):

- **Queue Mode**: Messages queued while agent is busy
- **Steer Mode**: Immediate message injection mid-task
- **Priority Queue**: High priority messages processed first
- **Interrupt**: Stopping agent operations
- **Clear Queue**: Removing all queued messages

```bash
# First start the runtime server in another terminal
cd ../agent-runtime && npx ts-node server.ts

# Then run the demo
npx ts-node demo-steering.ts
```

### 4. `test-runtime-client.ts` - Interactive Test Client

Provides an interactive command-line interface for testing the runtime:

```bash
# First start the runtime server in another terminal
cd ../agent-runtime && npx ts-node server.ts

# Then run the client
npx ts-node test-runtime-client.ts
```

**Available Commands:**

| Command | Description |
|---------|-------------|
| `start [name]` | Start a Claude Code agent |
| `start-codex [name]` | Start a Codex agent |
| `stop [id]` | Stop an agent |
| `list` | List all agents |
| `send <id> <msg>` | Send a message |
| `queue <id> <msg>` | Queue a message |
| `queue-high <id> <msg>` | Queue with high priority |
| `steer <id> <msg>` | Send steering message |
| `mode <id> <mode>` | Set steer mode (immediate/queue) |
| `interrupt <id>` | Interrupt agent |
| `clear <id>` | Clear message queue |
| `state <id>` | Get queue state |
| `sub <id>` | Subscribe to events |
| `use <id>` | Set default agent |
| `help` | Show help |
| `quit` | Exit |

**Shortcuts:**
- After `use <id>`, agent_id can be omitted from commands
- Typing any text directly sends it as a message to the current agent

## Understanding Prompt Steering

### How it works in Claude Code and Codex

Both Claude Code CLI and Codex CLI allow users to interact with the agent while it's working:

**Claude Code:**
- `Escape` key interrupts the agent (context preserved)
- Users can type while seeing "Claude is working..."
- Messages are queued and processed when Claude finishes

**Codex CLI:**
- `Tab` key toggles between "Steer" and "Queue" modes
- In "Steer" mode: messages sent immediately (mid-turn)
- In "Queue" mode: messages wait until current turn completes
- `Alt+↑/↓` navigates through queued messages

### Implementation in Orkis

The Orkis runtime implements similar functionality:

```typescript
// Queue a message (will be sent when agent is idle)
await client.queueMessage(agentId, "Please also check file X");

// Send steering message (interrupts and redirects)
await client.sendSteerMessage(agentId, "Actually, focus on Y instead");

// Toggle modes
await client.setSteerMode(agentId, "immediate"); // or "queue"

// Interrupt the agent
await client.interruptAgent(agentId);
```

### WebSocket Events

The runtime emits these events for queue operations:

| Event | Description |
|-------|-------------|
| `queue_message_added` | Message added to queue |
| `queue_message_removed` | Message removed from queue |
| `queue_cleared` | All messages cleared |
| `queue_processing_started` | Started processing queue |
| `queue_processing_completed` | Finished processing queue |
| `steer_mode_changed` | Steer mode toggled |
| `agent_interrupted` | Agent was interrupted |
| `steer_message_injected` | Steer message was injected |

## Troubleshooting

### "Cannot find module" errors
Run `npm install` in the scripts directory.

### "Connection refused" for steering/test demos
Make sure the runtime server is running:
```bash
cd ../agent-runtime && npx ts-node server.ts
```

### API key errors
Ensure environment variables are set:
```bash
echo $ANTHROPIC_API_KEY
echo $OPENAI_API_KEY
```

### TypeScript errors
The scripts use ts-node. If you have issues, try:
```bash
npx ts-node --esm demo-claude-code.ts
```

## Example Session

```bash
# Terminal 1: Start runtime
cd agent-runtime
npx ts-node server.ts
# Output: Agent runtime server listening on ws://127.0.0.1:9847

# Terminal 2: Start test client
cd scripts
npx ts-node test-runtime-client.ts

# In the client:
orkis> start My Test Agent
✓ Agent: abc123... (My Test Agent)

orkis> sub abc123
✓ Subscribed to agent events

orkis> use abc123
✓ Now using agent: abc123...

[abc123...] orkis> Count from 1 to 100
[assistant] I'll count from 1 to 100...

# While counting is happening:
[abc123...] orkis> mode abc123 queue
[Mode Changed] queue

[abc123...] orkis> queue abc123 And then tell me a joke
[Queue +1] "And then tell me a joke..."

[abc123...] orkis> state abc123
✓ Queue State:
  Mode: queue
  Processing: false
  Messages: 1
    - [normal] And then tell me a joke...
```
